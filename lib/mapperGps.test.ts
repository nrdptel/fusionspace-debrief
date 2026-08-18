import { describe, expect, it } from 'vitest';
import { buildFlight } from './flight/build';
import { getChannel } from './flight/types';
import { importFlight } from './parsers';
import { ROLE_OPTIONS, unitOptionsFor } from './flight/mappingOptions';

/**
 * One file, one answer — whichever route it came in by.
 *
 * The satellite-count fix rule lived inside `lib/parsers/altusmetrum.ts`, so a flyer whose own
 * spreadsheet carried a satellite count got a position with no grading and no held-over blanking,
 * while the identical numbers through a named parser got both. `MAINTAINING.md`'s architecture
 * invariant is that every importer AND the column-mapper is a thin producer of ONE model; a rule
 * that lives in one importer is a rule the mapper does not have.
 *
 * These hold the two routes side by side rather than testing each alone, which is this repo's
 * stated shape for two things that must agree.
 */

/** Four samples: two solved on 9 satellites, one 3-satellite fix (position without a height), and
 *  one with none at all (the position beside it is the last one the receiver had). */
const ROWS = [
  // t, lat, lon, gpsAlt, nsat, hdop
  ['0', '40.100000', '-88.200000', '210', '9', '1.20'],
  ['1', '40.100100', '-88.200100', '260', '9', '1.30'],
  ['2', '40.100200', '-88.200200', '300', '3', '2.40'],
  ['3', '40.100200', '-88.200200', '300', '0', '23.10'],
];

function mapped() {
  return buildFlight({
    source: 'hand.csv',
    format: 'csv',
    formatLabel: 'Generic CSV',
    headers: ['t', 'lat', 'lon', 'galt', 'nsat', 'hdop'],
    dataRows: ROWS,
    mappings: [
      { index: 0, role: 'time', unit: 's' },
      { index: 1, role: 'latitude', unit: null },
      { index: 2, role: 'longitude', unit: null },
      { index: 3, role: 'altitudeGps', unit: 'm' },
      { index: 4, role: 'satellites', unit: null },
      { index: 5, role: 'dopHorizontal', unit: null },
    ],
  });
}

describe('a hand-mapped GPS column set', () => {
  it('is graded exactly as a named parser would grade it', () => {
    const f = mapped();

    // The no-fix row's position is blanked, and so is everything that rode on it.
    const lat = getChannel(f, 'latitude')!.values;
    const lon = getChannel(f, 'longitude')!.values;
    expect(Number.isFinite(lat[3]), 'a fix with no satellites is not a position').toBe(false);
    expect(Number.isFinite(lon[3])).toBe(false);
    expect(Number.isFinite(lat[0]), 'a solved fix is kept').toBe(true);

    // A 2D fix keeps its position and loses its height — the rule's whole point.
    expect(Number.isFinite(lat[2]), 'a 2D fix still walks you to the rocket').toBe(true);
    const galt = getChannel(f, 'altitudeGps')!.values;
    expect(Number.isFinite(galt[2]), "a 2D fix's height is an assumption, not a reading").toBe(false);
    expect(Number.isFinite(galt[0]), 'a 3D fix keeps its height').toBe(true);

    // And the dilution beside a fix that never happened goes with it.
    const hdop = getChannel(f, 'dopHorizontal')!.values;
    expect(Number.isFinite(hdop[3]), 'no fix, no geometry to report').toBe(false);
    expect(hdop[0]).toBeCloseTo(1.2, 6);

    // The grade is published, so the mapper route can say what it was solved in too.
    const grade = getChannel(f, 'gpsFixGrade');
    expect(grade, 'the mapped flight states its fix grade').toBeTruthy();
    expect(grade!.values[0]).toBe(3);
    expect(grade!.values[2]).toBe(2);
    expect(grade!.values[3]).toBe(0);
  });

  it('agrees channel for channel with the same numbers read by the AltOS parser', () => {
    // The same four fixes, written as the file a TeleMetrum actually exports. If the two routes
    // ever diverge again this is the case that says so, rather than each route being right alone.
    const header =
      '#version,serial,flight,call,time,state,state_name,acceleration,pressure,altitude,height,' +
      'speed,temperature,battery_voltage,latitude,longitude,altitude,nsat,hdop';
    const row = (t: string, la: string, lo: string, ga: string, ns: string, hd: string) =>
      `1,1,1,K,${t},8,coast,0,90000,100,100,10,20,4,${la},${lo},${ga},${ns},${hd}`;
    const csv = [header, ...ROWS.map((r) => row(r[0], r[1], r[2], r[3], r[4], r[5]))].join('\n');

    const res = importFlight({ name: 'telemetrum.csv', text: csv, bytes: new TextEncoder().encode(csv) });
    if (res.kind !== 'flight') {
      // The point of the case is the comparison; if the fixture stops auto-detecting, say so
      // loudly rather than passing quietly on a route that was never exercised.
      throw new Error(`the AltOS fixture no longer auto-detects (kind: ${res.kind})`);
    }

    const byParser = res.flight;
    const byMapper = mapped();
    for (const kind of ['latitude', 'longitude', 'altitudeGps', 'dopHorizontal', 'gpsFixGrade'] as const) {
      const a = getChannel(byParser, kind);
      const b = getChannel(byMapper, kind);
      expect(a, `the parser produced ${kind}`).toBeTruthy();
      expect(b, `the mapper produced ${kind}`).toBeTruthy();
      const finite = (v: Float64Array) => Array.from(v).map((x) => Number.isFinite(x));
      expect(finite(a!.values), `${kind}: the two routes blank the same rows`).toEqual(finite(b!.values));
    }
  });

  it('offers every one of those roles in the picker, with units only where a unit exists', () => {
    // The gap this slice closed: all five were legal roles and legal kinds and none was offered,
    // so the answer above was unreachable by the only route that needed it.
    const values = ROLE_OPTIONS.map((o) => o.value);
    for (const r of ['altitudeGps', 'satellites', 'dopHorizontal', 'dopVertical', 'dopPosition'] as const) {
      expect(values, `${r} is offered`).toContain(r);
    }
    // A count and a ratio have nothing to convert between; offering a menu invites a wrong answer.
    for (const r of ['satellites', 'dopHorizontal', 'dopVertical', 'dopPosition'] as const) {
      expect(unitOptionsFor(r), `${r} offers no units`).toEqual([]);
    }
    expect(unitOptionsFor('altitudeGps'), 'a height takes the lengths a height takes').toEqual(['ft', 'm']);

    // The label has to carry the contract — see the comment on this option.
    const sats = ROLE_OPTIONS.find((o) => o.value === 'satellites')!;
    expect(sats.label, 'the satellites label says IN THE FIX').toMatch(/in the fix/i);
  });
});
