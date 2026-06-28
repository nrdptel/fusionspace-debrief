// Featherweight GPS tracker log. A position-only stream (no barometer or
// accelerometer): UTC time, a Unix timestamp, GPS altitude, lat/lon, fix quality,
// battery, etc. The headline numbers come from the (coarser) GPS altitude, but
// the real value is the ground track — where the rocket drifted and came down.
//
//   UTCTIME,UNIXTIME,ALT,LAT,LON,#SATS,FIX,HORZV,VERTV,HEAD,FLAGS,…,RSSI,BATT
//
// The serial capture isn't always in time order, so we sort by the Unix clock.

import type { Parser, ParseInput } from './types';
import type { RawFlight, Channel } from '../flight/types';
import { parseTable } from '../csv';

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const low = rows[i].map((c) => c.trim().toLowerCase());
    if (low.includes('unixtime') && low.includes('lat') && low.includes('lon')) return i;
  }
  return -1;
}

export const featherweightGpsParser: Parser = {
  id: 'featherweight-gps',
  label: 'Featherweight GPS',

  detect(input: ParseInput): number {
    const head = input.text.slice(0, 2000).toLowerCase();
    if (head.includes('unixtime') && head.includes('lat') && head.includes('lon') && head.includes('#sats')) return 0.95;
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the Featherweight GPS header.');
    const header = rows[headerIdx].map((c) => c.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const cUt = idx('unixtime');
    const cAlt = idx('alt');
    const cLat = idx('lat');
    const cLon = idx('lon');
    const cFix = idx('fix');
    const cSats = idx('#sats');
    const cBatt = idx('batt');

    // Read each row's fields, keeping only rows with a real Unix timestamp.
    interface Rec {
      t: number;
      alt: number;
      lat: number;
      lon: number;
      sats: number;
      batt: number;
    }
    const recs: Rec[] = [];
    const num = (r: string[], i: number) => (i >= 0 ? Number(r[i]) : NaN);
    for (const r of rows.slice(headerIdx + 1)) {
      const t = num(r, cUt);
      if (!Number.isFinite(t)) continue;
      // A 3D fix is needed for a trustworthy position/altitude; below that, drop it.
      const fix = num(r, cFix);
      const has3d = !Number.isFinite(fix) || fix >= 3;
      recs.push({
        t,
        alt: has3d ? num(r, cAlt) * 0.3048 : NaN, // GPS feet → metres
        lat: has3d ? num(r, cLat) : NaN,
        lon: has3d ? num(r, cLon) : NaN,
        sats: num(r, cSats),
        batt: num(r, cBatt),
      });
    }
    if (recs.length < 4) throw new Error('Too few GPS samples to analyze.');

    // Sort by the Unix clock and drop exact-duplicate timestamps so the time base
    // is strictly ascending for the analysis.
    recs.sort((a, b) => a.t - b.t);
    const dedup: Rec[] = [];
    for (const rec of recs) {
      if (dedup.length > 0 && rec.t === dedup[dedup.length - 1].t) dedup[dedup.length - 1] = rec;
      else dedup.push(rec);
    }
    const t0 = dedup[0].t;
    const time = Float64Array.from(dedup, (r) => r.t - t0);
    const col = (pick: (r: Rec) => number) => Float64Array.from(dedup, pick);

    const channels: Channel[] = [
      { kind: 'altitude', label: 'GPS altitude', unit: 'm', values: col((r) => r.alt) },
      { kind: 'latitude', label: 'Latitude', unit: '°', values: col((r) => r.lat) },
      { kind: 'longitude', label: 'Longitude', unit: '°', values: col((r) => r.lon) },
    ];
    if (cSats >= 0) channels.push({ kind: 'other', label: 'Satellites', unit: '', values: col((r) => r.sats) });
    if (cBatt >= 0) channels.push({ kind: 'voltage', label: 'Battery', unit: 'V', values: col((r) => r.batt) });

    return {
      source: input.name,
      format: 'featherweight-gps',
      formatLabel: 'Featherweight GPS',
      time,
      channels,
      meta: { device: 'Featherweight GPS', altitudeSource: 'gps' },
      notes: [
        'Featherweight GPS log: altitude is the GPS reading, which is coarser than a barometer — read it as approximate. The ground track shows where the rocket drifted and landed.',
      ],
    };
  },
};
