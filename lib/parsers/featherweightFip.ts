// Featherweight Raven, exported by the Featherweight Interface Program (FIP).
// Unlike a normal CSV, every channel carries its OWN time column, because the
// channels sample at different rates (axial accel ~400 Hz, baro/velocity ~20 Hz):
//
//   Time@Axial Accel (Gs),Axial Accel (Gs),bILBA,Time@Baro (Atm),Baro (Atm),bILBA,…
//
// So there is no single time base in the file. We read each channel as its own
// (time, value) series, take the densest channel's clock as the master, and
// resample the others onto it by linear interpolation — giving one coherent
// flight. Altitude comes from the barometric channel; the "bILBA" marker columns
// make the format unmistakable.

import type { Parser, ParseInput } from './types';
import type { RawFlight, Channel } from '../flight/types';
import { parseTable } from '../csv';
import { G0 } from '../units';

interface Series {
  t: number[];
  v: number[];
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const low = rows[i].map((c) => c.toLowerCase());
    if (low.some((c) => c.startsWith('time@')) && low.includes('bilba')) return i;
  }
  return -1;
}

function readChannel(dataRows: string[][], timeCol: number, valCol: number): Series {
  const pairs: [number, number][] = [];
  for (const row of dataRows) {
    const tc = row[timeCol];
    const vc = row[valCol];
    if (!tc || !vc) continue;
    const tn = Number(tc);
    const vn = Number(vc);
    if (Number.isFinite(tn) && Number.isFinite(vn)) pairs.push([tn, vn]);
  }
  // Sort by time and drop duplicate timestamps so the master clock and every
  // resample source are strictly ascending — the analysis (and resample's
  // forward cursor) assume monotonic time. A no-op on an already-ordered export.
  pairs.sort((a, b) => a[0] - b[0]);
  const t: number[] = [];
  const v: number[] = [];
  for (const [tn, vn] of pairs) {
    if (t.length > 0 && tn === t[t.length - 1]) {
      v[v.length - 1] = vn; // duplicate timestamp: keep the latest sample
      continue;
    }
    t.push(tn);
    v.push(vn);
  }
  return { t, v };
}

/** Linearly resample (src.t, src.v) onto the target time grid (both ascending). */
function resample(src: Series, target: Float64Array): Float64Array {
  const out = new Float64Array(target.length);
  const n = src.t.length;
  if (n === 0) {
    out.fill(NaN);
    return out;
  }
  let j = 0;
  for (let i = 0; i < target.length; i++) {
    const t = target[i];
    while (j < n - 1 && src.t[j + 1] < t) j++;
    if (t <= src.t[0]) out[i] = src.v[0];
    else if (t >= src.t[n - 1]) out[i] = src.v[n - 1];
    else {
      const t0 = src.t[j];
      const t1 = src.t[j + 1];
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      out[i] = src.v[j] + f * (src.v[j + 1] - src.v[j]);
    }
  }
  return out;
}

export const featherweightFipParser: Parser = {
  id: 'featherweight-fip',
  label: 'Featherweight Raven (FIP)',

  detect(input: ParseInput): number {
    const head = input.text.slice(0, 4000).toLowerCase();
    if (head.includes('bilba') && head.includes('time@')) return 0.95;
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the Featherweight FIP header.');
    const headers = rows[headerIdx];
    const dataRows = rows.slice(headerIdx + 1);

    // Map each "Time@<name>" header to its (time col, value col).
    const channels = new Map<string, { timeCol: number; valCol: number }>();
    headers.forEach((h, i) => {
      const m = /^time@(.+)$/i.exec(h.trim());
      if (m) channels.set(m[1].trim().toLowerCase(), { timeCol: i, valCol: i + 1 });
    });

    const find = (needle: string) => {
      for (const [name, cols] of channels) if (name.includes(needle)) return cols;
      return null;
    };

    const baro = find('baro');
    if (!baro) throw new Error('This Featherweight FIP file has no barometric channel to analyze.');
    const baroS = readChannel(dataRows, baro.timeCol, baro.valCol);
    const velCols = find('velocity');
    const accCols = find('axial accel');
    const tempCols = find('temperature');
    const battCols = find('volts battery') ?? find('battery');

    const velS = velCols ? readChannel(dataRows, velCols.timeCol, velCols.valCol) : null;
    const accS = accCols ? readChannel(dataRows, accCols.timeCol, accCols.valCol) : null;

    // Master clock = the densest of baro / velocity / accel.
    const candidates: Series[] = [baroS, velS, accS].filter((s): s is Series => !!s && s.t.length > 0);
    const master = candidates.reduce((a, b) => (b.t.length > a.t.length ? b : a), baroS);
    if (master.t.length < 4) throw new Error('Too few samples in the Featherweight FIP file.');
    const time = Float64Array.from(master.t);

    const out: Channel[] = [];
    // Baro is logged in atm; convert to Pa and let the pipeline derive altitude.
    out.push({
      kind: 'pressure',
      label: 'Baro (Atm)',
      unit: 'Pa',
      values: resample({ t: baroS.t, v: baroS.v.map((a) => a * 101325) }, time),
    });
    if (velS) {
      out.push({ kind: 'velocity', label: 'Velocity', unit: 'm/s', values: resample({ t: velS.t, v: velS.v.map((x) => x * 0.3048) }, time) });
    }
    if (accS) {
      out.push({ kind: 'accelAxial', label: 'Axial Accel', unit: 'm/s²', values: resample({ t: accS.t, v: accS.v.map((g) => g * G0) }, time) });
    }
    if (tempCols) {
      const s = readChannel(dataRows, tempCols.timeCol, tempCols.valCol);
      out.push({ kind: 'temperature', label: 'Temperature', unit: '°C', values: resample({ t: s.t, v: s.v.map((f) => ((f - 32) * 5) / 9) }, time) });
    }
    if (battCols) {
      const s = readChannel(dataRows, battCols.timeCol, battCols.valCol);
      out.push({ kind: 'voltage', label: 'Battery', unit: 'V', values: resample(s, time) });
    }

    return {
      source: input.name,
      format: 'featherweight-fip',
      formatLabel: 'Featherweight Raven (FIP)',
      time,
      channels: out,
      meta: { device: 'Featherweight Raven' },
      notes: [
        'Featherweight FIP export: altitude is derived from the barometric channel, and the per-channel time bases were resampled onto one common clock so the curves line up.',
      ],
    };
  },
};
