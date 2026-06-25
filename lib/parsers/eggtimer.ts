// Eggtimer (Classic / Quantum / Apogee). The downloaded flight-detail CSV has a
// header row of T, Alt, VRaw, VFilt — time in milliseconds, altitude in feet,
// and raw / filtered velocity in ft·s⁻¹ — sampled ~10 Hz on the way up and slower
// after nose-over (a mixed rate the analysis handles). The VRaw/VFilt pair is a
// distinctive signature, so detection is reliable.
//
// One genuine ambiguity: the device can be configured for metric, and the header
// is identical either way. We assume the default (feet) and say so, rather than
// silently guess — switch the report units if the device logged metres.

import type { Parser, ParseInput } from './types';
import type { RawFlight } from '../flight/types';
import { parseTable } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const lower = rows[i].map((c) => c.trim().toLowerCase());
    if (lower.includes('vraw') && lower.includes('vfilt')) return i;
  }
  return -1;
}

export const eggtimerParser: Parser = {
  id: 'eggtimer',
  label: 'Eggtimer',

  detect(input: ParseInput): number {
    const head = input.text.slice(0, 4000).toLowerCase();
    return head.includes('vraw') && head.includes('vfilt') ? 0.95 : 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the Eggtimer header row.');

    const headers = rows[headerIdx].map((c) => c.trim());
    const lower = headers.map((h) => h.toLowerCase());
    const dataRows = rows.slice(headerIdx + 1).filter((r) => r[0] !== '');

    const col = (name: string) => lower.indexOf(name);
    const mappings: ColumnMapping[] = [];
    const add = (name: string, role: ColumnMapping['role'], unit: string | null) => {
      const i = col(name);
      if (i >= 0) mappings.push({ index: i, role, unit });
    };
    add('t', 'time', 'ms');
    add('alt', 'altitude', 'ft');
    // Prefer the filtered velocity (smoother; Eggtimer's own recommended trace).
    add('vfilt', 'velocity', 'ft/s');
    // Newer firmware may add these; map only if clearly present.
    add('voltage', 'voltage', 'V');
    add('volt', 'voltage', 'V');

    return buildFlight({
      source: input.name,
      format: 'eggtimer',
      formatLabel: 'Eggtimer',
      headers,
      dataRows,
      mappings,
      notes: [
        'Velocity is Eggtimer’s filtered (VFilt) value. Altitude and speed are read as feet — Eggtimer’s default. The CSV doesn’t record its units, so a metric-configured device can’t be told apart; if yours was set to metric, these figures read about 3.3× too high.',
      ],
    });
  },
};
