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
import { flownAtFromText } from '../flight/flownAt';

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
    const cUtc = idx('utctime');
    const cUt = idx('unixtime');
    // The stated UTC stamp of the first fix that carries one: the flight's own date and
    // time, straight off the satellites. Rows before a lock hold a placeholder, which
    // flownAtFromText rejects rather than guesses at.
    const flownAt =
      (cUtc >= 0
        ? rows
            .slice(headerIdx + 1)
            .reduce<ReturnType<typeof flownAtFromText>>((got, r) => got ?? flownAtFromText(r[cUtc] ?? '', 'UTC'), null)
        : null) ?? undefined;
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
      // Every fix is stamped `Apr 17 2021 19:06:45.800 UTC` — a GPS's own UTC, so the
      // flight carries the day and time it flew without any zone guesswork.
      ...(flownAt ? { flownAt } : {}),
      notes: [
        'Featherweight GPS log: altitude is the GPS reading, which is coarser than a barometer — read it as approximate. The ground track shows where the rocket drifted and landed.',
      ],
    };
  },
};

// --- Ground-station variant -------------------------------------------------
// The same tracker, logged at the other end of the radio link. The ground station
// writes what it *received*, so every row carries two positions — the receiver's own
// and the rocket's — and the flight is the TRACKER columns:
//
//   TRACKER,DATE,TIME,GS Lat,GS Lon,GS Alt asl,TRACKER Lat,TRACKER Lon,TRACKER Alt asl,
//   FIX,HORZV,VERTV,HEAD,FLAGS,#TOT,>40,>32,>24,RSSI Down,RSSI Up,
//   Horizontal range (ft),Alt AGL (ft),Total range (ft),…,BATT,GS_batt_v,…
//
// Three things make this a parser rather than a job for the column mapper:
//  - the mapper claims the first column matching each role, which here is the ground
//    station's — a receiver that never leaves the field would be analysed as the flight;
//  - there is no elapsed-time column at all. The only clock is the wall clock in
//    DATE + TIME, so the mapper cannot even offer a time base and the file is a dead end;
//  - "Alt AGL (ft)" is the receiver's live subtraction of its OWN altitude, which drifts
//    with its own GPS (38 ft over one corpus log). The altitude read here is the tracker's
//    stated altitude above sea level, with the pad baseline taken from the record the same
//    way as for every other logger.

/** Seconds past midnight from a `HH:MM:SS(.sss)` cell. Unlike `clockFromText` — which
 *  answers "when did this fly" and stops at whole seconds — this clock IS the time base,
 *  so the fractional part is what separates two samples. Null when it isn't a clock. */
function clockSeconds(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (h > 23 || min > 59 || s >= 61) return null;
  return h * 3600 + min * 60 + s;
}

/** Whole days since the epoch from a `YYYY-MM-DD` cell, so a log that runs past midnight
 *  keeps counting forwards. Null when the cell isn't a date. */
function dayNumber(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text.trim());
  if (!m) return null;
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(day) ? day / 86_400_000 : null;
}

function findGsHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const low = rows[i].map((c) => c.trim().toLowerCase());
    if (low.includes('tracker lat') && low.includes('tracker lon') && low.includes('time')) return i;
  }
  return -1;
}

export const featherweightGpsGroundStationParser: Parser = {
  id: 'featherweight-gps-gs',
  label: 'Featherweight GPS (ground station)',

  detect(input: ParseInput): number {
    const head = input.text.slice(0, 2000).toLowerCase();
    // Token-anchored on the pair of columns that only this export has: the tracker's
    // position beside the receiver's. `unixtime` would be the tracker's own log instead.
    if (head.includes('tracker lat') && head.includes('tracker lon') && head.includes('gs lat')) return 0.95;
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findGsHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the Featherweight GPS ground-station header.');
    const header = rows[headerIdx].map((c) => c.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const cDate = idx('date');
    const cTime = idx('time');
    const cAlt = idx('tracker alt asl');
    const cLat = idx('tracker lat');
    const cLon = idx('tracker lon');
    const cFix = idx('fix');
    const cSats = idx('#tot');
    const cBatt = idx('batt');
    if (cTime < 0 || cAlt < 0) throw new Error('The ground-station log has no clock or tracker altitude.');

    // The altitude columns state no unit; the range columns beside them do, and they are
    // one set of numbers from one app — so the label on "Alt AGL (…)" says which system
    // this export is written in rather than leaving it to be assumed.
    const aglHeader = header.find((h) => /^alt agl\b/.test(h)) ?? '';
    const metres = /\(\s*m(?:etre|eter)?s?\s*\)/.test(aglHeader);
    const toMetres = metres ? 1 : 0.3048;

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
    // A wall clock with no date to anchor it still has to run forwards past midnight; a
    // step backwards of more than half a day is the only thing that can be.
    let dayFallback = 0;
    let prevClock = -Infinity;
    for (const r of rows.slice(headerIdx + 1)) {
      const clock = clockSeconds(r[cTime] ?? '');
      if (clock == null) continue;
      const day = cDate >= 0 ? dayNumber(r[cDate] ?? '') : null;
      if (day == null) {
        if (clock < prevClock - 43_200) dayFallback += 1;
        prevClock = clock;
      }
      const fix = num(r, cFix);
      const has3d = !Number.isFinite(fix) || fix >= 3;
      recs.push({
        t: (day ?? dayFallback) * 86_400 + clock,
        alt: has3d ? num(r, cAlt) * toMetres : NaN,
        lat: has3d ? num(r, cLat) : NaN,
        lon: has3d ? num(r, cLon) : NaN,
        sats: num(r, cSats),
        batt: num(r, cBatt),
      });
    }
    if (recs.length < 4) throw new Error('Too few received fixes to analyze.');

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
    // `#TOT` is the satellite count the tracker reported, binned by signal strength into
    // the `>40`/`>32`/`>24` columns beside it — those three sum to it row by row.
    if (cSats >= 0) channels.push({ kind: 'other', label: 'Satellites', unit: '', values: col((r) => r.sats) });
    if (cBatt >= 0) channels.push({ kind: 'voltage', label: 'Battery', unit: 'V', values: col((r) => r.batt) });

    // DATE and TIME carry no zone. A GPS states UTC and says so; this pair is written by
    // the ground-station software on its own clock, so it is read as the logger's.
    const flownAt =
      (cDate >= 0
        ? rows
            .slice(headerIdx + 1)
            .reduce<ReturnType<typeof flownAtFromText>>(
              (got, r) => got ?? flownAtFromText(`${r[cDate] ?? ''} ${r[cTime] ?? ''}`, 'logger'),
              null,
            )
        : null) ?? undefined;

    return {
      source: input.name,
      format: 'featherweight-gps-gs',
      formatLabel: 'Featherweight GPS (ground station)',
      time,
      channels,
      meta: { device: 'Featherweight GPS ground station', altitudeSource: 'gps' },
      ...(flownAt ? { flownAt } : {}),
      notes: [
        'Featherweight GPS ground-station log: altitude is the tracker’s GPS reading, which is coarser than a barometer — read it as approximate. The ground track shows where the rocket drifted and landed.',
        'These are the packets the receiver actually logged, so a gap in the record is a gap in reception, not a gap in the flight.',
      ],
    };
  },
};
