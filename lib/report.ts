// Build a plain-text flight summary for sharing — the kind of thing you'd paste
// into a forum post or save next to the log. Mirrors what the report shows.

import type { RawFlight, ReportedValue } from './flight/types';
import type { FlightAnalysis, FlightMetrics } from './analyze/types';
import type { UnitSystem } from './display';
import { compareReported } from './flight/reported';
import { crossCheck, type Comparison, type CompareFlight } from './compare';
import {
  fmtLength,
  fmtSpeed,
  fmtAccel,
  fmtTemp,
  fmtTime,
  fmtMach,
  fmtPressure,
  lengthIn,
  speedIn,
  accelInG,
  tempIn,
  pressureIn,
  pressureUnit,
  UNIT_LABEL,
} from './display';

/** Optional, user-supplied context for a report — a label (rocket, motor, flight
 *  number) and free-text notes — that a flyer adds to make an exported report their
 *  own for a cert document, a project, or a forum post. Both are plain text the flyer
 *  typed; empty/whitespace values are treated as absent. */
export interface ReportMeta {
  label?: string;
  notes?: string;
}

/** Trim a user string, returning undefined when it's empty — so an untouched field
 *  never adds an empty line to an export. */
function clean(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

function row(label: string, value: string): string {
  return `${label.padEnd(18)}${value}`;
}

/** The headline metrics as [label, value] pairs in report order — the single
 *  source both the text and the Markdown export render, so they never drift. Only
 *  the metrics the flight actually has are included. */
function headlineRows(m: FlightAnalysis['metrics'], sys: UnitSystem): [string, string][] {
  const rows: [string, string][] = [];
  rows.push(['Apogee', fmtLength(m.apogeeAltitude, sys)]);
  if (Number.isFinite(m.timeToApogee)) rows.push(['Time to apogee', fmtTime(m.timeToApogee)]);
  if (Number.isFinite(m.maxVelocity)) {
    const mach = m.mach ? ` (${fmtMach(m.mach)})` : '';
    rows.push(['Max velocity', fmtSpeed(m.maxVelocity, sys) + mach]);
  }
  if (Number.isFinite(m.maxAcceleration)) rows.push(['Max acceleration', fmtAccel(m.maxAcceleration)]);
  if (m.maxDynamicPressure != null) {
    const at = m.maxDynamicPressureAltitude != null ? ` at ${fmtLength(m.maxDynamicPressureAltitude, sys)}` : '';
    rows.push(['Max Q', fmtPressure(m.maxDynamicPressure, sys) + at]);
  }
  if (m.transonicTime != null) {
    const at = m.transonicAltitude != null ? ` at ${fmtLength(m.transonicAltitude, sys)}` : '';
    rows.push(['Supersonic', `crossed Mach 1${at}, ${fmtTime(m.transonicTime)} after liftoff`]);
  }
  if (m.burnTime != null) rows.push(['Burn time', fmtTime(m.burnTime)]);
  if (m.burnoutAltitude != null) rows.push(['Burnout altitude', fmtLength(m.burnoutAltitude, sys)]);
  if (m.burnoutVelocity != null) rows.push(['Burnout velocity', fmtSpeed(m.burnoutVelocity, sys)]);
  if (m.coastTime != null) rows.push(['Coast to apogee', fmtTime(m.coastTime)]);
  if (m.drogueDescentRate != null) rows.push(['Drogue descent', fmtSpeed(m.drogueDescentRate, sys)]);
  if (m.mainDescentRate != null) {
    rows.push([m.drogueDescentRate != null ? 'Main descent' : 'Descent rate', fmtSpeed(m.mainDescentRate, sys)]);
  }
  if (m.descentTime != null) rows.push(['Descent time', fmtTime(m.descentTime)]);
  if (m.flightTime != null) rows.push(['Flight time', fmtTime(m.flightTime)]);
  if (m.tiltAtBurnout != null) rows.push(['Tilt at burnout', `${Math.round(m.tiltAtBurnout)}° off vertical`]);
  if (m.groundTemperature != null) rows.push(['Ground temp', fmtTemp(m.groundTemperature, sys)]);
  return rows;
}

function fmtReported(metric: ReportedValue['metric'], si: number, sys: UnitSystem): string {
  if (metric === 'apogeeAltitude') return fmtLength(si, sys);
  if (metric === 'maxVelocity' || metric === 'burnoutVelocity' || metric === 'mainDescentRate') return fmtSpeed(si, sys);
  return fmtAccel(si);
}

/** Rows for the "logger's own summary" cross-check: the device figure, Debrief's
 *  read, and how closely they agree. Empty when the file carried no summary. */
function crossCheckRows(flight: RawFlight, m: FlightAnalysis['metrics'], sys: UnitSystem): [string, string, string, string][] {
  if (!flight.reported?.length) return [];
  return compareReported(flight.reported, m).map(({ reported: r, computed, hasComputed, deltaPct, status }) => {
    const pct = deltaPct == null ? '' : deltaPct < 0.05 ? '≈0' : `${deltaPct.toFixed(deltaPct < 10 ? 1 : 0)}%`;
    const agreement =
      status == null
        ? 'not computed'
        : status === 'agree'
          ? `agree (${pct})`
          : status === 'consistent'
            ? `consistent (${pct})`
            : `differ (${pct})`;
    return [r.label, fmtReported(r.metric, r.value, sys), hasComputed ? fmtReported(r.metric, computed, sys) : '—', agreement];
  });
}

export function summaryText(
  flight: RawFlight,
  analysis: FlightAnalysis,
  sys: UnitSystem,
  analyzedAt?: number,
  meta?: ReportMeta,
): string {
  const label = clean(meta?.label);
  const notes = clean(meta?.notes);
  const lines: string[] = [];
  lines.push('Debrief — flight report');
  if (label) lines.push(label);
  lines.push(`${flight.source} · ${flight.formatLabel}`);
  if (analyzedAt) lines.push(`Analyzed ${formatAnalyzedAt(analyzedAt)}`);
  if (notes) {
    lines.push('');
    lines.push(notes);
  }
  lines.push('');

  for (const [label, value] of headlineRows(analysis.metrics, sys)) lines.push(row(label, value));

  if (analysis.events.length) {
    lines.push('');
    lines.push('Events');
    for (const e of analysis.events) {
      const prov = e.provenance !== 'measured' ? `  (${e.provenance})` : '';
      const v = analysis.series.velocity[e.index];
      const speed = Number.isFinite(v) ? `   ${fmtSpeed(v, sys)}` : '';
      lines.push(`  ${e.label.padEnd(12)} ${fmtTime(e.time).padStart(8)}   ${fmtLength(e.altitude, sys)}${speed}${prov}`);
    }
  }

  const xrows = crossCheckRows(flight, analysis.metrics, sys);
  if (xrows.length) {
    lines.push('');
    lines.push('Logger’s own summary (cross-check)');
    for (const [label, device, debrief, agreement] of xrows) {
      lines.push(`  ${label.padEnd(16)} logger ${device.padStart(10)}   Debrief ${debrief.padStart(10)}   ${agreement}`);
    }
  }

  if (analysis.warnings.length) {
    lines.push('');
    lines.push('Notes');
    for (const w of analysis.warnings) lines.push(`  - ${w}`);
  }

  lines.push('');
  lines.push('Figures are computed best-effort from the logger’s own data — a careful');
  lines.push('reading, not gospel; values marked (derived) were inferred, not measured.');
  lines.push('Made with Debrief (debrief.fusionspace.co) — parsed locally, never uploaded.');
  return lines.join('\n');
}

/** A report-grade Markdown version of the summary — headline metrics and events as
 *  tables, notes as a list — to drop straight into a project write-up, a cert
 *  document, or a forum post (Reddit and anywhere else that renders Markdown). Same
 *  numbers as the report and the text summary, in the chosen units. */
export function summaryMarkdown(
  flight: RawFlight,
  analysis: FlightAnalysis,
  sys: UnitSystem,
  analyzedAt?: number,
  meta?: ReportMeta,
): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|'); // a stray pipe would split the table cell
  const label = clean(meta?.label);
  const notes = clean(meta?.notes);
  const out: string[] = [];
  out.push('# Debrief — flight report');
  out.push('');
  if (label) out.push(`## ${cell(label)}`, '');
  const stamp = analyzedAt ? ` · Analyzed ${formatAnalyzedAt(analyzedAt)}` : '';
  out.push(`**${cell(flight.source)}** · ${cell(flight.formatLabel)}${stamp}`);
  out.push('');
  if (notes) {
    // A blockquote keeps the flyer's own words distinct from the read; each line
    // carries the marker so a multi-line note stays one quote.
    out.push(notes.split('\n').map((l) => `> ${l}`).join('\n'), '');
  }

  out.push('| Metric | Value |');
  out.push('| --- | --- |');
  for (const [label, value] of headlineRows(analysis.metrics, sys)) out.push(`| ${cell(label)} | ${cell(value)} |`);

  if (analysis.events.length) {
    out.push('', '## Events', '', '| Event | Time | Altitude | Speed |', '| --- | --- | --- | --- |');
    for (const e of analysis.events) {
      const label = e.provenance !== 'measured' ? `${e.label} (${e.provenance})` : e.label;
      const v = analysis.series.velocity[e.index];
      const speed = Number.isFinite(v) ? fmtSpeed(v, sys) : '—';
      out.push(`| ${cell(label)} | ${fmtTime(e.time)} | ${cell(fmtLength(e.altitude, sys))} | ${cell(speed)} |`);
    }
  }

  const xrows = crossCheckRows(flight, analysis.metrics, sys);
  if (xrows.length) {
    out.push('', '## Logger’s own summary (cross-check)', '', '| Reading | Logger | Debrief | Agreement |', '| --- | --- | --- | --- |');
    for (const [label, device, debrief, agreement] of xrows) {
      out.push(`| ${cell(label)} | ${cell(device)} | ${cell(debrief)} | ${cell(agreement)} |`);
    }
  }

  if (analysis.warnings.length) {
    out.push('', '## Notes', '');
    for (const w of analysis.warnings) out.push(`- ${w}`);
  }

  out.push('');
  out.push(
    '_Computed best-effort from the logger’s own data — a careful reading, not gospel; values marked “derived” were inferred, not measured. Made with [Debrief](https://debrief.fusionspace.co) — parsed locally, never uploaded._',
  );
  return out.join('\n');
}

/** The analyzed series as a tidy CSV in the chosen units — the cleaned data a
 *  spreadsheet user would otherwise have to derive by hand. */
export function analyzedDataCsv(analysis: FlightAnalysis, sys: UnitSystem): string {
  const { time, altitude, velocity, acceleration, speedOfSound, airDensity } = analysis.series;
  const L = UNIT_LABEL[sys];
  const pUnit = pressureUnit(sys);
  const cell = (v: number) => (Number.isFinite(v) ? v : '');
  const rows = [
    `time (s),altitude (${L.length} AGL),velocity (${L.speed}),acceleration (g),mach,dynamic pressure (${pUnit})`,
  ];
  for (let i = 0; i < time.length; i++) {
    const v = velocity[i];
    const mach = speedOfSound > 0 ? v / speedOfSound : NaN;
    const q = 0.5 * airDensity[i] * v * v;
    rows.push(
      [
        time[i].toFixed(3),
        cell(Number(lengthIn(altitude[i], sys).toFixed(1))),
        cell(Number(speedIn(velocity[i], sys).toFixed(1))),
        cell(Number(accelInG(acceleration[i]).toFixed(2))),
        cell(Number(mach.toFixed(3))),
        cell(Number(pressureIn(q, sys).toFixed(2))),
      ].join(','),
    );
  }
  return rows.join('\n');
}

// --- Comparison / cross-check report -------------------------------------

/** Strip a file extension for a tidy display/column label. */
function nameStem(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export interface CompareMetricRow {
  label: string;
  /** One formatted string per flight, in flight order. */
  cells: string[];
  /** Index of the flight to emphasize as best, or -1 for none. */
  best: number;
  /** For a two-flight comparison only: the spread between the pair, |a−b| as a
   *  percent of their mean — how closely two recordings of one flight agree, or how
   *  much one flight differs from another. Null for ≠2 flights or a missing value. */
  spreadPct: number | null;
}

/** The side-by-side comparison table as labelled rows — the single source both the
 *  on-screen table and the Markdown/CSV exports render, so they can't drift. A row's
 *  `best` marks the single highest finite value (only for a metric where higher is
 *  better, ≥2 flights have one, and there's no tie); `spreadPct` gives the pairwise
 *  difference for a two-flight comparison. Velocity/acceleration that mix device and
 *  baro sources across flights are tagged "(baro)" rather than crowned across methods
 *  that aren't directly comparable. */
export function compareMetricRows(flights: CompareFlight[], sys: UnitSystem): CompareMetricRow[] {
  const velMixed = new Set(flights.map((f) => f.metrics.maxVelocitySource)).size > 1;
  const accMixed = new Set(flights.map((f) => f.metrics.accelerationSource)).size > 1;
  const baroTag = (mixed: boolean, source: 'device' | 'baro', finite: boolean) =>
    mixed && source === 'baro' && finite ? ' (baro)' : '';

  // Every row has a numeric value (for the pairwise spread); `rank` marks the rows
  // where a single highest value is a meaningful "best" to emphasize.
  const specs: { label: string; get: (m: FlightMetrics) => string; value: (m: FlightMetrics) => number; rank?: boolean }[] = [
    { label: 'Apogee', get: (m) => fmtLength(m.apogeeAltitude, sys), value: (m) => m.apogeeAltitude, rank: true },
    { label: 'Time to apogee', get: (m) => fmtTime(m.timeToApogee), value: (m) => m.timeToApogee },
    {
      label: 'Max velocity',
      get: (m) => fmtSpeed(m.maxVelocity, sys) + baroTag(velMixed, m.maxVelocitySource, Number.isFinite(m.maxVelocity)),
      value: (m) => m.maxVelocity,
      rank: true,
    },
    { label: 'Max Mach', get: (m) => fmtMach(m.mach), value: (m) => m.mach ?? NaN, rank: true },
    {
      label: 'Max acceleration',
      get: (m) => fmtAccel(m.maxAcceleration) + baroTag(accMixed, m.accelerationSource, Number.isFinite(m.maxAcceleration)),
      value: (m) => m.maxAcceleration,
      rank: true,
    },
    { label: 'Max Q', get: (m) => fmtPressure(m.maxDynamicPressure, sys), value: (m) => m.maxDynamicPressure ?? NaN, rank: true },
    { label: 'Burn time', get: (m) => (m.burnTime != null ? fmtTime(m.burnTime) : '—'), value: (m) => m.burnTime ?? NaN },
    { label: 'Burnout altitude', get: (m) => (m.burnoutAltitude != null ? fmtLength(m.burnoutAltitude, sys) : '—'), value: (m) => m.burnoutAltitude ?? NaN },
    { label: 'Drogue descent', get: (m) => (m.drogueDescentRate != null ? fmtSpeed(m.drogueDescentRate, sys) : '—'), value: (m) => m.drogueDescentRate ?? NaN },
    { label: 'Main descent', get: (m) => (m.mainDescentRate != null ? fmtSpeed(m.mainDescentRate, sys) : '—'), value: (m) => m.mainDescentRate ?? NaN },
    { label: 'Flight time', get: (m) => (m.flightTime != null ? fmtTime(m.flightTime) : '—'), value: (m) => m.flightTime ?? NaN },
  ];
  // Tilt at burnout only when at least one flight carried an attitude solution —
  // otherwise the row would be all "—" for the (common) loggers without one.
  if (flights.some((f) => f.metrics.tiltAtBurnout != null)) {
    specs.push({
      label: 'Tilt at burnout',
      get: (m) => (m.tiltAtBurnout != null ? `${Math.round(m.tiltAtBurnout)}°` : '—'),
      value: (m) => m.tiltAtBurnout ?? NaN,
    });
  }

  return specs.map((s) => {
    let best = -1;
    if (s.rank) {
      let bv = -Infinity;
      let finite = 0;
      let ties = 0;
      flights.forEach((f, i) => {
        const v = s.value(f.metrics);
        if (!Number.isFinite(v)) return;
        finite++;
        if (v > bv) {
          bv = v;
          best = i;
          ties = 1;
        } else if (v === bv) {
          ties++;
        }
      });
      if (finite < 2 || ties !== 1) best = -1;
    }

    let spreadPct: number | null = null;
    if (flights.length === 2) {
      const a = s.value(flights[0].metrics);
      const b = s.value(flights[1].metrics);
      const mean = (a + b) / 2;
      if (Number.isFinite(a) && Number.isFinite(b) && mean > 0) spreadPct = (Math.abs(a - b) / mean) * 100;
    }

    return { label: s.label, cells: flights.map((f) => s.get(f.metrics)), best, spreadPct };
  });
}

/** Whether any compared flight tags a metric "(baro)" — i.e. the flights mix a
 *  device-logged and a baro-derived source, so a footnote is warranted. */
export function compareHasBaroMix(flights: CompareFlight[]): boolean {
  return (
    new Set(flights.map((f) => f.metrics.maxVelocitySource)).size > 1 ||
    new Set(flights.map((f) => f.metrics.accelerationSource)).size > 1
  );
}

/** A report-grade Markdown comparison — the cross-check narrative (how closely the
 *  recordings agree) and the side-by-side metrics table — to document a redundant-
 *  altimeter check or a stage-by-stage assembly in a cert package or a forum post.
 *  Same numbers as the compare view, in the chosen units. */
export function compareMarkdown(comparison: Comparison, sys: UnitSystem, note?: string, meta?: ReportMeta): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|');
  const label = clean(meta?.label);
  const userNotes = clean(meta?.notes);
  const { flights } = comparison;
  const out: string[] = [];
  out.push('# Debrief — flight comparison');
  out.push('');
  if (label) out.push(`## ${cell(label)}`, '');
  out.push(`Comparing **${flights.length}** flight${flights.length === 1 ? '' : 's'}, aligned at liftoff (t = 0).`);
  out.push('');
  out.push(...flights.map((f) => `- **${cell(nameStem(f.name))}** · ${cell(f.formatLabel)}`));
  if (userNotes) out.push('', userNotes.split('\n').map((l) => `> ${l}`).join('\n'));
  if (note) out.push('', `> ${cell(note)}`);

  const agree = crossCheck(flights);
  if (agree.length) {
    const phrase = agree
      .map((a) => `${a.spreadPct.toFixed(a.spreadPct < 1 ? 1 : 0)}% on ${a.label}${a.mixedSource ? '\\*' : ''}`)
      .reduce((acc, s, i, arr) => (i === 0 ? s : `${acc}${i === arr.length - 1 ? ' and ' : ', '}${s}`), '');
    const mixed = agree.some((a) => a.mixedSource)
      ? ' \\*The recordings mix a measured value with one derived from altitude, which reads softer at the peak — so read that agreement as the looser bound.'
      : '';
    out.push('', '## Cross-check', '');
    out.push(
      `If these are recordings of the same flight, the independent readings agree to within ${phrase}. Close agreement builds confidence; a wide gap is a flag worth chasing — not a verdict, just the spread.${mixed}`,
    );
  }

  const rows = compareMetricRows(flights, sys);
  // A two-flight comparison gets a Difference column: how far apart the pair is on
  // each metric — the redundant-altimeter agreement, or the flight-to-flight change.
  const pair = flights.length === 2;
  out.push('', '## Metrics', '');
  out.push(`| Metric | ${flights.map((f) => cell(nameStem(f.name))).join(' | ')} |${pair ? ' Difference |' : ''}`);
  out.push(`| --- | ${flights.map(() => '---').join(' | ')} |${pair ? ' --- |' : ''}`);
  for (const r of rows) {
    const cells = r.cells.map((c, i) => (i === r.best ? `**${cell(c)}**` : cell(c)));
    const diff = pair ? ` ${r.spreadPct != null ? `${r.spreadPct.toFixed(r.spreadPct < 1 ? 1 : 0)}%` : '—'} |` : '';
    out.push(`| ${cell(r.label)} | ${cells.join(' | ')} |${diff}`);
  }

  if (compareHasBaroMix(flights)) {
    out.push('', '_(baro) — derived from altitude rather than logged by the device, so it reads softer at peak speed._');
  }

  out.push('');
  out.push(
    '_Recordings aligned at liftoff and resampled onto a shared time base. A cross-check of the recordings, never a verdict. Made with [Debrief](https://debrief.fusionspace.co) — parsed locally, never uploaded._',
  );
  return out.join('\n');
}

/** Unit-conversion helpers for the JSON exports, bound to a system, so every
 *  structured export rounds and converts identically. */
function jsonConv(sys: UnitSystem) {
  const round = (v: number, p: number): number | null => (Number.isFinite(v) ? Number(v.toFixed(p)) : null);
  return {
    round,
    len: (v: number | null) => (v == null ? null : round(lengthIn(v, sys), 1)),
    spd: (v: number | null) => (v == null ? null : round(speedIn(v, sys), 1)),
    acc: (v: number | null) => (v == null ? null : round(accelInG(v), 2)),
    sec: (v: number | null) => (v == null ? null : round(v, 2)),
    prs: (v: number | null) => (v == null ? null : round(pressureIn(v, sys), 2)),
  };
}

/** The units every JSON metric is expressed in, for the chosen system. */
function jsonUnits(sys: UnitSystem) {
  const L = UNIT_LABEL[sys];
  return {
    length: L.length,
    speed: L.speed,
    acceleration: L.accel,
    temperature: L.temp,
    pressure: pressureUnit(sys),
    mach: 'ratio',
    time: 's',
    voltage: 'V',
    angularRate: 'deg/s',
    angle: '°',
  };
}

/** One flight's metrics as a JSON object, in the chosen units — the single builder
 *  behind both the single-flight and the comparison exports, so they can't drift. */
function jsonMetrics(m: FlightAnalysis['metrics'], sys: UnitSystem): Record<string, number | string | boolean | null> {
  const { round, len, spd, acc, sec, prs } = jsonConv(sys);
  return {
    apogee: len(m.apogeeAltitude),
    timeToApogee: sec(m.timeToApogee),
    maxVelocity: spd(m.maxVelocity),
    maxVelocitySource: m.maxVelocitySource,
    maxVelocityAltitude: len(m.maxVelocityAltitude),
    maxMach: m.mach != null ? round(m.mach, 3) : null,
    maxAcceleration: acc(m.maxAcceleration),
    accelerationSource: m.accelerationSource,
    accelerationClipped: m.accelClipped,
    avgBoostAcceleration: acc(m.avgBoostAcceleration),
    maxDeceleration: acc(m.maxDeceleration),
    liftoffThrustToWeight: m.liftoffTWR != null ? round(m.liftoffTWR, 2) : null,
    maxDynamicPressure: prs(m.maxDynamicPressure),
    maxDynamicPressureAltitude: len(m.maxDynamicPressureAltitude),
    transonicTime: sec(m.transonicTime),
    transonicAltitude: len(m.transonicAltitude),
    burnTime: sec(m.burnTime),
    burnoutAltitude: len(m.burnoutAltitude),
    burnoutVelocity: spd(m.burnoutVelocity),
    coastTime: sec(m.coastTime),
    coastEfficiency: m.coastEfficiency != null ? round(m.coastEfficiency, 3) : null,
    dragLossAltitude: len(m.dragLossAltitude),
    drogueDescentRate: spd(m.drogueDescentRate),
    mainDescentRate: spd(m.mainDescentRate),
    descentTime: sec(m.descentTime),
    flightTime: sec(m.flightTime),
    groundTemperature: m.groundTemperature != null ? round(tempIn(m.groundTemperature, sys), 1) : null,
    batteryStartV: m.batteryStartV != null ? round(m.batteryStartV, 2) : null,
    batteryMinV: m.batteryMinV != null ? round(m.batteryMinV, 2) : null,
    peakRollRate: m.peakRollRate != null ? round(m.peakRollRate, 0) : null,
    rollRevolutions: m.rollRevolutions != null ? round(m.rollRevolutions, 1) : null,
    tiltAtBurnoutDeg: m.tiltAtBurnout != null ? round(m.tiltAtBurnout, 1) : null,
  };
}

/** The full analysis as structured JSON — Debrief's canonical read of a flight in
 *  one machine-readable file, for a script, a spreadsheet import, another tool, or
 *  an archive. Every number carries its unit (the chosen system) and its
 *  provenance, so nothing downstream reads as more certain than it is; only the
 *  metrics the flight actually has are non-null. Same values as the report. */
export function analysisJson(
  flight: RawFlight,
  analysis: FlightAnalysis,
  sys: UnitSystem,
  analyzedAt?: number,
  meta?: ReportMeta,
): string {
  const { metrics: m, events, warnings, series } = analysis;
  const { round, len, spd, acc, sec } = jsonConv(sys);
  const reportedNum = (metric: ReportedValue['metric'], si: number) =>
    metric === 'apogeeAltitude' ? len(si) : metric === 'maxVelocity' ? spd(si) : acc(si);
  const label = clean(meta?.label);
  const notes = clean(meta?.notes);

  const doc: Record<string, unknown> = {
    schema: 'debrief.flight/1',
    generatedBy: 'Debrief (debrief.fusionspace.co)',
    source: flight.source,
    format: flight.formatLabel,
    ...(label ? { label } : {}),
    ...(notes ? { notes } : {}),
    analyzedAt: analyzedAt ? new Date(analyzedAt).toISOString() : null,
    units: jsonUnits(sys),
    altitudeSource: series.altitudeSource,
    metrics: jsonMetrics(m, sys),
    events: events.map((e) => ({
      type: e.type,
      label: e.label,
      time: sec(e.time),
      altitude: len(e.altitude),
      speed: spd(series.velocity[e.index] ?? NaN),
      provenance: e.provenance,
      ...(e.peakAccel != null ? { peakAcceleration: acc(e.peakAccel) } : {}),
    })),
    warnings,
    disclaimer:
      'Computed best-effort from the logger’s own data — a careful reading, not gospel; values marked “derived” were inferred, not measured. Parsed locally; nothing uploaded.',
  };

  // The logger's own reported summary and how Debrief's read compares — only when
  // the file carried one.
  if (flight.reported?.length) {
    doc.loggerSummary = compareReported(flight.reported, m).map(({ reported: r, computed, hasComputed, deltaPct, status }) => ({
      label: r.label,
      metric: r.metric,
      logger: reportedNum(r.metric, r.value),
      debrief: hasComputed ? reportedNum(r.metric, computed) : null,
      agreementPct: deltaPct == null ? null : round(deltaPct, 1),
      agreement: status,
    }));
  }

  return JSON.stringify(doc, null, 2);
}

/** A comparison as structured JSON — each flight's metrics, the cross-check spreads,
 *  and (for a pair) the per-metric difference — the machine-readable companion to the
 *  comparison Markdown, for a script reconciling redundant altimeters or tracking a
 *  rocket across launches. Same numbers as the compare view, in the chosen units. */
export function compareJson(comparison: Comparison, sys: UnitSystem, note?: string, meta?: ReportMeta): string {
  const { flights } = comparison;
  const { round } = jsonConv(sys);
  const label = clean(meta?.label);
  const userNotes = clean(meta?.notes);
  const doc: Record<string, unknown> = {
    schema: 'debrief.comparison/1',
    generatedBy: 'Debrief (debrief.fusionspace.co)',
    alignment: 'liftoff',
    ...(label ? { label } : {}),
    ...(userNotes ? { notes: userNotes } : {}),
    ...(note ? { note } : {}),
    units: jsonUnits(sys),
    flights: flights.map((f) => ({ name: f.name, format: f.formatLabel, metrics: jsonMetrics(f.metrics, sys) })),
    crossCheck: crossCheck(flights).map((a) => ({
      metric: a.key,
      label: a.label,
      spreadPct: round(a.spreadPct, 1),
      flights: a.count,
      ...(a.mixedSource ? { mixedSource: true } : {}),
    })),
    disclaimer:
      'Recordings aligned at liftoff and resampled onto a shared time base. A cross-check of the recordings, never a verdict. Parsed locally; nothing uploaded.',
  };
  if (flights.length === 2) {
    doc.differences = compareMetricRows(flights, sys)
      .filter((r) => r.spreadPct != null)
      .map((r) => ({ metric: r.label, spreadPct: round(r.spreadPct as number, 1) }));
  }
  return JSON.stringify(doc, null, 2);
}

/** A friendly "Jun 25, 2026, 10:37 AM" stamp, matching the family's style. */
export function formatAnalyzedAt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A filesystem-safe stem from the source file name. */
export function reportStem(source: string): string {
  return (source.replace(/\.[^.]+$/, '') || 'flight').replace(/[^a-z0-9._-]+/gi, '-');
}
