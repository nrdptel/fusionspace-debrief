'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderCaveats } from '@/lib/caveatUnits';
import { repeatedSpanNote } from '@/lib/highRateRepeats';
import { groupToken } from '@/lib/flightGroups';
import type { RawFlight } from '@/lib/flight/types';
import type { FlightAnalysis } from '@/lib/analyze/types';
import { accelIn, accelInG, fmtAccel, fmtLength, fmtMach, fmtSpeed, fmtTime, lengthIn, placesFor, speedIn, systemOf, unitsOf } from '@/lib/display';
import type { UnitChoice, Units } from '@/lib/display';
import { summaryText, summaryMarkdown, summaryHtml, analyzedDataCsv, analysisJson, recordingLine, reportStem, formatAnalyzedAt, reportTable, type RecoveryFigures } from '@/lib/report';
import { formatFlownAt } from '@/lib/flight/flownAt';
import { encodeFlight, shareUrl, MAX_SHARE_URL } from '@/lib/share';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { getChannel } from '@/lib/flight/types';
import { buildPlotChannels } from '@/lib/explore';
import { unionTimeBase } from '@/lib/overlay';
import { canMeasureDrag } from '@/lib/drag';
import { MAX_REASONABLE_MASS_KG } from '@/lib/landing';
import { MAX_REASONABLE_DEPLOY_M } from '@/lib/deploy';
import { MAX_REASONABLE_DELAY_S } from '@/lib/ejection';
import { download } from '@/lib/download';
import { KEPT_DOCUMENTS, type KeptDocument, type DocumentContext } from '@/lib/documents';
import { plotSvg } from '@/lib/svgChart';
import { zip, type ZipEntry } from '@/lib/zip';
import { useIsDark } from './useIsDark';
import { useFigureDark, FigureThemeButton } from './FigureTheme';
import Chart, { focusRange, type ChartMarker } from './Chart';
import MetricGrid from './MetricGrid';
import type { RecentMeta } from '@/lib/recents';
import FlightPicker from './FlightPicker';
import RecordingPicker from './RecordingPicker';
import SimulationChoice from './SimulationChoice';
import type { PredictionOffer, SimulationChoice as SimulationChoiceValue } from '@/lib/predictionChoice';
import CropControl from './CropControl';
import { copyTable } from '@/lib/copyTable';
import { savePlotPng } from '@/lib/plotPng';
import { toCanonical } from '@/lib/canonical';
import { landedInRecord, landingRate, liftoffOnLogClock, withheldReason } from '@/lib/readings';
import { loadFigureOrder, loadHidden, moveReading, orderRows, saveFigureOrder, saveHidden, toggleHidden, loadHiddenFigures, saveHiddenFigures } from '@/lib/reportProfile';
import DeviceSummary from './DeviceSummary';
import FigureChooser from './FigureChooser';
import { figureColor, loadFigureColors, saveFigureColors } from '@/lib/seriesColor';
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
import { padOrigin } from '@/lib/gps';
import { Button, Card, Chip, Disclosure, Figure, Frame, Notice, SectionNav } from './ui';
import { SYNTHETIC_NOTE, isSynthetic } from '@/lib/synthetic';

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
  caption,
  onCaption,
  fileTime,
  fileFlight,
  onRead,
  reading,
  readError,
  recordings,
  recordingId,
  onRecording,
  simulationOffer,
  simulationChoice,
  onSimulationChoice,
}: {
  flight: RawFlight;
  analysis: FlightAnalysis;
  analyzedAt: number;
  sourceText: string;
  sys: UnitChoice;
  /** The WHOLE file's time base, when `flight` is a stretch of it — what the crop control
   *  offers. Absent where the report is of the whole file, which is its own answer. */
  fileTime?: Float64Array;
  /** The WHOLE file, when `flight` is a stretch of it — for the readings that are measured
   *  from the pad and so cannot take their reference from the stretch. */
  fileFlight?: RawFlight;
  /** Read a different stretch of the same file — one of the other flights in a launch-day
   *  download. Absent where the surface has no way to re-read (a shared link). */
  onRead?: (from: number, to: number) => void;
  /** True while a re-read is in flight, so the picker can refuse a second click. */
  reading?: boolean;
  /** Why the last stretch asked for could not be read, when one could not. */
  readError?: string;
  /** The label and notes kept with this flight in the logbook, when it has any. */
  caption?: { label: string; notes: string };
  /** Keep them. Absent where the flight has no logbook entry to keep them against — a
   *  private window with storage refused — in which case the panel says so. */
  onCaption?: (caption: { label: string; notes: string }) => void;
  /** Every recording of this flight, the one that reports it first — where the flyer has said
   *  that two files are one flight flown on two altimeters. Absent, or of length one, on every
   *  ordinary flight, and then nothing about this page changes. */
  recordings?: RecentMeta[];
  /** Which of them these readings are of. */
  recordingId?: string;
  /** Open another recording of this flight. */
  onRecording?: (id: string) => void;
  /** A design dropped beside this flight that states SEVERAL simulations, so Debrief declined to
   *  pick one. Absent on every flight without one, and then nothing about this page changes.
   *  See `lib/predictionChoice.ts`. */
  simulationOffer?: PredictionOffer;
  /** Which one the flyer said flew; `null` or absent is Debrief's own default of picking none. */
  simulationChoice?: SimulationChoiceValue;
  /** Say which flew — or take it back. Absent where the surface cannot re-render the flight
   *  (a shared link, the print card), in which case the control is not offered rather than
   *  offered and dead. */
  onSimulationChoice?: (choice: SimulationChoiceValue) => void;
}) {
  const dark = useIsDark();
  const [figureDark, toggleFigureDark] = useFigureDark();
  const { series, events, metrics } = analysis;
  // Caveats carry their lengths as tokens so the ANALYSIS can stay unit-agnostic; they are
  // substituted here, where the flyer's units are known — and re-substituted on every unit switch,
  // which is why this is a memo on `sys` rather than a one-off at parse time. See
  // `lib/caveatTokens.ts` for the wrong number this closes.
  const warnings = useMemo(() => renderCaveats(analysis.warnings, sys), [analysis.warnings, sys]);
  // Same claim, same builder as every export — see `lib/highRateRepeats.ts`. It needs the
  // ANALYSIS as well as the flight, which is why it is assembled here rather than folded into
  // `flight.notes` where the stream is read: the stretch being drawn is not known until now.
  const notes = useMemo(
    () =>
      renderCaveats(
        [
          repeatedSpanNote(flight.repeatedSpans, analysis.extent),
          // The synthetic sentence is HOISTED out of this list, not repeated in it — see the
          // notice at the top of the report. A made-up flight saying so in the ninth card of a
          // nine-screen report, between "the parser skipped a blank row" and a repeated-span
          // note, is a footnote; the claim needs to be the first thing on the page and beside
          // the numbers, not filed under how the file was read.
          ...flight.notes.filter((n) => n !== SYNTHETIC_NOTE),
        ].filter((n): n is string => !!n),
        sys,
      ),
    [flight.repeatedSpans, flight.notes, analysis.extent, sys],
  );

  /** Did Debrief make this flight up? Read from the flight's own notes, so it is equally true of
   *  a file just dropped, a saved record re-opened, and a logbook entry restored from a backup. */
  const synthetic = isSynthetic(flight);

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
  const [sharePayload, setSharePayload] = useState<{ ok: true; url: string } | { ok: false; why: 'size' | 'not-text' } | null>(null);
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);

  // An optional label (rocket, motor, flight number) and free-text notes the flyer
  // adds to make an exported report their own — for a cert document, a project, or a
  // forum post. They ride into every text/Markdown/JSON export and the printed card,
  // and belong to the flight in view, so a new flight clears them.
  const [reportLabel, setReportLabel] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  // The label belongs to the FILE, because that is what the logbook holds and what an address
  // returns to. So it is shown over the reading the logbook made — the whole file, or the
  // flight Debrief segmented out of it — and not over a stretch the flyer chose, where it
  // would be a heading typed for one flight sitting above another one's numbers.
  const ownsCaption = analysis.extent.source !== 'chosen';
  // Seeded from what the flight already carries rather than blanked: the report has an address
  // now, so leaving and coming back returns the flight — and these two, the only things on the
  // screen a flyer typed, were the two that didn't come with it. Keyed on `flight.source` and
  // on the stretch being read, so opening another flight in the file starts clean.
  useEffect(() => {
    setReportLabel(ownsCaption ? (caption?.label ?? '') : '');
    setReportNotes(ownsCaption ? (caption?.notes ?? '') : '');
    // `caption` belongs to the flight; re-running on its identity would fight the typing below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.source, analysis.extent.from, analysis.extent.to, ownsCaption]);

  // Written back as it is typed, debounced so a sentence isn't a transaction per keystroke.
  const captionRef = useRef(onCaption);
  // Not written back while a chosen stretch is on screen: the store is keyed on the flight the
  // logbook holds, so saving from here would put a label typed over flight 2 onto the file.
  captionRef.current = ownsCaption ? onCaption : undefined;
  useEffect(() => {
    if (!captionRef.current) return;
    const t = setTimeout(() => captionRef.current?.({ label: reportLabel, notes: reportNotes }), 400);
    return () => clearTimeout(t);
  }, [reportLabel, reportNotes]);
  /** Flush now, without waiting out the debounce. Leaving the field is what a flyer does on
   *  the way to clicking something else, and the debounce alone loses whatever was typed in
   *  the last 400 ms — which on a short label is all of it. */
  const flushCaption = useCallback(() => {
    captionRef.current?.({ label: reportLabel, notes: reportNotes });
  }, [reportLabel, reportNotes]);
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
  const [figureOrder, setFigureOrder] = useState<string[]>([]);
  // The figure colours are the flyer's too — per CHANNEL here rather than per flight, because
  // "my altitude trace in green" is a statement about the trace and should hold across every
  // flight they open. One map feeds the exported SVG and the on-screen chart, which were six
  // separate literals and could drift apart one edit at a time.
  const [figureColors, setFigureColors] = useState<Record<string, string>>({});
  useEffect(() => {
    setHiddenFigures(loadHiddenFigures());
    setFigureOrder(loadFigureOrder());
    setFigureColors(loadFigureColors());
  }, []);
  const setFigureColor = (title: string, color: string) =>
    setFigureColors((prev) => {
      const next = { ...prev, [title]: color };
      saveFigureColors(next);
      return next;
    });
  const clearFigureColor = (title: string) =>
    setFigureColors((prev) => {
      const next = { ...prev };
      delete next[title];
      saveFigureColors(next);
      return next;
    });
  const toggleFigure = useCallback((title: string) => {
    setHiddenFigures((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      saveHiddenFigures(next);
      return next;
    });
  }, []);

  // Which recording of the flight this document is, where the flyer has said the flight was
  // flown on more than one altimeter — so a cert write-up quoting an apogee can state which
  // instrument read it, and a reader holding two Debrief reports of one launch can tell they
  // are not two launches. Absent on every ordinary flight, and then no document gains a line.
  const recordingMeta = useMemo(() => {
    if (!recordings || recordings.length < 2 || !recordingId) return undefined;
    if (!recordings.some((r) => r.id === recordingId)) return undefined;
    // By ID, never by name. Two same-model altimeters write their exports under the same
    // default name, and the logbook keeps such rows apart by their contents — so comparing
    // names would have the BACKUP's report claim to be the one the flight is reported by.
    return { of: recordings.length, reportedBy: recordings[0].name, isReportedBy: recordings[0].id === recordingId };
  }, [recordings, recordingId]);
  const reportMeta = useMemo(
    () => ({ label: reportLabel, notes: reportNotes, hidden, ...(recordingMeta ? { recording: recordingMeta } : {}) }),
    [reportLabel, reportNotes, hidden, recordingMeta],
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

  // Every export's filename. It carries the stretch when the report is of one, because two
  // flights out of one download would otherwise leave the same file name in the flyer's
  // Downloads folder twice — the collision the logbook already had to fix once.
  const fileLat = fileFlight ? getChannel(fileFlight, 'latitude') : undefined;
  const fileLon = fileFlight ? getChannel(fileFlight, 'longitude') : undefined;
  // The FILE's pad, for the recovery card, when this report is of a stretch. Null on a
  // whole-file reading, where the fixes on screen open on the rail and are the pad already.
  const filePad = useMemo(() => {
    if (analysis.extent.source === 'file' || !fileLat || !fileLon) return null;
    return padOrigin(fileLat.values, fileLon.values);
  }, [analysis.extent.source, fileLat, fileLon]);

  const stem = useMemo(() => {
    const base = reportStem(flight.source);
    const e = analysis.extent;
    if (e.source === 'file') return base;
    const which = analysis.segments?.find((seg) => seg.from === e.from && seg.to === e.to);
    return which ? `${base}-flight-${which.index}` : `${base}-${Math.round(e.startTime)}s-${Math.round(e.endTime)}s`;
  }, [flight.source, analysis.extent, analysis.segments]);
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
    // A raw download off a card cannot ride in a link at all. A share link carries the
    // file's TEXT, and the text of a binary file is only what the decoder made of it —
    // every byte it could not read replaced, with no way back. Encoding it would produce a
    // link that opens to a refusal on the other end, which is a worse answer than saying so
    // here. U+FFFD is the decoder's own mark that it lost something.
    if (sourceText.includes('\uFFFD')) {
      setSharePayload({ ok: false, why: 'not-text' });
      return;
    }
    (async () => {
      try {
        const payload = await encodeFlight(flight.source, sourceText);
        const url = shareUrl(window.location.origin, window.location.pathname, payload);
        if (live) setSharePayload(url.length > MAX_SHARE_URL ? { ok: false, why: 'size' } : { ok: true, url });
      } catch {
        if (live) setSharePayload({ ok: false, why: 'size' });
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
        sharePayload.why === 'not-text'
          ? 'This is the raw download off the card, and a share link carries the file itself — which only works for a text export. Save .html below is the same report as one file you can send, and Save bundle packs the report, the charts and the data together.'
          : 'This log is too big to fit inside a link — a share link carries the whole file in the URL. Save .html below is the same report as one file you can send, and Save bundle packs the report, the charts and the data together.',
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

  /**
   * Save one kept document, chosen from `lib/documents.ts`.
   *
   * **One function and one list, replacing six near-identical `downloadX` closures.** The strip
   * below renders from the same list, so a document with a button is a document the checks
   * enumerate — which is what `ROADMAP.md`'s D10 asks for and what a list kept inside a test file
   * could never give: adding a seventh export used to leave both ratchets green and the new
   * document unstamped.
   *
   * The context is assembled per document rather than always, because two pieces of it are not
   * free: rendering the figure SVGs costs a pass over the charts, and the grouping is a statement
   * read out of the logbook.
   */
  function saveDocument(doc: KeptDocument) {
    const ctx: DocumentContext = { analyzedAt, meta: reportMeta, recovery };
    if (doc.id === 'html') ctx.figures = figureSvgs().map((f) => ({ title: f.title, svg: f.svg }));
    if (doc.id === 'record') {
      // The flyer's own statement that this file is one of several recordings of one flight, where
      // they made one. It rides beside the measurement rather than in it — a grouping is something
      // the flyer said, not something the instrument recorded — so saving both halves of a
      // two-altimeter flight and dropping them back in returns one flight rather than two.
      //
      // **The token is the EARLIEST-ADDED recording's id, deliberately not the flight's own id.**
      // A flight's id is its current primary's, and the primary MOVES: "report by this one"
      // rewrites every row's `flightId`, and deleting the primary promotes the next survivor. Two
      // records saved either side of that would carry different tokens, bucket separately and
      // restore nothing — silently, because the failure looks exactly like two ordinary flights.
      // Opening order is a property of the SET rather than of whichever member currently speaks
      // for it, and it is the same rule `planJoin` already picks a primary by.
      //
      // `reports` still reads the current primary, because that is what it is a statement about:
      // which recording the flight is reported by, now. `recordings[0]` is that one, which is how
      // `groupRecordings` builds the list.
      if (recordings && recordings.length > 1 && recordingId && recordings.some((r) => r.id === recordingId)) {
        ctx.grouping = {
          flight: groupToken(recordings),
          reports: recordings[0].id === recordingId,
          of: recordings.length,
        };
      }
    }
    download(new Blob([doc.build(flight, analysis, sys, ctx)], { type: doc.mime }), `${stem}-debrief${doc.ext}`);
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
    savePlotPng(altChartRef.current, { dark, filename: `${stem}-altitude.png` });
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
            { label: `Altitude (${unitsOf(sys).length} AGL)`, color: figureColor('Altitude', figureColors), axis: 'left', values: Array.from(series.altitude, (m) => lengthIn(m, sys)) },
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
          series: [{ label: `Velocity (${unitsOf(sys).speed})`, color: figureColor('Velocity', figureColors), axis: 'left', values: Array.from(series.velocity, (v) => speedIn(v, sys)) }],
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
              color: figureColor('Acceleration', figureColors),
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
    // Ordered as the flyer arranged it, then minus what they turned off — the same two
    // steps, in the same order, as the comparison's `documentFigures`.
    return orderRows(figs, (f) => f.title, figureOrder).filter((f) => !hiddenFigures.includes(f.title));
  }, [series, events, sys, figureDark, stem, chartRange, hiddenFigures, figureOrder, figureColors]);

  /** Every figure this flight could carry, chosen or not — what the chooser lists. */
  const figureTitles = useMemo(() => {
    const titles = ['Altitude'];
    if (series.velocity.some((v) => Number.isFinite(v))) titles.push('Velocity');
    if (series.accelerationSource === 'device') {
      titles.push('Acceleration');
    }
    return orderRows(titles, (t) => t, figureOrder);
  }, [series, figureOrder]);
  const moveFigure = (title: string, delta: -1 | 1) =>
    setFigureOrder((prev) => {
      const next = moveReading(prev, figureTitles, title, delta);
      saveFigureOrder(next);
      return next;
    });

  function saveChartSvg() {
    // The first figure the flyer kept — not necessarily altitude, and possibly none at all.
    const [first] = figureSvgs();
    if (!first) return;
    download(new Blob([first.svg], { type: 'image/svg+xml' }), first.name);
  }

  // One self-contained HTML file — the numbers, events, cross-check and caveats plus the
  // charts inline as vector SVG — a flyer can save, email, print or archive without
  // re-running Debrief. Report-grade output as a single portable document.
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
    const v = series.velocityUnusable ? NaN : series.velocity[index];
    if (!Number.isFinite(v)) return '';
    const sos = series.speedOfSoundProfile[index]; // local speed of sound at the event's altitude
    const m = Number.isFinite(sos) && sos > 0 ? v / sos : NaN;
    return Number.isFinite(m) && Math.abs(m) >= 0.8 ? `${fmtSpeed(v, sys)} · ${fmtMach(m)}` : fmtSpeed(v, sys);
  };

  /** The altitude chart, and the predicted curve beside it when a design was dropped in with the
   *  log. The two do NOT share a clock — a simulation starts at ignition and a recording starts
   *  when the logger was armed — so they are merged onto a union x that keeps every original
   *  sample of each and NaN elsewhere (`lib/overlay.ts`). Nothing is resampled: moving a
   *  simulation's samples onto a measured liftoff is what would make it look measured.
   *
   *  `altTime` is the flight's own time base when there is no prediction, so the ordinary case
   *  pays nothing for this. */
  const { altTime, altSeries } = useMemo(() => {
    const measured = {
      label: 'altitude',
      values: series.altitude,
      stroke: figureColor('Altitude', figureColors),
      width: 2,
    };
    const pred = flight.predicted;
    if (!pred || pred.time.length < 2) {
      return { altTime: series.time, altSeries: [measured] };
    }
    const merged = unionTimeBase([
      { time: series.time, values: series.altitude },
      { time: pred.time, values: pred.altitude },
    ]);
    return {
      altTime: merged.time,
      altSeries: [
        { ...measured, values: merged.values[0], spanGaps: true },
        {
          // Named for the design rather than "predicted", because the flyer chose that name and
          // will recognise it — and the word `predicted` is already carried by the dash and by
          // the caption under the chart.
          label: `${pred.rocket} (predicted)`,
          values: merged.values[1],
          stroke: figureColor('Predicted', figureColors),
          width: 2,
          dash: [6, 4],
          spanGaps: true,
        },
      ],
    };
  }, [series.time, series.altitude, flight.predicted, figureColors]);
  const velSeries = useMemo(
    () => [{ label: 'velocity', values: series.velocity, stroke: figureColor('Velocity', figureColors) }],
    [series.velocity, figureColors],
  );
  const accSeries = useMemo(
    () => [{ label: 'acceleration', values: series.acceleration, stroke: figureColor('Acceleration', figureColors) }],
    [series.acceleration, figureColors],
  );
  const altFmt = useCallback((v: number) => round(lengthIn(v, sys), 0), [sys]);
  const velFmt = useCallback((v: number) => round(speedIn(v, sys), 0), [sys]);
  const accFmt = useCallback((v: number) => round(accelIn(v, sys), placesFor(unitsOf(sys).accel)), [sys]);

  // Every channel worth plotting, for the flexible explorer below.
  const plotChannels = useMemo(() => buildPlotChannels(flight, series, metrics), [flight, series, metrics]);

  // A per-flight key links the three charts' hover cursor and zoom range.
  //
  // **Keyed on the ANALYSIS, not on the flight object.** Regenerating it tears down and rebuilds
  // all three uPlot instances, which throws away the flyer's zoom and snaps the preset row back to
  // "Flight" — right when the reading being shown is genuinely a different one, and wrong
  // otherwise. Every path that used to hand this a new `flight` handed it a new `analysis` in the
  // same breath (a load, a crop, another recording), so this is the same key it always was for all
  // of them. What changed is that a flyer picking which simulation flew now rewrites the flight —
  // additively, with no re-analysis — and losing a zoom you set to compare two traces, because you
  // asked to see the other trace, is the "controls that forget" tell.
  const syncKey = useMemo(() => `flight-${Math.random().toString(36).slice(2)}`, [analysis]);

  const eventSummary = events.map((e) => `${e.label.toLowerCase()} at ${fmtTime(e.time)}`).join(', ');
  // The predicted curve is a second line on this chart, so the text alternative has to carry it —
  // a screen-reader flyer told "line chart: altitude" would have no way to know a second trace is
  // there at all, and `role="img"` means the canvas says nothing else.
  const predPeak = flight.predicted
    ? flight.predicted.altitude.reduce((m, v) => (Number.isFinite(v) && v > m ? v : m), -Infinity)
    : NaN;
  const altLabel =
    `Line chart: altitude above ground against time, peaking at ${fmtLength(metrics.apogeeAltitude, sys)}.` +
    (flight.predicted && Number.isFinite(predPeak)
      ? ` A second, dashed line shows the prediction from the design “${flight.predicted.rocket}”, peaking at ${fmtLength(predPeak, sys)} — a simulation, not a measurement, drawn on its own clock.`
      : '') +
    ` Marked events: ${eventSummary}.`;
  const velLabel = `Line chart: velocity against time${Number.isFinite(metrics.maxVelocity) ? `, peaking at ${fmtSpeed(metrics.maxVelocity, sys)}` : ''}.`;
  const accLabel = `Line chart: ${series.accelerationResultant ? 'total (resultant) ' : ''}acceleration against time${Number.isFinite(metrics.maxAcceleration) ? `, peaking at ${fmtAccel(metrics.maxAcceleration, sys)}` : ''}.`;

  // Where liftoff falls on the log's own clock, when that isn't zero — the Events list is on
  // that clock and every reading is on seconds-since-liftoff, so the offset is what tells a
  // reader the two are describing the same instant. Null where the file already starts at
  // liftoff and the note would say nothing.
  // Shared with the recovery map's readout, which prints a time on the same clock — see
  // lib/readings.ts, so the two surfaces cannot decide differently whether to name it.
  const liftoffClock = liftoffOnLogClock(events);

  // Where a flyer can jump to. The report runs 5,472 px on a desktop and 7,710 px — nine
  // screens — on a phone, and carried no in-page links at all, so coming back to check one
  // number meant scrolling past everything and there was no way to send a clubmate to a
  // section. Only the sections this flight actually has are listed: a baro-only log has no
  // acceleration chart, a log without GPS has no recovery, and offering a link to either
  // would be the "control that fails only when pressed" this manual warns about.
  const jumpTo: { id: string; label: string }[] = [
    ...(warnings.length > 0 ? [{ id: 'worth-knowing', label: 'Worth knowing' }] : []),
    { id: 'readings-heading', label: 'Readings' },
    { id: 'flight-timeline', label: 'Timeline' },
    { id: 'altitude-chart', label: 'Charts' },
    { id: 'events', label: 'Events' },
    ...(gpsLat && gpsLon ? [{ id: 'ground-track', label: 'Recovery' }] : []),
    { id: 'explore-the-data', label: 'Explore' },
    { id: 'flight-card-heading', label: 'Flight card' },
  ];

  return (
    <div className="space-y-8">
      <h2 className="sr-only">Flight report for {flight.source}</h2>
      {/* A flight Debrief MADE UP says so before it says anything else, and says it on paper too.
          Not `print:hidden` like the chrome around it: printing is how a certification package is
          actually produced, and a printed page of numbers with the claim stripped off it is the
          worst version of this failure rather than an acceptable one. */}
      {synthetic && (
        <Notice as="p" tone="warn" data-synthetic="report">
          {SYNTHETIC_NOTE}
        </Notice>
      )}
      {/* `SectionNav` (`DESIGN.md` §5) since 2026-08-08. This strip was hand-rolled here, and
          `app/methods/page.tsx` — ~12,700 words in 51 blocks — had no in-page navigation at
          all, which is most of owner note ON-1. The jump targets carry a `scroll-margin-top`
          so a heading lands below the strip rather than under it (see the id list in
          app/globals.css). */}
      <SectionNav label="Jump to a section of this report" items={jumpTo} />
      {/* Print-only masthead: a printed card should still say what it is. */}
      <div className="hidden print:block">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Debrief · Flight Report</p>
      </div>
      {/* The flyer's own caption, once set — shown here on screen and on the printed
          card, and carried into the exports. */}
      {(reportLabel.trim() || reportNotes.trim()) && (
        <div className="space-y-1">
          {reportLabel.trim() && (
            <h3 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
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
      {/* Which RECORDING of this flight these readings are, when the flyer has said the flight
          was recorded more than once. Above the flight picker, because it is the wider
          question: which instrument, then which flight of that instrument's download. */}
      {recordings && recordings.length > 1 && recordingId && onRecording && (
        <RecordingPicker recordings={recordings} currentId={recordingId} sys={sys} hidden={hidden} onOpen={onRecording} />
      )}

      {/* Which flight in the download this is, when the file holds several. */}
      {analysis.segments && analysis.segments.length > 1 && onRead && (
        <FlightPicker
          segments={analysis.segments}
          extent={analysis.extent}
          sys={sys}
          onRead={onRead}
          busy={reading}
        />
      )}

      {/* File / format line */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 max-w-full truncate font-mono text-zinc-700 dark:text-zinc-300">
            {flight.source}
          </span>
          {/* §5's `Chip` at its accent tone. Hand-rolled on a different indigo ramp
              (`indigo-300` / `indigo-50`) at `px-2 py-0.5`, so the one chip on the report header
              and the chips two panels down were three shapes of the same thing. */}
          <Chip tone="accent" mono={false} className="shrink-0" value={flight.formatLabel} />
          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">read locally — never uploaded</span>
          {/* On PAPER this is the only place the recording can be named: the strip above is
              `print:hidden`, and printing is how a certification package is actually produced.
              Without it two printed reports of one launch are indistinguishable from two
              launches — the exact thing this reading exists to prevent. Hidden on screen,
              where the strip says it better and in more detail. */}
          {recordingMeta && (
            <span className="hidden shrink-0 text-xs text-zinc-500 print:inline dark:text-zinc-400">
              {recordingLine(recordingMeta)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 print:hidden">
          {/* Primary actions — what you do with the flight — stay in view even on a
              phone, where the file-format saves below scroll aside instead of stacking
              into four rows that push the numbers down. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={copySummary} title="Copy a text summary to the clipboard">
              {copied ? 'Copied ✓' : 'Copy summary'}
            </Button>
            <Button
              size="sm"
              onClick={copyReadings}
              title="Copy the readings as a table — lands in cells in a spreadsheet or document, and as tab-separated text everywhere else"
            >
              {copiedTable === 'yes' ? 'Copied ✓' : 'Copy table'}
            </Button>
            <Button
              size="sm"
              onClick={shareLink}
              title={
                sharePayload === null
                  ? 'Working out whether this flight fits in a link…'
                  : sharePayload.ok
                    ? 'Copy a link with the whole flight encoded in it — decoded in the browser, never uploaded'
                    : sharePayload.why === 'not-text'
                      ? 'A share link carries the file itself, which only works for a text export. Save .html or Save bundle below sends the whole report instead.'
                      : 'This log is too big to fit inside a link. Save .html or Save bundle below sends the whole report instead.'
              }
            >
              {sharePayload?.ok === false ? (sharePayload.why === 'not-text' ? 'No link for a raw file' : 'Too big to link') : 'Share link'}
            </Button>
            <Button
              size="sm"
              onClick={printCard}
              title="Print a clean flight card (or save it as a PDF) — numbers, events and charts on one page"
            >
              Print
            </Button>
            {/* The unit control moved to the header, where the page has always said it is and
                where it can be reached before a flight is loaded. Two copies of one setting on
                one screen is a control that looks like a choice about this panel. */}
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
            {/* `shrink-0` on every button in this strip, and it is load-bearing rather than
                leftover: the strip scrolls horizontally on a phone, and a button allowed to
                compress clips its own label. It used to be baked into a `SAVE_BTN` constant that
                carried this comment; the constant is gone and the reason is not. */}
            {/* Rendered FROM `lib/documents.ts`, not written out six times. That is what makes
                "a document with a button is a document the checks enumerate" true rather than
                aspirational: a seventh export cannot get a button without also getting a build
                stamp assertion and a synthetic-label assertion. `shrink-0` is load-bearing — the
                strip scrolls horizontally on a phone and a button allowed to compress clips its
                own label. */}
            {KEPT_DOCUMENTS.map((doc) => (
              <Button
                key={doc.id}
                size="sm"
                onClick={() => saveDocument(doc)}
                title={doc.title}
                className="shrink-0"
              >
                {doc.label}
              </Button>
            ))}
            <Button
              size="sm"
              onClick={saveChartSvg}
              disabled={figureTitles.every((t) => hiddenFigures.includes(t))}
              title={
                figureTitles.every((t) => hiddenFigures.includes(t))
                  ? 'No figures are in this report — turn one on under the charts'
                  : 'Save the first figure in this report as a vector SVG (events marked) — crisp at any size'
              }
              className="shrink-0"
            >
              Save .svg
            </Button>
            <Button size="sm" onClick={saveChartPng} title="Save the altitude chart as a PNG" className="shrink-0">
              Save .png
            </Button>
            <Button
              size="sm"
              onClick={downloadBundle}
              title="Save one ZIP with the Markdown summary, the data CSV and the altitude/velocity/acceleration figures — the whole report, zipped in the browser"
              className="shrink-0"
            >
              Save bundle
            </Button>
            <FigureThemeButton dark={figureDark} onToggle={toggleFigureDark} className="shrink-0" />
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
      <Disclosure summary={<>Label this report{reportLabel.trim() || reportNotes.trim() ? ' ✓' : ' (optional)'}</>} className="print:hidden">
          <div>
            <label htmlFor="report-label" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Label
            </label>
            <input
              id="report-label"
              type="text"
              value={reportLabel}
              onChange={(e) => setReportLabel(e.target.value)}
              onBlur={flushCaption}
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
              onBlur={flushCaption}
              rows={3}
              placeholder="Conditions, motor, anomalies — anything you'd add to a write-up."
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Appears at the top of the text, Markdown and JSON exports and the printed card.
            {!ownsCaption
              ? ' Held for this stretch only — the label your logbook keeps belongs to the file, and this is a stretch of it you chose.'
              : onCaption
                ? ' Kept with this flight on this device, so it is still here when you come back to it.'
                : ' Held for this view only — this browser wouldn’t let Debrief remember the flight, so save an export before you leave.'}
          </p>
        
      </Disclosure>

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

      {/* Directly above the cross-check it fills, so the choice and its effect are one glance
          apart rather than a scroll apart. */}
      {simulationOffer && onSimulationChoice && (
        <SimulationChoice
          offer={simulationOffer}
          choice={simulationChoice ?? null}
          onChoice={onSimulationChoice}
          sys={sys}
        />
      )}

      {flight.reported && flight.reported.length > 0 && (
        <DeviceSummary reported={flight.reported} metrics={metrics} events={events} sys={sys} />
      )}

      <GpsApogee metrics={metrics} sys={sys} />

      {warnings.length > 0 && (
        <Card tone="warn" role="status" aria-live="polite" className="text-sm">
          <h3 id="worth-knowing" className="mb-1 text-sm font-medium text-amber-900 dark:text-amber-100">
            Worth knowing
          </h3>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      {notes.length > 0 && (
        <Card tone="sunken" className="text-sm">
          <h3 id="how-this-file-was-read" className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            How this file was read
          </h3>
          <ul className="space-y-1">
            {notes.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-labelledby="readings-heading">
        <h3
          id="readings-heading"
          className="mb-3 text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300"
        >
          Readings
        </h3>
        <MetricGrid metrics={metrics} sys={sys} hidden={hidden} onToggle={toggleReading} synthetic={synthetic} />
      </section>

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
        {canMeasureDrag(series, events) ? (
          <DragCoefficient series={series} events={events} sys={sys} />
        ) : (
          // A withheld reading says why it is withheld. This panel used to simply not
          // render, which on a flight whose speed trace was refused left the flyer with no
          // way to tell "this flight can't give a Cd" from "Debrief forgot" — and the
          // refusal is the interesting fact, because it is the same one behind the withheld
          // peak speed.
          //
          // It renders ONLY where the flight would otherwise have produced a Cd: the same
          // coast geometry `canMeasureDrag` wants, with the velocity judgement taken out.
          // Without that, the eight corpus flights that have no burnout at all would be told
          // the refusal is what stopped the reading, when nothing could have produced one.
          // The other two reasons (GPS altitude, no measurable coast) stay unnarrated because
          // they are properties of the flight rather than a judgement Debrief made about it.
          canMeasureDrag({ ...series, velocityUnusable: false }, events) && (
            <Card as="section" aria-labelledby="drag-withheld-heading">
              <h3
                id="drag-withheld-heading"
                className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300"
              >
                Drag coefficient (measured)
              </h3>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {metrics.maxVelocityWithheld === 'gap' ? (
                  <>
                    Withheld. C<sub>d</sub> is read straight off the coast speed, and this record has a stretch of the
                    ascent it doesn’t cover — the same gap that withholds the peak speed. A drag figure fitted across a
                    hole would read as a measurement.
                  </>
                ) : (
                  <>
                    Withheld. C<sub>d</sub> is read straight off the coast speed, and this flight’s speed trace is one
                    Debrief won’t stand behind — the same reason its peak speed is withheld. A drag figure from it
                    would carry that error squared.
                  </>
                )}
              </p>
            </Card>
          )
        )}
      </div>

      <FlightTimeline events={events} metrics={metrics} sys={sys} />

      {/* Ejection-delay check — the coast time IS the ideal motor delay, so a
          motor-eject flier can check the delay they flew against apogee. Shown
          whenever a coast (burnout → apogee) was measured. */}
      {metrics.coastTime != null && <EjectionDelay coastTimeS={metrics.coastTime} delayS={delayS} onDelayS={setDelayS} />}

      {/* Charts */}
      {zoomPresets.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {/* NOT a `Segmented`, and the design audit was wrong to group it with the logbook's sort
              and the comparison's channel picker. Those two are exactly-one-active — `Segmented`
              takes a `value` and marks one option pressed — while this group has a real
              none-active state: `activePreset` is null whenever the flyer has panned or zoomed the
              chart by hand, and `e2e/analyze.spec.ts` asserts both presets read
              `aria-pressed="false"` at once. Converting it would have to invent a selected option
              that is not selected, which is worse than the hand-roll it replaced. */}
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
      {/* …and the flyer's own answer to which stretch is theirs, which overrules the
          segmentation above it. The chart is the selector; the boxes are the same choice
          typed, so the control is reachable without a pointer. */}
      {onRead && (
        <CropControl
          time={fileTime ?? flight.time}
          view={view}
          extent={analysis.extent}
          onRead={onRead}
          busy={reading}
          error={readError}
        />
      )}
      <div className="space-y-6">
        <Figure id="altitude-chart" title="Altitude" unit={`${unitsOf(sys).length} AGL`}>
          <div ref={altChartRef}>
            <Chart
              time={altTime}
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
        </Figure>

        {/* The refusal travels with the curve. Six surfaces already consult
            `series.velocityUnusable` — the timeline reading NaNs it (:691), the channel explorer
            attaches the headline's own reason to the SAME trace (`lib/explore.ts:201`), the rail
            exit refuses (`RailExit.tsx:72`), the exports NaN it (`lib/report.ts:71`), the
            comparison marks it unusable (`lib/compare.ts:164`) and drag refuses (`drag.ts:54`) —
            and this Figure, the largest rendering of that data on the page, said only "derived
            from altitude". Measured 2026-08-08: 15 of 50 analysable corpus recordings reach the
            report in that state with a finite trace.

            The curve stays drawn, deliberately: `#135` established that a mis-scaled column has
            to remain visible to be diagnosed, and it is the READING taken off it that is refused.
            The reason comes from `withheldReason`, the same function the headline tile uses, so
            the two cannot drift into saying different things about one refusal. */}
        <Figure
          id="velocity-chart"
          title="Velocity"
          unit={unitsOf(sys).speed}
          note={series.velocitySource === 'device' ? 'logged by the device' : 'derived from altitude'}
          caveat={
            series.velocityUnusable
              ? `Debrief will not report a peak off this trace${
                  metrics.maxVelocityWithheld ? ` — ${withheldReason(metrics.maxVelocityWithheld)}` : ''
                }. The curve is drawn so the problem can be seen; read no speed off it.`
              : undefined
          }
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
        </Figure>

        {hasAccel && (
          <Figure
            id="acceleration-chart"
            title={series.accelerationResultant ? 'Total acceleration' : 'Acceleration'}
            unit={unitsOf(sys).accel}
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
          </Figure>
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
      <FigureChooser
        titles={figureTitles}
        hidden={hiddenFigures}
        onToggle={toggleFigure}
        onMove={moveFigure}
        colorOf={(t) => figureColor(t, figureColors)}
        onColor={setFigureColor}
        onClearColor={clearFigureColor}
        what="the .html report, the bundle and Save .svg"
      />

      {/* Event legend */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="events" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Events
          </h3>
          {/* These times are the log's own clock, which is what the charts are drawn against —
              so an event lines up with the trace above it. The readings are seconds since
              liftoff, which is what a flyer quotes. On a file whose clock doesn't start at
              liftoff those are two different numbers for one instant, and neither was named:
              the ground-station GPS log puts apogee at 973.0 s here and 13.0 s in the grid,
              and 27 of the corpus's 45 flights disagree by half a second or more. Naming the
              clock and where liftoff falls on it reconciles them without moving either. */}
          {liftoffClock != null && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              log clock · liftoff at {fmtTime(liftoffClock)}
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Frame
              key={e.type + e.index}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: EVENT_COLOR[e.type] }}
                  aria-hidden="true"
                />
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{e.label}</span>
                {e.provenance !== 'measured' && (
                  // §3 keeps `text-[11px]` for axis ticks and diagram annotations. A provenance
                  // label is a caption on a value, which is `text-xs`.
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{e.provenance}</span>
                )}
              </span>
              {/* P1 item 2, on the surface that most needed it. These read at `text-xs` in §2's
                  TERTIARY colour, and they are the numbers a flyer checks their recovery against:
                  the height the main actually fired at, against what they set on the altimeter,
                  and the shock the airframe took when it did. §3 is explicit that `text-sm` is the
                  floor for anything read to make a decision and that `text-xs` is for the text
                  AROUND such a value — its unit, its provenance, its caveat — never the value.
                  `tabular-nums` because these are read down a column, event against event. */}
              <span className="text-right font-mono text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                <span className="block">
                  {fmtTime(e.time)} · {fmtLength(e.altitude, sys)}
                </span>
                {eventSpeed(e.index) && <span className="block">{eventSpeed(e.index)}</span>}
                {e.peakAccel != null && accelInG(e.peakAccel) >= 2 && (
                  <span className="block">{fmtAccel(e.peakAccel, sys)} shock</span>
                )}
              </span>
            </Frame>
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
          padOrigin={filePad}
          time={series.time}
          altitude={series.altitude}
          hasGpsAltitude={getChannel(flight, 'altitudeGps') != null}
          // The descent (for the measured wind) starts at the main deploy when one
          // was found, else at apogee — the low, wind-coupled part of the fall.
          descentFromIndex={(events.find((e) => e.type === 'main') ?? events.find((e) => e.type === 'apogee'))?.index}
          apogeeIndex={events.find((e) => e.type === 'apogee')?.index}
          apogeeAltitude={metrics.apogeeAltitude}
          events={events}
        />
      )}

      <div className="print:hidden">
        <ChannelExplorer channels={plotChannels} time={series.time} events={events} sys={sys} stem={stem} />
      </div>

      {/* The shareable card closes the report, once everything it summarizes is shown. */}
      <FlightCard series={series} metrics={metrics} sys={sys} stem={stem} formatLabel={flight.formatLabel} xRange={chartRange} hidden={hidden} recording={recordingMeta} />

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

