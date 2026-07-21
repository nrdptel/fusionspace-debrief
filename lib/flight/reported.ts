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
import type { FlightMetrics } from '../analyze/types';
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
}

/** Pair each device-reported figure with Debrief's own read of the same metric —
 *  the shared basis for the on-screen cross-check and the exported report. */
export function compareReported(reported: ReportedValue[], metrics: FlightMetrics): ReportedComparison[] {
  return reported.map((r) => {
    // Some analysis fields (burnout velocity, main descent) are null when the flight
    // didn't have them; treat that as "nothing to compare" (NaN), not a zero.
    const computed = metrics[r.metric] ?? NaN;
    const hasComputed = Number.isFinite(computed) && Number.isFinite(r.value) && r.value !== 0;
    const deltaPct = hasComputed ? Math.abs((computed - r.value) / r.value) * 100 : null;
    const agree = deltaPct != null && deltaPct <= AGREE_FRACTION * 100;
    const wide = (WIDE_TOLERANCE[r.metric] ?? AGREE_FRACTION) * 100;
    const status: AgreementStatus | null =
      deltaPct == null ? null : agree ? 'agree' : deltaPct <= wide ? 'consistent' : 'differ';
    return { reported: r, computed, hasComputed, deltaPct, agree, status };
  });
}
