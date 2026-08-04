// Pull the logger's own headline figures out of a summary block a file carries
// ahead of its data — today the AltimeterCloud/Mercury export, whose metadata is a
// grid of "key,value" pairs (e.g. `Apogee meters,209.28`). These are the device's
// OWN computed numbers; Debrief keeps them as provenance-labelled data to show
// beside its independent read as a cross-check, never to replace it.
//
// Deliberately conservative: only a small set of exact, unambiguous keys is
// matched, and only when the paired cell is a finite number — so a stray metadata
// row is never mistaken for a reading. Unknown formats simply yield nothing.

import type { ReportedValue } from './types';
import type { FlightEvent, FlightMetrics } from '../analyze/types';
import { parseNumber } from '../csv';
import { G0 } from '../units';

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

interface KeyDef {
  metric: ReportedValue['metric'];
  label: string;
  /** Convert the file's stated value to canonical SI. */
  toSI: (v: number) => number;
}

// Keyed by the exact (normalised) label the file writes. The unit is fixed by the
// key itself — AltimeterCloud states it in the label ("Apogee meters", velocities
// in m/s, accelerations in milli-g).
const KEYS: Record<string, KeyDef> = {
  'apogee meters': { metric: 'apogeeAltitude', label: 'Apogee', toSI: (v) => v },
  'max velocity up': { metric: 'maxVelocity', label: 'Max velocity', toSI: (v) => v },
  'max acc ascent (mg)': { metric: 'maxAcceleration', label: 'Max acceleration', toSI: (v) => (v * G0) / 1000 },
  'burnout velocity (m/s)': { metric: 'burnoutVelocity', label: 'Burnout velocity', toSI: (v) => v },
  // The device writes descent velocity as a signed (downward-negative) rate; Debrief's
  // main descent rate is a downward speed, so compare magnitudes.
  'descent velocity (m/s)': { metric: 'mainDescentRate', label: 'Descent velocity', toSI: (v) => Math.abs(v) },
};

/** Read a device's self-reported headline figures from a file's pre-data metadata
 *  rows. Returns one entry per recognised key, in canonical SI, or [] if none. */
export function extractReportedSummary(metadataRows: string[][]): ReportedValue[] {
  const out: ReportedValue[] = [];
  const seen = new Set<string>();
  for (const row of metadataRows) {
    for (let i = 0; i < row.length - 1; i++) {
      const def = KEYS[norm(row[i] ?? '')];
      if (!def || seen.has(def.metric)) continue;
      const raw = parseNumber(row[i + 1] ?? '');
      if (!Number.isFinite(raw)) continue;
      seen.add(def.metric);
      out.push({ metric: def.metric, label: def.label, value: def.toSI(raw), source: 'device' });
    }
  }
  return out;
}

/** Which quantity each reported metric is. A `Record` over the union rather than a chain of
 *  comparisons, so adding a metric to `ReportedValue` fails to compile until it is classified
 *  here. It lives beside the type rather than in a renderer because the cross-check is
 *  rendered THREE times — the on-screen panel, the formatted report and the JSON export — and
 *  each used to decide this for itself. The JSON copy tested only `maxVelocity` and let
 *  everything else fall through to the acceleration converter, so a device's own burnout
 *  velocity and descent rate (both speeds, both carried by every AltimeterCloud file) were
 *  divided by g before being printed under `units.speed`. The on-screen panel had the same
 *  chain, and would have done the same to the drogue rate the moment one existed. */
export type ReportedQuantity = 'length' | 'speed' | 'accel' | 'time' | 'mach';

export const REPORTED_QUANTITY: Record<ReportedValue['metric'], ReportedQuantity> = {
  apogeeAltitude: 'length',
  maxVelocity: 'speed',
  burnoutVelocity: 'speed',
  mainDescentRate: 'speed',
  drogueDescentRate: 'speed',
  groundHitVelocity: 'speed',
  launchRodVelocity: 'speed',
  deploymentVelocity: 'speed',
  maxAcceleration: 'accel',
  apogeeShock: 'accel',
  mainShock: 'accel',
  timeToApogee: 'time',
  flightTime: 'time',
  optimumDelay: 'time',
  // Dimensionless: a Mach number is the same in every unit system, so a renderer must
  // NOT hand it to a converter. Its own quantity for exactly that reason.
  maxMach: 'mach',
};

/**
 * Render one reported figure by its quantity, with every quantity spelled out.
 *
 * The three surfaces that show the cross-check each used to write
 * `q === 'length' ? … : q === 'speed' ? … : accel`, which is a chain that FALLS THROUGH
 * to acceleration for anything it does not name. That is not hypothetical: the JSON copy
 * tested only `maxVelocity`, so a device's own burnout velocity and descent rate — both
 * speeds, both on every AltimeterCloud file — were divided by g and printed under a speed
 * unit. Adding `time` and `mach` to the union would have put a flight time through the
 * same funnel and printed seconds as g.
 *
 * So the chain is gone. A caller supplies one renderer per quantity and TypeScript checks
 * the set is complete, which means the next metric added to `ReportedValue` cannot reach a
 * surface without someone deciding how it reads there.
 */
export function renderReported<T>(metric: ReportedValue['metric'], by: Record<ReportedQuantity, () => T>): T {
  return by[REPORTED_QUANTITY[metric]]();
}

/** Within this fraction the device's figure and Debrief's read agree tightly — the
 *  right bar for a well-defined peak (apogee, or a velocity read at one instant). */
export const AGREE_FRACTION = 0.05;

/** A descent rate isn't an instant — it's a windowed average of an unsteady descent,
 *  and the definition of the window matters. This very device reports its own
 *  "descent velocity" and "landing velocity" ~25% apart, so two independent reads of
 *  "the descent rate" are expected to differ by more than a peak would. Within this
 *  wider band a windowed figure is called "consistent" rather than a discrepancy;
 *  only beyond it is it a genuine flag. Peaks fall back to the tight AGREE_FRACTION. */
const CONSISTENT_FRACTION = 0.2;
const WIDE_TOLERANCE: Partial<Record<ReportedValue['metric'], number>> = {
  mainDescentRate: CONSISTENT_FRACTION,
  drogueDescentRate: CONSISTENT_FRACTION,
  // A deployment shock is a millisecond-scale transient, and the two instruments are not
  // sampling the same instant of it: the board reads its own charge channel while Debrief
  // reads the airframe's accelerometer over a window around the event. Two honest reads of
  // one bang differ by more than two reads of an apogee do, so the wider band applies —
  // which is the same argument the descent rates already make.
  apogeeShock: CONSISTENT_FRACTION,
  mainShock: CONSISTENT_FRACTION,
};

/** How a device figure and Debrief's independent read line up: a tight `agree`, a
 *  `consistent` (within the wider band a windowed figure like a descent rate is
 *  expected to vary by), or a genuine `differ`. */
export type AgreementStatus = 'agree' | 'consistent' | 'differ';

export interface ReportedComparison {
  reported: ReportedValue;
  /** Debrief's own value for the same metric, in canonical SI (may be NaN). */
  computed: number;
  hasComputed: boolean;
  /** |computed − device| / |device|, as a percentage; null when not comparable. */
  deltaPct: number | null;
  /** True only for a tight (≤ AGREE_FRACTION) match — kept for the simple green split. */
  agree: boolean;
  /** Three-way read of the agreement; null when there's nothing to compare. */
  status: AgreementStatus | null;
  /** Set when the two figures are the same reading under two conventions: the device
   *  reports acceleration net of gravity, Debrief the specific force the accelerometer
   *  actually measured. See `gravityConvention`. */
  gravityConvention?: boolean;
}

/**
 * Is this "disagreement" just the two ways of saying acceleration?
 *
 * An accelerometer at rest on the pad reads 1 g: that is the specific force it measures, and
 * it is what Debrief reports, because it is the g the airframe feels and the number a
 * structures check wants. A device can instead report acceleration net of gravity — what the
 * rocket is being accelerated BY — which is exactly 1 g lower on the boost axis. Neither is
 * wrong, and the difference is not measurement spread.
 *
 * Every AltimeterCloud file in the corpus shows it, and shows it exactly: Debrief reads
 * 316.76, 314.07, 314.76 m/s² against the device's 306.95, 304.26, 304.96 — **+1.00 g on
 * every one**, to two decimals. That regularity is the evidence. Presented as a 3.2%
 * disagreement it teaches a flyer to discount the cross-check; named, it is a corroboration
 * stronger than the percentage suggests, because two independent reads landing exactly one
 * gravity apart is not what noise does.
 *
 * Deliberately NOT used to adjust either figure into agreement — both are reported as each
 * instrument states them, and the note explains the gap rather than closing it.
 */
function isGravityConvention(metric: ReportedValue['metric'], computed: number, device: number): boolean {
  if (metric !== 'maxAcceleration') return false;
  const gap = computed - device;
  // Within a twentieth of a g of exactly one g — tight enough that only the convention
  // produces it, and scale-free because it is an absolute offset, not a fraction.
  return Math.abs(gap - G0) <= G0 * 0.05;
}

/** Pair each device-reported figure with Debrief's own read of the same metric —
 *  the shared basis for the on-screen cross-check and the exported report. */
/** Debrief's own read of one reported metric.
 *
 *  Most name a field on `FlightMetrics` directly. The two deployment shocks do not: Debrief
 *  measures that quantity as `peakAccel` on the apogee and main EVENTS, so they are resolved
 *  from the event list. Without this a device that states its shocks would show a permanently
 *  blank Debrief column, which reads as "not measured" on the flights that did measure it. */
function computedFor(metric: ReportedValue['metric'], metrics: FlightMetrics, events?: FlightEvent[]): number {
  if (metric === 'apogeeShock' || metric === 'mainShock') {
    const type = metric === 'apogeeShock' ? 'apogee' : 'main';
    return events?.find((e) => e.type === type)?.peakAccel ?? NaN;
  }
  const field = METRIC_FIELD[metric];
  // Four figures a prediction states have no counterpart Debrief measures, and picking
  // the nearest field for them would be inventing an agreement. NaN reaches `hasComputed`
  // as "nothing to compare", which is what is true — see the note on those members in
  // `ReportedValue`.
  if (field === null) return NaN;
  return (metrics[field] as number | null | undefined) ?? NaN;
}

/** Which `FlightMetrics` field each reported metric is checked against, or null where
 *  Debrief measures nothing comparable. A total `Record` rather than a chain, so a metric
 *  added to `ReportedValue` fails to compile until someone answers this for it — the same
 *  discipline `REPORTED_QUANTITY` applies to units. The two shocks are absent from the
 *  lookup because `computedFor` resolves them from the event list before reaching it. */
const METRIC_FIELD: Record<Exclude<ReportedValue['metric'], 'apogeeShock' | 'mainShock'>, keyof FlightMetrics | null> = {
  apogeeAltitude: 'apogeeAltitude',
  maxVelocity: 'maxVelocity',
  maxAcceleration: 'maxAcceleration',
  burnoutVelocity: 'burnoutVelocity',
  mainDescentRate: 'mainDescentRate',
  drogueDescentRate: 'drogueDescentRate',
  timeToApogee: 'timeToApogee',
  flightTime: 'flightTime',
  // `FlightMetrics` calls the peak Mach simply `mach`.
  maxMach: 'mach',
  groundHitVelocity: null,
  launchRodVelocity: null,
  deploymentVelocity: null,
  optimumDelay: null,
};

export function compareReported(
  reported: ReportedValue[],
  metrics: FlightMetrics,
  events?: FlightEvent[],
): ReportedComparison[] {
  return reported.map((r) => {
    // Some analysis fields (burnout velocity, main descent) are null when the flight
    // didn't have them; treat that as "nothing to compare" (NaN), not a zero.
    const computed = computedFor(r.metric, metrics, events);
    const hasComputed = Number.isFinite(computed) && Number.isFinite(r.value) && r.value !== 0;
    const deltaPct = hasComputed ? Math.abs((computed - r.value) / r.value) * 100 : null;
    const agree = deltaPct != null && deltaPct <= AGREE_FRACTION * 100;
    const wide = (WIDE_TOLERANCE[r.metric] ?? AGREE_FRACTION) * 100;
    const status: AgreementStatus | null =
      deltaPct == null ? null : agree ? 'agree' : deltaPct <= wide ? 'consistent' : 'differ';
    const gravityConvention = hasComputed && isGravityConvention(r.metric, computed, r.value);
    return { reported: r, computed, hasComputed, deltaPct, agree, status, ...(gravityConvention ? { gravityConvention } : {}) };
  });
}
