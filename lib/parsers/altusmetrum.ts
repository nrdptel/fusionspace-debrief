// Altus Metrum (TeleMetrum / TeleMega / EasyMega / EasyMini …). AltOS exports a
// CSV with a few '#'-prefixed preamble lines, then one '#'-prefixed header line,
// then one row per sample, in SI units. The exact columns vary by device and
// firmware — TeleMega/EasyMega add IMU/GPS columns, and the velocity column is
// "accel_speed"/"baro_speed" on some builds and a single "speed" on others — so
// we detect on the stable trio state_name + height + pressure and map by name.
//
// Header (core): version,serial,flight,call,time,…,state,state_name,acceleration,
//   pressure,altitude,height,(accel_speed|speed)[,baro_speed],temperature,…,
//   battery_voltage,… Units: time s, acceleration m/s², height m (AGL), speed m/s,
//   temperature °C, voltage V.

import type { Parser, ParseInput } from './types';
import type { RawFlight } from '../flight/types';
import { getChannel } from '../flight/types';
import { dropNeverSupplied, fixAllows, gradeFromSatellites, gradeValue } from '../gpsFix';
import { parseTable } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';
import { flownAtFromColumns } from '../flight/flownAt';

function stripHash(cell: string): string {
  return cell.replace(/^#\s*/, '').trim();
}

function isAltosHeader(toks: string[]): boolean {
  return toks.includes('state_name') && toks.includes('height') && toks.includes('pressure');
}

// The AltOS *telemetry* CSV — the radio downlink log AltosUI saves — is a different
// shape from the on-board flight-log CSV above: one row per received packet, keyed by
// a "tick" clock and a numeric "ptype" packet type, with height/speed/acceleration in
// SI. It carries no `state_name`/`pressure` columns, so the flight-log detector misses
// it and it would otherwise fall to the generic mapper (which mis-reads voltage columns
// named `v_apogee`/`v_main` as altitude). Radio telemetry is lossy — downsampled and
// often cut off mid-descent when the signal drops — so it's a cross-check, not a
// substitute for the on-board log.
function isAltosTelemetryHeader(toks: string[]): boolean {
  return toks.includes('tick') && toks.includes('ptype') && toks.includes('height') && toks.includes('speed');
}

function findHeaderRow(rows: string[][], test: (toks: string[]) => boolean): number {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    if (test(rows[i].map((c) => stripHash(c).toLowerCase()))) return i;
  }
  return -1;
}

/** The modal value of a column over the data rows — used to keep only the dominant
 *  (sensor) telemetry packet type, so an interleaved GPS/config packet with stale or
 *  blank height doesn't enter the trajectory. */
function modalCell(dataRows: string[][], index: number): string | null {
  const counts = new Map<string, number>();
  for (const r of dataRows) {
    const v = r[index];
    if (v == null || v === '') continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) ((best = v), (bestN = n));
  return best;
}

/** Parse the AltOS radio-telemetry CSV (tick/ptype/height/speed/…, SI units). */
function parseTelemetry(input: ParseInput, rows: string[][]): RawFlight {
  const headerIdx = findHeaderRow(rows, isAltosTelemetryHeader);
  const headers = rows[headerIdx].map(stripHash);
  const lower = headers.map((h) => h.toLowerCase());
  const col = (name: string) => lower.indexOf(name);

  const tickIdx = col('tick');
  const minCols = Math.min(headers.length, 6);
  let dataRows = rows.slice(headerIdx + 1).filter((r) => r.length >= minCols && r[tickIdx] !== '' && Number.isFinite(Number(r[tickIdx])));
  // Keep only the dominant (sensor) packet type; interleaved GPS/config packets carry
  // no fresh trajectory and would otherwise inject stale samples.
  const ptypeIdx = col('ptype');
  if (ptypeIdx >= 0) {
    const sensor = modalCell(dataRows, ptypeIdx);
    if (sensor != null) dataRows = dataRows.filter((r) => r[ptypeIdx] === sensor);
  }

  const mappings: ColumnMapping[] = [];
  const add = (index: number, role: ColumnMapping['role'], unit: string | null, gravityRemoved?: boolean) => {
    if (index >= 0) mappings.push({ index, role, unit, ...(gravityRemoved ? { gravityRemoved } : {}) });
  };
  add(tickIdx, 'time', 's');
  add(col('height'), 'altitude', 'm');
  add(col('speed'), 'velocity', 'm/s');
  // AltOS writes `acceleration` net of gravity: it reads ~0 sitting on the pad, where an
  // accelerometer's own specific force is +1 g. The same rows prove it — one file reads
  // -0.98 here while its `accel_x` body axis reads 9.78 on the same sample. Debrief reports
  // specific force throughout, so flag it and let the analyzer add that g back; read as-is
  // it makes every acceleration reading off this family a full g low, including the
  // thrust-to-weight quoted against the 5:1 rail rule.
  add(col('acceleration'), 'accelAxial', 'm/s²', true);
  add(col('v_batt'), 'voltage', 'v');

  return buildFlight({
    source: input.name,
    format: 'altusmetrum',
    formatLabel: 'Altus Metrum (AltOS telemetry)',
    headers,
    dataRows,
    mappings,
    flownAt: flownAtFromColumns(
      dataRows,
      { year: col('year'), month: col('month'), day: col('day'), hour: col('hour'), minute: col('minute'), second: col('second') },
      'UTC',
    ) ?? undefined,
    notes: [
      'Read from the AltOS radio-telemetry log in AltOS’s native metric units. Telemetry is lossy — downsampled, and often cut off mid-descent when the signal drops — so treat it as a cross-check against the on-board flight log, not a complete record.',
    ],
  });
}

export const altusMetrumParser: Parser = {
  id: 'altusmetrum',
  label: 'Altus Metrum (AltOS)',

  detect(input: ParseInput): number {
    for (const line of input.text.split(/\r?\n/).slice(0, 60)) {
      const toks = line.toLowerCase().split(',').map((s) => s.replace(/^#\s*/, '').trim());
      if (isAltosHeader(toks)) return 0.97;
      if (isAltosTelemetryHeader(toks)) return 0.95;
    }
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows, isAltosHeader);
    // The on-board flight-log CSV is the primary format; fall back to the radio-telemetry
    // shape (tick/ptype/…) only when the flight-log header isn't present.
    if (headerIdx < 0) {
      if (findHeaderRow(rows, isAltosTelemetryHeader) >= 0) return parseTelemetry(input, rows);
      throw new Error('Could not find the AltOS header line.');
    }

    const headers = rows[headerIdx].map(stripHash);
    const lower = headers.map((h) => h.toLowerCase());
    const minCols = Math.min(headers.length, 6);
    const dataRows = rows.slice(headerIdx + 1).filter((r) => r.length >= minCols && r[0] !== '');

    // Map by exact column name (first occurrence). `height` is already AGL, so it's
    // the altitude channel; `altitude` (baro MSL, and a duplicate GPS column) is left
    // aside. Velocity is whichever speed column this build emits.
    const col = (...names: string[]) => {
      for (const n of names) {
        const i = lower.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    const mappings: ColumnMapping[] = [];
    const add = (index: number, role: ColumnMapping['role'], unit: string | null, gravityRemoved?: boolean) => {
      if (index >= 0) mappings.push({ index, role, unit, ...(gravityRemoved ? { gravityRemoved } : {}) });
    };
    add(col('time'), 'time', 's');
    add(col('height'), 'altitude', 'm');
    // Net of gravity here too — see the note on the telemetry branch above.
    add(col('acceleration'), 'accelAxial', 'm/s²', true);
    add(col('accel_speed', 'speed', 'baro_speed'), 'velocity', 'm/s');
    add(col('temperature'), 'temperature', 'c');
    add(col('battery_voltage'), 'voltage', 'v');
    // GPS, on the units that have it — drives the recovery (ground-track) view.
    const iLon = col('longitude');
    add(col('latitude'), 'latitude', null);
    add(iLon, 'longitude', null);
    // AltOS writes a SECOND `altitude` column immediately after the GPS position: the
    // receiver's own altitude, a different sensor from the barometer entirely. It is
    // kept as a second altitude recording to cross-check against, never merged into the
    // analysis — which stays on the barometric channel. Found by position rather than by
    // name because the name is a duplicate of the baro MSL column earlier in the row.
    if (iLon >= 0) {
      for (let i = iLon + 1; i < lower.length; i++) {
        if (lower[i] === 'altitude') {
          mappings.push({ index: i, role: 'altitudeGps', unit: 'm' });
          break;
        }
      }
    }
    // How many satellites were in the fix. A receiver with none does not report
    // nothing — it holds its last position and altitude — so this is what separates a
    // measurement from a stale value.
    add(col('nsat'), 'satellites', null);
    // How good the satellite GEOMETRY was — the columns AltOS has always written and Debrief has
    // always dropped. Unitless, and deliberately NOT turned into metres anywhere: that conversion
    // needs the receiver's own ranging error, which no file here carries. Read `dropNeverSupplied`
    // below for the sentinel these arrive with.
    add(col('hdop'), 'dopHorizontal', null);
    add(col('vdop'), 'dopVertical', null);
    add(col('pdop'), 'dopPosition', null);

    const meta: Record<string, string | number> = {};
    for (let i = 0; i < headerIdx; i++) {
      const m = stripHash(rows[i][0] ?? '').match(/^([a-z_ ]+)\s+(.+)$/i);
      if (m && ['serial', 'flight', 'product', 'version'].includes(m[1].trim().toLowerCase())) {
        meta[m[1].trim()] = m[2].trim();
      }
    }

    const flight = buildFlight({
      source: input.name,
      format: 'altusmetrum',
      formatLabel: 'Altus Metrum (AltOS)',
      headers,
      dataRows,
      mappings,
      meta,
      // AltOS writes the GPS date and time of day as their own columns, so the flight
      // carries when it flew — in UTC, since that is what a GPS reports.
      flownAt: flownAtFromColumns(
        dataRows,
        { year: col('year'), month: col('month'), day: col('day'), hour: col('hour'), minute: col('minute'), second: col('second') },
        'UTC',
      ) ?? undefined,
      notes: ['Altitude is the AltOS AGL "height" channel; values are read in AltOS’s native metric units.'],
    });

    // AltOS writes (0, 0) — and holds the last value — before a GPS lock; blank
    // those out so the ground track isn't dragged to the equator. A real launch
    // site is never at exactly 0,0 or out of range.
    const lat = getChannel(flight, 'latitude');
    const lon = getChannel(flight, 'longitude');
    const gpsAlt = getChannel(flight, 'altitudeGps');
    // AltOS names it `altitude`, the same word as the barometric MSL column earlier in
    // the row, so on its own it reads as a duplicate in the explorer's channel list. The
    // source name is kept — this only says which of the two it is.
    if (gpsAlt) gpsAlt.label = `${gpsAlt.label} (GPS)`;
    const sats = getChannel(flight, 'satellites');
    if (lat && lon) {
      let any = false;
      // What each fix was solved in, DERIVED from the satellite count rather than read off a
      // column — AltOS writes no fix-type field. The label says so, because a value Debrief
      // worked out and one the instrument stated are not the same claim.
      const gradeVals = new Float64Array(lat.values.length).fill(NaN);
      const dops = (['dopHorizontal', 'dopVertical', 'dopPosition'] as const)
        .map((k) => getChannel(flight, k))
        .filter((c): c is NonNullable<typeof c> => !!c);
      for (let i = 0; i < lat.values.length; i++) {
        const la = lat.values[i];
        const lo = lon.values[i];
        // With no satellites in the fix, the position and the GPS altitude beside it are
        // the last ones the receiver had, written again — not readings. One corpus flight
        // loses lock through the whole boost and repeats its pad position and 218 m all
        // the way to 2,400 m, so taking those as data would put the rocket on the pad
        // while the barometer has it a mile up.
        //
        // What a count of satellites permits is `lib/gpsFix.ts`'s judgement rather than this
        // parser's, so that the Featherweight family — which asks the same question of a
        // fix-type column instead — cannot answer it differently. The rule it states is the one
        // this parser has always taken: three satellites give latitude and longitude on an
        // ASSUMED height, so the height is dropped and the position beside it is kept, because
        // a 2D fix still walks you to the rocket.
        const n = sats && Number.isFinite(sats.values[i]) ? sats.values[i] : null;
        const grade = gradeFromSatellites(n);
        if (n !== null) gradeVals[i] = gradeValue(grade);
        const allows = fixAllows(grade);
        const ok =
          allows.position &&
          Number.isFinite(la) &&
          Number.isFinite(lo) &&
          Math.abs(la) <= 90 &&
          Math.abs(lo) <= 180 &&
          !(la === 0 && lo === 0);
        if (!ok) {
          lat.values[i] = NaN;
          lon.values[i] = NaN;
        } else any = true;
        if (gpsAlt && (!ok || !allows.altitude)) gpsAlt.values[i] = NaN;
        // The dilution columns are held over exactly like the position beside them: on
        // `endurance`'s TeleMetrum log, all 108 samples that report zero satellites carry
        // `23.10` in all three — one value, repeated, on every row with no fix. Left in, the
        // recovery view would quote it as this flight's worst geometry, which is a reading it
        // is not.
        //
        // **The test is the missing FIX, never how the number looks**, and the corpus supplies
        // the counter-example that settles it: the 121 km flight's TeleMega log writes
        // `3.60 / 8.00 / 8.80` on all 12,931 of its own zero-satellite rows — an ordinary triple
        // inside the range of real readings, which satisfies `PDOP² = HDOP² + VDOP²` to 0.31%.
        // A rule that spotted `23.10` by its size would keep every one of those. (That file is
        // not reachable through this parser today — its sheet-export headers fall to the column
        // mapper — which is exactly why it is written down rather than relied on.)
        //
        // Not a quality filter, and the distinction matters because row 47 forbids one: nothing
        // here looks at how BAD a dilution is. It applies the rule the lines above already
        // apply — with no satellites in the fix, the values beside it are the last ones the
        // receiver had — to one more column of the same fix.
        if (!allows.position) for (const d of dops) d.values[i] = NaN;
      }
      if (any) {
        flight.notes.push('A GPS track was found; the recovery view shows where it drifted and landed.');
        if (sats) {
          flight.channels.push({
            kind: 'gpsFixGrade',
            label: 'Fix (from satellite count)',
            unit: '',
            values: gradeVals,
          });
        }
      }
    }

    // OUTSIDE the `lat && lon` guard on purpose. A dilution column is written by the same
    // receiver but is not conditional on this file having a usable position — and the failure of
    // getting that wrong is not a missing channel, it is a published dilution of precision of two
    // billion on a record whose track Debrief happened to reject.
    dropNeverSupplied(flight);
    return flight;
  },
};
