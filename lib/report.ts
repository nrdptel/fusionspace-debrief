// Build a plain-text flight summary for sharing — the kind of thing you'd paste
// into a forum post or save next to the log. Mirrors what the report shows.

import type { RawFlight } from './flight/types';
import type { FlightAnalysis } from './analyze/types';
import type { UnitSystem } from './display';
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
  UNIT_LABEL,
} from './display';

function row(label: string, value: string): string {
  return `${label.padEnd(18)}${value}`;
}

export function summaryText(
  flight: RawFlight,
  analysis: FlightAnalysis,
  sys: UnitSystem,
  analyzedAt?: number,
): string {
  const m = analysis.metrics;
  const lines: string[] = [];
  lines.push('Debrief — flight report');
  lines.push(`${flight.source} · ${flight.formatLabel}`);
  if (analyzedAt) lines.push(`Analyzed ${formatAnalyzedAt(analyzedAt)}`);
  lines.push('');

  lines.push(row('Apogee', fmtLength(m.apogeeAltitude, sys)));
  if (Number.isFinite(m.timeToApogee)) lines.push(row('Time to apogee', fmtTime(m.timeToApogee)));
  if (Number.isFinite(m.maxVelocity)) {
    const mach = m.mach ? ` (${fmtMach(m.mach)})` : '';
    lines.push(row('Max velocity', fmtSpeed(m.maxVelocity, sys) + mach));
  }
  if (Number.isFinite(m.maxAcceleration)) lines.push(row('Max acceleration', fmtAccel(m.maxAcceleration)));
  if (m.maxDynamicPressure != null) lines.push(row('Max Q', fmtPressure(m.maxDynamicPressure, sys)));
  if (m.burnTime != null) lines.push(row('Burn time', fmtTime(m.burnTime)));
  if (m.burnoutAltitude != null) lines.push(row('Burnout altitude', fmtLength(m.burnoutAltitude, sys)));
  if (m.burnoutVelocity != null) lines.push(row('Burnout velocity', fmtSpeed(m.burnoutVelocity, sys)));
  if (m.coastTime != null) lines.push(row('Coast to apogee', fmtTime(m.coastTime)));
  if (m.drogueDescentRate != null) lines.push(row('Drogue descent', fmtSpeed(m.drogueDescentRate, sys)));
  if (m.mainDescentRate != null) {
    lines.push(row(m.drogueDescentRate != null ? 'Main descent' : 'Descent rate', fmtSpeed(m.mainDescentRate, sys)));
  }
  if (m.descentTime != null) lines.push(row('Descent time', fmtTime(m.descentTime)));
  if (m.flightTime != null) lines.push(row('Flight time', fmtTime(m.flightTime)));
  if (m.groundTemperature != null) lines.push(row('Ground temp', fmtTemp(m.groundTemperature, sys)));

  if (analysis.events.length) {
    lines.push('');
    lines.push('Events');
    for (const e of analysis.events) {
      const prov = e.provenance !== 'measured' ? `  (${e.provenance})` : '';
      lines.push(`  ${e.label.padEnd(12)} ${fmtTime(e.time).padStart(8)}   ${fmtLength(e.altitude, sys)}${prov}`);
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

/** The analyzed series as a tidy CSV in the chosen units — the cleaned data a
 *  spreadsheet user would otherwise have to derive by hand. */
export function analyzedDataCsv(analysis: FlightAnalysis, sys: UnitSystem): string {
  const { time, altitude, velocity, acceleration } = analysis.series;
  const L = UNIT_LABEL[sys];
  const cell = (v: number) => (Number.isFinite(v) ? v : '');
  const rows = [`time (s),altitude (${L.length} AGL),velocity (${L.speed}),acceleration (g)`];
  for (let i = 0; i < time.length; i++) {
    rows.push(
      [
        time[i].toFixed(3),
        cell(Number(lengthIn(altitude[i], sys).toFixed(1))),
        cell(Number(speedIn(velocity[i], sys).toFixed(1))),
        cell(Number(accelInG(acceleration[i]).toFixed(2))),
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
