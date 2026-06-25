// Eggtimer (Classic / Quantum / Apogee). The downloaded flight-detail CSV has a
// header row; two real-world variants exist:
//   Classic:  T, Alt, VRaw, VFilt              — time in ms, ft, ft·s⁻¹
//   Quantum:  T, Alt, Veloc, Apogee, Drogue, Main, N-O, …  — time in s, ft, ft·s⁻¹
// (the Apogee/Drogue/Main/N-O columns mark events). We detect either, map by
// column name, and infer whether time is in milliseconds or seconds from the
// step size so both variants read correctly. Sampling is ~10 Hz climbing and
// slower after nose-over (a mixed rate the analysis handles).
//
// One genuine ambiguity: the device can be set to metric, and the header is
// identical either way. We read feet (the default) and say so.

import type { Parser, ParseInput } from './types';
import type { RawFlight } from '../flight/types';
import { parseTable } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';

function headerTokens(line: string): string[] {
  return line.toLowerCase().split(',').map((s) => s.trim());
}

/** Is this row an Eggtimer header (Classic VRaw/VFilt or Quantum Veloc+events)? */
function isEggtimerHeader(toks: string[]): boolean {
  if (!toks.includes('t') && !toks.includes('time')) return false;
  if (!toks.includes('alt')) return false;
  const classic = toks.includes('vraw') && toks.includes('vfilt');
  const events = ['apogee', 'drogue', 'main', 'n-o', 'nose-over'].filter((c) => toks.includes(c)).length;
  const quantum = toks.includes('veloc') && events >= 2;
  return classic || quantum;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (isEggtimerHeader(rows[i].map((c) => c.trim().toLowerCase()))) return i;
  }
  return -1;
}

/** Eggtimer time is ms (Classic) or s (Quantum); tell them apart by step size. */
function timeUnit(dataRows: string[][], tIdx: number): 'ms' | 's' {
  const vals: number[] = [];
  for (const r of dataRows) {
    const v = Number(r[tIdx]);
    if (Number.isFinite(v)) vals.push(v);
    if (vals.length >= 60) break;
  }
  const diffs: number[] = [];
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 's';
  diffs.sort((a, b) => a - b);
  // A ~10 Hz log steps by ~100 in ms or ~0.1 in s — well separated.
  return diffs[diffs.length >> 1] > 3 ? 'ms' : 's';
}

export const eggtimerParser: Parser = {
  id: 'eggtimer',
  label: 'Eggtimer',

  detect(input: ParseInput): number {
    for (const line of input.text.split(/\r?\n/).slice(0, 15)) {
      if (isEggtimerHeader(headerTokens(line))) return 0.95;
    }
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the Eggtimer header row.');

    const headers = rows[headerIdx].map((c) => c.trim());
    const lower = headers.map((h) => h.toLowerCase());
    const dataRows = rows.slice(headerIdx + 1).filter((r) => r[0] !== '' && r.length >= 3);

    const col = (...names: string[]) => {
      for (const n of names) {
        const i = lower.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };

    const tIdx = col('t', 'time');
    const unit = tIdx >= 0 ? timeUnit(dataRows, tIdx) : 's';

    const mappings: ColumnMapping[] = [];
    const add = (index: number, role: ColumnMapping['role'], u: string | null) => {
      if (index >= 0) mappings.push({ index, role, unit: u });
    };
    add(tIdx, 'time', unit);
    add(col('alt'), 'altitude', 'ft');
    // Prefer a filtered velocity (Classic VFilt / Quantum FVeloc), then raw.
    add(col('vfilt', 'fveloc', 'veloc', 'vraw'), 'velocity', 'ft/s');

    return buildFlight({
      source: input.name,
      format: 'eggtimer',
      formatLabel: 'Eggtimer',
      headers,
      dataRows,
      mappings,
      notes: [
        'Altitude and speed are read as feet — Eggtimer’s default. The CSV doesn’t record its units, so a metric-configured device can’t be told apart; if yours was set to metric, these figures read about 3.3× too high.',
      ],
    });
  },
};
