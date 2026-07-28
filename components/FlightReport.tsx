'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RawFlight } from '@/lib/flight/types';
import type { FlightAnalysis } from '@/lib/analyze/types';
import { accelIn, accelInG, fmtAccel, fmtLength, fmtMach, fmtSpeed, fmtTime, lengthIn, placesFor, speedIn, systemOf, unitsOf } from '@/lib/display';
import type { UnitChoice, Units } from '@/lib/display';
import { summaryText, summaryMarkdown, summaryHtml, analyzedDataCsv, analysisJson, reportStem, formatAnalyzedAt, reportTable, type RecoveryFigures } from '@/lib/report';
import { formatFlownAt } from '@/lib/flight/flownAt';
import { encodeFlight, shareUrl, MAX_SHARE_URL } from '@/lib/share';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { getChannel } from '@/lib/flight/types';
import { buildPlotChannels } from '@/lib/explore';
import { canMeasureDrag } from '@/lib/drag';
import { MAX_REASONABLE_MASS_KG } from '@/lib/landing';
import { MAX_REASONABLE_DEPLOY_M } from '@/lib/deploy';
import { MAX_REASONABLE_DELAY_S } from '@/lib/ejection';
import { download } from '@/lib/download';
import { plotSvg } from '@/lib/svgChart';
import { zip, type ZipEntry } from '@/lib/zip';
import UnitsControl from './UnitsControl';
import { useIsDark } from './useIsDark';
import { useFigureDark, FigureThemeButton } from './FigureTheme';
import Chart, { focusRange, type ChartMarker } from './Chart';
import MetricGrid from './MetricGrid';
import { copyTable } from '@/lib/copyTable';
import { landedInRecord, landingRate } from '@/lib/readings';
import { loadHidden, saveHidden, toggleHidden, loadHiddenFigures, saveHiddenFigures } from '@/lib/reportProfile';
import DeviceSummary from './DeviceSummary';
import GpsApogee from './GpsApogee';
import ChannelExplorer from './ChannelExplorer';
import LogDetails from './LogDetails';
import FlightTimeline from './FlightTimeline';
import RailExit from './RailExit';
import LandingEnergy from './LandingEnergy';
import DragCoefficient from './DragCoefficient';
import ParachuteCd from './ParachuteCd';
import DrogueCd from './DrogueCd';
import EjectionDelay from './EjectionDelay';
import DeployAltitude from './DeployAltitude';
import FlightCard from './FlightCard';
import GroundTrack from './GroundTrack';

const ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800';
// Same button, but it never compresses inside the horizontally-scrolling "Save a file"
// strip on a phone — a shrunk button would clip its label.
const SAVE_BTN = `${ACTION_BTN} shrink-0`;

function round(v: number, p: number): string {
  const f = Math.pow(10, p);
  return (Math.round(v * f) / f).toLocaleString('en-US', { maximumFractionDigits: p });
}

export default function FlightReport({
  flight,
  analysis,
  analyzedAt,
  sourceText,
  sys,
  onToggleUnits,
  onSetUnits,
}: {
  flight: RawFlight;
  analysis: FlightAnalysis;
  analyzedAt: number;
  sourceText: string;
  sys: UnitChoice;
  onToggleUnits: () => void;
  onSetUnits: (units: Units) => void;
}) {
  const dark = useIsDark();
  const [figureDark, toggleFigureDark] = useFigureDark();
  const { series, events, metrics, warnings } = analysis;
  const notes = flight.notes;

  // The descending mass is one quantity used by two recovery panels (landing
  // energy and parachute Cd), so the report owns it and feeds both — one input,
  // no drift. Persisted on this device, like the unit choice.
  const [massKg, setMassKgState] = useState<number | null>(null);
  useEffect(() => {
    const v = Number(window.localStorage.getItem('debrief.mass.kg'));
    setMassKgState(Number.isFinite(v) && v > 0 && v <= MAX_REASONABLE_MASS_KG ? v : null);
  }, []);
  const setMassKg = useCallback((kg: number | null) => {
    setMassKgState(kg);
    try {
      if (kg == null) window.localStorage.removeItem('debrief.mass.kg');
      else window.localStorage.setItem('debrief.mass.kg', String(kg));
    } catch {
      /* ignore */
    }
  }, []);

  // The main-deploy altitude the flyer set on the altimeter — owned here (like the mass) so
  // the main-deploy verification can ride into the exported report, not just the panel.
  const [setMainDeployM, setSetMainDeployMState] = useState<number | null>(null);
  useEffect(() => {
    const v = Number(window.localStorage.getItem('debrief.maindeploy.m'));
    setSetMainDeployMState(Number.isFinite(v) && v > 0 && v <= MAX_REASONABLE_DEPLOY_M ? v : null);
  }, []);
  const setMainDeploy = useCallback((m: number | null) => {
    setSetMainDeployMState(m);
    try {
      if (m == null) window.localStorage.removeItem('debrief.maindeploy.m');
      else window.localStorage.setItem('debrief.maindeploy.m', String(m));
    } catch {
      /* ignore */
    }
  }, []);

  // The printed motor delay the flyer flew — owned here (like the mass and set altitude) so
  // the ejection-delay check rides into the exported report, not just the panel.
  const [delayS, setDelaySState] = useState<number | null>(null);
  useEffect(() => {
    const v = Number(window.localStorage.getItem('debrief.delay.s'));
    setDelaySState(Number.isFinite(v) && v > 0 && v <= MAX_REASONABLE_DELAY_S ? v : null);
  }, []);
  const setDelayS = useCallback((s: number | null) => {
    setDelaySState(s);
    try {
      if (s == null) window.localStorage.removeItem('debrief.delay.s');
      else window.localStorage.setItem('debrief.delay.s', String(s));
    } catch {
      /* ignore */
    }
  }, []);
  const altChartRef = useRef<HTMLDivElement>(null);
  const printingRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [copiedTable, setCopiedTable] = useState<'yes' | 'no' | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  /** Whether this flight fits in a link, and the payload if it does — worked out once when
   *  the report opens rather than when the button is pressed. A share link carries the whole
   *  file inside the URL, so past a certain size there is no link to build; offering a
   *  button that is always enabled and fails on an ordinary flight (a 220 KB corpus log is
   *  already too big) makes that discoverable only by pressing it. */
  const [sharePayload, setSharePayload] = useState<{ ok: true; url: string } | { ok: false } | null>(null);
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);

  // An optional label (rocket, motor, flight number) and free-text notes the flyer
  // adds to make an exported report their own — for a cert document, a project, or a
  // forum post. They ride into every text/Markdown/JSON export and the printed card,
  // and belong to the flight in view, so a new flight clears them.
  const [reportLabel, setReportLabel] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  useEffect(() => {
    setReportLabel('');
    setReportNotes('');
  }, [flight.source]);
  // Which readings this flyer wants in a report, remembered on this device and applied
  // both here and in every report export — the same decision, made once.
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => setHidden(loadHidden()), []);
  const toggleReading = useCallback((label: string) => {
    setHidden((prev) => {
      const next = toggleHidden(prev, label);
      saveHidden(next);
      return next;
    });
  }, []);

  // …and which figures travel with it. Same decision, same shape, kept on this device.
  const [hiddenFigures, setHiddenFigures] = useState<string[]>([]);
  useEffect(() => setHiddenFigures(loadHiddenFigures()), []);
  const toggleFigure = useCallback((title: string) => {
    setHiddenFigures((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      saveHiddenFigures(next);
      return next;
    });
  }, []);

  const reportMeta = useMemo(
    () => ({ label: reportLabel, notes: reportNotes, hidden }),
    [reportLabel, reportNotes, hidden],
  );
  // The recovery figures a flyer entered — the descending mass (landing energy) and the
  // set main-deploy altitude (the fired-where-set check) — ride into the exported report
  // too, so what's on screen isn't left behind when they hand the report in.
  const recovery = useMemo<RecoveryFigures | undefined>(() => {
    const mainEvt = events.find((e) => e.type === 'main');
    const mainDeploy = setMainDeployM != null && mainEvt ? { setM: setMainDeployM, actualM: mainEvt.altitude } : undefined;
    const ejectionDelay =
      delayS != null && metrics.coastTime != null ? { printedS: delayS, coastS: metrics.coastTime } : undefined;
    if (massKg == null && !mainDeploy && !ejectionDelay) return undefined;
    return {
      ...(massKg != null ? { descendingMassKg: massKg } : {}),
      ...(mainDeploy ? { mainDeploy } : {}),
      ...(ejectionDelay ? { ejectionDelay } : {}),
    };
  }, [massKg, setMainDeployM, delayS, events, metrics.coastTime]);

  const stem = reportStem(flight.source);
  // A GPS track, when the logger recorded one, drives the recovery (walkback) view.
  const gpsLat = getChannel(flight, 'latitude');
  const gpsLon = getChannel(flight, 'longitude');

  // Build the link once, when the report opens, so the button can say whether there is one
  // before it is pressed. The work is the same gzip the click used to do; doing it here
  // costs it once per flight instead of once per press, and it is what turns "press and find
  // out" into a control that states its own condition. Cancelled if the flight changes
  // underneath it, so a slow encode can't answer for the wrong flight.
  useEffect(() => {
    let live = true;
    setSharePayload(null);
    setShareMsg(null);
    (async () => {
      try {
        const payload = await encodeFlight(flight.source, sourceText);
        const url = shareUrl(window.location.origin, window.location.pathname, payload);
        if (live) setSharePayload(url.length > MAX_SHARE_URL ? { ok: false } : { ok: true, url });
      } catch {
        if (live) setSharePayload({ ok: false });
      }
    })();
    return () => {
      live = false;
    };
  }, [flight.source, sourceText]);

  async function shareLink() {
    if (sharePayload === null) {
      setShareMsg('Still working out whether this flight fits in a link — try again in a moment.');
      return;
    }
    // Not disabled, deliberately: a disabled button on a phone is a dead end — there is no
    // hover to read a title from and nothing happens on a tap. The label says the answer
    // before it is pressed, and pressing it explains what to do instead.
    if (!sharePayload.ok) {
      setShareMsg(
        'This log is too big to fit inside a link — a share link carries the whole file in the URL. Save .html below is the same report as one file you can send, and Save bundle packs the report, the charts and the data together.',
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(sharePayload.url);
      setShareMsg('Link copied — the flight rides inside it; nothing was uploaded.');
      setTimeout(() => setShareMsg(null), 4000);
    } catch {
      setShareMsg('Couldn’t write to the clipboard in this browser — the exports below all save a file instead.');
    }
  }

  async function copySummary() {
    const text = summaryText(flight, analysis, sys, analyzedAt, reportMeta, recovery);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      download(new Blob([text], { type: 'text/plain' }), `${stem}-debrief.txt`);
    }
  }

  // The readings as a table, for the club spreadsheet or the cert document — the same
  // paste a spreadsheet has supported forever, rather than a round trip through a file.
  async function copyReadings() {
    const { header, rows } = reportTable(analysis, sys, reportMeta, recovery);
    const ok = await copyTable(header, rows);
    setCopiedTable(ok ? 'yes' : 'no');
    setTimeout(() => setCopiedTable(null), 4000);
  }

  function downloadSummary() {
    download(new Blob([summaryText(flight, analysis, sys, analyzedAt, reportMeta, recovery)], { type: 'text/plain' }), `${stem}-debrief.txt`);
  }

  function downloadMarkdown() {
    download(new Blob([summaryMarkdown(flight, analysis, sys, analyzedAt, reportMeta, recovery)], { type: 'text/markdown' }), `${stem}-debrief.md`);
  }

  function downloadData() {
    download(new Blob([analyzedDataCsv(flight, analysis, sys)], { type: 'text/csv' }), `${stem}-debrief.csv`);
  }

  function downloadJson() {
    download(
      new Blob([analysisJson(flight, analysis, sys, analyzedAt, reportMeta, recovery)], { type: 'application/json' }),
      `${stem}-debrief.json`,
    );
  }

  // Print a clean flight card. Force a light theme first so the canvas charts
  // (whose pixels are baked at draw time, beyond the reach of print CSS) come
  // out on white, then restore whatever the user had once printing is done.
  function printCard() {
    // Ignore re-entry until the previous print has restored, so a double-click
    // can't capture the already-forced `light` as the "original" theme.
    if (printingRef.current) return;
    printingRef.current = true;

    const el = document.documentElement;
    const hadDark = el.classList.contains('dark');
    const hadLight = el.classList.contains('light');
    el.classList.remove('dark');
    el.classList.add('light');

    const mql = window.matchMedia('print');
    let done = false;
    const restore = () => {
      if (done) return;
      done = true;
      el.classList.toggle('dark', hadDark);
      el.classList.toggle('light', hadLight);
      window.removeEventListener('afterprint', restore);
      mql.removeEventListener?.('change', onMedia);
      printingRef.current = false;
    };
    // Restore on whichever signal the browser gives us: `afterprint`, or the
    // print media-query turning back off. Either way `restore` is idempotent, so
    // we never get stuck in light mode even if only one of them fires.
    const onMedia = (e: MediaQueryListEvent) => {
      if (!e.matches) restore();
    };
    window.addEventListener('afterprint', restore);
    mql.addEventListener?.('change', onMedia);

    // Give React a beat to repaint the charts light before the dialog opens.
    window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // Dialog was blocked/unavailable — nothing got printed, so undo now.
        restore();
      }
    }, 250);
  }

  function saveChartPng() {
    const canvas = altChartRef.current?.querySelector('canvas');
    if (!canvas) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = dark ? '#09090b' : '#ffffff'; // solid background, not transparent
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => blob && download(blob, `${stem}-altitude.png`));
  }

  // One-click zoom presets that frame all three charts to a flight phase — and the
  // window the charts OPEN on, which is the flight rather than the file. A logger armed
  // early records the pad wait, and a corpus TeleMega holds 308 s of it before a 76 s
  // flight: opened on the whole record, four fifths of that chart is a rocket standing
  // still. The record either side is never dropped — "Full record" and zooming out reach
  // it, and it is where the plot returns on a double-click reset.
  const zoomPresets = useMemo(() => {
    const t0 = series.time[0] ?? 0;
    const tEnd = series.time[series.time.length - 1] ?? 0;
    const at = (type: string) => events.find((e) => e.type === type)?.time;
    const lo = at('liftoff');
    const bo = at('burnout');
    const apo = at('apogee');
    const land = at('landing');
    const presets: { label: string; min: number; max: number }[] = [];
    if (lo != null) {
      // A little air either side so liftoff and touchdown aren't drawn on the frame.
      const end = land ?? tEnd;
      const pad = Math.max(1, (end - lo) * 0.03);
      presets.push({ label: 'Flight', min: Math.max(t0, lo - pad), max: Math.min(tEnd, end + pad) });
    }
    if (lo != null && bo != null && bo > lo) presets.push({ label: 'Boost', min: Math.max(t0, lo - 0.3), max: bo + 1 });
    if (lo != null && apo != null) presets.push({ label: 'Ascent', min: Math.max(t0, lo - 0.3), max: Math.min(tEnd, apo + (tEnd - apo) * 0.05 + 1) });
    if (apo != null && land != null && land > apo) presets.push({ label: 'Descent', min: Math.max(t0, apo - 1), max: land });
    presets.push({ label: 'Full record', min: t0, max: tEnd });
    return presets;
  }, [series.time, events]);

  // What the charts open on: the flight where one was detected, the whole record where it
  // wasn't (a file with no liftoff has no flight window to choose).
  const chartRange = useMemo<[number, number] | undefined>(() => {
    const flight = zoomPresets.find((p) => p.label === 'Flight');
    return flight ? [flight.min, flight.max] : undefined;
  }, [zoomPresets]);

  // Which preset the charts are currently showing, so the row reports the view instead of
  // being four buttons with no state. Read off the charts' own visible range (they report
  // it on init and on every zoom), matched within half a second so a preset still reads as
  // active after uPlot has rounded the window to its axis.
  const [view, setView] = useState<[number, number] | null>(null);
  const onChartView = useCallback((min: number, max: number) => setView([min, max]), []);
  const activePreset = useMemo(() => {
    if (!view) return null;
    const near = zoomPresets.find((p) => Math.abs(p.min - view[0]) < 0.5 && Math.abs(p.max - view[1]) < 0.5);
    return near?.label ?? null;
  }, [view, zoomPresets]);

  // The report's headline figures as standalone vector SVGs — altitude, and (when
  // recorded) velocity and acceleration — events marked, crisp at any size. One
  // definition feeds both the single Save .svg button and the bundle, so they can't
  // drift. Built lazily on click, not on every render.
  const figureSvgs = useCallback((): { title: string; name: string; svg: string }[] => {
    const markerDefs = events.map((e) => ({ x: e.time, label: e.label.toLowerCase(), color: EVENT_COLOR[e.type] }));
    const figs: { title: string; name: string; svg: string }[] = [
      {
        title: 'Altitude',
        name: `${stem}-altitude.svg`,
        svg: plotSvg({
          x: series.time,
          series: [
            { label: `Altitude (${unitsOf(sys).length} AGL)`, color: '#6366f1', axis: 'left', values: Array.from(series.altitude, (m) => lengthIn(m, sys)) },
          ],
          xLabel: 'Time (s)',
          leftLabel: `${unitsOf(sys).length} AGL`,
          markers: markerDefs,
          dark: figureDark,
          ...(chartRange ? { xRange: chartRange } : {}),
        }),
      },
    ];
    if (series.velocity.some((v) => Number.isFinite(v))) {
      figs.push({
        title: 'Velocity',
        name: `${stem}-velocity.svg`,
        svg: plotSvg({
          x: series.time,
          series: [{ label: `Velocity (${unitsOf(sys).speed})`, color: '#10b981', axis: 'left', values: Array.from(series.velocity, (v) => speedIn(v, sys)) }],
          xLabel: 'Time (s)',
          leftLabel: unitsOf(sys).speed,
          markers: markerDefs,
          dark: figureDark,
          ...(chartRange ? { xRange: chartRange } : {}),
        }),
      });
    }
    if (series.accelerationSource === 'device') {
      figs.push({
        title: 'Acceleration',
        name: `${stem}-acceleration.svg`,
        svg: plotSvg({
          x: series.time,
          series: [
            {
              label: `${series.accelerationResultant ? 'Total ' : ''}Acceleration (${unitsOf(sys).accel})`,
              color: '#f59e0b',
              axis: 'left',
              values: Array.from(series.acceleration, (a) => accelIn(a, sys)),
            },
          ],
          xLabel: 'Time (s)',
          leftLabel: unitsOf(sys).accel,
          markers: markerDefs,
          dark: figureDark,
          ...(chartRange ? { xRange: chartRange } : {}),
        }),
      });
    }
    // What the flyer asked for. Every figure the flight supports is drawn — the choice is
    // about the document, not about the analysis — and turning them all off leaves a report
    // of numbers, which is a legitimate answer for a table-only write-up.
    return figs.filter((f) => !hiddenFigures.includes(f.title));
  }, [series, events, sys, figureDark, stem, chartRange, hiddenFigures]);

  /** Every figure this flight could carry, chosen or not — what the chooser lists. */
  const figureTitles = useMemo(() => {
    const titles = ['Altitude'];
    if (series.velocity.some((v) => Number.isFinite(v))) titles.push('Velocity');
    if (series.accelerationSource === 'device') {
      titles.push('Acceleration');
    }
    return titles;
  }, [series]);

  function saveChartSvg() {
    // The first figure the flyer kept — not necessarily altitude, and possibly none at all.
    const [first] = figureSvgs();
    if (!first) return;
    download(new Blob([first.svg], { type: 'image/svg+xml' }), first.name);
  }

  // One self-contained HTML file — the numbers, events, cross-check and caveats plus the
  // charts inline as vector SVG — a flyer can save, email, print or archive without
  // re-running Debrief. Report-grade output as a single portable document.
  function downloadHtml() {
    const figures = figureSvgs().map((f) => ({ title: f.title, svg: f.svg }));
    download(
      new Blob([summaryHtml(flight, analysis, sys, analyzedAt, reportMeta, recovery, figures)], { type: 'text/html' }),
      `${stem}-debrief.html`,
    );
  }

  // Package the report-grade artifacts a flyer needs — the Markdown write-up (with
  // the logger's own cross-check), the analyzed series as CSV, and the headline
  // figures as SVG — into one ZIP, so a cert doc or forum post is a single download
  // rather than a handful of separate clicks. Zipped in the browser; nothing uploaded.
  async function downloadBundle() {
    setBundleMsg('Building bundle…');
    try {
      const entries: ZipEntry[] = [
        { name: `${stem}-summary.md`, data: summaryMarkdown(flight, analysis, sys, analyzedAt, reportMeta, recovery) },
        { name: `${stem}-data.csv`, data: analyzedDataCsv(flight, analysis, sys) },
        { name: `${stem}-debrief.json`, data: analysisJson(flight, analysis, sys, analyzedAt, reportMeta, recovery) },
        ...figureSvgs().map((f) => ({ name: f.name, data: f.svg })),
      ];
      download(await zip(entries), `${stem}-debrief.zip`);
      setBundleMsg('Bundle saved — summary, data and figures, all zipped locally.');
      setTimeout(() => setBundleMsg(null), 4000);
    } catch {
      setBundleMsg('Couldn’t build the bundle in this browser — the individual Save buttons still work.');
    }
  }

  // Memoized so an unrelated re-render (e.g. clicking Copy summary / Share link,
  // which only flips `copied`/`shareMsg`) doesn't change these prop identities
  // and tear down + rebuild the charts, which would reset any zoom the user set.
  const markers = useMemo<ChartMarker[]>(
    () => events.map((e) => ({ x: e.time, label: e.label.toLowerCase(), color: EVENT_COLOR[e.type] })),
    [events],
  );

  // Only a measured acceleration is charted. A baro-derived acceleration is a
  // noise-dominated second derivative whose peak is already withheld (a real trace swings
  // hundreds of g), so it isn't plotted or exported either — the velocity chart carries
  // the derived kinematics instead.
  // A dead column no longer reaches here as a 'device' source — the analyzer treats one as
  // no accelerometer at all (see hasLiveSamples in lib/analyze). This used to carry its own
  // `v !== 0` check on the NORMALISED array, which a gravity-removed channel defeated by
  // construction: its zeros arrive as a flat +9.80665. A second, weaker copy of a guard that
  // now lives at the source is worse than none, because it reads as though it were doing the
  // work.
  const hasAccel = series.accelerationSource === 'device';

  // Air density over the drogue phase (apogee → main) — higher and thinner than the
  // ground, the right ρ for the drogue Cd. Median over the phase so noise averages out.
  const drogueDensity = useMemo(() => {
    const ground = series.airDensity.find((d) => Number.isFinite(d)) ?? 1.225;
    const apo = events.find((e) => e.type === 'apogee');
    const end = events.find((e) => e.type === 'main') ?? events.find((e) => e.type === 'landing');
    if (!apo || !end || end.index <= apo.index) return ground;
    const arr: number[] = [];
    for (let i = apo.index; i <= end.index; i++) if (Number.isFinite(series.airDensity[i])) arr.push(series.airDensity[i]);
    if (arr.length === 0) return ground;
    arr.sort((a, b) => a - b);
    return arr[arr.length >> 1];
  }, [events, series.airDensity]);

  // Speed (and Mach, once it's worth showing) at an event — so the events list
  // answers "how fast at burnout / at deployment", not just when and how high.
  const eventSpeed = (index: number): string => {
    // A velocity the analysis judged unusable is withheld everywhere it would be read as
    // a number, not just in the headline — printing the impossible figure beside burnout
    // while the headline shows "—" would hand it back with the withholding hidden.
    const v = series.velocityImplausible ? NaN : series.velocity[index];
    if (!Number.isFinite(v)) return '';
    const sos = series.speedOfSoundProfile[index]; // local speed of sound at the event's altitude
    const m = Number.isFinite(sos) && sos > 0 ? v / sos : NaN;
    return Number.isFinite(m) && Math.abs(m) >= 0.8 ? `${fmtSpeed(v, sys)} · ${fmtMach(m)}` : fmtSpeed(v, sys);
  };

  const altSeries = useMemo(() => [{ label: 'altitude', values: series.altitude, stroke: '#6366f1', width: 2 }], [series.altitude]);
  const velSeries = useMemo(() => [{ label: 'velocity', values: series.velocity, stroke: '#10b981' }], [series.velocity]);
  const accSeries = useMemo(() => [{ label: 'acceleration', values: series.acceleration, stroke: '#f59e0b' }], [series.acceleration]);
  const altFmt = useCallback((v: number) => round(lengthIn(v, sys), 0), [sys]);
  const velFmt = useCallback((v: number) => round(speedIn(v, sys), 0), [sys]);
  const accFmt = useCallback((v: number) => round(accelIn(v, sys), placesFor(unitsOf(sys).accel)), [sys]);

  // Every channel worth plotting, for the flexible explorer below.
  const plotChannels = useMemo(() => buildPlotChannels(flight, series), [flight, series]);

  // A per-flight key links the three charts' hover cursor and zoom range.
  const syncKey = useMemo(() => `flight-${Math.random().toString(36).slice(2)}`, [flight]);


  const eventSummary = events.map((e) => `${e.label.toLowerCase()} at ${fmtTime(e.time)}`).join(', ');
  const altLabel = `Line chart: altitude above ground against time, peaking at ${fmtLength(metrics.apogeeAltitude, sys)}. Marked events: ${eventSummary}.`;
  const velLabel = `Line chart: velocity against time${Number.isFinite(metrics.maxVelocity) ? `, peaking at ${fmtSpeed(metrics.maxVelocity, sys)}` : ''}.`;
  const accLabel = `Line chart: ${series.accelerationResultant ? 'total (resultant) ' : ''}acceleration against time${Number.isFinite(metrics.maxAcceleration) ? `, peaking at ${fmtAccel(metrics.maxAcceleration, sys)}` : ''}.`;

  return (
    <div className="space-y-8">
      <h2 className="sr-only">Flight report for {flight.source}</h2>
      {/* Print-only masthead: a printed card should still say what it is. */}
      <div className="hidden print:block">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Debrief · Flight Report</p>
      </div>
      {/* The flyer's own caption, once set — shown here on screen and on the printed
          card, and carried into the exports. */}
      {(reportLabel.trim() || reportNotes.trim()) && (
        <div className="space-y-1">
          {reportLabel.trim() && (
            <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {reportLabel.trim()}
            </h3>
          )}
          {reportNotes.trim() && (
            <p className="max-w-2xl whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
              {reportNotes.trim()}
            </p>
          )}
        </div>
      )}
      {/* File / format line */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 max-w-full truncate font-mono text-zinc-700 dark:text-zinc-300">
            {flight.source}
          </span>
          <span className="inline-flex shrink-0 items-center rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-300">
            {flight.formatLabel}
          </span>
          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">read locally — never uploaded</span>
        </div>
        <div className="flex flex-col gap-2 print:hidden">
          {/* Primary actions — what you do with the flight — stay in view even on a
              phone, where the file-format saves below scroll aside instead of stacking
              into four rows that push the numbers down. */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={copySummary} title="Copy a text summary to the clipboard" className={ACTION_BTN}>
              {copied ? 'Copied ✓' : 'Copy summary'}
            </button>
            <button
              type="button"
              onClick={copyReadings}
              title="Copy the readings as a table — lands in cells in a spreadsheet or document, and as tab-separated text everywhere else"
              className={ACTION_BTN}
            >
              {copiedTable === 'yes' ? 'Copied ✓' : 'Copy table'}
            </button>
            <button
              type="button"
              onClick={shareLink}
              title={
                sharePayload === null
                  ? 'Working out whether this flight fits in a link…'
                  : sharePayload.ok
                    ? 'Copy a link with the whole flight encoded in it — decoded in the browser, never uploaded'
                    : 'This log is too big to fit inside a link. Save .html or Save bundle below sends the whole report instead.'
              }
              className={ACTION_BTN}
            >
              {sharePayload?.ok === false ? 'Too big to link' : 'Share link'}
            </button>
            <button
              type="button"
              onClick={printCard}
              title="Print a clean flight card (or save it as a PDF) — numbers, events and charts on one page"
              className={ACTION_BTN}
            >
              Print
            </button>
            <UnitsControl sys={sys} onToggleUnits={onToggleUnits} onSetUnits={onSetUnits} />
          </div>
          {/* File exports — one saved file each. A single horizontal strip on a phone
              (so the flight rises up), wrapping inline on a wider screen. The strip fades
              at its right edge below sm:, because a button clipped mid-word by the viewport
              reads as broken rather than as "there is more this way". */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent sm:hidden dark:from-zinc-950"
            />
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">Save a file:</span>
            <button type="button" onClick={downloadSummary} title="Download the summary as a text file" className={SAVE_BTN}>
              Save .txt
            </button>
            <button
              type="button"
              onClick={downloadMarkdown}
              title="Download a Markdown report — metrics and events as tables, ready for a write-up or a forum post"
              className={SAVE_BTN}
            >
              Save .md
            </button>
            <button
              type="button"
              onClick={downloadHtml}
              title="Download a self-contained HTML report — numbers, events, the logger cross-check and the charts inline, in one file you can open, print, email or archive anywhere (nothing uploaded)"
              className={SAVE_BTN}
            >
              Save .html
            </button>
            <button
              type="button"
              onClick={downloadData}
              title="Download the whole flight as CSV — Debrief's derived series (altitude, velocity, acceleration, Mach, dynamic pressure) plus every channel the logger recorded (battery, temperature, GPS, tilt …)"
              className={SAVE_BTN}
            >
              Save .csv
            </button>
            <button
              type="button"
              onClick={downloadJson}
              title="Download the full analysis — metrics, events and provenance — as structured JSON, in the chosen units, for a script or another tool"
              className={SAVE_BTN}
            >
              Save .json
            </button>
            <button
              type="button"
              onClick={saveChartSvg}
              disabled={figureTitles.every((t) => hiddenFigures.includes(t))}
              title={
                figureTitles.every((t) => hiddenFigures.includes(t))
                  ? 'No figures are in this report — turn one on under the charts'
                  : 'Save the first figure in this report as a vector SVG (events marked) — crisp at any size'
              }
              className={`${SAVE_BTN} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Save .svg
            </button>
            <button type="button" onClick={saveChartPng} title="Save the altitude chart as a PNG" className={SAVE_BTN}>
              Save .png
            </button>
            <button
              type="button"
              onClick={downloadBundle}
              title="Save one ZIP with the Markdown summary, the data CSV and the altitude/velocity/acceleration figures — the whole report, zipped in the browser"
              className={SAVE_BTN}
            >
              Save bundle
            </button>
            <FigureThemeButton dark={figureDark} onToggle={toggleFigureDark} className={SAVE_BTN} />
          </div>
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? 'Summary copied to the clipboard.' : ''}
          </span>
        </div>
      </div>

      {/* Optional caption the flyer adds to make the export their own — a rocket/motor
          label and free-text notes that ride into every text/Markdown/JSON export and
          the printed card. Tucked in a disclosure so it never clutters the common read. */}
      <details className="rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/30 print:hidden">
        <summary className="cursor-pointer select-none text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Label this report{reportLabel.trim() || reportNotes.trim() ? ' ✓' : ' (optional)'}
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="report-label" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Label
            </label>
            <input
              id="report-label"
              type="text"
              value={reportLabel}
              onChange={(e) => setReportLabel(e.target.value)}
              placeholder="e.g. Nimbus IV · J450 · Flight 3"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="report-notes" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Notes
            </label>
            <textarea
              id="report-notes"
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              rows={3}
              placeholder="Conditions, motor, anomalies — anything you'd add to a write-up."
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Appears at the top of the text, Markdown and JSON exports and the printed card. Kept on
            your device; a new flight clears it.
          </p>
        </div>
      </details>

      {shareMsg && (
        <p role="status" aria-live="polite" className="text-xs text-zinc-500 dark:text-zinc-400">
          {shareMsg}
        </p>
      )}

      {copiedTable === 'no' && (
        <p role="status" aria-live="polite" className="text-xs text-zinc-500 dark:text-zinc-400">
          This browser wouldn&apos;t let the page write to the clipboard. <strong>Save .csv</strong>{' '}
          gives you the same readings as a file.
        </p>
      )}

      {bundleMsg && (
        <p role="status" aria-live="polite" className="text-xs text-zinc-500 dark:text-zinc-400">
          {bundleMsg}
        </p>
      )}

      <p className="-mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        {/* When it flew comes first where the file says: that's the flight's own date, and
            the one a cert document or a logbook entry wants. When it was read is ours. */}
        {flight.flownAt && (
          <>
            Flew <time dateTime={flight.flownAt.stamp}>{formatFlownAt(flight.flownAt)}</time>
            {' · '}
          </>
        )}
        Analyzed{' '}
        <time dateTime={new Date(analyzedAt).toISOString()}>{formatAnalyzedAt(analyzedAt)}</time>
      </p>

      <LogDetails flight={flight} />

      {flight.reported && flight.reported.length > 0 && (
        <DeviceSummary reported={flight.reported} metrics={metrics} sys={sys} />
      )}

      <GpsApogee metrics={metrics} sys={sys} />

      {warnings.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <p className="mb-1 font-medium text-amber-900 dark:text-amber-100">Worth knowing</p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          <p className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">How this file was read</p>
          <ul className="space-y-1">
            {notes.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <MetricGrid metrics={metrics} sys={sys} hidden={hidden} onToggle={toggleReading} />

      {/* The ascent readings that take a figure from the flyer. Each is a sentence and one
          input, and stacked full-width on a desktop they were 1,232 px wide apiece for a
          field you type three characters into — a column of mostly-empty cards between the
          tiles and the charts. Two across from lg: up, one on a phone, which is what a card
          this shape wants. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rail-exit velocity is a fine-grained reading of the first couple of metres,
            so it only makes sense with barometric altitude — GPS is far too coarse. It's
            read by integrating the logged velocity from liftoff to one rail-length of travel. */}
        {series.altitudeSource !== 'gps' && (
          <RailExit series={series} sys={sys} liftoffIndex={events.find((e) => e.type === 'liftoff')?.index ?? null} />
        )}

        {/* Measured drag coefficient — read from the coast deceleration, so it needs a
            real coast between burnout and apogee (and an accelerometer or baro trace). */}
        {canMeasureDrag(series, events) && <DragCoefficient series={series} events={events} sys={sys} />}
      </div>

      <FlightTimeline events={events} metrics={metrics} sys={sys} />

      {/* Ejection-delay check — the coast time IS the ideal motor delay, so a
          motor-eject flier can check the delay they flew against apogee. Shown
          whenever a coast (burnout → apogee) was measured. */}
      {metrics.coastTime != null && <EjectionDelay coastTimeS={metrics.coastTime} delayS={delayS} onDelayS={setDelayS} />}

      {/* Charts */}
      {zoomPresets.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Zoom to</span>
          {zoomPresets.map((p) => {
            const active = activePreset === p.label;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => focusRange(syncKey, p.min, p.max)}
                className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-500/60 dark:hover:text-indigo-400'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="space-y-6">
        <ChartBlock title={`Altitude (${unitsOf(sys).length} AGL)`}>
          <div ref={altChartRef}>
            <Chart
              time={series.time}
              series={altSeries}
              markers={markers}
              dark={dark}
              height={300}
              fmt={altFmt}
              ariaLabel={altLabel}
              syncKey={syncKey}
              xRange={chartRange}
              onView={onChartView}
            />
          </div>
        </ChartBlock>

        <ChartBlock
          title={`Velocity (${unitsOf(sys).speed})`}
          note={series.velocitySource === 'device' ? 'logged by the device' : 'derived from altitude'}
        >
          <Chart
            time={series.time}
            series={velSeries}
            markers={markers}
            dark={dark}
            height={200}
            fmt={velFmt}
            ariaLabel={velLabel}
            syncKey={syncKey}
            xRange={chartRange}
            onView={onChartView}
          />
        </ChartBlock>

        {hasAccel && (
          <ChartBlock
            title={`${series.accelerationResultant ? 'Total acceleration' : 'Acceleration'} (${unitsOf(sys).accel})`}
            note={
              series.accelerationResultant
                ? 'resultant of the logged axes'
                : series.accelerationSource === 'device'
                  ? 'logged by the device'
                  : 'derived from velocity'
            }
          >
            <Chart
              time={series.time}
              series={accSeries}
              markers={markers}
              dark={dark}
              height={200}
              fmt={accFmt}
              ariaLabel={accLabel}
              syncKey={syncKey}
              xRange={chartRange}
              onView={onChartView}
            />
          </ChartBlock>
        )}
        {!hasAccel && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {series.altitudeSource === 'gps'
              ? 'Acceleration is omitted — it would be a second derivative of coarse GPS altitude, too noisy to be meaningful.'
              : "This logger didn't record acceleration, so only altitude and velocity are shown."}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 print:hidden">
        Hover to read all three at a time · drag across a chart to zoom (pinch on touch) · double-click
        or double-tap to reset
      </p>

      {/* Which plots the DOCUMENT carries — the companion to the readings chooser under the
          tiles, and the next thing a report is written for needs. A certification package
          often wants the altitude trace alone; a drag study wants all three. Every figure
          the flight supports is still drawn on screen: this is about what travels into the
          .html, the bundle and the single-figure save, not about the analysis. */}
      {figureTitles.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Figures in the report</span>
          {figureTitles.map((t) => {
            const on = !hiddenFigures.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFigure(t)}
                title={`${on ? 'Leave out' : 'Include'} the ${t.toLowerCase()} plot — applies to the .html report, the bundle and Save .svg`}
                className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
                  on
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-zinc-300 bg-white text-zinc-500 line-through hover:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500'
                }`}
              >
                {t}
              </button>
            );
          })}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {figureTitles.every((t) => hiddenFigures.includes(t))
              ? 'None — the report carries its numbers and no plots.'
              : 'Applies to the .html report, the bundle and Save .svg.'}
          </span>
        </div>
      )}

      {/* Event legend */}
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Events</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <div
              key={e.type + e.index}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: EVENT_COLOR[e.type] }}
                  aria-hidden="true"
                />
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{e.label}</span>
                {e.provenance !== 'measured' && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{e.provenance}</span>
                )}
              </span>
              <span className="text-right font-mono text-xs text-zinc-500 dark:text-zinc-400">
                <span className="block">
                  {fmtTime(e.time)} · {fmtLength(e.altitude, sys)}
                </span>
                {eventSpeed(e.index) && <span className="block">{eventSpeed(e.index)}</span>}
                {e.peakAccel != null && accelInG(e.peakAccel) >= 2 && (
                  <span className="block">{fmtAccel(e.peakAccel, sys)} shock</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* The recovery readings, together. Three of the four read off the SAME descending
          mass, and stacked down a 1,232 px column the flyer typed it into one card and
          scrolled past two others that had quietly filled in. Side by side, the shared
          figure and everything it unlocks are in view at once. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Main-deploy altitude check — a dual-deploy flight fires the main at a set
            altitude; this surfaces where it actually fired (and the drogue descent
            before it). Shown only when a main deployment was detected. */}
        {(() => {
          const main = events.find((e) => e.type === 'main');
          return main ? (
            <DeployAltitude
              mainAltitudeM={main.altitude}
              apogeeAltitudeM={metrics.apogeeAltitude}
              sys={sys}
              setM={setMainDeployM}
              onSetM={setMainDeploy}
            />
          ) : null;
        })()}

        {/* Landing energy belongs with recovery — it reads off the measured landing
            descent rate, so it's only shown when the log actually descended to it. The
            panel still renders on a record that stops in the air, because it is where that
            gets explained; `landingRate` is what withholds the number itself. */}
        {(metrics.mainDescentRate ?? metrics.wholeDescentRate) != null && (
          <LandingEnergy metrics={metrics} sys={sys} massKg={massKg} onMassKg={setMassKg} />
        )}

        {/* Parachute Cd reads off the terminal main descent — shown with landing
            energy, the other recovery measurement that needs the descending mass. A Cd is
            solved from a terminal velocity, so a record that never reached the ground has
            no input for it; the panel above says so rather than this one repeating it. */}
        {landingRate(metrics) != null && (
          <ParachuteCd
            descentRate={landingRate(metrics) as number}
            // Ground-level air density (first finite sample) — the main descends low,
            // where density is near the pad's, so this is the right ρ for terminal v.
            airDensity={series.airDensity.find((d) => Number.isFinite(d)) ?? 1.225}
            sys={sys}
            massKg={massKg}
          />
        )}

        {/* Drogue Cd — the same reading on the drogue-phase descent (in the thinner
            air aloft), shown only on a dual-deploy flight that had a distinct drogue. */}
        {metrics.drogueDescentRate != null && (
          <DrogueCd descentRate={metrics.drogueDescentRate} airDensity={drogueDensity} sys={sys} massKg={massKg} />
        )}
      </div>

      {gpsLat && gpsLon && (
        <GroundTrack
          landed={landedInRecord(metrics)}
          lat={gpsLat.values}
          lon={gpsLon.values}
          sys={sys}
          stem={stem}
          time={series.time}
          altitude={series.altitude}
          // The descent (for the measured wind) starts at the main deploy when one
          // was found, else at apogee — the low, wind-coupled part of the fall.
          descentFromIndex={(events.find((e) => e.type === 'main') ?? events.find((e) => e.type === 'apogee'))?.index}
          apogeeIndex={events.find((e) => e.type === 'apogee')?.index}
          apogeeAltitude={metrics.apogeeAltitude}
        />
      )}

      <div className="print:hidden">
        <ChannelExplorer channels={plotChannels} time={series.time} events={events} sys={sys} stem={stem} />
      </div>

      {/* The shareable card closes the report, once everything it summarizes is shown. */}
      <FlightCard series={series} metrics={metrics} sys={sys} stem={stem} formatLabel={flight.formatLabel} xRange={chartRange} hidden={hidden} />

      {/* Print-only provenance line, so a card that leaves the screen says where
          it came from. */}
      <p className="hidden text-center text-[11px] text-zinc-500 print:block">
        debrief.fusionspace.co ·{' '}
        {flight.flownAt ? `flew ${formatFlownAt(flight.flownAt)} · ` : ''}analyzed{' '}
        {formatAnalyzedAt(analyzedAt)}
      </p>
    </div>
  );
}

function ChartBlock({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">{title}</h3>
        {note && <span className="text-xs text-zinc-500 dark:text-zinc-400">{note}</span>}
      </div>
      {children}
    </div>
  );
}
