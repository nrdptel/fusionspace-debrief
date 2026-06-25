// PerfectFlite — StratoLogger / StratoLoggerCF / Pnut. These export (and their
// native .pf2 files store) a short text preamble followed by headerless rows of
//   time, altitude, velocity, temperature, voltage
// at ~20 Hz, in seconds / feet / ft·s⁻¹ / °F / volts. Because there is no header
// line, the generic CSV mapper can't read them well, so this parser is what makes
// StratoLogger files work without hand-mapping. Some rows carry only the first
// three columns (temperature/voltage are logged less often); the builder reads a
// missing trailing cell as a gap.

import type { Parser, ParseInput } from './types';
import type { RawFlight } from '../flight/types';
import { splitLine } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';

const COLUMNS: ColumnMapping[] = [
  { index: 0, role: 'time', unit: 's' },
  { index: 1, role: 'altitude', unit: 'ft' },
  { index: 2, role: 'velocity', unit: 'ft/s' },
  { index: 3, role: 'temperature', unit: 'F' },
  { index: 4, role: 'voltage', unit: 'V' },
];
const HEADERS = ['Time', 'Altitude', 'Velocity', 'Temperature', 'Voltage'];

const MARKERS = ['perfectflite', 'stratologger', 'stratologgercf', 'pnut'];

function isDataLine(line: string): boolean {
  return /^\s*-?\d/.test(line) && line.includes(',');
}

export const perfectFliteParser: Parser = {
  id: 'perfectflite',
  label: 'PerfectFlite (StratoLogger)',

  detect(input: ParseInput): number {
    const name = input.name.toLowerCase();
    if (name.endsWith('.pf2')) return 0.95;
    const head = input.text.slice(0, 4000).toLowerCase();
    if (MARKERS.some((m) => head.includes(m))) return 0.9;
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const dataRows: string[][] = [];
    let maxCols = 0;
    for (const line of input.text.split(/\r?\n/)) {
      if (!isDataLine(line)) continue;
      const cells = splitLine(line, ',');
      maxCols = Math.max(maxCols, cells.length);
      dataRows.push(cells);
    }
    if (dataRows.length === 0) throw new Error('No PerfectFlite data rows were found in this file.');

    const mappings = COLUMNS.filter((c) => c.index < maxCols);
    return buildFlight({
      source: input.name,
      format: 'perfectflite',
      formatLabel: 'PerfectFlite (StratoLogger)',
      headers: HEADERS,
      dataRows,
      mappings,
      notes: ['Velocity is PerfectFlite’s own computed value; altitude is barometric.'],
    });
  },
};
