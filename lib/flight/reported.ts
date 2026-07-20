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

/** Within this fraction the device's figure and Debrief's read are called "agree". */
export const AGREE_FRACTION = 0.05;

export interface ReportedComparison {
  reported: ReportedValue;
  /** Debrief's own value for the same metric, in canonical SI (may be NaN). */
  computed: number;
  hasComputed: boolean;
  /** |computed − device| / |device|, as a percentage; null when not comparable. */
  deltaPct: number | null;
  agree: boolean;
}

/** Pair each device-reported figure with Debrief's own read of the same metric —
 *  the shared basis for the on-screen cross-check and the exported report. */
export function compareReported(reported: ReportedValue[], metrics: FlightMetrics): ReportedComparison[] {
  return reported.map((r) => {
    const computed = metrics[r.metric];
    const hasComputed = Number.isFinite(computed) && Number.isFinite(r.value) && r.value !== 0;
    const deltaPct = hasComputed ? Math.abs((computed - r.value) / r.value) * 100 : null;
    return { reported: r, computed, hasComputed, deltaPct, agree: deltaPct != null && deltaPct <= AGREE_FRACTION * 100 };
  });
}
