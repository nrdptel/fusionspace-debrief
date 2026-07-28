import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';

const ATM_PA = 101325;

// Build a Blue Raven low-rate (@ LOG_LOW) capture to the documented token format:
// "[sync] Bo: [temp] [pressure atm×50000] V: [batt mV] … Vel: … Pos: … ang: … FER: … CRC: …"
// at 50 Hz, with pressure synthesized from a barometric altitude profile.
function blueRavenLow(): string {
  const G = 9.80665;
  const dt = 0.02; // 50 Hz
  const padT = 1;
  const aBoost = 100;
  const tBurn = 0.7;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const apogee = hB + (vB * vB) / (2 * G);
  const total = padT + tBurn + coastT + 60;
  const lines = ['@ LOG_LOW 4096 2026 6 25 10 0 0'];
  let prev = 0;
  let sync = 0;
  for (let t = 0; t <= total; t += dt) {
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
    else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hB + vB * c - 0.5 * G * c * c;
    } else h = Math.max(0, prev - 5 * dt);
    prev = h;
    const pa = ATM_PA * Math.pow(1 - h / 44330, 5.255); // pad at sea level
    const rawPressure = Math.round((pa / ATM_PA) * 50000);
    const up = (h - prev) / dt; // unused by parser, included for realism
    sync = (sync + 20) % 250;
    lines.push(
      `${sync} Bo: 7100 ${rawPressure} V: 9310 0 0 0 0 12 Vel: ${up.toFixed(0)} 0 0 ` +
        `Pos: ${(h / 0.3048).toFixed(0)} 0 0 ang: 0 0 0 FER: 0 0 0 0 0 CRC: 0`,
    );
  }
  return lines.join('\n');
}

describe('Featherweight Blue Raven parser', () => {
  const text = blueRavenLow();

  it('auto-detects the low-rate LOG_LOW file', () => {
    const result = importFlight({ name: 'BLR_flight.txt', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('blueraven');
  });

  it('reads barometric pressure and analyses a sane apogee', () => {
    const result = importFlight({ name: 'BLR_flight.txt', text });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const flight = result.flight;
    expect(getChannel(flight, 'pressure')!.unit).toBe('Pa');
    expect(getChannel(flight, 'pressure')!.values[0]).toBeCloseTo(ATM_PA, -3);

    const a = analyzeFlight(flight);
    // ~900 ft apogee; altitude is derived from pressure.
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(750);
    expect(apogeeFt).toBeLessThan(1100);
    expect(a.events.some((e) => e.type === 'apogee')).toBe(true);
    expect(a.events.some((e) => e.type === 'landing')).toBe(true);
  });

  it('gives a helpful error for the high-rate file', () => {
    const hir = ['@ LOG_HIR 4096 2026 6 25 10 0 0', '0 100 200 300 100 100 9800 0 0 0 30000'].join('\n');
    expect(() => importFlight({ name: 'BLR_hir.txt', text: hir })).toThrow(/high-rate/i);
  });
});

// Phone-app export: a normal headered CSV with Blue Raven's column names.
function blueRavenAppLow(): string {
  const G = 9.80665;
  const dt = 0.02; // 50 Hz
  const padT = 1;
  const aBoost = 100;
  const tBurn = 0.7;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const total = padT + tBurn + coastT + 60;
  // Real app low-rate columns. Includes both a sea-level baro altitude and an
  // (intentionally drifted-high) inertial altitude, so the test proves the parser
  // picks the barometric AGL column over the ASL and inertial ones.
  const padAsl = 1000; // ft
  const header =
    'Year,Month,Day,Time,Flight_Time_(s),Sync,Temperature_(F),Baro_Press_(atm),' +
    'Baro_Altitude_ASL_(feet),Baro_Altitude_AGL_(feet),Batt_Volts,Velocity_Up,Inertial_Altitude,' +
    'Tilt_Angle_(deg),Tilt Exceeded 90deg';
  const lines = [header];
  let prev = 0;
  let sync = 0;
  for (let t = 0; t <= total; t += dt) {
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
    else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hB + vB * c - 0.5 * G * c * c;
    } else h = Math.max(0, prev - 5 * dt);
    const v = (h - prev) / dt;
    prev = h;
    sync = (sync + 20) % 250;
    const aglFt = h / 0.3048;
    const tilt = ft <= 0 ? 0 : Math.min(85, 3 + ft * 2); // grows off vertical toward apogee
    lines.push(
      `2025,5,24,08:29:54,${t.toFixed(2)},${sync},70,0.95,${(padAsl + aglFt).toFixed(1)},${aglFt.toFixed(1)},9.3,${(v / 0.3048).toFixed(1)},${(aglFt * 1.1).toFixed(1)},${tilt.toFixed(1)},0`,
    );
  }
  return lines.join('\n');
}

describe('Blue Raven phone-app export', () => {
  it('auto-detects and analyses the low-rate app CSV', () => {
    const result = importFlight({ name: 'tcf_TTV_018 LR.csv', text: blueRavenAppLow() });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('blueraven');
    expect(getChannel(result.flight, 'altitude')!.unit).toBe('m');
    expect(getChannel(result.flight, 'velocity')).toBeTruthy();
    const a = analyzeFlight(result.flight);
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(750);
    expect(apogeeFt).toBeLessThan(1100);
  });

  it('surfaces the onboard tilt (angle off vertical) as an explorable channel', () => {
    const result = importFlight({ name: 'tcf_TTV_018 LR.csv', text: blueRavenAppLow() });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const tilt = getChannel(result.flight, 'tilt');
    expect(tilt, 'tilt channel present').toBeTruthy();
    // Read as degrees, as-is (no conversion), and it's the angle column — not the
    // boolean "Tilt Exceeded 90deg" flag next to it.
    expect(tilt!.unit).toBe('°');
    expect(tilt!.label.toLowerCase()).toContain('tilt_angle');
    expect(tilt!.values.some((v) => v > 1 && v <= 85)).toBe(true);
  });

  it('points the user to the low-rate file for a high-rate app CSV', () => {
    const hr = [
      'Year,Month,Day,Time,Flight_Time_(s),Sync,Gyro_X,Gyro_Y,Gyro_Z,Accel_X,Accel_Y,Accel_Z,Quat_1,Quat_2,Quat_3,Quat_4,Aux_Volts,Current',
      '2025,5,24,08:29:54.433,6.318,101,169.6,64.8,-280.4,0.60,1.25,0.00,-0.55,0.17,-0.81,0.09,0.07,0.126',
      '2025,5,24,08:29:54.435,6.320,107,206.2,70.1,-300.2,0.58,1.27,0.04,-0.55,0.18,-0.81,0.10,0.07,0.129',
    ].join('\n');
    expect(() => importFlight({ name: 'tcf_TTV_018 HR.csv', text: hr })).toThrow(/low-rate/i);
  });
});

describe('Blue Raven inertial altitude', () => {
  it('is carried as a second altitude recording, not discarded', () => {
    const res = importFlight({ name: 'tcf_TTV_018 LR.csv', text: blueRavenAppLow() });
    if (res.kind !== 'flight') throw new Error('expected a flight');
    // The barometric channel stays the analysis source…
    const baro = getChannel(res.flight, 'altitude');
    expect(baro).toBeTruthy();
    // …and the device's own inertial solution rides along beside it, in canonical metres,
    // so it can be plotted against the baro line. It matters through the transonic push,
    // where a baro trace reads the rocket descending: on a corpus flight the barometric
    // altitude reaches 493 ft below the pad at the same instant the inertial reads
    // 1,710 ft, and only one of those can be a height.
    const inert = getChannel(res.flight, 'altitudeInertial');
    expect(inert, 'inertial altitude channel').toBeTruthy();
    expect(inert!.unit).toBe('m');
    expect(inert!.values.length).toBe(res.flight.time.length);
    expect(inert!.values.some((v) => Number.isFinite(v) && v > 0)).toBe(true);
    // Two distinct recordings, not the same column twice.
    expect(inert!.label).not.toBe(baro!.label);
  });
});

// The inertial channel is a second recording of the same height and the analysis leans on it
// through the transonic push — but it is an INTEGRATION written into a field that wraps, and
// carried whole it was plotted in the explorer and written into the data CSV long after it
// stopped being an altitude. Measured on the corpus, on the copy Debrief analyses: jan18 runs
// to -151,147 ft (reading -64,762 ft where the barometer reads 823), lemiv and meraki hit
// exactly +/-32,767 ft, and jan10 drifts to -2,781 ft and stays credible.
describe('the inertial altitude, where it stops being one', () => {
  /** A flight whose inertial column diverges from the barometric one after apogee. */
  function withInertial(inert: (i: number, baroFt: number) => number): string {
    const head = 'Flight_Time_(s),Baro_Altitude_AGL_(feet),Inertial_Altitude,Velocity_Up,Batt_Volts';
    const rows: string[] = [head];
    for (let i = 0; i < 400; i++) {
      const t = (i - 40) * 0.02;
      // up to 1,000 ft by t=2 s, back down by t=7 s
      const baro = t <= 0 ? 0 : t < 2 ? 1000 * (t / 2) : Math.max(0, 1000 * (1 - (t - 2) / 5));
      rows.push([t.toFixed(2), baro.toFixed(1), inert(i, baro).toFixed(1), '0', '4.0'].join(','));
    }
    return rows.join('\n');
  }

  function asFlight(name: string, text: string) {
    const r = importFlight({ name, text });
    if (r.kind !== 'flight') throw new Error(`expected a flight, got ${r.kind}`);
    return r.flight;
  }

  it('keeps a channel that only drifts', () => {
    // jan10's case: +9% at apogee and never far from the barometer. Nothing is cut.
    const f = asFlight('BlRv_drift_LR.csv', withInertial((i, b) => b * 1.09));
    const ch = f.channels.find((c) => c.kind === 'altitudeInertial')!;
    expect([...ch.values].every((v) => Number.isFinite(v))).toBe(true);
    expect(f.notes.some((n) => /stops being readable/.test(n))).toBe(false);
  });

  it('cuts a channel that walks away from the barometer by more than the whole flight', () => {
    // jan18's case: no wrap, just an integrator running away. The bound is the flight's own
    // height — two recordings of one flight that differ by more than the whole flight are not
    // a second opinion.
    const f = asFlight('BlRv_runaway_LR.csv', withInertial((i, b) => (i < 200 ? b : b - (i - 200) * 40)));
    const ch = f.channels.find((c) => c.kind === 'altitudeInertial')!;
    const live = [...ch.values].filter((v) => Number.isFinite(v)).length;
    expect(live).toBeGreaterThan(150); // the climb survives
    expect(live).toBeLessThan(ch.values.length); // the runaway does not
    expect(f.notes.some((n) => /stops being readable/.test(n))).toBe(true);
  });

  it('cuts at a 2^16 ft step, which is a counter wrapping rather than a rocket moving', () => {
    // meraki's and lemiv's case. 65,536 ft in one 20 ms sample is 3.3 million ft/s.
    const f = asFlight('BlRv_wrap_LR.csv', withInertial((i, b) => (i < 150 ? b : b - 65536)));
    const ch = f.channels.find((c) => c.kind === 'altitudeInertial')!;
    expect(Number.isFinite(ch.values[149])).toBe(true);
    expect(Number.isFinite(ch.values[150])).toBe(false);
    expect(f.notes.some((n) => /stops being readable/.test(n))).toBe(true);
  });

  it('says where it stopped and what the two recordings read there', () => {
    const f = asFlight('BlRv_wrap_LR.csv', withInertial((i, b) => (i < 150 ? b : b - 65536)));
    const note = f.notes.find((n) => /stops being readable/.test(n))!;
    expect(note).toMatch(/\d+\.\d s into this record/);
    expect(note).toMatch(/where the barometer reads/);
  });
});
