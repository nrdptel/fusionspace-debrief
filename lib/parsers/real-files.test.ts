import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';
import { summaryMarkdown } from '../report';

// Regression tests against real, downloaded flight files (see __fixtures__/README.md
// for sources). Big logs are downsampled but keep their original headers. Where a
// manufacturer summary exists, we assert against its ground-truth numbers.
const dir = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const read = (f: string) => readFileSync(dir + f, 'utf8');
const apogeeFt = (text: string, name: string) => {
  const r = importFlight({ name, text });
  if (r.kind !== 'flight') throw new Error(`${name} did not auto-detect`);
  return { r, a: analyzeFlight(r.flight) };
};

describe('real files — Altus Metrum TeleMetrum', () => {
  it('detects and analyses (real AltOS export with a single "speed" column + GPS)', () => {
    const { r, a } = apogeeFt(read('altusmetrum-telemetrum.csv'), 'TeleMetrum.csv');
    expect(r.parser.id).toBe('altusmetrum');
    expect(getChannel(r.flight, 'velocity')).toBeTruthy();
    // TeleMetrum logs GPS — surfaced so the recovery view can use the baro altitude
    // and the GPS track together.
    const lat = getChannel(r.flight, 'latitude');
    expect(lat).toBeTruthy();
    expect(lat!.values.some((v) => Number.isFinite(v))).toBe(true);
    expect(getChannel(r.flight, 'longitude')).toBeTruthy();
    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(9000);
    expect(ft).toBeLessThan(9600);
  });

  it('keeps the receiver’s own altitude as a second recording, and cross-checks apogee', () => {
    const { r, a } = apogeeFt(read('altusmetrum-telemetrum.csv'), 'TeleMetrum.csv');
    // AltOS writes a second `altitude` column after the GPS position — the receiver's
    // own, a different sensor from the barometer. It is carried, not merged.
    const gps = getChannel(r.flight, 'altitudeGps');
    expect(gps).toBeTruthy();
    expect(gps!.values.some((v) => Number.isFinite(v))).toBe(true);

    // Two independent readings of one apogee, stated side by side.
    const gpsFt = convert(a.metrics.gpsApogeeAltitude!, 'm', 'ft');
    const baroFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(gpsFt).toBeGreaterThan(9000);
    expect(Math.abs(gpsFt - baroFt) / baroFt).toBeLessThan(0.05);
    // The analysis itself is unmoved — the barometric channel is still the one it rides.
    expect(a.series.altitudeSource).toBe('baro');
    expect(a.metrics.gpsAscentFixes).toBeGreaterThan(50);
  });

  it('puts every reading the screen shows into the written report', () => {
    // Four readings were on screen and in no export: a flyer who read the thrust-to-weight
    // off the page and saved a Markdown write-up got a document without it. A report that
    // says less than the screen it came from is an export half-finished.
    const { r, a } = apogeeFt(read('altusmetrum-telemetrum.csv'), 'TeleMetrum.csv');
    const md = summaryMarkdown(r.flight, a, 'imperial');
    expect(a.metrics.avgBoostAcceleration).not.toBeNull();
    expect(a.metrics.liftoffTWR).not.toBeNull();
    expect(a.metrics.coastEfficiency).not.toBeNull();
    for (const label of ['Avg acceleration', 'Thrust-to-weight', 'Coast efficiency']) {
      expect(md, `${label} belongs in the report`).toContain(`| ${label} |`);
    }
    // …with the context the tile carries, not a bare number.
    expect(md).toMatch(/\| Avg acceleration \| [^|]*over the boost/);
    expect(md).toMatch(/\| Thrust-to-weight \| [\d.]+:1 off the pad/);
    expect(md).toMatch(/\| Coast efficiency \| \d+%/);
  });

  it('drops the fixes the receiver held with no satellites', () => {
    // This flight loses lock through the whole boost, and AltOS repeats the last
    // position and altitude rather than writing nothing. Read as data those samples put
    // the rocket on the pad at 218 m while the barometer has it climbing past 2,000 m.
    const { r } = apogeeFt(read('altusmetrum-telemetrum.csv'), 'TeleMetrum.csv');
    const sats = getChannel(r.flight, 'satellites');
    const gps = getChannel(r.flight, 'altitudeGps');
    const lat = getChannel(r.flight, 'latitude');
    expect(sats).toBeTruthy();
    let zeroFix = 0;
    for (let i = 0; i < sats!.values.length; i++) {
      if (sats!.values[i] !== 0) continue;
      zeroFix++;
      expect(Number.isFinite(gps!.values[i])).toBe(false);
      expect(Number.isFinite(lat!.values[i])).toBe(false);
    }
    // …and this file really does have such samples, so the assertion above has teeth.
    expect(zeroFix).toBeGreaterThan(10);
  });
});

describe('real files — PerfectFlite Pnut .pf2', () => {
  it('matches the file’s stated 1009 ft apogee', () => {
    const { r, a } = apogeeFt(read('perfectflite-pnut.pf2'), 'flight.pf2');
    expect(r.parser.id).toBe('perfectflite');
    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(960);
    expect(ft).toBeLessThan(1080);
  });

  it('keeps the device’s stated apogee as a cross-check against Debrief’s read', () => {
    const { r } = apogeeFt(read('perfectflite-pnut.pf2'), 'flight.pf2');
    if (r.kind !== 'flight') throw new Error('expected a flight');
    const reported = r.flight.reported ?? [];
    const apo = reported.find((v) => v.metric === 'apogeeAltitude');
    expect(apo, 'device apogee captured').toBeTruthy();
    expect(apo!.source).toBe('device');
    // "Apogee: 1009' AGL" → ~307.5 m, read as the device's own figure.
    expect(convert(apo!.value, 'm', 'ft')).toBeCloseTo(1009, 0);
  });

  it('skips a non-numeric stated apogee (a PWRLOSS power-loss flight)', () => {
    const preamble = 'PerfectFlite Pnut\nApogee: PWRLOSS\nData: (Time, Altitude, Velocity)\n';
    const rows = Array.from({ length: 40 }, (_, i) => `${(i * 0.05).toFixed(2)}, ${i < 20 ? i * 30 : (40 - i) * 30}, 0`).join('\n');
    const { r } = apogeeFt(preamble + rows, 'pwrloss.pf2');
    if (r.kind !== 'flight') throw new Error('expected a flight');
    expect(r.flight.reported ?? []).toHaveLength(0);
  });
});

describe('real files — Featherweight Raven (FIP)', () => {
  it('resamples the per-channel clocks and matches the Pnut on the same flight', () => {
    const { r, a } = apogeeFt(read('featherweight-raven-fip.csv'), 'TopShot_FIPa.csv');
    expect(r.parser.id).toBe('featherweight-fip');
    expect(getChannel(r.flight, 'pressure')).toBeTruthy();
    expect(getChannel(r.flight, 'accelAxial')).toBeTruthy();
    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(960);
    expect(ft).toBeLessThan(1100);
  });
});

describe('real files — Entacore AIM XTRA', () => {
  it('resamples the per-channel clocks and derives a sane apogee (~643 m AGL)', () => {
    const { r, a } = apogeeFt(read('aim-xtra.csv'), 'AIM_XTRA.csv');
    expect(r.parser.id).toBe('entacore-aim');
    expect(getChannel(r.flight, 'pressure')).toBeTruthy();
    expect(getChannel(r.flight, 'accelAxial')).toBeTruthy();
    expect(getChannel(r.flight, 'temperature')).toBeTruthy();
    // Device reported ~643 m AGL; deriving from raw baro lands close.
    const m = a.metrics.apogeeAltitude;
    expect(m).toBeGreaterThan(560);
    expect(m).toBeLessThan(740);
  });
});

describe('real files — Featherweight GPS', () => {
  it('detects, sorts the out-of-order clock, and exposes a lat/lon track', () => {
    const { r, a } = apogeeFt(read('featherweight-gps.csv'), 'GPS.csv');
    expect(r.parser.id).toBe('featherweight-gps');
    expect(getChannel(r.flight, 'latitude')).toBeTruthy();
    expect(getChannel(r.flight, 'longitude')).toBeTruthy();
    // Time base must be strictly ascending after the sort.
    const t = r.flight.time;
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    // GPS apogee ≈ 10,668 ft AGL for this flight.
    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(9800);
    expect(ft).toBeLessThan(11500);
    // This J510W flight is genuinely fast — it crosses Mach 1 on the way up.
    expect(a.metrics.mach).toBeGreaterThan(1);
    expect(a.metrics.transonicTime).not.toBeNull();
    expect(a.metrics.transonicAltitude).not.toBeNull();
    // Altitude is GPS, so acceleration (a second derivative) is omitted, not noise.
    expect(a.series.altitudeSource).toBe('gps');
    expect(Number.isNaN(a.metrics.maxAcceleration)).toBe(true);
    expect(a.series.acceleration.every((v) => Number.isNaN(v))).toBe(true);
  });
});

describe('real files — PerfectFlite StratoLogger CSV', () => {
  it('falls back to a usable mapping with the right roles/units', () => {
    const r = importFlight({ name: 'StratoLogger.csv', text: read('perfectflite-stratologger.csv') });
    expect(r.kind).toBe('mapping');
    if (r.kind !== 'mapping') return;
    const byRole = Object.fromEntries(r.table.columns.map((c) => [c.role, c]));
    expect(byRole.time).toBeTruthy();
    expect(byRole.altitude?.unit).toBe('ft');
  });
});

describe('real files — Blue Raven phone-app low-rate, vs its summary', () => {
  // Ground truth from the bundled BlRv summary CSV.
  const summary = read('blueraven-app.summary.csv');
  const truth = (re: RegExp) => Number(summary.match(re)![1]);
  const truthApogee = truth(/Max Altitude,([\d.]+)/);
  const truthMaxV = truth(/Max velocity,([\d.]+)/);

  it('matches the summary apogee and max velocity, with drogue faster than main', () => {
    const { r, a } = apogeeFt(read('blueraven-app-lr.csv'), 'BlRv-LR.csv');
    expect(r.parser.id).toBe('blueraven');

    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(truthApogee * 0.98);
    expect(ft).toBeLessThan(truthApogee * 1.02);

    const maxV = convert(a.metrics.maxVelocity, 'm/s', 'ft/s');
    expect(maxV).toBeGreaterThan(truthMaxV * 0.92);
    expect(maxV).toBeLessThan(truthMaxV * 1.08);

    // Dual deploy: drogue (fast) then main (slow).
    expect(a.metrics.drogueDescentRate).not.toBeNull();
    expect(a.metrics.mainDescentRate).not.toBeNull();
    expect(a.metrics.drogueDescentRate!).toBeGreaterThan(a.metrics.mainDescentRate!);
  });
});

// The date a flight flew, where the file states it. Three loggers do: AltOS and a
// Featherweight GPS write a GPS's UTC, a Blue Raven writes its own wall clock. Whose clock
// it is has to survive, because the same flight reads differently through each — a corpus
// pair recorded on both stamps 14:55 on the Blue Raven and 22:55 UTC on the GPS.
describe('real files — when the flight flew', () => {
  const flightOf = (file: string, as = file) => {
    const r = importFlight({ name: as, text: read(file) });
    if (r.kind !== 'flight') throw new Error(`${file} did not auto-detect`);
    return r.flight;
  };

  it('reads the GPS date out of an AltOS log, as UTC', () => {
    expect(flightOf('altusmetrum-telemetrum.csv').flownAt).toEqual({ stamp: '2021-10-30T20:07:50', zone: 'UTC' });
  });

  it('reads a Featherweight GPS’s stated UTC stamp', () => {
    expect(flightOf('featherweight-gps.csv').flownAt).toEqual({ stamp: '2021-04-17T19:06:45', zone: 'UTC' });
  });

  it('reads a Blue Raven’s own clock, and says it is the logger’s', () => {
    // Year,Month,Day + a Time column, with no zone stated anywhere in the file — so it is
    // carried as the device's clock rather than promoted to UTC.
    expect(flightOf('blueraven-app-lr.csv').flownAt).toEqual({ stamp: '2024-05-11T14:09:44', zone: 'logger' });
  });

  it('leaves it absent on a file that carries no date', () => {
    // A Raven FIP export and an AIM export are time/altitude/accel/… — nothing about the
    // day. The file's own modification time is when it was copied off the altimeter, not
    // when it flew, so there is nothing honest to show.
    expect(flightOf('featherweight-raven-fip.csv').flownAt).toBeUndefined();
    expect(flightOf('aim-xtra.csv').flownAt).toBeUndefined();
  });
});
