'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtLength, fmtSpeed, fmtTime, lengthIn, unitsOf } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { groundTrack, recoveryStats, compass, trackGpx, trackKml, descentWind, ascentLean, windProfile } from '@/lib/gps';
import { dopSentence, fixQualitySentence, trackDop, trackFixQuality } from '@/lib/gpsFix';
import type { FlightEvent } from '@/lib/analyze/types';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { liftoffOnLogClock } from '@/lib/readings';
import { download } from '@/lib/download';
import { provenanceCell } from '@/lib/synthetic';
import { useIsDark } from './useIsDark';
import { Button, Card, EmptyState, Frame } from './ui';

/** The plot is square and capped, so a wide column doesn't stretch a north-up map. */
const MAX_SIZE = 420;

/** A round ring spacing (1/2/5 × 10ⁿ) giving a handful of rings across `maxM`. */
function niceStep(maxM: number): number {
  const raw = maxM / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const mult = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return Math.max(1, mult * pow);
}

/** Where the flight was, and what it was doing, at one fix — everything the readout
 *  under the map states. `phase` is the event the leg started at, so the track's
 *  colour and this line always name the same thing. */
interface FixReading {
  index: number;
  /** Seconds on the LOG's own clock — the base the charts and the Events list use, named
   *  as such beside the readout. On a file whose clock doesn't start at liftoff this is a
   *  different number from the seconds-since-liftoff the readings grid quotes, and the
   *  ground-station GPS log puts apogee at 973.0 s here against 13.0 s there. */
  t: number;
  /** Metres from the pad, and the compass bearing from the pad to here. */
  distM: number;
  bearing: number;
  /** The last event at or before this fix — what the rocket was doing here.
   *
   *  NOTE: no height. The map is a plan view and the app already states altitude in three
   *  places that adjudicate it properly; a fourth statement here would have to reproduce
   *  `altAt` (lib/analyze/index.ts), which withholds an ascent altitude only where the
   *  barometric trace is actually contradicted. A first cut withheld every pre-apogee
   *  height instead, which said "no height" at a burnout the Events list publishes as
   *  1,600 ft — the same cross-surface disagreement, in the other direction. */
  phase: FlightEvent | null;
}

/** The recovery (walkback) view: a north-up, equal-scale ground track of where
 *  the rocket drifted and came down relative to the pad, with the headline
 *  distance/bearing. Shown only when a flight carries a GPS lat/lon track. */
export default function GroundTrack({
  lat,
  lon,
  sys,
  stem,
  padOrigin,
  time,
  altitude,
  hasGpsAltitude = false,
  descentFromIndex,
  apogeeIndex,
  apogeeAltitude,
  landed,
  events,
  fixGrade,
  hdop,
  satellites,
  synthetic,
  recordedBy,
}: {
  lat: Float64Array;
  lon: Float64Array;
  sys: UnitChoice;
  /** Whether the record reached the ground. The last GPS fix always exists; it is only a
   *  LANDING when the flight was recorded down to it. On a log that ends at apogee the last
   *  fix is still over the pad, so an unguarded card reported "landed 10 ft from the pad,
   *  bearing 267° W" and told the flyer to walk that way — for a rocket 3,548 ft up doing
   *  1,057 ft/s at the last sample. Same track, same numbers, different claim. */
  landed: boolean;
  /** Filesystem-safe stem of the source file, for the GPX filename. */
  stem: string;
  /** The FILE's own pad, when this report is of a stretch of it. Absent for a whole-file
   *  reading, where the opening fixes ARE the pad. */
  padOrigin?: { lat0: number; lon0: number } | null;
  /** Flight time base (s), aligned with lat/lon — needed to read drift velocity. */
  time?: Float64Array;
  /** Altitude (m AGL), aligned with lat/lon — needed for the wind-by-altitude profile. */
  altitude?: Float64Array;
  /** Whether this flight ALSO carries the receiver's own altitude. The KML's height comes from
   *  the barometer either way; this is what decides whether the exported file has to say that a
   *  second, independent altitude exists and was not the one drawn. */
  hasGpsAltitude?: boolean;
  /** Index the descent starts at (apogee or main deploy), for the wind reading. */
  descentFromIndex?: number;
  /** Apogee sample index and altitude (m AGL), for the off-vertical reading. */
  apogeeIndex?: number;
  apogeeAltitude?: number;
  /** The flight's events, aligned with the same sample clock. They colour the track leg
   *  by leg — each leg takes the colour of the event that began it, the same token the
   *  charts mark that event with — and give the readout something to name a fix by. */
  events?: FlightEvent[];
  /** What the receiver solved each fix in, aligned with lat/lon — `lib/gpsFix.ts`'s `gpsFixGrade`
   *  channel where the file states one. Optional, because most formats say nothing about their fix
   *  quality and the panel must say nothing rather than guess for them. */
  fixGrade?: Float64Array;
  /** Horizontal dilution of precision, where the file states one. */
  hdop?: Float64Array;
  /** Satellites IN the fix, where the file states them — the `satellites` channel and only that
   *  one. It rides into the `.gpx`'s `<sat>` beside `hdop`'s `<hdop>`; see `lib/gps.ts`'s
   *  `FixQualityChannels` for why a similarly-named column that counts satellites the receiver can
   *  merely HEAR must not be mapped here. */
  satellites?: Float64Array;
  /** Whether this is a flight Debrief MADE UP. Required with no default, for the reason
   *  `MetricGrid`'s and `FlightCard`'s are: on a panel whose three exports are coordinates
   *  somebody walks to, the safe-looking default is the defect value.
   *
   *  It reaches the three sinks and not the screen. The report above already carries the
   *  sentence and the readings grid carries the short form, and `DESIGN.md` §5 puts a notice
   *  above the surface rather than beside every control on it — the same reading
   *  `SampleTable`'s copy button follows, where the claim rides on the clipboard and the toast
   *  keeps its plain label. `/stitch` is the case that differs, because it is a top-level route
   *  with nothing above it. */
  synthetic: boolean;
  /** Which instrument recorded these fixes, as the file stated it. Rides into the `.gpx`'s `<src>`
   *  and the `.kml`'s `<ExtendedData>` — the fields both schemas reserve for exactly this, and
   *  which Debrief left empty while every vendor tool in `COMPETITION.md` row 43 repeats the board
   *  identity on every record it writes. Null when the file named nothing. */
  recordedBy?: string | null;
}) {
  const dark = useIsDark();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [copied, setCopied] = useState(false);
  /** The fix being read, if any. Set by a hover, a tap, or the arrow keys — one piece of
   *  state, so the pointer and the keyboard drive the same marker and the same line of
   *  text rather than two parallel readouts that can disagree. */
  const [cursor, setCursor] = useState<number | null>(null);
  /** Whether the fix in `cursor` was chosen deliberately (a key press or a tap) rather than
   *  swept over with a pointer. Only a deliberate choice is announced: a hover crossing the
   *  map changes the fix on nearly every pixel, and a live region fed from that would read
   *  a new position aloud per pointer sample. */
  const [deliberate, setDeliberate] = useState(false);

  // The pad, from the FILE's opening fixes when the report is showing a stretch of one. Every
  // reading below is measured from it, so taking it from the crop's first fixes would put the
  // pad wherever the rocket happened to be when the flyer's selection starts.
  const track = useMemo(() => groundTrack(lat, lon, 16, padOrigin ?? undefined), [lat, lon, padOrigin]);
  /** What the exported trajectory is made of, said in the file itself. Two instruments drew it —
   *  the receiver put every fix on the map, the barometer put it at a height — and a KML that
   *  shows a 3D track without saying which is a number with its provenance stripped off. The
   *  second sentence appears only where the flight really does carry a receiver altitude, so a
   *  file that has one instrument is not told about a disagreement it cannot have. */
  const kmlAltitudeNote = useMemo(() => {
    if (!altitude) return 'Ground track only: this recording carried no height to draw the fixes at.';
    const base =
      'Positions are the GPS receiver’s. Heights are the barometer’s, measured above the pad — two instruments, not one.';
    return hasGpsAltitude
      ? `${base} This recording also carries the receiver’s own altitude, which is NOT what is drawn here: it is measured above the ellipsoid rather than above the pad, so the two are different quantities and differ by hundreds of metres on real flights. The barometer is the better vertical measurement and the one “relative to ground” means.`
      : base;
  }, [altitude, hasGpsAltitude]);
  const stats = useMemo(() => (track ? recoveryStats(track) : null), [track]);
  // **What the receiver actually solved these fixes in, in place of a constant.** This panel told
  // every flyer "Positions are GPS, good to a few metres" in both branches, on every flight,
  // derived from nothing — and it is the app's ONLY statement about horizontal accuracy. On the one
  // corpus flight that spends real time on three satellites it is wrong by an order of magnitude,
  // on the surface a flyer physically acts on. `null` where the file says nothing, because a panel
  // that guesses at quality is worse than one that is quiet about it.
  const fixQuality = useMemo(
    () => fixQualitySentence(trackFixQuality(lat, lon, fixGrade)),
    [lat, lon, fixGrade],
  );
  // What the satellite GEOMETRY was behind those positions — a different question from what the
  // receiver solved them IN, and the columns AltOS has always written and Debrief always dropped.
  // Same function the saved report calls, so the two cannot drift apart.
  const dop = useMemo(() => dopSentence(trackDop(hdop, lat, lon)), [hdop, lat, lon]);
  const wind = useMemo(
    () =>
      track && time && descentFromIndex != null
        ? descentWind(track, time, descentFromIndex, Math.min(lat.length, lon.length) - 1)
        : null,
    [track, time, descentFromIndex, lat.length, lon.length],
  );
  const lean = useMemo(
    () => (track && apogeeIndex != null && apogeeAltitude != null ? ascentLean(track, apogeeIndex, apogeeAltitude) : null),
    [track, apogeeIndex, apogeeAltitude],
  );
  // The wind binned by altitude (apogee → landing), so the shear reads off layer by
  // layer. Computed over the whole descent so every altitude the rocket fell through
  // is covered; the single "Wind (descent)" stat above is the average of it.
  const profile = useMemo(
    () =>
      track && time && altitude && stats && apogeeIndex != null && apogeeAltitude != null
        ? windProfile(track, time, altitude, apogeeIndex, stats.landingIndex, apogeeAltitude)
        : [],
    [track, time, altitude, stats, apogeeIndex, apogeeAltitude],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // `contentRect` is the CONTENT box — the room inside the card's own p-4. `clientWidth`,
    // which this used to read, includes that padding, so the map was drawn 32 px wider than
    // the space it had: at a 390 px viewport the card ended at x=374 and the canvas ran to
    // x=389, hanging 15 px out of its own border and stopping 1 px short of the screen edge.
    // Invisible on a desktop, where the 420 px cap bites long before the padding does.
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const size = Math.min(width, MAX_SIZE);

  /** The pad-centred, equal-scale projection, plus the screen position of every fix.
   *  One computation feeds three consumers — the map, the hover hit-test and the
   *  highlight overlay — so a point can never be drawn somewhere the pointer doesn't
   *  find it. `valid` lists the indices that actually have a fix, in order, which is
   *  also the sequence the arrow keys step along. */
  const proj = useMemo(() => {
    if (!track || size <= 0) return null;
    const { east, north } = track;
    let half = 10;
    for (let i = 0; i < east.length; i++) {
      if (!Number.isFinite(east[i]) || !Number.isFinite(north[i])) continue;
      half = Math.max(half, Math.abs(east[i]), Math.abs(north[i]));
    }
    half *= 1.12;
    const margin = 16;
    const scale = (size / 2 - margin) / half;
    const px = (e: number) => size / 2 + e * scale;
    const py = (n: number) => size / 2 - n * scale; // north is up
    const valid: number[] = [];
    for (let i = 0; i < east.length; i++) {
      if (Number.isFinite(east[i]) && Number.isFinite(north[i])) valid.push(i);
    }
    return { half, scale, px, py, valid };
  }, [track, size]);

  /** Every event on the flight's clock, in order — what names the phase a fix falls in.
   *  This is the WHOLE list, including events the GPS has no fix for: naming the phase only
   *  from events that happen to land on a fix means a dropout over apogee silently relabels
   *  the entire descent "after burnout". `altusmetrum-telemetrum.csv` alone carries 108
   *  non-finite fixes in 529 samples, so that is a live case, not a corner. */
  const phases = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => e.index >= 0).slice().sort((a, b) => a.index - b.index);
  }, [events]);

  /** The subset that can actually be DRAWN on the ground — an event with no fix has no
   *  position, and pinning it to the nearest one would put a labelled dot somewhere the
   *  rocket wasn't. Landing is excluded deliberately: the ✕ already marks it, and it is
   *  placed at `stats.landingIndex` (the last valid fix) rather than at the landing event's
   *  index. On `featherweight-gps.csv` those are samples 474 and 479 — two dots, two
   *  distances from the pad, one landing. */
  const marks = useMemo(() => {
    if (!track) return [];
    const n = Math.min(track.east.length, track.north.length);
    return phases.filter(
      (e) => e.type !== 'landing' && e.index < n && Number.isFinite(track.east[e.index]) && Number.isFinite(track.north[e.index]),
    );
  }, [track, phases]);

  /** Whether the log's clock needs naming beside a time read off it — the same call the
   *  Events list makes, from the same helper. */
  const liftoffClock = useMemo(() => liftoffOnLogClock(phases), [phases]);

  /** Read one fix into the line of text under the map. */
  const readAt = useCallback(
    (i: number): FixReading | null => {
      if (!track) return null;
      const e = track.east[i];
      const no = track.north[i];
      if (!Number.isFinite(e) || !Number.isFinite(no)) return null;
      let bearing = (Math.atan2(e, no) * 180) / Math.PI;
      if (bearing < 0) bearing += 360;
      let phase: FlightEvent | null = null;
      for (const m of phases) {
        if (m.index <= i) phase = m;
        else break;
      }
      return {
        index: i,
        t: time && i < time.length ? time[i] : NaN,
        distM: Math.hypot(e, no),
        bearing,
        phase,
      };
    },
    [track, phases, time],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track || !stats || !proj || size <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ink = dark ? '#e4e4e7' : '#27272a'; // zinc-200 / zinc-800
    const grid = dark ? 'rgba(82,82,91,0.5)' : 'rgba(212,212,216,0.8)';
    const accent = '#6366f1';
    const land = '#f43f5e';
    ctx.clearRect(0, 0, size, size);

    const { east, north } = track;
    const { half, scale, px, py } = proj;

    // Range rings centred on the pad, labelled in the display unit.
    const step = niceStep(half);
    ctx.strokeStyle = grid;
    ctx.fillStyle = dark ? '#71717a' : '#a1a1aa';
    ctx.font = '10px var(--font-geist-mono, monospace)';
    ctx.lineWidth = 1;
    for (let r = step; r <= half; r += step) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${Math.round(lengthIn(r, sys))} ${unitsOf(sys).length}`, size / 2 + 3, py(r) + 11);
    }

    // North indicator (top-centre).
    ctx.fillStyle = ink;
    ctx.font = 'bold 11px var(--font-geist-sans, sans-serif)';
    ctx.textAlign = 'center';
    ctx.fillText('N', size / 2, 12);
    ctx.textAlign = 'start';

    // The track itself, skipping gaps in the fix. Each leg is stroked in the colour of
    // the event that began it — the same token the charts mark that event with — so the
    // shape on the ground reads as boost, coast, drogue and main rather than as one
    // undifferentiated squiggle. With no events (or none that land on a fix) the whole
    // track is the accent, exactly as before.
    ctx.lineWidth = 1.75;
    let legAt = 0;
    let legColor = marks.length > 0 ? (dark ? '#a1a1aa' : '#71717a') : accent; // before the first event: on the pad
    const strokeLeg = (from: number, to: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      let pen = false;
      for (let i = from; i <= to && i < east.length; i++) {
        if (!Number.isFinite(east[i]) || !Number.isFinite(north[i])) {
          pen = false;
          continue;
        }
        const x = px(east[i]);
        const y = py(north[i]);
        if (pen) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
    };
    for (const m of marks) {
      // Legs overlap by one sample so consecutive colours meet rather than leaving a
      // one-segment hole at every event.
      if (m.index > legAt) strokeLeg(legAt, m.index, legColor);
      legAt = m.index;
      legColor = EVENT_COLOR[m.type];
    }
    strokeLeg(legAt, east.length - 1, legColor);

    // A dot on the ground at each event, in the event's own colour — where the rocket
    // was when it lit, burned out, topped out and put its charges out.
    for (const m of marks) {
      ctx.fillStyle = EVENT_COLOR[m.type];
      ctx.strokeStyle = dark ? '#18181b' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px(east[m.index]), py(north[m.index]), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineWidth = 1.75;

    // Pad marker (origin).
    ctx.strokeStyle = ink;
    ctx.fillStyle = dark ? '#18181b' : '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Landing marker (✕).
    const lx = px(stats.landingEast);
    const ly = py(stats.landingNorth);
    ctx.strokeStyle = land;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx - 5, ly - 5);
    ctx.lineTo(lx + 5, ly + 5);
    ctx.moveTo(lx + 5, ly - 5);
    ctx.lineTo(lx - 5, ly + 5);
    ctx.stroke();
  }, [track, stats, proj, marks, size, dark, sys]);

  /** The highlight, on its own canvas above the map. A separate layer so following the
   *  pointer costs one dot and a crosshair rather than a full redraw of a track that can
   *  run to tens of thousands of fixes. */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !track || !proj || size <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    overlay.width = size * dpr;
    overlay.height = size * dpr;
    overlay.style.width = `${size}px`;
    overlay.style.height = `${size}px`;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (cursor == null) return;
    const e = track.east[cursor];
    const no = track.north[cursor];
    if (!Number.isFinite(e) || !Number.isFinite(no)) return;
    const x = proj.px(e);
    const y = proj.py(no);
    // The line back to the pad IS the reading — distance and bearing from the pad are
    // what the text says, drawn so the two can't be read as different things.
    ctx.strokeStyle = dark ? 'rgba(228,228,231,0.55)' : 'rgba(39,39,42,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // A hollow ring in the page's own ink, not a filled dot in the accent — `#6366f1` is
    // `EVENT_COLOR.liftoff` and the default track stroke, so a filled indigo marker read as
    // one more event dot instead of "you are here". A ring reads as a cursor at any size,
    // and it doesn't hide the fix it is marking.
    ctx.strokeStyle = dark ? '#fafafa' : '#18181b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = dark ? '#18181b' : '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 7.75, 0, Math.PI * 2);
    ctx.stroke();
  }, [cursor, track, proj, size, dark]);

  /** The fix nearest the pointer, in screen space. Nearest-in-pixels rather than
   *  nearest-along-the-track: on a canopy descent the track doubles back over itself, and
   *  a flyer pointing at a spot means the spot, not the earlier pass over it. */
  const nearestTo = useCallback(
    (cx: number, cy: number): number | null => {
      if (!track || !proj) return null;
      let best = -1;
      let bestD = Infinity;
      for (const i of proj.valid) {
        const dx = proj.px(track.east[i]) - cx;
        const dy = proj.py(track.north[i]) - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      // Beyond this the pointer isn't over the track at all, and snapping to a fix a
      // third of the map away would state a reading the flyer never asked for.
      return best >= 0 && bestD <= 40 * 40 ? best : null;
    },
    [track, proj],
  );

  const onPointer = useCallback(
    (ev: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = ev.currentTarget.getBoundingClientRect();
      setCursor(nearestTo(ev.clientX - rect.left, ev.clientY - rect.top));
      setDeliberate(ev.type === 'pointerdown');
    },
    [nearestTo],
  );

  /** Arrow keys walk the track, so every reading the hover gives is reachable without a
   *  pointer — and on a phone, where there is no hover at all, a tap does the same thing.
   *  Home/End are the pad and the last fix; PageUp/PageDown jump event to event, which is
   *  how you get to "where was it at apogee" in one keystroke rather than four hundred. */
  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!proj || proj.valid.length === 0) return;
      const valid = proj.valid;
      const at = cursor == null ? -1 : valid.indexOf(cursor);
      const go = (pos: number) => {
        ev.preventDefault();
        setCursor(valid[Math.max(0, Math.min(valid.length - 1, pos))]);
        setDeliberate(true);
      };
      const step = ev.shiftKey ? 10 : 1;
      switch (ev.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          return go(at < 0 ? 0 : at + step);
        case 'ArrowLeft':
        case 'ArrowDown':
          return go(at < 0 ? valid.length - 1 : at - step);
        case 'Home':
          return go(0);
        case 'End':
          return go(valid.length - 1);
        case 'PageDown': {
          const next = marks.find((m) => m.index > (cursor ?? -1));
          if (next) go(valid.indexOf(next.index));
          return;
        }
        case 'PageUp': {
          const prev = [...marks].reverse().find((m) => m.index < (cursor ?? Infinity));
          if (prev) go(valid.indexOf(prev.index));
          return;
        }
        case 'Escape':
          ev.preventDefault();
          setDeliberate(false);
          return setCursor(null);
      }
    },
    [proj, cursor, marks],
  );

  /**
   * GPS columns, and no fix to draw from them.
   *
   * This returned a bare `null`, which deleted the whole Recovery section — the map, the landing
   * bearing, the coordinates and the drift — heading included, with nothing saying why. §5: a
   * surface with no empty state is not finished. It is the same defect the flight timeline carried
   * until 2026-08-16, one section down.
   *
   * **Reachable, and stated exactly rather than rounded up.** `FlightReport` renders this whenever
   * the latitude and longitude CHANNELS exist; the track is null when `groundTrack` cannot resolve
   * an origin (the median of the first 16 fixes is non-finite) and the stats are null when no fix
   * in the record is finite at all. Measured over every real recording the repo can reach: of 59
   * flights that analyse end to end, **16 carry GPS columns and 0 reach this branch** — so unlike
   * the timeline, no corpus file demonstrates it, and that is said rather than implied.
   *
   * What does reach it is a receiver's ordinary cold start. A GPS logger writes its columns from
   * power-on and leaves them blank until it has a lock, and a rocket can fly before the lock
   * lands. Built as a file and confirmed: the roles are detected as latitude/longitude, both
   * channels are present, and `groundTrack` returns null — so the flyer whose receiver never
   * locked, the one person most likely to go looking for the map, is the one who is shown nothing
   * at all and left to conclude Debrief is broken.
   *
   * The two causes get one sentence each because they are different facts about the flight, and no
   * `action`: there is nothing a flyer can press to put fixes into a file that has none.
   *
   * **It also repairs a link to nowhere, which is the half that was invisible from here.**
   * `FlightReport` adds a *Recovery* entry to the section nav on the same condition it renders this
   * on — `gpsLat && gpsLon`, at `FlightReport.tsx:860` — pointing at `#ground-track`. That id lived
   * on the heading this branch deleted, so a flight with unusable fixes offered a nav link that
   * jumped nowhere. The heading, and the id, now exist on both branches.
   *
   * **The copy names no instrument, and that is a correction rather than vagueness.** Two drafts
   * tried to reassure by provenance — "every reading above comes from the barometer and the
   * accelerometer, not the GPS" — and both were false. `GpsApogee` renders ABOVE this at
   * `FlightReport.tsx:1130`; and a Featherweight GPS log has no barometer at all, so its apogee is
   * the receiver's, with `altitudeSource: 'gps'` set in the analysis. Naming the barometer there
   * would have told a flyer his GPS-derived apogee came from an instrument the file does not
   * carry — on the same page that says otherwise two panels up. The e2e fixture this branch is
   * walked with has no accelerometer column either, so the report prints "This logger didn't
   * record acceleration" directly above. What IS true of every case is the relationship: nothing
   * else on the page is measured from the pad, so nothing else is affected. Both drafts were
   * caught by the pre-push review.
   */
  if (!track || !stats) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="ground-track" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Recovery
          </h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">from GPS</span>
        </div>
        <EmptyState
          className="mt-3"
          title="No ground track in this recording"
          what={
            <>
              This file carries latitude and longitude columns, but{' '}
              {track
                ? 'not one fix in them is a usable position'
                : 'the opening fixes never resolved into a launch point'}{' '}
              — so there is no pad to measure from and no track to draw. A receiver that had not got
              a lock yet writes its columns empty, and a flight can be over before the lock arrives.
              Nothing else on this page rests on the track: every reading above is taken from the
              columns this file does carry, and none of them is measured from the pad.
            </>
          }
        />
      </div>
    );
  }

  const bearing = Math.round(stats.landingBearing);
  const coords = `${lat[stats.landingIndex].toFixed(5)}, ${lon[stats.landingIndex].toFixed(5)}`;
  /** What the clipboard gets. The pair stays FIRST and unchanged so a maps app still resolves it
   *  — the claim rides in a trailing parenthetical, which is the one placement that labels the
   *  coordinate without breaking the paste it exists for. The screen keeps the bare pair: the
   *  report above it carries the sentence, and this is the same split `SampleTable`'s per-column
   *  copy settled on, where the clipboard travels and the toast does not. */
  const coordsToCopy = synthetic ? `${coords} (${provenanceCell(true)})` : coords;
  const ariaLabel = landed
    ? `Ground track: landed ${fmtLength(stats.landingDistance, sys)} from the pad, bearing ${bearing} degrees ${compass(
        stats.landingBearing,
      )}, having drifted up to ${fmtLength(stats.maxDrift, sys)} from the pad.`
    : `Ground track: the record ends in the air, so this is not a landing. Its last fix is ${fmtLength(
        stats.landingDistance,
        sys,
      )} from the pad, bearing ${bearing} degrees ${compass(stats.landingBearing)}, having drifted up to ${fmtLength(
        stats.maxDrift,
        sys,
      )} from the pad.`;

  const reading = cursor == null ? null : readAt(cursor);
  /** The same line the map shows, as a sentence, for the sr-only live region — empty unless
   *  the fix was chosen deliberately, so a hover announces nothing. */
  const announced =
    reading && deliberate
      ? `${Number.isFinite(reading.t) ? `${fmtTime(reading.t)}, ` : ''}${fmtLength(reading.distM, sys)} from the pad, bearing ${Math.round(
          reading.bearing,
        )} degrees ${compass(reading.bearing)}${reading.phase ? `, after ${reading.phase.label.toLowerCase()}` : ''}.`
      : '';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="ground-track" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
          Recovery
        </h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">north up · from GPS</span>
      </div>

      <Card ref={hostRef} className="mt-3">
        <div className="relative mx-auto" style={{ width: size || undefined, height: size || undefined }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${ariaLabel} Focus this map and use the arrow keys to read a fix — Home and End for its ends, Page Up and Page Down to step between events, Escape to clear.`}
            aria-describedby="ground-track-readout"
            tabIndex={0}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            /* Only a mouse leaving clears the reading. A touch pointer is *removed* when
               the finger lifts, so the browser fires pointerleave immediately after
               pointerup — an unguarded clear here wiped every tap on a phone the instant
               it landed, and the map read as if it did nothing at all. */
            onPointerLeave={(ev) => {
              if (ev.pointerType === 'mouse') setCursor(null);
            }}
            /* …but a gesture the browser TAKES for scrolling is not a tap, and leaving that
               reading on screen pins a fix the flyer never chose: a thumb that lands on the
               map to scroll the report past it would otherwise leave a distance and bearing
               behind, with Escape (no keyboard) the only way out. `pointercancel` is exactly
               the signal that the UA claimed the gesture. */
            onPointerCancel={() => setCursor(null)}
            onKeyDown={onKeyDown}
            /* No `touch-none`: the map is 358 px tall on a phone, and owning the touch
               gesture there would mean a thumb that lands on it can't scroll the report
               past it. A tap reads a fix (pointerdown), a drag still scrolls the page. */
            className="block cursor-crosshair"
          />
          <canvas ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0" />
        </div>

        {/* The reading itself. It holds its height whether or not a fix is picked, so
            following the track doesn't shove the page up and down under the pointer, and it
            is the same element for hover, tap and the arrow keys.
            NOT a live region. It was one, and that was wrong: `onPointerMove` sets a new
            fix on nearly every pixel of travel, so a mouse crossing the map would have
            queued an announcement per pointer sample. The announcements live in the
            sr-only region below, which only discrete choices write to. */}
        <p
          id="ground-track-readout"
          /* The walkback reading — how far from the pad and on what bearing. A flyer reads this
             standing in a field deciding where to walk, so it is decision-grade and takes §3's
             `text-sm` floor rather than caption size. */
          className="mx-auto mt-3 min-h-[2.5rem] max-w-[420px] text-center text-sm text-zinc-600 dark:text-zinc-400"
        >
          {reading ? (
            <>
              {/* `tabular-nums` because this line REWRITES ITSELF as the pointer sweeps the
                  track. With proportional digits the whole readout shifts horizontally on every
                  sample, which is the one place lined-up digits are load-bearing for reading at
                  all rather than for comparing. */}
              <span className="font-mono tabular-nums">
                {Number.isFinite(reading.t) && <>{fmtTime(reading.t)} · </>}
                {fmtLength(reading.distM, sys)} from pad · {Math.round(reading.bearing)}°{' '}
                {compass(reading.bearing)}
                {reading.phase && <> · after {reading.phase.label.toLowerCase()}</>}
              </span>
              {/* Which clock that time is on. The Events list above states the same thing for
                  the same reason: these are the log's own seconds, what the charts are drawn
                  against, while every reading in the grid is seconds since liftoff. On the
                  ground-station GPS log the two differ by 960 s for one instant. Shown only
                  where the file's clock doesn't already start at liftoff, so a flight where
                  they agree isn't given a distinction it doesn't have. */}
              {liftoffClock != null && (
                <span className="mt-0.5 block">log clock · liftoff at {fmtTime(liftoffClock)}</span>
              )}
            </>
          ) : (
            <>Point at the track — or focus it and use the arrow keys — to read where the rocket was, when.</>
          )}
        </p>

        {/* What a screen reader hears, and only when a fix was chosen deliberately — a key
            press or a tap, never a hover. Hovering is a pointer user's gesture and produces
            no announcement at all; the visible line above still follows the pointer. */}
        <p id="ground-track-spoken" className="sr-only" role="status" aria-live="polite">
          {announced}
        </p>

        {/* The key. It is the events list, in the colours the charts already draw them in,
            so a dot on the ground and a dashed line on the altitude plot are the same
            event rather than two things that happen to look similar. */}
        {marks.length > 0 && (
          <ul
            aria-label="What the dots on the map mark"
            className="mx-auto mt-2 flex max-w-[420px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400"
          >
            {marks.map((m) => (
              <li key={`${m.type}-${m.index}`} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: EVENT_COLOR[m.type] }}
                />
                {m.label}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={landed ? 'Landed from pad' : 'Last fix from pad'} value={fmtLength(stats.landingDistance, sys)} />
        <Stat label="Bearing" value={`${bearing}° ${compass(stats.landingBearing)}`} />
        <Stat label="Max drift" value={fmtLength(stats.maxDrift, sys)} />
        {wind && (
          // The wind it actually fell through, measured: under canopy the rocket
          // drifts with the air, so its descent drift velocity is the wind aloft.
          <Stat label="Wind (descent)" value={`${fmtSpeed(wind.speed, sys)} from ${compass(wind.fromBearing)}`} />
        )}
        {lean && (
          // How far off vertical the ascent flew (weathercocking + ascent drift) —
          // the apogee's horizontal offset from the pad.
          <Stat label="Off vertical" value={`${Math.round(lean.angleDeg)}° ${compass(lean.towardBearing)}`} />
        )}
      </dl>

      {/* The exact landing coordinates and a GPX you can navigate to on a phone
          or handheld — the precise walkback, on top of the rough bearing. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">{coords}</span>
        <Button
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(coordsToCopy).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              },
              () => {},
            );
          }}
          title={landed ? 'Copy the landing coordinates' : 'Copy the last-fix coordinates'}
        >
          {copied ? 'Copied ✓' : 'Copy coords'}
        </Button>
        <Button
          size="sm"
          onClick={() =>
            download(
              new Blob([trackGpx(stem, lat, lon, stats.landingIndex, landed, synthetic, recordedBy, { hdop, satellites, fixGrade })], {
                type: 'application/gpx+xml',
              }),
              `${stem}-track.gpx`,
            )
          }
          title={`Download the track and ${landed ? 'landing point' : 'last fix'} as a GPX file (opens in any GPS app)`}
        >
          Save GPX
        </Button>
        {/* GPX carries where it went on the ground; KML carries where it went, full stop.
            With the altitude beside each fix, Google Earth draws the trajectory in the air
            over the actual field — the view AltosUI has offered for years, and the one worth
            handing to someone helping walk a rocket down. */}
        <Button
          size="sm"
          onClick={() =>
            download(
              new Blob([trackKml(stem, lat, lon, altitude, stats.landingIndex, landed, synthetic, recordedBy, kmlAltitudeNote)], {
                type: 'application/vnd.google-earth.kml+xml',
              }),
              `${stem}-track.kml`,
            )
          }
          title="Download the flight as KML — the 3D path over the ground, for Google Earth"
        >
          Save KML
        </Button>
      </div>

      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {landed ? (
          <>
            Walk from the pad toward {compass(stats.landingBearing)} ({bearing}°), or put the coordinates into your
            phone/GPS — the cross marks the last fix.{fixQuality ? ` ${fixQuality}` : ''}
            {dop ? ` ${dop}` : ''}
          </>
        ) : (
          <>
            This record ends before the ground, so the cross is the last fix Debrief has — not where the rocket came
            down, and not a direction to walk.{fixQuality ? ` ${fixQuality}` : ''}
            {dop ? ` ${dop}` : ''}
          </>
        )}
        {lean && (
          <>
            {' '}
            It flew about {Math.round(lean.angleDeg)}° off vertical — {fmtLength(lean.downrange, sys)} downrange
            toward {compass(lean.towardBearing)} at apogee.
          </>
        )}
      </p>

      {/* The wind by altitude — the descent drift binned into layers, so the shear
          shows. Only worth its own block when there are at least two layers (one
          would just restate the average above). */}
      {profile.length >= 2 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Wind aloft (by altitude)</h4>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">measured from the descent drift</span>
          </div>
          <Frame as="dl" className="mt-2 divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-800">
            {profile.map((l) => (
              <div key={l.altLoM} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                <dt className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                  {Math.round(lengthIn(l.altLoM, sys)).toLocaleString('en-US')}–
                  {Math.round(lengthIn(l.altHiM, sys)).toLocaleString('en-US')} {unitsOf(sys).length}
                </dt>
                <dd className="font-mono font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                  {fmtSpeed(l.speed, sys)} from {compass(l.fromBearing)}
                </dd>
              </div>
            ))}
          </Frame>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Under canopy the rocket drifts with the air, so its drift across each layer is the wind there. The slow,
            low layers read cleanest; a sparse upper layer is dropped rather than guessed.
          </p>
        </div>
      )}
    </div>
  );
}

// `py-2.5` here was one of the unsanctioned half-steps `DESIGN.md` §9 records as ledgered in
// `BACKLOG.md` rather than swept — 21 `-2.5`s, of which this was one. It is `py-2` now, which is
// on §4's scale outright, because the tile was being folded into the shared frame anyway and
// leaving a half-step inside a conversion is how the ledger's count silently stops matching the
// tree. The ledger is decremented in the same commit; the other 20 still want the §4 decision
// about which half-steps are on the scale, and that is a change owed to both repos.
// (§4's `px-3 py-1.5` row is about the inside of a CONTROL and does not sanction this tile either
// way — an earlier draft of this comment said it did, which was simply wrong.)
/** Deliberately NOT `Readout`, though it renders the same thing at the same sizes.
 *
 *  These are `<dt>`/`<dd>` inside a `<dl>` — a screen reader announces them as term/definition
 *  pairs — and `Readout` renders `<div>`s. Converting would take the recovery grid out of the
 *  list semantics it has, which is exactly the trade `Card`'s `as` prop exists to refuse; and
 *  `Readout` cannot take an `as`, because it renders THREE elements rather than one. So the two
 *  genuine `DESIGN.md` violations here are fixed in place rather than by adoption:
 *  - the label was `text-[11px]`, which §3 reserves for axis ticks and diagram annotations. A
 *    stat label is a caption, which is the size above it.
 *  - the value had `font-mono` and no `tabular-nums`. These five tiles sit in one grid and are
 *    read against each other — walkback distance, bearing, max drift, wind, off-vertical — by a
 *    flyer standing in a field deciding where to walk, and §3 requires lined-up digits for
 *    exactly that. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Frame className="px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </dd>
    </Frame>
  );
}
