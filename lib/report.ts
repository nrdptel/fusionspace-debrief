// Build a plain-text flight summary for sharing — the kind of thing you'd paste
// into a forum post or save next to the log. Mirrors what the report shows.

import type { RawFlight, ReportedValue } from './flight/types';
import type { FlightAnalysis, FlightMetrics } from './analyze/types';
import {
  accelIn,
  accelInG,
  fmtAccel,
  fmtLength,
  fmtMach,
  fmtPressure,
  fmtSpeed,
  fmtTemp,
  fmtTime,
  fmtVoltage,
  lengthIn,
  pressureIn,
  pressureUnit,
  speedIn,
  systemOf,
  tempIn,
  unitsOf,
} from './display';
import type { UnitChoice } from './display';
import { compareReported, REPORTED_QUANTITY } from './flight/reported';
import { formatFlownAt } from './flight/flownAt';
import {
  crossCheck,
  crossCheckLede,
  differentFlightDays,
  statedDaySplit,
  statedDaysPhrase,
  undatedNote,
  DIFFERENT_DAYS_CAVEAT,
  type Comparison,
  type CompareFlight,
} from './compare';
import { derivedPeakCaveat } from './derivedPeak';
import { apogeeSub, velocityProvenance, burnoutSub, burnoutVelocitySub, landedInRecord, landingRate, landingRateIsWholeDescent, withheldReason } from './readings';
import { peakAgreement } from './crossPeak';
import { buildPlotChannels } from './explore';
import { orderRows, visibleRows } from './reportProfile';
import { formulaGuard } from './csv';
import { landingEnergyJoules, joulesToFtLbf, MASS_TO_KG } from './landing';
import { deployCheck } from './deploy';
import { delayCheck } from './ejection';

/** Recovery figures a flyer supplied on-screen that a report should carry: the descending
 *  mass (for landing energy — the ½·m·v² a cert card and many club waivers ask for), and the
 *  main-deploy altitude they set on the altimeter (to verify, against the measured firing,
 *  that the main fired where told — a main firing too low is a hard-landing hazard). Each is
 *  optional; a field only appears in the export once the flyer has entered it. */
export interface RecoveryFigures {
  descendingMassKg?: number;
  /** The main-deploy altitude the flyer set, and the altitude Debrief measured it firing at
   *  (both metres AGL) — for the "did the main fire where I told it to" check. */
  mainDeploy?: { setM: number; actualM: number };
  /** The printed motor delay the flyer flew (s) and the flight's coast time (the ideal
   *  delay, s) — for the "did the ejection fire near apogee" check on a motor-ejection flight. */
  ejectionDelay?: { printedS: number; coastS: number };
}

/** The speed at an event, for the event tables every export carries. A velocity the
 *  analysis judged unusable — beyond any rocket, swinging negative on the way up, or past
 *  the ceiling the flight's own accelerometer allows — is withheld here as it is in the
 *  headline, so no export hands back the figure the analysis has already refused. */
function eventSpeed(analysis: FlightAnalysis, index: number): number {
  if (analysis.series.velocityUnusable) return NaN;
  return analysis.series.velocity[index] ?? NaN;
}

/** The landing-energy summary row, when a descending mass was entered and the flight has
 *  a landing descent rate — in the cert unit (ft·lbf imperial, J metric), noting the mass. */
function landingEnergyRow(
  m: FlightAnalysis['metrics'],
  sys: UnitChoice,
  recovery: RecoveryFigures | undefined,
): [string, string] | null {
  if (recovery?.descendingMassKg == null) return null;
  const joules = landingEnergyJoules(recovery.descendingMassKg, landingRate(m));
  if (joules == null) return null;
  const massUnit = systemOf(sys) === 'metric' ? 'g' : 'oz';
  const massDisp = (recovery.descendingMassKg / MASS_TO_KG[massUnit]).toFixed(massUnit === 'oz' ? 1 : 0);
  const value =
    systemOf(sys) === 'metric'
      ? `${Math.round(joules)} J`
      : `${joulesToFtLbf(joules).toFixed(joulesToFtLbf(joules) < 100 ? 1 : 0)} ft·lbf`;
  const basis = landingRateIsWholeDescent(m)
    ? ' — off the whole-descent average, as no deployment change is in the record'
    : '';
  return ['Landing energy', `${value} (at ${massDisp} ${massUnit} descending)${basis}`];
}

/** The main-deploy verification row, when the flyer entered the altitude they set: how the
 *  measured firing compared to it (on the mark / high / low), the check a cert flight and a
 *  careful flyer both want. */
function mainDeployRow(sys: UnitChoice, recovery: RecoveryFigures | undefined): [string, string] | null {
  if (!recovery?.mainDeploy) return null;
  const { setM, actualM } = recovery.mainDeploy;
  const { offsetM, when } = deployCheck(actualM, setM);
  const side =
    when === 'on'
      ? 'on the mark'
      : when === 'high'
        ? `${fmtLength(offsetM, sys)} high`
        : `${fmtLength(-offsetM, sys)} low`;
  return ['Main deploy check', `fired at ${fmtLength(actualM, sys)}, set ${fmtLength(setM, sys)} — ${side}`];
}

/** The ejection-delay verification row, when the flyer entered the motor delay they flew:
 *  how it landed relative to apogee (at / after / before) — a delay that fires well before
 *  apogee deploys into a fast airstream, the riskiest case for the recovery gear. */
function ejectionDelayRow(recovery: RecoveryFigures | undefined): [string, string] | null {
  if (!recovery?.ejectionDelay) return null;
  const { printedS, coastS } = recovery.ejectionDelay;
  const { offsetS, when } = delayCheck(printedS, coastS);
  const side =
    when === 'at'
      ? 'near apogee'
      : when === 'after'
        ? `${offsetS.toFixed(1)} s after apogee`
        : `${(-offsetS).toFixed(1)} s before apogee`;
  return ['Ejection check', `flew ${printedS} s, ideal ${coastS.toFixed(1)} s — fires ${side}`];
}

/** Optional, user-supplied context for a report — a label (rocket, motor, flight
 *  number) and free-text notes — that a flyer adds to make an exported report their
 *  own for a cert document, a project, or a forum post. Both are plain text the flyer
 *  typed; empty/whitespace values are treated as absent. */
export interface ReportMeta {
  label?: string;
  notes?: string;
  /** Readings the flyer has turned off for this report (see lib/reportProfile). Applies
   *  to the text, Markdown and HTML reports — not to the data exports, which stay a
   *  complete machine-readable record. */
  hidden?: string[];
  /** The order the flyer put the comparison's rows in (see lib/reportProfile). Applies to
   *  the comparison only, where one builder feeds the screen and every export alike. */
  order?: string[];
  /** Which RECORDING of the flight this document is, where the flyer has said the flight was
   *  flown on more than one altimeter. Absent on every ordinary flight, and then no document
   *  gains a line.
   *
   *  The file name in the header already names the recording; what it cannot say is that the
   *  flight has others and which one it is reported by. A cert write-up quoting an apogee has
   *  to be able to state which instrument read it, and a reader who finds two Debrief reports
   *  of the same launch has to be able to tell they are not two launches.
   *
   *  `of` is a count and it is grounded. There is deliberately no INDEX: the recordings are
   *  ordered by when each was last opened, so "recording 3 of 4" renumbers itself when a flyer
   *  merely looks at one, and an ordinal that reads as an identity in a certification document
   *  must not be a fact about this afternoon's clicking.
   *
   *  `isReportedBy` is decided by the caller from the logbook ID, never from the file name.
   *  Two same-model altimeters — the canonical primary-and-backup pair — write their exports
   *  under the same default name, and the logbook keeps such rows apart by their contents; a
   *  name comparison would have the BACKUP's report claim to be the one the flight is reported
   *  by, which is a false statement about provenance in the one document this exists for. */
  recording?: { of: number; reportedBy: string; isReportedBy: boolean };
}

/** The one sentence every document says about being one recording of several. Built here so
 *  the surfaces that print it cannot drift into saying different things. */
export function recordingLine(rec: NonNullable<ReportMeta['recording']>): string {
  const which = `One of ${rec.of} recordings of this flight`;
  return rec.isReportedBy ? `${which} — the one it is reported by` : `${which} — reported by ${rec.reportedBy}`;
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
 *  the metrics the flight actually has are included.
 *
 *  Exported for the drift guard in lib/readings.test.ts, which holds this list against
 *  the on-screen one and fails when a reading appears on the page and not in the saved
 *  report — the way six of them once did. */
export function headlineRows(
  m: FlightAnalysis['metrics'],
  sys: UnitChoice,
  recovery?: RecoveryFigures,
  hidden?: string[],
): [string, string][] {
  const rows: [string, string][] = [];
  // The document a flyer files has to carry the qualifier the screen shows, or the number
  // that leaves the app is the one without it.
  const apoSub = m.apogeeIsFloor ? apogeeSub(m) : undefined;
  rows.push(['Apogee', fmtLength(m.apogeeAltitude, sys) + (apoSub ? ` — ${apoSub}` : '')]);
  if (Number.isFinite(m.timeToApogee)) rows.push(['Time to apogee', fmtTime(m.timeToApogee)]);
  if (Number.isFinite(m.maxVelocity)) {
    const mach = m.mach ? ` (${fmtMach(m.mach)})` : '';
    // …and that applies to the PEAK SPEED too, which it did not until now. The tile has always
    // said measured or derived; every saved document printed the number bare, so a cert write-up
    // carried a speed with no sign it had been differentiated out of an altitude. Same rule as the
    // apogee floor two lines up, same shared source as the screen.
    rows.push(['Max velocity', `${fmtSpeed(m.maxVelocity, sys)}${mach} — ${velocityProvenance(m)}`]);
  } else if (m.maxVelocityWithheld != null) {
    // A saved report that simply omits the row says the flight had no peak speed. It had
    // one; Debrief declined to report it, and the document has to carry that distinction
    // as the screen does.
    rows.push([
      'Max velocity',
      m.maxVelocityWithheld === 'gap'
        ? 'withheld — the ascent has a stretch the record doesn’t cover, so the top speed may fall inside it'
        : 'withheld — the speed this trace gives is not physically possible',
    ]);
  }
  if (Number.isFinite(m.maxAcceleration)) rows.push(['Max acceleration', fmtAccel(m.maxAcceleration, sys)]);
  // These four were on screen and in no saved report — so a flyer who read the
  // thrust-to-weight off the page and saved a Markdown write-up got a document without it.
  // A report that says less than the screen it came from is the export half-finished.
  if (m.avgBoostAcceleration != null)
    rows.push(['Avg acceleration', `${fmtAccel(m.avgBoostAcceleration, sys)} over the boost`]);
  if (m.liftoffTWR != null) rows.push(['Thrust-to-weight', `${m.liftoffTWR.toFixed(1)}:1 off the pad`]);
  if (m.maxDynamicPressure != null) {
    const at = m.maxDynamicPressureAltitude != null ? ` at ${fmtLength(m.maxDynamicPressureAltitude, sys)}` : '';
    rows.push(['Max Q', fmtPressure(m.maxDynamicPressure, sys) + at]);
  }
  if (m.transonicTime != null) {
    const at = m.transonicAltitude != null ? ` at ${fmtLength(m.transonicAltitude, sys)}` : '';
    rows.push(
      m.transonicUnconfirmed
        ? [
            'Transonic',
            m.derivedVelocityFrom === 'gps'
              ? `GPS-derived speed crosses Mach 1${at} — unconfirmed (differentiating a coarse GPS altitude runs the peak high)`
              : `barometric speed crosses Mach 1${at} — unconfirmed (a barometer can’t resolve speed from about Mach 0.9 up)`,
          ]
        : ['Supersonic', `crossed Mach 1${at}, ${fmtTime(m.transonicTime)} after liftoff`],
    );
  }
  // The same provenance the grid shows, from the same helper — all three readings are taken
  // at the one instant burnout was located at, so none of them is more direct than it.
  const boSub = burnoutSub(m);
  const boTail = boSub ? ` — ${boSub}` : '';
  if (m.burnTime != null) rows.push(['Burn time', fmtTime(m.burnTime) + boTail]);
  if (m.burnoutAltitude != null) rows.push(['Burnout altitude', fmtLength(m.burnoutAltitude, sys) + boTail]);
  if (m.burnoutVelocity != null) {
    const boVelSub = burnoutVelocitySub(m);
    rows.push(['Burnout velocity', fmtSpeed(m.burnoutVelocity, sys) + (boVelSub ? ` — ${boVelSub}` : '')]);
  }
  if (m.coastTime != null) rows.push(['Coast to apogee', fmtTime(m.coastTime)]);
  if (m.coastEfficiency != null) {
    const drag = m.dragLossAltitude != null ? ` (${fmtLength(m.dragLossAltitude, sys)} short of a drag-free coast)` : '';
    rows.push(['Coast efficiency', `${Math.round(m.coastEfficiency * 100)}%${drag}`]);
  }
  if (m.drogueDescentRate != null) rows.push(['Drogue descent', fmtSpeed(m.drogueDescentRate, sys)]);
  if (m.wholeDescentRate != null) {
    rows.push([
      'Descent rate',
      landedInRecord(m)
        ? `${fmtSpeed(m.wholeDescentRate, sys)} — averaged apogee to landing, no deployment change is in the record`
        : `${fmtSpeed(m.wholeDescentRate, sys)} — averaged over the recorded descent; the record stops before the ground, so this is not a landing speed`,
    ]);
  }
  if (m.mainDescentRate != null) {
    rows.push([
      'Main descent',
      landedInRecord(m)
        ? fmtSpeed(m.mainDescentRate, sys)
        : `${fmtSpeed(m.mainDescentRate, sys)} — averaged from the main deploy to the last sample; the record stops before the ground, so this is not a landing speed`,
    ]);
  }
  const copyNote = m.descentSource === 'second-copy' ? ' — from this file’s second copy of the flight' : '';
  if (m.descentTime != null) rows.push(['Descent time', fmtTime(m.descentTime) + copyNote]);
  const landing = landingEnergyRow(m, sys, recovery);
  if (landing) rows.push(landing);
  const deploy = mainDeployRow(sys, recovery);
  if (deploy) rows.push(deploy);
  const ejection = ejectionDelayRow(recovery);
  if (ejection) rows.push(ejection);
  if (m.flightTime != null) rows.push(['Flight time', fmtTime(m.flightTime) + copyNote]);
  if (m.tiltAtBurnout != null) rows.push(['Tilt at burnout', `${Math.round(m.tiltAtBurnout)}° off vertical`]);
  if (m.groundTemperature != null) rows.push(['Ground temp', fmtTemp(m.groundTemperature, sys)]);
  if (m.peakRollRate != null)
    rows.push(['Peak roll rate', `${Math.round(m.peakRollRate)} °/s (${(m.peakRollRate / 360).toFixed(1)} rev/s)`]);
  if (m.rollRevolutions != null)
    rows.push(['Revolutions', `${m.rollRevolutions.toFixed(m.rollRevolutions < 10 ? 1 : 0)} total roll`]);
  // A weak pack is a common cause of a charge that didn't fire, so the voltage belongs in
  // the document a flyer keeps, not only on the screen they looked at once.
  if (m.batteryMinV != null) {
    const rest = m.batteryStartV != null ? ` (${fmtVoltage(m.batteryStartV)} at rest)` : '';
    rows.push(['Battery low', `${fmtVoltage(m.batteryMinV)}${rest}`]);
  }
  // The flyer's own selection, applied at the one place every report format reads from.
  return visibleRows(rows, (r) => r[0], hidden);
}

/**
 * The flight's readings as a header + rows — the same rows the text, Markdown and HTML
 * reports carry, honouring the same choice of what's in the report, for anywhere that
 * needs the table itself rather than a document (the clipboard, today).
 */
export function reportTable(
  analysis: FlightAnalysis,
  sys: UnitChoice,
  meta?: ReportMeta,
  recovery?: RecoveryFigures,
): { header: string[]; rows: string[][] } {
  return {
    header: ['Reading', 'Value'],
    rows: headlineRows(analysis.metrics, sys, recovery, meta?.hidden).map(([l, v]) => [l, v]),
  };
}

function fmtReported(metric: ReportedValue['metric'], si: number, sys: UnitChoice): string {
  const q = REPORTED_QUANTITY[metric];
  return q === 'length' ? fmtLength(si, sys) : q === 'speed' ? fmtSpeed(si, sys) : fmtAccel(si, sys);
}

/** Rows for the "logger's own summary" cross-check: the device figure, Debrief's
 *  read, and how closely they agree. Empty when the file carried no summary. */
function crossCheckRows(
  flight: RawFlight,
  m: FlightAnalysis['metrics'],
  sys: UnitChoice,
  events?: FlightAnalysis['events'],
): [string, string, string, string][] {
  if (!flight.reported?.length) return [];
  return compareReported(flight.reported, m, events).map(({ reported: r, computed, hasComputed, deltaPct, status, gravityConvention }) => {
    const pct = deltaPct == null ? '' : deltaPct < 0.05 ? '≈0' : `${deltaPct.toFixed(deltaPct < 10 ? 1 : 0)}%`;
    const agreement =
      status == null
        ? 'not computed'
        : // The same reading under two conventions rather than a disagreement — the device
          // reports acceleration net of gravity, Debrief the specific force the accelerometer
          // measured. A document that printed the percentage alone would file the difference
          // as measurement spread, which is exactly what it isn't.
          gravityConvention
          ? 'agree — exactly 1 g apart (the device reports acceleration net of gravity; Debrief the force the airframe felt)'
          : status === 'agree'
            ? `agree (${pct})`
            : status === 'consistent'
              ? `consistent (${pct})`
              : `differ (${pct})`;
    return [r.label, fmtReported(r.metric, r.value, sys), hasComputed ? fmtReported(r.metric, computed, sys) : '—', agreement];
  });
}

/**
 * The GPS recording as a cross-check row, where the file carries one — the same shape as
 * the logger's own summary, because it is the same kind of thing: a second, independent
 * reading of one flight, stated beside Debrief's and never merged into it. A saved report
 * has to carry it, or the document a flyer files says less than the screen it came from.
 */
function gpsCrossRow(m: FlightAnalysis['metrics'], sys: UnitChoice): [string, string, string, string] | null {
  const gps = m.gpsApogeeAltitude;
  if (gps == null || !Number.isFinite(m.apogeeAltitude) || m.apogeeAltitude <= 0) return null;
  const verdict = peakAgreement(
    { value: gps, time: m.gpsApogeeTime },
    { value: m.apogeeAltitude, time: m.timeToApogee },
  );
  const deltaPct = ((gps - m.apogeeAltitude) / m.apogeeAltitude) * 100;
  const pct = Math.abs(deltaPct) < 0.05 ? '≈0%' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;
  const agreement =
    verdict === 'different-peak'
      ? `not the same peak — the two put it ${Math.abs((m.gpsApogeeTime ?? 0) - m.timeToApogee).toFixed(1)} s apart`
      : `${verdict === 'agree' ? 'agree' : 'differ'} (${pct})`;
  return ['Apogee', fmtLength(gps, sys), fmtLength(m.apogeeAltitude, sys), agreement];
}


/**
 * Which stretch of the file the reading is of, as a sentence — for the documents, where a
 * reader has no picker to look at and no chart to check against.
 *
 * Null for the ordinary whole-file reading, because "Debrief read the file" is not worth a
 * line. Present whenever it is NOT the whole file, which is exactly when a report that says
 * nothing reads as a report of the whole thing: a cert package built from flight 2 of a
 * launch day would otherwise carry that flight's numbers under the file's name with nothing
 * anywhere saying which flight it was.
 */
export function extentNote(analysis: FlightAnalysis): string | null {
  const e = analysis.extent;
  if (e.source === 'file') return null;
  const stretch = `${fmtTime(e.startTime)} to ${fmtTime(e.endTime)} of a ${fmtTime(e.fileEndTime)} file`;
  const which = analysis.segments?.find((seg) => seg.from === e.from && seg.to === e.to);
  const of = analysis.segments?.length;
  if (which && of) {
    return `Read ${stretch} — flight ${which.index} of the ${of} this file holds${e.source === 'chosen' ? ', chosen by the flyer' : ''}.`;
  }
  return e.source === 'chosen'
    ? `Read ${stretch} — a stretch chosen by the flyer, not Debrief's own segmentation.`
    : `Read ${stretch} — the flight Debrief segmented out of a record that holds more than one.`;
}

/** The provenance list a document prints under "How this file was read": what the parser
 *  wanted the reader to know, with the stretch that was read at the head of it. */
function howRead(flight: RawFlight, analysis: FlightAnalysis): string[] {
  const note = extentNote(analysis);
  return note ? [note, ...flight.notes] : flight.notes;
}

export function summaryText(
  flight: RawFlight,
  analysis: FlightAnalysis,
  sys: UnitChoice,
  analyzedAt?: number,
  meta?: ReportMeta,
  recovery?: RecoveryFigures,
): string {
  const label = clean(meta?.label);
  const notes = clean(meta?.notes);
  const lines: string[] = [];
  lines.push('Debrief — flight report');
  if (label) lines.push(label);
  lines.push(`${flight.source} · ${flight.formatLabel}`);
  if (meta?.recording) lines.push(recordingLine(meta.recording));
  // When it flew, where the file states it — the date a cert document or logbook wants,
  // and a different fact from when this report was produced.
  if (flight.flownAt) lines.push(`Flew ${formatFlownAt(flight.flownAt)}`);
  if (analyzedAt) lines.push(`Analyzed ${formatAnalyzedAt(analyzedAt)}`);
  if (notes) {
    lines.push('');
    lines.push(notes);
  }
  lines.push('');

  for (const [label, value] of headlineRows(analysis.metrics, sys, recovery, meta?.hidden)) lines.push(row(label, value));

  if (analysis.events.length) {
    lines.push('');
    lines.push('Events');
    for (const e of analysis.events) {
      const prov = e.provenance !== 'measured' ? `  (${e.provenance})` : '';
      const v = eventSpeed(analysis, e.index);
      const speed = Number.isFinite(v) ? `   ${fmtSpeed(v, sys)}` : '';
      // The snatch force a deployment charge put through the airframe — the recovery
      // hardware's load case, so it belongs in the report, not just the on-screen timeline.
      const shock = e.peakAccel != null && accelInG(e.peakAccel) >= 2 ? `   ${fmtAccel(e.peakAccel, sys)} shock` : '';
      lines.push(`  ${e.label.padEnd(12)} ${fmtTime(e.time).padStart(8)}   ${fmtLength(e.altitude, sys)}${speed}${shock}${prov}`);
    }
  }

  const xrows = crossCheckRows(flight, analysis.metrics, sys, analysis.events);
  if (xrows.length) {
    lines.push('');
    lines.push('Logger’s own summary (cross-check)');
    for (const [label, device, debrief, agreement] of xrows) {
      lines.push(`  ${label.padEnd(16)} logger ${device.padStart(10)}   Debrief ${debrief.padStart(10)}   ${agreement}`);
    }
  }

  const gpsRow = gpsCrossRow(analysis.metrics, sys);
  if (gpsRow) {
    lines.push('');
    lines.push('The GPS recording (cross-check)');
    lines.push(`  ${gpsRow[0].padEnd(16)} GPS ${gpsRow[1].padStart(13)}   barometer ${gpsRow[2].padStart(8)}   ${gpsRow[3]}`);
  }

  if (analysis.warnings.length) {
    lines.push('');
    lines.push('Worth knowing');
    for (const w of analysis.warnings) lines.push(`  - ${w}`);
  }

  // How the FILE was read, which is a different list from the caveats above and was in none of
  // the exports. These say which channel the altitude came from, that rows were dropped, that a
  // telemetry capture is lossy — the provenance the screen shows under this heading. A cert
  // package quoting a record that silently discarded 1,135 of its 15,938 rows should say so.
  const read = howRead(flight, analysis);
  if (read.length) {
    lines.push('');
    lines.push('How this file was read');
    for (const n of read) lines.push(`  - ${n}`);
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
  sys: UnitChoice,
  analyzedAt?: number,
  meta?: ReportMeta,
  recovery?: RecoveryFigures,
): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|'); // a stray pipe would split the table cell
  const label = clean(meta?.label);
  const notes = clean(meta?.notes);
  const out: string[] = [];
  out.push('# Debrief — flight report');
  out.push('');
  if (label) out.push(`## ${cell(label)}`, '');
  const flew = flight.flownAt ? ` · Flew ${cell(formatFlownAt(flight.flownAt))}` : '';
  const stamp = analyzedAt ? ` · Analyzed ${formatAnalyzedAt(analyzedAt)}` : '';
  out.push(`**${cell(flight.source)}** · ${cell(flight.formatLabel)}${flew}${stamp}`);
  if (meta?.recording) out.push('', `*${cell(recordingLine(meta.recording))}*`);
  out.push('');
  if (notes) {
    // A blockquote keeps the flyer's own words distinct from the read; each line
    // carries the marker so a multi-line note stays one quote.
    out.push(notes.split('\n').map((l) => `> ${l}`).join('\n'), '');
  }

  out.push('| Metric | Value |');
  out.push('| --- | --- |');
  for (const [label, value] of headlineRows(analysis.metrics, sys, recovery, meta?.hidden)) out.push(`| ${cell(label)} | ${cell(value)} |`);

  if (analysis.events.length) {
    out.push('', '## Events', '', '| Event | Time | Altitude | Speed | Shock |', '| --- | --- | --- | --- | --- |');
    for (const e of analysis.events) {
      const label = e.provenance !== 'measured' ? `${e.label} (${e.provenance})` : e.label;
      const v = eventSpeed(analysis, e.index);
      const speed = Number.isFinite(v) ? fmtSpeed(v, sys) : '—';
      // The deployment snatch force — the recovery hardware's load case — where measured.
      const shock = e.peakAccel != null && accelInG(e.peakAccel) >= 2 ? fmtAccel(e.peakAccel, sys) : '—';
      out.push(`| ${cell(label)} | ${fmtTime(e.time)} | ${cell(fmtLength(e.altitude, sys))} | ${cell(speed)} | ${cell(shock)} |`);
    }
  }

  const xrows = crossCheckRows(flight, analysis.metrics, sys, analysis.events);
  if (xrows.length) {
    out.push('', '## Logger’s own summary (cross-check)', '', '| Reading | Logger | Debrief | Agreement |', '| --- | --- | --- | --- |');
    for (const [label, device, debrief, agreement] of xrows) {
      out.push(`| ${cell(label)} | ${cell(device)} | ${cell(debrief)} | ${cell(agreement)} |`);
    }
  }

  const gpsRow = gpsCrossRow(analysis.metrics, sys);
  if (gpsRow) {
    out.push('', '## The GPS recording (cross-check)', '', '| Reading | GPS | Barometer | Agreement |', '| --- | --- | --- | --- |');
    out.push(`| ${cell(gpsRow[0])} | ${cell(gpsRow[1])} | ${cell(gpsRow[2])} | ${cell(gpsRow[3])} |`);
  }

  if (analysis.warnings.length) {
    out.push('', '## Worth knowing', '');
    for (const w of analysis.warnings) out.push(`- ${w}`);
  }

  const read = howRead(flight, analysis);
  if (read.length) {
    out.push('', '## How this file was read', '');
    for (const n of read) out.push(`- ${n}`);
  }

  out.push('');
  out.push(
    '_Computed best-effort from the logger’s own data — a careful reading, not gospel; values marked “derived” were inferred, not measured. Made with [Debrief](https://debrief.fusionspace.co) — parsed locally, never uploaded._',
  );
  return out.join('\n');
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

// One inlined stylesheet for every HTML export — no external asset, script or font, so the
// file opens anywhere offline and stays a static document. Light theme, tuned to read and print.
const REPORT_STYLE = `<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 32px 20px 56px; }
  header { border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .src { color: #52525b; font-size: 13px; }
  .src ul { margin: 6px 0 0; padding-left: 18px; }
  blockquote { margin: 14px 0 0; padding: 8px 14px; border-left: 3px solid #d4d4d8; color: #3f3f46; background: #fafafa; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; color: #52525b; margin: 28px 0 10px; }
  p.lede { margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 6px 10px; border-top: 1px solid #e4e4e7; }
  .metrics th { width: 42%; font-weight: 600; color: #3f3f46; }
  .metrics td, td.num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  td.best { font-weight: 700; }
  thead th { border-top: none; border-bottom: 1px solid #d4d4d8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; color: #71717a; }
  figure { margin: 16px 0 0; }
  figcaption { font-size: 13px; font-weight: 600; color: #3f3f46; margin-bottom: 4px; }
  .chart { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 6px; overflow-x: auto; }
  .chart svg { max-width: 100%; height: auto; display: block; }
  ul.notes { margin: 0; padding-left: 18px; color: #3f3f46; }
  ul.notes li { margin: 3px 0; }
  footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #71717a; }
  footer a { color: #6366f1; }
  @media print { body { background: #fff; } .chart { border-color: #d4d4d8; } main { padding-top: 8px; } }
</style>`;

/** Wrap report body markup in a complete, self-contained HTML document with the shared
 *  stylesheet and Debrief's footer credit. */
function htmlDoc(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${REPORT_STYLE}
</head>
<body>
<main>
${inner}
  <footer>
    Computed best-effort from the logger’s own data — a careful reading, not gospel; values marked “derived” were inferred, not measured.
    Made with <a href="https://debrief.fusionspace.co">Debrief</a> — parsed locally in the browser, never uploaded.
  </footer>
</main>
</body>
</html>`;
}

/** Embed caller-rendered SVG figures as a Charts section (empty string when none). */
function figuresSection(figures?: { title: string; svg: string }[]): string {
  const figHtml = (figures ?? []).map((f) => `<figure><figcaption>${esc(f.title)}</figcaption><div class="chart">${f.svg}</div></figure>`).join('');
  return figHtml ? `<section><h2>Charts</h2>${figHtml}</section>` : '';
}

/** A self-contained HTML flight report — one file a flyer can save, email, print, or
 *  archive: the same headline numbers, events, logger cross-check and caveats as the
 *  Markdown summary, plus the charts inline as vector SVG, in a clean print-friendly
 *  layout. All styling is inlined and no asset is fetched, so it opens anywhere offline
 *  and never phones home — the report-grade "everything in one place" export. Figures
 *  (already rendered as SVG strings by the caller) are embedded as given. */
export function summaryHtml(
  flight: RawFlight,
  analysis: FlightAnalysis,
  sys: UnitChoice,
  analyzedAt?: number,
  meta?: ReportMeta,
  recovery?: RecoveryFigures,
  figures?: { title: string; svg: string }[],
): string {
  const label = clean(meta?.label);
  const notes = clean(meta?.notes);
  const flew = flight.flownAt ? ` · Flew ${esc(formatFlownAt(flight.flownAt))}` : '';
  const stamp = `${flew}${analyzedAt ? ` · Analyzed ${esc(formatAnalyzedAt(analyzedAt))}` : ''}`;
  const title = label ? `${label} — Debrief flight report` : `Debrief flight report — ${flight.source}`;

  const metricRows = headlineRows(analysis.metrics, sys, recovery, meta?.hidden)
    .map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`)
    .join('');

  const eventRows = analysis.events
    .map((e) => {
      const lbl = e.provenance !== 'measured' ? `${e.label} (${e.provenance})` : e.label;
      const v = eventSpeed(analysis, e.index);
      const speed = Number.isFinite(v) ? fmtSpeed(v, sys) : '—';
      const shock = e.peakAccel != null && accelInG(e.peakAccel) >= 2 ? fmtAccel(e.peakAccel, sys) : '—';
      return `<tr><td>${esc(lbl)}</td><td>${esc(fmtTime(e.time))}</td><td>${esc(fmtLength(e.altitude, sys))}</td><td>${esc(speed)}</td><td>${esc(shock)}</td></tr>`;
    })
    .join('');

  const xrows = crossCheckRows(flight, analysis.metrics, sys, analysis.events);
  const crossRows = xrows.map(([l, d, b, a]) => `<tr><td>${esc(l)}</td><td>${esc(d)}</td><td>${esc(b)}</td><td>${esc(a)}</td></tr>`).join('');
  const gpsRow = gpsCrossRow(analysis.metrics, sys);
  const gpsHtml = gpsRow
    ? `<section><h2>The GPS recording (cross-check)</h2><table><thead><tr><th>Reading</th><th>GPS</th><th>Barometer</th><th>Agreement</th></tr></thead><tbody><tr>${gpsRow.map((c) => `<td>${esc(c)}</td>`).join('')}</tr></tbody></table><p class="src">A second, independent altitude recording — a different sensor from the barometer. Stated beside Debrief's read, never merged into it.</p></section>`
    : '';

  const notesHtml = notes ? `<blockquote>${esc(notes).replace(/\n/g, '<br>')}</blockquote>` : '';
  const readList = howRead(flight, analysis);
  const readHtml = readList.length
    ? `<section><h2>How this file was read</h2><ul class="notes">${readList.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>`
    : '';
  const warnHtml = analysis.warnings.length
    ? `<section><h2>Worth knowing</h2><ul class="notes">${analysis.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>`
    : '';

  const inner = `  <header>
    <h1>${esc(label || 'Debrief — flight report')}</h1>
    <div class="src">${esc(flight.source)} · ${esc(flight.formatLabel)}${stamp}</div>
    ${meta?.recording ? `<div class="src">${esc(recordingLine(meta.recording))}</div>` : ''}
    ${notesHtml}
  </header>

  <section><h2>Headline</h2><table class="metrics"><tbody>${metricRows}</tbody></table></section>
  ${figuresSection(figures)}
  ${eventRows ? `<section><h2>Events</h2><table><thead><tr><th>Event</th><th>Time</th><th>Altitude</th><th>Speed</th><th>Shock</th></tr></thead><tbody>${eventRows}</tbody></table></section>` : ''}
  ${crossRows ? `<section><h2>Logger’s own summary (cross-check)</h2><table><thead><tr><th>Reading</th><th>Logger</th><th>Debrief</th><th>Agreement</th></tr></thead><tbody>${crossRows}</tbody></table></section>` : ''}
  ${gpsHtml}
  ${warnHtml}
  ${readHtml}`;
  return htmlDoc(title, inner);
}

/** The analyzed series as a tidy CSV in the chosen units — the cleaned data a
 *  spreadsheet user would otherwise have to derive by hand. */
export function analyzedDataCsv(flight: RawFlight, analysis: FlightAnalysis, sys: UnitChoice): string {
  const { time, altitude, velocity, acceleration, speedOfSoundProfile, airDensity } = analysis.series;
  const L = unitsOf(sys);
  const pUnit = pressureUnit(sys);
  const cell = (v: number) => (Number.isFinite(v) ? v : '');
  // Past Debrief's six derived curves, carry every channel the logger actually recorded
  // (battery, temperature, tilt, roll, GPS, raw pressure, per-axis acceleration …), in
  // its displayed unit, so one data export is the whole flight rather than the headline
  // curves alone — the "expose everything the logger recorded" promise, in a single file.
  const recorded = buildPlotChannels(flight, analysis.series).filter((c) => c.group === 'Recorded');
  const sig6 = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : '');
  // Recorded labels are logger-derived, so quote and defang them (a stray comma or a
  // spreadsheet-formula prefix would otherwise break or hijack the CSV).
  const quoted = (s: string) => `"${formulaGuard(s).replace(/"/g, '""')}"`;
  // The acceleration column is exported only when it was measured — a baro-derived
  // acceleration is differentiation noise (its peak is withheld and its trace isn't
  // charted), so shipping a column of it into a data export would just hand a cert doc
  // hundreds of g of garbage. The velocity column (a usable first derivative) stays.
  const hasAccel = analysis.series.accelerationSource === 'device';
  // Mach and dynamic pressure are derived from the velocity, so they go the same way it does.
  // Where the analysis judged the speed physically impossible it withholds both headlines, the
  // explorer stops offering the curves and the comparison overlay stops drawing them — but this
  // writer computed them per sample regardless, so the one artefact a flyer pastes into a
  // spreadsheet or a cert document was the one place the withheld figure reappeared. Ten of the
  // corpus's 46 flights are in that state and every one of them exported a Mach: 362.4 and
  // 1.79e8 kPa on the loudest, but also a perfectly believable 1.7, 1.6 and 1.3 — and a
  // believable wrong number is the dangerous one. The velocity column itself stays, exactly as
  // its trace stays on screen, so a mis-scaled column can still be seen and diagnosed.
  const velUsable = !analysis.series.velocityUnusable;
  const header = [
    'time (s)',
    `altitude (${L.length} AGL)`,
    `velocity (${L.speed})`,
    ...(hasAccel ? [`acceleration (${L.accel})`] : []),
    ...(velUsable ? ['mach', `dynamic pressure (${pUnit})`] : []),
    ...recorded.map((c) => quoted(c.unitLabel(sys) ? `${c.label} (${c.unitLabel(sys)})` : c.label)),
  ].join(',');
  const rows = [header];
  for (let i = 0; i < time.length; i++) {
    const v = velocity[i];
    const sos = speedOfSoundProfile[i];
    const mach = Number.isFinite(sos) && sos > 0 ? v / sos : NaN;
    const q = 0.5 * airDensity[i] * v * v;
    rows.push(
      [
        time[i].toFixed(3),
        cell(Number(lengthIn(altitude[i], sys).toFixed(1))),
        cell(Number(speedIn(velocity[i], sys).toFixed(1))),
        ...(hasAccel ? [cell(Number(accelIn(acceleration[i], sys).toFixed(2)))] : []),
        ...(velUsable ? [cell(Number(mach.toFixed(3))), cell(Number(pressureIn(q, sys).toFixed(2)))] : []),
        ...recorded.map((c) => sig6(c.toDisplay(c.values[i], sys))),
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
  /** The same figures unformatted, in flight order (NaN where the flight has none) —
   *  what the table sorts the flight columns by. */
  values: number[];
  /** Index of the flight to emphasize as best, or -1 for none. */
  best: number;
  /** The spread across the flights that recorded this figure: (max − min) as a percent
   *  of their mean — how closely several recordings of one flight agree, or how much the
   *  flights differ from each other. Null when fewer than two of them have the value. */
  spreadPct: number | null;
}

/** The side-by-side comparison table as labelled rows — the single source both the
 *  on-screen table and the Markdown/CSV exports render, so they can't drift. A row's
 *  `best` marks the single highest finite value (only for a metric where higher is
 *  better, ≥2 flights have one, and there's no tie); `spreadPct` gives the spread across
 *  the flights that recorded the figure. Velocity/acceleration that mix device and
 *  baro sources across flights are tagged "(baro)" rather than crowned across methods
 *  that aren't directly comparable. */
export function compareMetricRows(
  flights: CompareFlight[],
  sys: UnitChoice,
  hidden?: string[],
  order?: string[],
): CompareMetricRow[] {
  const velMixed = new Set(flights.map((f) => f.metrics.maxVelocitySource)).size > 1;
  const accMixed = new Set(flights.map((f) => f.metrics.accelerationSource)).size > 1;
  /** A reading differentiated out of the altitude rather than logged, tagged wherever it appears.
   *
   *  **This used to be gated on the set MIXING device and baro sources, and that suppressed the
   *  caveat in exactly the case that needs it most.** Two PerfectFlite altimeters in one airframe
   *  — the canonical comparison — are both baro, so `velMixed` was false and the comparison
   *  published `2,781 ft/s · Mach 2.52` bare while each flight's own metric grid, print card and
   *  .txt/.md/.html report said the same number with *"derived, which usually reads high at the
   *  peak"* attached. A caveat on one surface and a confident claim on another is worse than
   *  either alone, and the claim here is that a rocket went supersonic.
   *
   *  The old reasoning — "where every flight was located the same way, the tag on every cell
   *  would be noise" — is right about a COMPARISON (which is higher?) and wrong about a CLAIM
   *  (is this number soft?). The tag answers the second, so it does not depend on what the other
   *  flights did. What legitimately depends on mixing is the crown, handled by `rankBlocked`. */
  const baroTag = (source: 'device' | 'baro', finite: boolean) => (source === 'baro' && finite ? ' (baro)' : '');
  // Same idea for the burnout readings: a burn time or burnout altitude read off an
  // accelerometer crossing and one taken at the speed peak are two different instants, so
  // lining them up in a column without saying which is which reads as a like-for-like
  // comparison. Tagged only when the set actually mixes the two — where every flight was
  // located the same way, the tag on every cell would be noise.
  const boMixed = new Set(flights.map((f) => f.metrics.burnoutSource).filter((s) => s != null)).size > 1;
  const boTag = (m: FlightMetrics) => (boMixed && m.burnoutSource === 'derived' ? ' (speed peak)' : '');
  // A saturated peak is a floor, so a clipped cell is tagged and — since the true
  // maximum is unknown — the row's "highest" crown is withheld: which flight actually
  // pulled the most g can't be settled when one reading railed at its limit.
  const anyClipped = flights.some((f) => f.metrics.accelClipped && Number.isFinite(f.metrics.maxAcceleration));
  // The same argument as `anyClipped`, one row up. A floor apogee is a LOWER BOUND — the log
  // ends at its own peak and the rocket was still climbing — so which flight actually went
  // highest cannot be settled from these numbers, and crowning one says it can.
  const anyFloor = flights.some((f) => f.metrics.apogeeIsFloor && Number.isFinite(f.metrics.apogeeAltitude));
  const clipTag = (m: FlightMetrics) => (m.accelClipped && Number.isFinite(m.maxAcceleration) ? ' (clipped)' : '');
  /** A peak speed Debrief DECLINED to report, said as such rather than as an em dash.
   *
   *  `fmtSpeed(NaN)` is `—`, which is also what a flight carrying no speed channel prints, so the
   *  comparison could not tell a refusal from an absence. `lib/report.ts` already ruled on this
   *  for the single-flight report — *"a saved report that simply omits the row says the flight had
   *  no peak speed. It had one; Debrief declined to report it"* — and the comparison is the
   *  surface that still conflated them. `compareJson` carries `maxVelocityWithheld`, so the same
   *  comparison exported the distinction as JSON and dropped it everywhere else.
   *
   *  The reason strings are `withheldReason` in `lib/readings.ts`, imported rather than restated,
   *  so the grid and the comparison cannot drift into two accounts of one refusal. */
  const withheldSpeed = (m: FlightMetrics) =>
    !Number.isFinite(m.maxVelocity) && m.maxVelocityWithheld != null ? `withheld — ${withheldReason(m.maxVelocityWithheld)}` : null;
  // Mach and max-Q are withheld together with the speed they ride on (`lib/analyze`), so the
  // Mach cell has the same two meanings to tell apart and takes the same treatment.
  const withheldMach = (m: FlightMetrics) =>
    m.mach == null && m.maxVelocityWithheld != null ? `withheld — ${withheldReason(m.maxVelocityWithheld)}` : null;
  // A descent rate off a record that stops in the air is a short leg, not a landing — the
  // grid and the saved report say so on the flight's own page, and this table is the one
  // surface that still printed the figure bare. Tagged per cell rather than per row, because
  // the whole point is which of the flights in the column set it applies to: both corpus
  // groups that cross-check a main leg pair a recording that landed with one that didn't.
  const aloftTag = (m: FlightMetrics) => (landedInRecord(m) ? '' : ' (stops in the air)');

  // Every row has a numeric value (for the pairwise spread); `rank` marks the rows
  // where a single highest value is a meaningful "best" to emphasize. `rankBlocked`
  // withholds that crown even on a rankable row when the comparison can't settle it.
  const specs: { label: string; get: (m: FlightMetrics) => string; value: (m: FlightMetrics) => number; rank?: boolean; rankBlocked?: boolean }[] = [
    {
      label: 'Apogee',
      get: (m) => fmtLength(m.apogeeAltitude, sys) + (m.apogeeIsFloor ? ' (at least)' : ''),
      value: (m) => m.apogeeAltitude,
      rank: true,
      rankBlocked: anyFloor,
    },
    { label: 'Time to apogee', get: (m) => fmtTime(m.timeToApogee), value: (m) => m.timeToApogee },
    {
      label: 'Max velocity',
      get: (m) => withheldSpeed(m) ?? fmtSpeed(m.maxVelocity, sys) + baroTag(m.maxVelocitySource, Number.isFinite(m.maxVelocity)),
      value: (m) => m.maxVelocity,
      rank: true,
      // Crowning a baro-derived peak over a device-logged one ranks two definitions, not two
      // flights — the same argument `anyClipped` makes one row down. A derived peak reads high,
      // so "highest" would go to whichever flight happened to be measured the softer way.
      rankBlocked: velMixed,
    },
    {
      label: 'Max Mach',
      // Mach rides on the peak speed, so it inherits the peak's provenance — and it carried NO
      // tag at all, in the mixed case too. This is the "went supersonic" number.
      get: (m) => withheldMach(m) ?? fmtMach(m.mach) + baroTag(m.maxVelocitySource, m.mach != null),
      value: (m) => m.mach ?? NaN,
      rank: true,
      rankBlocked: velMixed,
    },
    {
      label: 'Max acceleration',
      get: (m) => fmtAccel(m.maxAcceleration, sys) + baroTag(m.accelerationSource, Number.isFinite(m.maxAcceleration)) + clipTag(m),
      value: (m) => m.maxAcceleration,
      rank: true,
      rankBlocked: anyClipped,
    },
    { label: 'Max Q', get: (m) => fmtPressure(m.maxDynamicPressure, sys), value: (m) => m.maxDynamicPressure ?? NaN, rank: true },
    { label: 'Burn time', get: (m) => (m.burnTime != null ? fmtTime(m.burnTime) + boTag(m) : '—'), value: (m) => m.burnTime ?? NaN },
    { label: 'Burnout altitude', get: (m) => (m.burnoutAltitude != null ? fmtLength(m.burnoutAltitude, sys) + boTag(m) : '—'), value: (m) => m.burnoutAltitude ?? NaN },
    { label: 'Drogue descent', get: (m) => (m.drogueDescentRate != null ? fmtSpeed(m.drogueDescentRate, sys) : '—'), value: (m) => m.drogueDescentRate ?? NaN },
    { label: 'Main descent', get: (m) => (m.mainDescentRate != null ? fmtSpeed(m.mainDescentRate, sys) + aloftTag(m) : '—'), value: (m) => m.mainDescentRate ?? NaN },
    { label: 'Descent rate (whole)', get: (m) => (m.wholeDescentRate != null ? fmtSpeed(m.wholeDescentRate, sys) + aloftTag(m) : '—'), value: (m) => m.wholeDescentRate ?? NaN },
    { label: 'Flight time', get: (m) => (m.flightTime != null ? fmtTime(m.flightTime) : '—'), value: (m) => m.flightTime ?? NaN },
  ];
  // When the main fired, measured from each flight's own liftoff. This is the row the
  // redundant-altimeter case is actually for: two bays on one airframe agree on apogee and
  // still fire seconds apart, and until now the comparison could show the agreement but not
  // the disagreement — the deploy time existed only on each flight's separate timeline,
  // where lining two of them up meant doing the arithmetic by hand. Only when some flight
  // has one, so a fleet of baro-only logs doesn't grow a column of dashes.
  if (flights.some((f) => f.metrics.mainDeployTime != null)) {
    // Beside the main descent rate rather than appended after the totals: the rows read
    // roughly in flight order, and "when the main fired" belongs with "how fast it came
    // down under it", not after flight time.
    const at = specs.findIndex((s) => s.label === 'Main descent');
    specs.splice(at >= 0 ? at : specs.length, 0, {
      label: 'Main deploy at',
      get: (m) => (m.mainDeployTime != null ? fmtTime(m.mainDeployTime) : '—'),
      value: (m) => m.mainDeployTime ?? NaN,
    });
  }
  // Tilt at burnout only when at least one flight carried an attitude solution —
  // otherwise the row would be all "—" for the (common) loggers without one.
  if (flights.some((f) => f.metrics.tiltAtBurnout != null)) {
    specs.push({
      label: 'Tilt at burnout',
      get: (m) => (m.tiltAtBurnout != null ? `${Math.round(m.tiltAtBurnout)}°` : '—'),
      value: (m) => m.tiltAtBurnout ?? NaN,
    });
  }

  const built = specs.map((s) => {
    let best = -1;
    if (s.rank && !s.rankBlocked) {
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

    // The spread across every flight that recorded this figure: (max − min) as a percent
    // of their mean. For a pair that is |a − b| / mean, exactly as before; for three or
    // more it is the full range, which is what a flyer flying triple redundancy needs —
    // two altimeters agreeing means nothing if the third is 8% off. Flights missing the
    // figure sit it out rather than dragging the range.
    let spreadPct: number | null = null;
    const finite = flights.map((f) => s.value(f.metrics)).filter((v) => Number.isFinite(v));
    if (finite.length >= 2) {
      const lo = Math.min(...finite);
      const hi = Math.max(...finite);
      const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
      if (mean > 0) spreadPct = ((hi - lo) / mean) * 100;
    }

    return {
      label: s.label,
      cells: flights.map((f) => s.get(f.metrics)),
      values: flights.map((f) => s.value(f.metrics)),
      best,
      spreadPct,
    };
  });
  // The flyer's own choice and order of readings, applied at the one place every
  // comparison surface and export reads from — the same profile as the single flight's.
  return orderRows(visibleRows(built, (r) => r.label, hidden), (r) => r.label, order);
}

/** Whether any compared flight tags a metric "(baro)", so the footnote explaining the tag is
 *  warranted.
 *
 *  **This asked whether the flights MIXED sources, which left the tag unexplained in every
 *  all-baro comparison** — and after the tag stopped being gated on mixing, that would have been
 *  a `(baro)` on every cell with nothing on the page saying what it meant. It now asks the
 *  question the footnote actually answers: is this tag anywhere on this table? */
export function compareHasBaroMix(flights: CompareFlight[]): boolean {
  return flights.some((f) => f.metrics.maxVelocitySource === 'baro' || f.metrics.accelerationSource === 'baro');
}

/** Whether any compared flight tags its max acceleration "(clipped)" — a saturated
 *  reading, so a footnote is warranted and the "highest" crown was withheld. */
export function compareHasClippedAccel(flights: CompareFlight[]): boolean {
  return flights.some((f) => f.metrics.accelClipped && Number.isFinite(f.metrics.maxAcceleration));
}

/** Whether any compared flight tags a descent rate "(stops in the air)". Every other per-cell
 *  tag in this table earns a legend line on screen, in the Markdown footer and in the HTML
 *  notes; without one, the tag is a bare parenthetical on the one figure a flyer sizes a
 *  parachute against, while the flight's own page spells out what it means. */
export function compareHasPartialDescent(flights: CompareFlight[]): boolean {
  return flights.some(
    (f) => !landedInRecord(f.metrics) && (f.metrics.mainDescentRate ?? f.metrics.wholeDescentRate) != null,
  );
}

/** A report-grade Markdown comparison — the cross-check narrative (how closely the
 *  recordings agree) and the side-by-side metrics table — to document a redundant-
 *  altimeter check or a stage-by-stage assembly in a cert package or a forum post.
 *  Same numbers as the compare view, in the chosen units. */
export function compareMarkdown(comparison: Comparison, sys: UnitChoice, note?: string, meta?: ReportMeta): string {
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
  out.push(
    ...flights.map(
      (f) =>
        `- **${cell(nameStem(f.name))}** · ${cell(f.formatLabel)}` +
        (f.flownAt ? ` · flew ${cell(formatFlownAt(f.flownAt))}` : ''),
    ),
  );
  if (userNotes) out.push('', userNotes.split('\n').map((l) => `> ${l}`).join('\n'));
  if (note) out.push('', `> ${cell(note)}`);

  const agree = crossCheck(flights);
  if (agree.length) {
    const phrase = agree
      .map((a) => `${a.spreadPct.toFixed(a.spreadPct < 1 ? 1 : 0)}% on ${a.label}${a.mixedSource ? '\\*' : ''}${a.saturated ? '†' : ''}${a.partialLeg ? '‡' : ''}`)
      .reduce((acc, s, i, arr) => (i === 0 ? s : `${acc}${i === arr.length - 1 ? ' and ' : ', '}${s}`), '');
    const mixed = agree.some((a) => a.mixedSource)
      ? ` \\*${derivedPeakCaveat()}`
      : '';
    const sat = agree.some((a) => a.saturated)
      ? ' †One recording’s accelerometer saturated at its full-scale limit, so its peak is a floor, not the truth — the real spread may be smaller than shown.'
      : '';
    const partial = agree.some((a) => a.partialLeg)
      ? ' ‡At least one recording’s descent leg stops before the ground, so it is averaged over a shorter span than a leg that reached it — part of that spread is the spans, not the flight. It reads HIGH, by 13% and 21% on the two corpus groups that pair a truncated leg with a landed one, because a leg cut short over-weights the fast moments just after deployment.'
      : '';
    // Where the files themselves date the flights days apart, the same numbers are a
    // flight-to-flight difference, not a failed reconciliation — so the write-up says so,
    // naming which file states which day and what the reading rests on.
    const otherDays = statedDaySplit(flights);
    out.push('', otherDays ? '## Flight to flight' : '## Cross-check', '');
    out.push(
      otherDays
        ? `The files date these on different days — ${statedDaysPhrase(otherDays, nameStem)}${undatedNote(otherDays, flights.length)} — so what follows is how far apart they are, not how closely two recordings of one flight agree. They differ by ${phrase}. A season’s spread is what changed between them — airframe, motor, conditions — not a disagreement to resolve. ${DIFFERENT_DAYS_CAVEAT}${mixed}${sat}${partial}`
        : `If these are recordings of the same flight, the independent readings ${crossCheckLede(agree)} ${phrase}. Close agreement builds confidence; a wide gap is a flag worth chasing — not a verdict, just the spread.${mixed}${sat}${partial}`,
    );
  }

  const rows = compareMetricRows(flights, sys, meta?.hidden, meta?.order);
  // The comparison carries a Spread column: how far apart the recordings are on
  // each metric — the redundant-altimeter agreement, or the flight-to-flight change.
  const spread = flights.length >= 2;
  out.push('', '## Metrics', '');
  out.push(`| Metric | ${flights.map((f) => cell(nameStem(f.name))).join(' | ')} |${spread ? ' Spread |' : ''}`);
  out.push(`| --- | ${flights.map(() => '---').join(' | ')} |${spread ? ' --- |' : ''}`);
  for (const r of rows) {
    const cells = r.cells.map((c, i) => (i === r.best ? `**${cell(c)}**` : cell(c)));
    const diff = spread ? ` ${r.spreadPct != null ? `${r.spreadPct.toFixed(r.spreadPct < 1 ? 1 : 0)}%` : '—'} |` : '';
    out.push(`| ${cell(r.label)} | ${cells.join(' | ')} |${diff}`);
  }

  if (compareHasBaroMix(flights)) {
    out.push('', '_(baro) — differentiated out of the altitude rather than logged by the device, so its peak reads high, not soft._');
  }
  if (compareHasClippedAccel(flights)) {
    out.push(
      '',
      '_(clipped) — the accelerometer saturated at its full-scale limit, so its peak is a floor, not the true maximum; the highest-acceleration mark is withheld because which flight pulled the most g can’t be settled._',
    );
  }
  if (compareHasPartialDescent(flights)) {
    out.push(
      '',
      '_(stops in the air) — that recording’s file ends while the rocket is still under canopy, so the rate is averaged over the descent that WAS recorded and is not a landing speed._',
    );
  }

  out.push('');
  out.push(
    '_Recordings aligned at liftoff and resampled onto a shared time base. A cross-check of the recordings, never a verdict. Made with [Debrief](https://debrief.fusionspace.co) — parsed locally, never uploaded._',
  );
  return out.join('\n');
}

/** A self-contained HTML comparison report — the cross-check narrative, the side-by-side
 *  metrics matrix, and the overlay charts inline as vector SVG, in one portable file for a
 *  cert package documenting a redundant-altimeter check or a stage assembly. The HTML
 *  sibling of {@link compareMarkdown}; figures are supplied by the caller. */
export function compareHtml(
  comparison: Comparison,
  sys: UnitChoice,
  note?: string,
  meta?: ReportMeta,
  figures?: { title: string; svg: string }[],
): string {
  const label = clean(meta?.label);
  const userNotes = clean(meta?.notes);
  const { flights } = comparison;
  const title = label ? `${label} — Debrief comparison` : `Debrief flight comparison — ${flights.length} recordings`;

  const flightList = `<ul>${flights.map((f) => `<li><strong>${esc(nameStem(f.name))}</strong> · ${esc(f.formatLabel)}</li>`).join('')}</ul>`;
  const noteBlocks = [userNotes, note ? clean(note) : null]
    .filter((n): n is string => !!n)
    .map((n) => `<blockquote>${esc(n).replace(/\n/g, '<br>')}</blockquote>`)
    .join('');

  const agree = crossCheck(flights);
  let crossHtml = '';
  if (agree.length) {
    const phrase = agree
      .map((a) => `${a.spreadPct.toFixed(a.spreadPct < 1 ? 1 : 0)}% on ${esc(a.label)}${a.mixedSource ? '*' : ''}${a.saturated ? '†' : ''}${a.partialLeg ? '‡' : ''}`)
      .reduce((acc, s, i, arr) => (i === 0 ? s : `${acc}${i === arr.length - 1 ? ' and ' : ', '}${s}`), '');
    const foot = [
      agree.some((a) => a.mixedSource)
        ? `*${derivedPeakCaveat()}`
        : '',
      agree.some((a) => a.saturated)
        ? '†One recording’s accelerometer saturated at its full-scale limit, so its peak is a floor, not the truth — the real spread may be smaller than shown.'
        : '',
      agree.some((a) => a.partialLeg) ? '‡At least one recording’s descent leg stops before the ground, so it is averaged over a shorter span than a leg that reached it — part of that spread is the spans, not the flight. It reads HIGH, by 13% and 21% on the two corpus groups that pair a truncated leg with a landed one, because a leg cut short over-weights the fast moments just after deployment.' : '',
    ]
      .filter(Boolean)
      .map((s) => `<p class="src">${esc(s)}</p>`)
      .join('');
    const otherDays = statedDaySplit(flights);
    // `phrase` is already escaped label by label, so the lede is assembled from escaped
    // parts rather than escaped again — which would double-encode it.
    const lede = otherDays
      ? `The files date these on different days — ${esc(statedDaysPhrase(otherDays, nameStem))}${esc(undatedNote(otherDays, flights.length))} — so what follows is how far apart they are, not how closely two recordings of one flight agree. They differ by ${phrase}. A season’s spread is what changed between them — airframe, motor, conditions — not a disagreement to resolve. ${esc(DIFFERENT_DAYS_CAVEAT)}`
      : `If these are recordings of the same flight, the independent readings ${crossCheckLede(agree)} ${phrase}. Close agreement builds confidence; a wide gap is a flag worth chasing — not a verdict, just the spread.`;
    crossHtml = `<section><h2>${otherDays ? 'Flight to flight' : 'Cross-check'}</h2><p class="lede">${lede}</p>${foot}</section>`;
  }

  const rows = compareMetricRows(flights, sys, meta?.hidden, meta?.order);
  const spread = flights.length >= 2;
  const head = `<tr><th>Metric</th>${flights.map((f) => `<th>${esc(nameStem(f.name))}</th>`).join('')}${spread ? '<th>Spread</th>' : ''}</tr>`;
  const body = rows
    .map((r) => {
      const cells = r.cells.map((c, i) => `<td class="num${i === r.best ? ' best' : ''}">${esc(c)}</td>`).join('');
      const diff = spread ? `<td class="num">${r.spreadPct != null ? `${r.spreadPct.toFixed(r.spreadPct < 1 ? 1 : 0)}%` : '—'}</td>` : '';
      return `<tr><td>${esc(r.label)}</td>${cells}${diff}</tr>`;
    })
    .join('');
  const metricsHtml = `<section><h2>Metrics</h2><table><thead>${head}</thead><tbody>${body}</tbody></table></section>`;

  const foots = [
    compareHasBaroMix(flights) ? '(baro) — differentiated out of the altitude rather than logged by the device, so its peak reads high, not soft.' : '',
    compareHasClippedAccel(flights)
      ? '(clipped) — the accelerometer saturated at its full-scale limit, so its peak is a floor; the highest-acceleration mark is withheld.'
      : '',
    compareHasPartialDescent(flights)
      ? '(stops in the air) — that recording’s file ends while the rocket is still under canopy, so the rate is averaged over the descent that WAS recorded and is not a landing speed.'
      : '',
  ]
    .filter(Boolean)
    .map((s) => `<li>${esc(s)}</li>`)
    .join('');
  const footsHtml = foots ? `<section><h2>Notes</h2><ul class="notes">${foots}</ul></section>` : '';

  const inner = `  <header>
    <h1>${esc(label || 'Debrief — flight comparison')}</h1>
    <div class="src">Comparing ${flights.length} recording${flights.length === 1 ? '' : 's'}, aligned at liftoff (t = 0).${flightList}</div>
    ${noteBlocks}
  </header>

  ${crossHtml}
  ${figuresSection(figures)}
  ${metricsHtml}
  ${footsHtml}`;
  return htmlDoc(title, inner);
}

/** Unit-conversion helpers for the JSON exports, bound to a system, so every
 *  structured export rounds and converts identically. */
function jsonConv(sys: UnitChoice) {
  const round = (v: number, p: number): number | null => (Number.isFinite(v) ? Number(v.toFixed(p)) : null);
  // Acceleration follows the chosen unit, because `jsonUnits` declares that unit beside it.
  // It used to convert to g unconditionally — so a flyer who picked m/s² for a drag write-up
  // got `units.acceleration: "m/s²"` next to a figure in g: 15.62 where the number is 153.14,
  // a factor of 9.81 (32.17 in ft/s²) inside a file meant to be read by a script. Every
  // surface converts with `accelIn` now — the metric grid, the explorer, the comparison, the
  // two charts and the data CSV. Two decimals on g is a 0.098 m/s² step and the hundreds-scale
  // units take one, a 0.1 step, so the exported resolution is the same figure whichever was
  // picked rather than three digits of noise.
  const accPlaces = unitsOf(sys).accel === 'g' ? 2 : 1;
  return {
    round,
    len: (v: number | null) => (v == null ? null : round(lengthIn(v, sys), 1)),
    spd: (v: number | null) => (v == null ? null : round(speedIn(v, sys), 1)),
    acc: (v: number | null) => (v == null ? null : round(accelIn(v, sys), accPlaces)),
    sec: (v: number | null) => (v == null ? null : round(v, 2)),
    prs: (v: number | null) => (v == null ? null : round(pressureIn(v, sys), 2)),
  };
}

/** The units every JSON metric is expressed in, for the chosen system. */
function jsonUnits(sys: UnitChoice) {
  const L = unitsOf(sys);
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
function jsonMetrics(m: FlightAnalysis['metrics'], sys: UnitChoice): Record<string, number | string | boolean | null> {
  const { round, len, spd, acc, sec, prs } = jsonConv(sys);
  return {
    apogee: len(m.apogeeAltitude),
    // Rides with its value, the same way `accelerationClipped` does. Without it a floor
    // apogee — the log ended at its own peak, so the rocket was still going up — exported
    // as a flat fact, and a document built from this JSON could not tell the difference.
    apogeeIsFloor: m.apogeeIsFloor,
    timeToApogee: sec(m.timeToApogee),
    maxVelocity: spd(m.maxVelocity),
    /** Rides with its value, like `apogeeIsFloor` and `accelerationClipped`. Without it a
     *  withheld peak exports as `maxVelocity: null`, and `analyze/types.ts` says what that
     *  means on its own: "null — the log carries no speed and none could be derived, which is
     *  the only case where 'not in this log' is true." A refusal and an absence became the same
     *  JSON, and the type had already written down why that is actively wrong. */
    maxVelocityWithheld: m.maxVelocityWithheld,
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
    ...(m.transonicTime != null ? { transonicUnconfirmed: m.transonicUnconfirmed } : {}),
    // Which altitude a derived speed was differentiated from — additive, and null on a
    // device-measured speed, so a consumer reads a key it knows either way.
    derivedVelocityFrom: m.derivedVelocityFrom,
    burnTime: sec(m.burnTime),
    burnoutAltitude: len(m.burnoutAltitude),
    burnoutVelocity: spd(m.burnoutVelocity),
    // How burnout was located: 'measured' off a signed accelerometer crossing zero, or
    // 'derived' from the velocity peak because no crossing was found before it.
    burnoutSource: m.burnoutSource,
    // Whether `burnoutVelocity` and `maxVelocity` are the same sample, so a consumer doesn't
    // read one number under two keys as two independent measurements. True by construction on
    // a 'derived' burnout, and true on a 'measured' one whenever the axial crossing lands on
    // the peak — which is where it physically belongs.
    burnoutAtVelocityPeak: m.burnoutAtVelocityPeak,
    coastTime: sec(m.coastTime),
    coastEfficiency: m.coastEfficiency != null ? round(m.coastEfficiency, 3) : null,
    dragLossAltitude: len(m.dragLossAltitude),
    drogueDescentRate: spd(m.drogueDescentRate),
    mainDescentRate: spd(m.mainDescentRate),
    wholeDescentRate: spd(m.wholeDescentRate),
    descentTime: sec(m.descentTime),
    flightTime: sec(m.flightTime),
    descentSource: m.descentSource,
    groundTemperature: m.groundTemperature != null ? round(tempIn(m.groundTemperature, sys), 1) : null,
    batteryStartV: m.batteryStartV != null ? round(m.batteryStartV, 2) : null,
    batteryMinV: m.batteryMinV != null ? round(m.batteryMinV, 2) : null,
    peakRollRate: m.peakRollRate != null ? round(m.peakRollRate, 0) : null,
    rollRevolutions: m.rollRevolutions != null ? round(m.rollRevolutions, 1) : null,
    tiltAtBurnoutDeg: m.tiltAtBurnout != null ? round(m.tiltAtBurnout, 1) : null,
    // The receiver's own apogee, where the file carries a GPS altitude — a second,
    // independent recording, never merged into the figures above. `gpsApogeeAgreement`
    // says how to read the pair: two recordings that put the peak seconds apart did not
    // see the same instant, and then their heights matching is a coincidence rather than
    // corroboration, which a consumer comparing only the numbers could not tell.
    gpsApogee: m.gpsApogeeAltitude != null ? len(m.gpsApogeeAltitude) : null,
    gpsApogeeTime: sec(m.gpsApogeeTime),
    gpsAscentFixes: m.gpsAscentFixes,
    gpsApogeeAgreement:
      m.gpsApogeeAltitude != null && Number.isFinite(m.apogeeAltitude) && m.apogeeAltitude > 0
        ? peakAgreement(
            { value: m.gpsApogeeAltitude, time: m.gpsApogeeTime },
            { value: m.apogeeAltitude, time: m.timeToApogee },
          )
        : null,
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
  sys: UnitChoice,
  analyzedAt?: number,
  meta?: ReportMeta,
  recovery?: RecoveryFigures,
): string {
  const { metrics: m, events, warnings, series } = analysis;
  const { round, len, spd, acc, sec } = jsonConv(sys);
  const u = jsonUnits(sys);
  const reportedNum = (metric: ReportedValue['metric'], si: number) => {
    const q = REPORTED_QUANTITY[metric];
    return q === 'length' ? len(si) : q === 'speed' ? spd(si) : acc(si);
  };
  const reportedUnit = (metric: ReportedValue['metric']) => {
    const q = REPORTED_QUANTITY[metric];
    return q === 'length' ? u.length : q === 'speed' ? u.speed : u.acceleration;
  };
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
    // The stamp exactly as the file states it, with whose clock it is — never
    // re-projected into another zone, and null when the file carries no date.
    flownAt: flight.flownAt ? { stamp: flight.flownAt.stamp, clock: flight.flownAt.zone } : null,
    units: jsonUnits(sys),
    altitudeSource: series.altitudeSource,
    metrics: jsonMetrics(m, sys),
    events: events.map((e) => ({
      type: e.type,
      label: e.label,
      time: sec(e.time),
      altitude: len(e.altitude),
      speed: spd(eventSpeed(analysis, e.index)),
      provenance: e.provenance,
      ...(e.peakAccel != null ? { peakAcceleration: acc(e.peakAccel) } : {}),
    })),
    warnings,
    // How the file was read, beside the caveats about the analysis — the same split the screen
    // and the written reports make. A consumer that wants to know whether rows were dropped, or
    // which channel the altitude is, could not tell from this document before.
    ...(howRead(flight, analysis).length ? { howThisFileWasRead: howRead(flight, analysis) } : {}),
    // …and which RECORDING of the flight this is, as data for the same reason: two Debrief
    // documents of one launch are not two launches, and a consumer should not have to read
    // English to tell.
    ...(meta?.recording
      ? { recording: { of: meta.recording.of, reportedBy: meta.recording.reportedBy, isReportedBy: meta.recording.isReportedBy } }
      : {}),
    // …and the same thing as data, because a consumer should not have to parse a sentence to
    // find out that this document is one flight out of a launch day.
    read: {
      from: sec(analysis.extent.startTime),
      to: sec(analysis.extent.endTime),
      fileEnds: sec(analysis.extent.fileEndTime),
      chosenBy: analysis.extent.source === 'chosen' ? 'flyer' : analysis.extent.source === 'segmented' ? 'debrief' : 'whole file',
      ...(analysis.segments
        ? {
            flightsInFile: analysis.segments.length,
            flight: analysis.segments.find((seg) => seg.from === analysis.extent.from && seg.to === analysis.extent.to)?.index ?? null,
          }
        : {}),
    },
    disclaimer:
      'Computed best-effort from the logger’s own data — a careful reading, not gospel; values marked “derived” were inferred, not measured. Parsed locally; nothing uploaded.',
  };

  // The logger's own reported summary and how Debrief's read compares — only when
  // the file carried one.
  if (flight.reported?.length) {
    doc.loggerSummary = compareReported(flight.reported, m, analysis.events).map(({ reported: r, computed, hasComputed, deltaPct, status, gravityConvention }) => ({
      label: r.label,
      metric: r.metric,
      logger: reportedNum(r.metric, r.value),
      debrief: hasComputed ? reportedNum(r.metric, computed) : null,
      // Which of the document's units this pair is in. The rows are a mix of lengths,
      // speeds and accelerations, so a consumer reading one row would otherwise have to
      // know from the metric name alone which entry of `units` applies to it.
      unit: reportedUnit(r.metric),
      agreementPct: deltaPct == null ? null : round(deltaPct, 1),
      agreement: status,
      // Additive: a consumer reading `agreementPct` alone would file a definitional 1 g
      // offset as measurement spread. Present and false where it doesn't apply, so a reader
      // checks a key it knows.
      gravityConvention: !!gravityConvention,
    }));
  }

  // Figures a flyer supplied on-screen: landing energy (½·m·v² off the measured descent
  // rate — the cert-card number) and the main-deploy verification (measured vs set). Only
  // the ones actually entered are included.
  if (recovery) {
    const rec: Record<string, unknown> = {};
    const joules = recovery.descendingMassKg != null ? landingEnergyJoules(recovery.descendingMassKg, landingRate(m)) : null;
    if (joules != null && recovery.descendingMassKg != null) {
      const massUnit = systemOf(sys) === 'metric' ? 'g' : 'oz';
      rec.descendingMass = { value: round(recovery.descendingMassKg / MASS_TO_KG[massUnit], massUnit === 'oz' ? 1 : 0), unit: massUnit };
      rec.landingEnergyJoules = round(joules, 1);
      rec.landingEnergyFtLbf = round(joulesToFtLbf(joules), 1);
    }
    if (recovery.mainDeploy) {
      const { setM, actualM } = recovery.mainDeploy;
      const chk = deployCheck(actualM, setM);
      rec.mainDeploy = { setAltitude: len(setM), actualAltitude: len(actualM), offset: len(chk.offsetM), verdict: chk.when };
    }
    if (recovery.ejectionDelay) {
      const { printedS, coastS } = recovery.ejectionDelay;
      const chk = delayCheck(printedS, coastS);
      rec.ejectionDelay = { flownSeconds: round(printedS, 1), idealSeconds: round(coastS, 1), offsetSeconds: round(chk.offsetS, 1), verdict: chk.when };
    }
    if (Object.keys(rec).length) doc.recovery = rec;
  }

  return JSON.stringify(doc, null, 2);
}

/** A comparison as structured JSON — each flight's metrics, the cross-check spreads,
 *  and the per-metric spread across the recordings — the machine-readable companion to the
 *  comparison Markdown, for a script reconciling redundant altimeters or tracking a
 *  rocket across launches. Same numbers as the compare view, in the chosen units. */
export function compareJson(comparison: Comparison, sys: UnitChoice, note?: string, meta?: ReportMeta): string {
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
    flights: flights.map((f) => ({
      name: f.name,
      format: f.formatLabel,
      // The stamp exactly as the file stated it, with whose clock it is; null where the
      // file carried no date. Never re-projected into another zone.
      flownAt: f.flownAt ? { stamp: f.flownAt.stamp, clock: f.flownAt.zone } : null,
      metrics: jsonMetrics(f.metrics, sys),
    })),
    // What the spread figures below MEAN — the same thing the screen and the written
    // reports say, in a form a consumer can branch on. A reader that took `crossCheck` for
    // an agreement between recordings of one flight would be wrong wherever the files
    // themselves date them apart, and the numbers alone can't tell it so.
    sameFlight: statedDaySplit(flights)
      ? {
          verdict: 'different-flights',
          refutedBy: 'stated-dates',
          statedDays: differentFlightDays(flights),
          // Which recording states which day, so a consumer can find the odd clock rather
          // than only learn that one exists — and the caveat the screen carries, verbatim,
          // because a machine reader has even less chance of thinking of it unprompted.
          statedBy: statedDaySplit(flights),
          caveat: DIFFERENT_DAYS_CAVEAT,
        }
      : { verdict: 'unknown' },
    crossCheck: crossCheck(flights).map((a) => ({
      metric: a.key,
      label: a.label,
      spreadPct: round(a.spreadPct, 1),
      flights: a.count,
      ...(a.mixedSource ? { mixedSource: true } : {}),
      ...(a.saturated ? { saturated: true } : {}),
      ...(a.partialLeg ? { partialLeg: true } : {}),
    })),
    disclaimer: differentFlightDays(flights)
      ? 'The files date these on different days, so the spread figures are how far apart the flights are, not how closely two recordings of one flight agree — a reading of the stated dates alone, which a device clock that was never set will get wrong. Aligned at liftoff and resampled onto a shared time base. Parsed locally; nothing uploaded.'
      : 'Recordings aligned at liftoff and resampled onto a shared time base. A cross-check of the recordings, never a verdict. Parsed locally; nothing uploaded.',
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
