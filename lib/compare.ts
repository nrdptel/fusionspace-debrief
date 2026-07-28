// Build the data for comparing several flights on one set of axes. Each flight
// is analyzed independently (its own time base); to overlay them we align every
// flight at its detected liftoff (t = 0) and resample altitude and velocity onto
// a shared, uniform time grid. uPlot needs one x-array shared by all series, so
// the resampling is what makes the overlay possible at all.

import { formatFlownDay, type FlownAt } from './flight/flownAt';
import type { EventType, FlightAnalysis, FlightMetrics } from './analyze/types';

// Distinct, colour-blind-friendly-ish strokes; one per flight, in order. Caps the
// number of flights a comparison shows (more than this gets visually unreadable).
export const COMPARE_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#a855f7'];
export const MAX_COMPARE = COMPARE_PALETTE.length;

const GRID_POINTS = 800;

export interface CompareInput {
  id: string;
  name: string;
  formatLabel: string;
  analysis: FlightAnalysis;
  /** When the flight flew, where its file stated it — carried through so a launch day's
   *  comparison can label its columns by date rather than by file name alone. */
  flownAt?: FlownAt;
}

export interface CompareFlight {
  id: string;
  name: string;
  formatLabel: string;
  color: string;
  /** When it flew, where the file said (see lib/flight/flownAt.ts). */
  flownAt?: FlownAt;
  /** Altitude (m AGL) resampled onto the shared grid; NaN outside the flight. */
  altitude: Float64Array;
  /** Velocity (m/s) resampled onto the shared grid; NaN outside the flight. */
  velocity: Float64Array;
  /** Acceleration (m/s²) resampled onto the shared grid; NaN outside the flight. */
  acceleration: Float64Array;
  /** Mach number resampled onto the shared grid; NaN outside the flight. */
  mach: Float64Array;
  /** Dynamic pressure (Pa) resampled onto the shared grid; NaN outside the flight. */
  dynamicPressure: Float64Array;
  /** Whether a real liftoff was detected. When false the flight is aligned at its
   *  first sample instead of a true t=0, so the overlay says so. */
  liftoffDetected: boolean;
  /** This flight's own detected events, on the SHARED time base — seconds after its liftoff,
   *  the same zero every other flight is aligned to — so the overlay can draw them against
   *  each other. That is the question a comparison is for and the one the table cannot answer
   *  as directly: two bays agreeing on apogee and firing main a second and a half apart is a
   *  thing you see, not a row you read.
   *
   *  Liftoff is deliberately absent. Every flight is aligned AT its liftoff, so a per-flight
   *  liftoff marker is a stack of lines on x=0 saying nothing; the overlay draws one shared
   *  liftoff marker there instead. */
  events: { type: EventType; label: string; t: number }[];
  metrics: FlightMetrics;
}

export interface Comparison {
  /** Shared x-axis: seconds after liftoff. */
  time: Float64Array;
  flights: CompareFlight[];
}

/** Liftoff time on a flight's own series clock (falls back to the first sample). */
function liftoffTime(a: FlightAnalysis): number {
  const lo = a.events.find((e) => e.type === 'liftoff');
  return lo ? lo.time : (a.series.time[0] ?? 0);
}

/**
 * Linear-resample (srcTime, srcVal) onto `grid`. Both time arrays are ascending.
 * A grid point outside the source's time span is NaN, so a shorter flight's line
 * simply stops instead of being extrapolated. O(n + m) via a forward cursor.
 */
export function resample(srcTime: Float64Array, srcVal: Float64Array, grid: Float64Array): Float64Array {
  const out = new Float64Array(grid.length);
  // Defensive: never read past either array if a parser left them mismatched.
  const n = Math.min(srcTime.length, srcVal.length);
  if (n === 0) {
    out.fill(NaN);
    return out;
  }
  const first = srcTime[0];
  const last = srcTime[n - 1];
  let j = 0;
  for (let i = 0; i < grid.length; i++) {
    const t = grid[i];
    if (t < first || t > last) {
      out[i] = NaN;
      continue;
    }
    while (j < n - 1 && srcTime[j + 1] < t) j++;
    const ta = srcTime[j];
    const tb = srcTime[j + 1] ?? ta;
    const va = srcVal[j];
    const vb = srcVal[j + 1] ?? va;
    // Clamp the fraction to [0,1] so a non-monotonic or duplicated source
    // timestamp can never extrapolate past the bracketing samples.
    const f = tb === ta ? 0 : Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    out[i] = va + (vb - va) * f;
  }
  return out;
}

/** Build the overlay/compare model from up to MAX_COMPARE analyzed flights. */
export function buildComparison(inputs: CompareInput[]): Comparison {
  const items = inputs.slice(0, MAX_COMPARE);

  // Each flight's time relative to its own liftoff, plus the overall span.
  const rels = items.map((it) => {
    const t0 = liftoffTime(it.analysis);
    const time = it.analysis.series.time;
    const rel = new Float64Array(time.length);
    for (let i = 0; i < time.length; i++) rel[i] = time[i] - t0;
    return rel;
  });

  let gStart = Infinity;
  let gEnd = -Infinity;
  for (const rel of rels) {
    if (rel.length === 0) continue;
    gStart = Math.min(gStart, rel[0]);
    gEnd = Math.max(gEnd, rel[rel.length - 1]);
  }
  if (!Number.isFinite(gStart) || !Number.isFinite(gEnd) || gEnd <= gStart) {
    gStart = 0;
    gEnd = 1;
  }
  // Keep at most ~1.5 s of pre-launch context; the interesting part is t ≥ 0.
  gStart = Math.max(gStart, -1.5);

  const grid = new Float64Array(GRID_POINTS);
  const step = (gEnd - gStart) / (GRID_POINTS - 1);
  for (let i = 0; i < GRID_POINTS; i++) grid[i] = gStart + step * i;

  const flights: CompareFlight[] = items.map((it, idx) => {
    const { series, metrics } = it.analysis;
    // Per-sample Mach and dynamic pressure from the same atmosphere the analysis
    // used, built here so they resample onto the shared grid like the rest.
    const n = Math.min(series.velocity.length, series.airDensity.length);
    const mach = new Float64Array(series.velocity.length);
    const q = new Float64Array(series.velocity.length);
    // A velocity judged impossible had its Mach and max-Q headlines withheld; don't
    // draw the overlay curves derived from it either (the velocity line still shows).
    const velUsable = !series.velocityImplausible;
    for (let i = 0; i < mach.length; i++) {
      const v = series.velocity[i];
      const sos = series.speedOfSoundProfile[i]; // local speed of sound at each height
      mach[i] = velUsable && Number.isFinite(sos) && sos > 0 ? v / sos : NaN;
      q[i] = velUsable && i < n ? 0.5 * series.airDensity[i] * v * v : NaN;
    }
    return {
      id: it.id,
      name: it.name,
      formatLabel: it.formatLabel,
      ...(it.flownAt ? { flownAt: it.flownAt } : {}),
      color: COMPARE_PALETTE[idx % COMPARE_PALETTE.length],
      altitude: resample(rels[idx], series.altitude, grid),
      velocity: resample(rels[idx], series.velocity, grid),
      // Only a measured acceleration overlays — a baro-derived one is differentiation
      // noise (a real trace swings hundreds of g) whose peak is already withheld, so its
      // curve isn't drawn either; an empty series leaves the overlay to the flights that
      // measured it.
      acceleration:
        series.accelerationSource === 'device'
          ? resample(rels[idx], series.acceleration, grid)
          : new Float64Array(grid.length).fill(NaN),
      mach: resample(rels[idx], mach, grid),
      dynamicPressure: resample(rels[idx], q, grid),
      liftoffDetected: it.analysis.events.some((e) => e.type === 'liftoff'),
      // Rebased onto the shared zero, the same subtraction the series went through above.
      events: it.analysis.events
        .filter((e) => e.type !== 'liftoff' && Number.isFinite(e.time))
        .map((e) => ({ type: e.type, label: e.label, t: e.time - liftoffTime(it.analysis) })),
      metrics,
    };
  });

  return { time: grid, flights };
}

export interface Agreement {
  key: string;
  /** Lower-case metric name for a sentence ("apogee", "max speed"). */
  label: string;
  min: number;
  max: number;
  /** Spread as a percentage of the mean — how far apart the readings are. */
  spreadPct: number;
  count: number;
  /** True when the contributing flights don't all share one measurement source —
   *  e.g. one max speed is device-measured and another is altitude-derived. Some of the
   *  spread is then method, not flight, and it has a direction: on all four corpus pairs
   *  where one recording measured the speed and another differentiated it out of an
   *  altitude, the derived one reads HIGH — by 5%, 23%, 31% and 110%. So a mixed spread
   *  overstates the disagreement rather than bounding it. */
  mixedSource: boolean;
  /** True when at least one contributing value is a floor rather than the true peak —
   *  today an accelerometer that saturated at its full-scale limit. Its real peak is
   *  higher than logged, so the spread shown is misleading (it may be smaller than it
   *  looks): flagged so the cross-check doesn't read a sensor limit as a flight gap. */
  saturated: boolean;
}

/**
 * How closely the compared flights' headline numbers agree. Read as a cross-check:
 * if these are independent recordings of the SAME flight (redundant altimeters, a
 * booster and its sustainer bay), close agreement builds confidence and a large gap
 * is a flag worth chasing; if they're different flights, it's just the spread. A
 * measurement of the recordings, never a verdict — so it's stated as a range, not a
 * single blessed number. Only metrics with a finite value on two or more flights.
 */
/** One stated launch day, and which recordings state it — the evidence behind a
 *  different-days reading, in the form that lets a flyer find the odd clock. */
export interface StatedDay {
  /** `YYYY-MM-DD`, as the file states it. */
  day: string;
  /** The recordings whose files state that day, in comparison order. */
  names: string[];
}

/**
 * Whether these recordings could be of one flight — the question the cross-check's whole
 * framing rests on. It is a hypothesis, and the files can refute it: where two of them
 * state a launch date and those dates are days apart, no reading of them is a
 * redundant-altimeter agreement, and calling a 201% apogee gap an "agreement to within
 * 201%" would be dressing a comparison of different flights as a failed reconciliation.
 *
 * Returns the days the files state, each with the recordings stating it, when the
 * hypothesis is refuted — and null when the question stays open, which is the honest
 * answer whenever fewer than two files state a date.
 *
 * Deliberately generous: a day of slack, because one recording can stamp UTC while another
 * stamps a logger's own wall clock, and an evening launch straddles midnight between them.
 * Two flights on consecutive days of one launch weekend therefore keep the conditional
 * framing. This only fires where the record makes the hypothesis impossible, not unlikely.
 *
 * **What it rests on, and what it cannot do.** The evidence is the stated dates and nothing
 * else, and a device clock can be wrong — one corpus TeleMetrum insists on 27 Apr 2013 for a
 * flight flown in October 2023. The readings cannot arbitrate: swept over the corpus, 8 of
 * 154 pairs of recordings of genuinely DIFFERENT flights agree on apogee to within 8%, the
 * closest to 0.55% — tighter than 6 of the 17 pairs that really are one flight, and tighter
 * on time-to-apogee than 4 of them. So "the numbers agree, so the clock must be wrong" is
 * not a test this corpus supports, and every surface says the reading is the dates' alone.
 */
export function statedDaySplit(flights: CompareFlight[]): StatedDay[] | null {
  const stated = flights
    .map((f) => ({ name: f.name, day: f.flownAt?.stamp.slice(0, 10) }))
    .filter((s): s is { name: string; day: string } => !!s.day && /^\d{4}-\d{2}-\d{2}$/.test(s.day));
  if (stated.length < 2) return null;
  const ms = stated.map((s) => Date.parse(`${s.day}T00:00:00Z`));
  const span = Math.max(...ms) - Math.min(...ms);
  if (!(span > 36 * 3600 * 1000)) return null;
  const byDay = new Map<string, string[]>();
  for (const s of stated) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.name]);
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, names]) => ({ day, names }));
}

/** Just the distinct days, for the places that name them without naming the recordings. */
export function differentFlightDays(flights: CompareFlight[]): string[] | null {
  return statedDaySplit(flights)?.map((d) => d.day) ?? null;
}

/**
 * The days with the recordings that state them — "30 Oct 2021 (TeleMetrum), 11 May 2024
 * (BlRv_SN1537)". Naming the files is the point: a flyer who knows these WERE one flight
 * can see at a glance which device is carrying the wrong clock, which a bare list of days
 * cannot tell them. `label` shortens a file name in the surface's own voice.
 */
export function statedDaysPhrase(days: StatedDay[], label: (name: string) => string): string {
  return days.map((d) => `${formatFlownDay(d.day)} (${d.names.map(label).join(', ')})`).join(', ');
}

/**
 * How many of the compared files state a day at all — because the verdict rests on the ones
 * that do, and a reader counting columns will notice if it doesn't add up.
 *
 * Comparing three flights where only two carry a date, the panel read "The files date these
 * on different days — 30 Oct 2021 (…), 11 May 2024 (…)", naming two days beside three
 * columns and leaving the third to be wondered about. It states the count now: the file with
 * no date is not evidence either way, and saying so is the same honesty as the caveat below.
 */
export function statedDayCount(days: StatedDay[]): number {
  return days.reduce((n, d) => n + d.names.length, 0);
}

/**
 * The caveat that must sit beside every different-days reading, on every surface. The
 * reading rests on the stated dates and nothing else, and a clock that was never set states
 * a wrong day — so the one alternative explanation is named rather than left for the flyer
 * to think of. It also says why the numbers can't break the tie: see `statedDaySplit`, where
 * the corpus measurement behind that claim is recorded.
 */
/** "…and the third states none", where some of the compared files carry no date. Empty when
 *  every one of them does, so the common case reads exactly as before. */
export function undatedNote(days: StatedDay[], flights: number): string {
  const undated = flights - statedDayCount(days);
  if (undated <= 0) return '';
  return ` The other ${undated === 1 ? 'file states' : `${undated} files state`} no date, so ${undated === 1 ? 'it is' : 'they are'} not evidence either way.`;
}

export const DIFFERENT_DAYS_CAVEAT =
  'That reads off the stated dates alone. If you flew these as one flight, a device clock is wrong — Debrief reports the day each file states and never corrects it, and the readings cannot settle it, because different flights can agree as closely as two recordings of one.';

/**
 * Where a spread stops reading as ordinary scatter between two instruments and starts reading
 * as a disagreement worth chasing. The comparison panel colours a row amber past it.
 */
export const CROSS_CHECK_WIDE = 10;

/**
 * How to introduce the cross-check list. "Agree to within" is only true when they do — with a
 * 193% burn-time spread in the list it reads as nonsense, and the corpus has a same-flight
 * group that produces exactly that. The panel already knows which side of the line the set is
 * on, because it colours by the same threshold; this makes the sentence say it too.
 *
 * One function rather than the three copies of the sentence that render it (the panel, the
 * Markdown write-up and the HTML report), so they cannot drift on what "agreement" means.
 */
export function crossCheckLede(agree: Agreement[]): 'agree to within' | 'differ by' {
  return agree.some((a) => a.spreadPct > CROSS_CHECK_WIDE) ? 'differ by' : 'agree to within';
}

export function crossCheck(flights: CompareFlight[]): Agreement[] {
  const specs: {
    key: string;
    label: string;
    get: (m: FlightMetrics) => number | null;
    source?: (m: FlightMetrics) => string;
    /** Marks a contributing value as a floor rather than a true peak (a saturated sensor). */
    soft?: (m: FlightMetrics) => boolean;
  }[] = [
    // Apogee is altitude-sourced on every logger, so there's no measured/derived
    // mix to flag — even a GPS-vs-baro apogee pair is independent corroboration.
    { key: 'apogee', label: 'apogee', get: (m) => m.apogeeAltitude },
    // Time to apogee is a pure timing (liftoff → apogee) — a temporal cross-check that
    // corroborates the spatial apogee agreement and shares no measurement source with it.
    // Two recordings of one flight saw the same climb, so it should match tightly.
    { key: 'timeToApogee', label: 'time to apogee', get: (m) => (Number.isFinite(m.timeToApogee) ? m.timeToApogee : null) },
    // Velocity can be device-measured on one flight and altitude-derived on another;
    // a derived peak reads high (never low, on the corpus), so a mixed cross-check is
    // flagged (mixedSource).
    { key: 'maxVelocity', label: 'max speed', get: (m) => m.maxVelocity, source: (m) => m.maxVelocitySource },
    // Peak acceleration, when two recordings both carry it — a redundant-altimeter
    // check on the g the airframe felt. Baro-derived acceleration is a soft second
    // derivative, so a measured-vs-derived pair is flagged like max speed.
    {
      key: 'maxAcceleration',
      label: 'max acceleration',
      get: (m) => (Number.isFinite(m.maxAcceleration) ? m.maxAcceleration : null),
      source: (m) => m.accelerationSource,
      // A clipped peak is a floor, not the truth — flag the spread rather than read a
      // sensor's full-scale limit as a difference between the flights.
      soft: (m) => m.accelClipped === true,
    },
    // Recovery, when both recordings caught it — the terminal descent rate under each
    // canopy is altitude-derived on every logger (no source mix), so two altimeters of
    // one flight should see the same sink. It rounds the cross-check out past apogee into
    // the descent, where recovery problems actually show up. It's a looser corroboration
    // than the apogee — chute behaviour, wind and where the rate is sampled all vary — so
    // read a modest gap as ordinary spread, not a fault.
    { key: 'drogueDescentRate', label: 'drogue descent rate', get: (m) => m.drogueDescentRate },
    { key: 'mainDescentRate', label: 'main descent rate', get: (m) => m.mainDescentRate },
    // Kept apart from the main leg on purpose. Four recordings of one corpus flight read
    // 24.6, 30.9 and 26.7 ft/s over their main legs while the fourth resolved no deployment
    // and read 71.3 ft/s over the whole descent; sharing a key reported that as a 121.6%
    // disagreement between instruments that had measured different things.
    { key: 'wholeDescentRate', label: 'whole-descent rate', get: (m) => m.wholeDescentRate },
    // Everything below is a reading the comparison TABLE already shows. Leaving them out of
    // the cross-check meant the panel could report agreement — the sentence a flyer reads to
    // decide whether to trust the set — over a shorter list of readings than the table beside
    // it displayed. Measured on the corpus's same-flight groups: iss-endurance's worst CHECKED
    // spread was 26.4% while its max-Q differed by 53% (58,017 against 99,672 Pa), its burn
    // time by 193% and its burnout altitude by 176%; the four-altimeter group read every
    // checked metric inside 6.7% — as tight an agreement as the corpus has — while its tilt at
    // burnout ran 4°, 9° and 11°.
    //
    // Max-Q first, because of the three it is the one a flyer acts on structurally: it is the
    // load case an airframe is sized against, and two recordings of one flight disagreeing 53%
    // about it is exactly the disagreement this panel exists to surface. It is ½ρv², so it
    // inherits the velocity's provenance and a measured-vs-derived pair is flagged like the
    // speed itself.
    {
      key: 'maxDynamicPressure',
      label: 'max-Q',
      get: (m) => m.maxDynamicPressure,
      source: (m) => m.maxVelocitySource,
    },
    // Burn time and burnout altitude are read at the same instant, so they carry the same
    // provenance: 'measured' from a signed axial crossing, or 'derived' from the speed peak.
    // A pair that mixes the two is not two readings of one quantity — it is two definitions of
    // the instant — which is precisely what the flag is for.
    { key: 'burnTime', label: 'burn time', get: (m) => m.burnTime, source: (m) => m.burnoutSource ?? 'unknown' },
    {
      key: 'burnoutAltitude',
      label: 'burnout altitude',
      get: (m) => m.burnoutAltitude,
      source: (m) => m.burnoutSource ?? 'unknown',
    },
    // When the main fired, from each recording's own liftoff. Two bays on one airframe are
    // supposed to fire together; 221 s apart on one corpus group is the single most actionable
    // thing a redundant-altimeter comparison can report, and it was not reported at all.
    { key: 'mainDeployTime', label: 'main deploy time', get: (m) => m.mainDeployTime },
    // Read straight off each logger's own attitude solution, so no source mix — but two
    // recordings on one airframe flew at one angle, and a wide spread means at least one
    // attitude solution has drifted rather than that the rocket did something.
    { key: 'tiltAtBurnout', label: 'tilt at burnout', get: (m) => m.tiltAtBurnout },
  ];
  const out: Agreement[] = [];
  for (const s of specs) {
    // Keep each contributing flight's value with its measurement source, so the
    // spread and the mixed-source flag are read off exactly the same set.
    const contrib = flights
      .map((f) => ({ v: s.get(f.metrics), src: s.source?.(f.metrics), soft: s.soft?.(f.metrics) ?? false }))
      .filter((c): c is { v: number; src: string | undefined; soft: boolean } => c.v != null && Number.isFinite(c.v) && c.v > 0);
    if (contrib.length < 2) continue;
    const vals = contrib.map((c) => c.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    // Only a genuine mix of differing, tracked sources counts (an untracked source
    // is undefined and ignored).
    const mixedSource = new Set(contrib.map((c) => c.src).filter((x): x is string => x != null)).size > 1;
    const saturated = contrib.some((c) => c.soft);
    out.push({ key: s.key, label: s.label, min, max, spreadPct: mean > 0 ? ((max - min) / mean) * 100 : 0, count: vals.length, mixedSource, saturated });
  }
  return out;
}
