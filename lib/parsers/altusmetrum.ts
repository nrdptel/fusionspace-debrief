// Altus Metrum (TeleMetrum / TeleMega / EasyMega / EasyMini …). AltOS exports a
// CSV with a few '#'-prefixed preamble lines, then a single header line, then one
// row per sample. Columns are documented and stable; the distinctive pair
// accel_speed / baro_speed makes detection unambiguous.
//
// Header (core): version,serial,flight,call,time,clock,rssi,lqi,state,state_name,
//   acceleration,pressure,altitude,height,accel_speed,baro_speed,temperature,
//   battery_voltage,drogue_voltage,main_voltage[,accel_x,…][,GPS…]
// Units: time s (since boost), acceleration m/s², pressure mBar, altitude/height m
//   (MSL / AGL), speeds m/s, temperature °C, voltages V.

import type { Parser, ParseInput } from './types';
import type { RawFlight } from '../flight/types';
import { parseTable } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';

function stripHash(cell: string): string {
  return cell.replace(/^#\s*/, '').trim();
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const norm = rows[i].map((c) => stripHash(c).toLowerCase());
    if (norm.includes('time') && norm.includes('height') && norm.includes('accel_speed')) {
      return i;
    }
  }
  return -1;
}

export const altusMetrumParser: Parser = {
  id: 'altusmetrum',
  label: 'Altus Metrum (AltOS)',

  detect(input: ParseInput): number {
    // accel_speed + baro_speed as whole header tokens (not loose substrings).
    for (const line of input.text.split(/\r?\n/).slice(0, 60)) {
      const toks = line.toLowerCase().split(',').map((s) => s.replace(/^#\s*/, '').trim());
      if (toks.includes('accel_speed') && toks.includes('baro_speed')) return 0.97;
    }
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the AltOS header line.');

    const headers = rows[headerIdx].map(stripHash);
    const lower = headers.map((h) => h.toLowerCase());
    // Keep any row that still carries the leading columns (version…time). A
    // truncated final write (power-loss) keeps its tail samples; preamble lines
    // split to far fewer cells and fall away. buildFlight drops rows whose time
    // isn't numeric, so a short row just contributes NaN to missing channels.
    const minCols = Math.min(headers.length, 6);
    const dataRows = rows.slice(headerIdx + 1).filter((r) => r.length >= minCols && r[0] !== '');

    // Map by exact column name (first occurrence). `height` is already AGL, so we
    // use it as the altitude channel and leave the MSL `altitude` column aside.
    const col = (name: string) => lower.indexOf(name);
    const mappings: ColumnMapping[] = [];
    const add = (name: string, role: ColumnMapping['role'], unit: string | null) => {
      const i = col(name);
      if (i >= 0) mappings.push({ index: i, role, unit });
    };
    add('time', 'time', 's');
    add('height', 'altitude', 'm');
    add('pressure', 'pressure', 'mbar');
    add('acceleration', 'accelAxial', 'm/s²');
    add('accel_speed', 'velocity', 'm/s');
    add('temperature', 'temperature', 'c');
    add('battery_voltage', 'voltage', 'v');

    // Pull a little metadata from the preamble for display/provenance.
    const meta: Record<string, string | number> = {};
    for (let i = 0; i < headerIdx; i++) {
      const cell = rows[i][0] ?? '';
      const m = stripHash(cell).match(/^([a-z_ ]+)\s+(.+)$/i);
      if (m && ['serial', 'flight', 'product', 'version'].includes(m[1].trim().toLowerCase())) {
        meta[m[1].trim()] = m[2].trim();
      }
    }

    return buildFlight({
      source: input.name,
      format: 'altusmetrum',
      formatLabel: 'Altus Metrum (AltOS)',
      headers,
      dataRows,
      mappings,
      meta,
      notes: [
        'Altitude is the AltOS AGL "height" channel; velocity is the accelerometer-integrated speed.',
      ],
    });
  },
};
