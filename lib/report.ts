// Build a plain-text flight summary for sharing — the kind of thing you'd paste
// into a forum post or save next to the log. Mirrors what the report shows.

import type { RawFlight, ReportedValue } from './flight/types';
import type { FlightAnalysis } from './analyze/types';
import type { UnitSystem } from './display';
import { compareReported } from './flight/reported';
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
  pressureIn,
  pressureUnit,
  UNIT_LABEL,
} from './display';

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
  if (m.groundTemperature != null) rows.push(['Ground temp', fmtTemp(m.groundTemperature, sys)]);
  return rows;
}

function fmtReported(metric: ReportedValue['metric'], si: number, sys: UnitSystem): string {
  if (metric === 'apogeeAltitude') return fmtLength(si, sys);
  if (metric === 'maxVelocity') return fmtSpeed(si, sys);
  return fmtAccel(si);
}

/** Rows for the "logger's own summary" cross-check: the device figure, Debrief's
 *  read, and how closely they agree. Empty when the file carried no summary. */
function crossCheckRows(flight: RawFlight, m: FlightAnalysis['metrics'], sys: UnitSystem): [string, string, string, string][] {
  if (!flight.reported?.length) return [];
  return compareReported(flight.reported, m).map(({ reported: r, computed, hasComputed, deltaPct }) => {
    const agreement =
      deltaPct == null ? 'not computed' : deltaPct <= 5 ? `agree (${deltaPct < 0.05 ? '≈0' : deltaPct.toFixed(1)}%)` : `differ (${deltaPct.toFixed(0)}%)`;
    return [r.label, fmtReported(r.metric, r.value, sys), hasComputed ? fmtReported(r.metric, computed, sys) : '—', agreement];
  });
}

export function summaryText(
  flight: RawFlight,
  analysis: FlightAnalysis,
  sys: UnitSystem,
  analyzedAt?: number,
): string {
  const lines: string[] = [];
  lines.push('Debrief — flight report');
  lines.push(`${flight.source} · ${flight.formatLabel}`);
  if (analyzedAt) lines.push(`Analyzed ${formatAnalyzedAt(analyzedAt)}`);
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
): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|'); // a stray pipe would split the table cell
  const out: string[] = [];
  out.push('# Debrief — flight report');
  out.push('');
  const stamp = analyzedAt ? ` · Analyzed ${formatAnalyzedAt(analyzedAt)}` : '';
  out.push(`**${cell(flight.source)}** · ${cell(flight.formatLabel)}${stamp}`);
  out.push('');

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
