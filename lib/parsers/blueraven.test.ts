import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
  // `Future_Angle_(deg)` and `Roll_Angle_(deg)` sit between the tilt and the boolean flag in
  // every real low-rate export, and the two are here so the fixture exercises the shape that
  // actually arrives: one column Debrief reads, one it deliberately refuses, and a boolean it
  // has always had to step around — all three matching on the word "angle" or "tilt".
  //
  // The column indices before `Tilt_Angle_(deg)` are unchanged on purpose: `withInertial` and
  // `rawInertialAt` address `Inertial_Altitude` positionally at 12.
  const header =
    'Year,Month,Day,Time,Flight_Time_(s),Sync,Temperature_(F),Baro_Press_(atm),' +
    'Baro_Altitude_ASL_(feet),Baro_Altitude_AGL_(feet),Batt_Volts,Velocity_Up,Inertial_Altitude,' +
    'Tilt_Angle_(deg),Future_Angle_(deg),Roll_Angle_(deg),Tilt Exceeded 90deg';
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
    // Cumulative and unwrapped, the way the board writes it — the corpus reaches 26,099°.
    const roll = ft <= 0 ? 0 : ft * 140;
    lines.push(
      `2025,5,24,08:29:54,${t.toFixed(2)},${sync},70,0.95,${(padAsl + aglFt).toFixed(1)},${aglFt.toFixed(1)},9.3,${(v / 0.3048).toFixed(1)},${(aglFt * 1.1).toFixed(1)},${tilt.toFixed(1)},${(tilt * 1.3).toFixed(1)},${roll.toFixed(1)},0`,
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

  it('surfaces the onboard ROLL angle too, as an angle and never as a rate', () => {
    const result = importFlight({ name: 'tcf_TTV_018 LR.csv', text: blueRavenAppLow() });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const roll = getChannel(result.flight, 'rollAngle');
    expect(roll, 'roll-angle channel present').toBeTruthy();
    expect(roll!.unit).toBe('°');
    expect(roll!.label.toLowerCase()).toContain('roll_angle');
    // Cumulative: it passes a full turn rather than wrapping, which is what makes reading it
    // as deg/s produce a number no flyer could sanity-check.
    expect(Math.max(...roll!.values), 'rolls past 360°').toBeGreaterThan(360);
    // And it is NOT a rate. This is the assertion that would have caught the defect: the
    // column used to arrive as `rollRate`, so a rate channel existed where no rate was logged.
    expect(getChannel(result.flight, 'rollRate'), 'no rate is invented from an angle').toBeUndefined();
  });

  it('refuses the board’s FUTURE angle, which is a projection and not a recording', () => {
    const result = importFlight({ name: 'tcf_TTV_018 LR.csv', text: blueRavenAppLow() });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    // The file carries it beside the two Debrief does read. It is what the board expects its
    // tilt to become — used for its own lockout — so presenting it would put another
    // instrument's forward estimate on a surface that reports what was flown.
    expect(
      result.flight.channels.some((c) => c.label.toLowerCase().includes('future')),
      'no channel is built from the projection',
    ).toBe(false);
  });

  it('carries the board’s own limit on the roll angle, and only when the channel is there', () => {
    const withRoll = importFlight({ name: 'tcf_TTV_018 LR.csv', text: blueRavenAppLow() });
    if (withRoll.kind !== 'flight') throw new Error('expected a flight');
    expect(withRoll.flight.notes.some((n) => n.includes('integrates its measured roll rate'))).toBe(true);

    // A low-rate export without the column must not carry a sentence about a channel it does
    // not have — a standing caveat on every other Blue Raven file is noise, and noise is how a
    // real caveat stops being read.
    const text = blueRavenAppLow();
    const lines = text.split('\n');
    const head = lines[0].split(',');
    const drop = head.indexOf('Roll_Angle_(deg)');
    const stripped = lines
      .map((l) => l.split(',').filter((_, i) => i !== drop).join(','))
      .join('\n');
    const without = importFlight({ name: 'tcf_TTV_018 LR.csv', text: stripped });
    if (without.kind !== 'flight') throw new Error('expected a flight');
    expect(getChannel(without.flight, 'rollAngle'), 'this board did not record it').toBeUndefined();
    expect(without.flight.notes.some((n) => n.includes('integrates its measured roll rate'))).toBe(false);
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

/** Rewrite the Inertial_Altitude column from `fromRow` onward, so each failure mode can be
 *  injected into an otherwise ordinary flight. The column is index 12 in the app header. */
function withInertial(csv: string, fromRow: number, valueFt: (i: number, prevFt: number) => number): string {
  const lines = csv.split('\n');
  const COL = 12;
  let prev = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    prev = Number(cells[COL]);
    if (i - 1 >= fromRow) {
      cells[COL] = valueFt(i - 1, prev).toFixed(1);
      lines[i] = cells.join(',');
    }
  }
  return lines.join('\n');
}


/** A flight TALLER than the inertial field's 2^16 ft span, so the wrap bound can be observed on
 *  its own. The corpus case is meraki at 247,754 ft; this is the same shape, 400 samples at
 *  10 Hz reaching ~80 km, with the inertial tracking the barometer until it wraps. */
function tallFlight({ wrapAtRow }: { wrapAtRow: number }): string {
  const header =
    'Year,Month,Day,Time,Flight_Time_(s),Sync,Temperature_(F),Baro_Press_(atm),' +
    'Baro_Altitude_ASL_(feet),Baro_Altitude_AGL_(feet),Batt_Volts,Velocity_Up,Inertial_Altitude,' +
    'Tilt_Angle_(deg),Tilt Exceeded 90deg';
  const lines = [header];
  const n = 400;
  const dt = 0.1;
  let prevH = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    // Up to ~80 km by sample 200, then back down — a sounding-rocket profile.
    const s = i / 200;
    const h = 80000 * Math.max(0, s <= 1 ? 1 - (1 - s) ** 2 : 1 - (s - 1) ** 2);
    const v = (h - prevH) / dt;
    prevH = h;
    const aglFt = h / 0.3048;
    // The inertial tracks the barometer honestly, then one sample steps by the field's span.
    const inertFt = i < wrapAtRow ? aglFt * 1.02 : aglFt * 1.02 - 65536;
    lines.push(
      `2025,5,24,08:29:54,${t.toFixed(2)},${(i * 20) % 250},70,0.95,${(1000 + aglFt).toFixed(1)},` +
        `${aglFt.toFixed(1)},9.3,${(v / 0.3048).toFixed(1)},${inertFt.toFixed(1)},5.0,0`,
    );
  }
  return lines.join('\n');
}

/** The inertial value the FILE states at a row, in metres — read back from the CSV so a test can
 *  reason about what the bounds saw before one of them withheld it. */
function rawInertialAt(csv: string, row: number): number {
  return Number(csv.split('\n')[row + 1].split(',')[12]) * 0.3048;
}

// A second recording of the same height is only a cross-check while it is still a recording.
// The Blue Raven writes its inertial solution into a field that cannot hold a large flight,
// and it is an integration, so on real corpus files it either wraps at 2^16 ft or drifts to a
// figure no rocket reached — and it was being plotted in the explorer and written into the
// data CSV as the device's own altitude either way. Two scale-free bounds, neither tuned: one
// is the field's own span, the other is the flight's own height.
describe('Blue Raven inertial altitude — stopped where it stops being an altitude', () => {
  const inertialOf = (csv: string) => {
    const res = importFlight({ name: 'tcf_TTV_018 LR.csv', text: csv });
    if (res.kind !== 'flight') throw new Error('expected a flight');
    return { flight: res.flight, values: getChannel(res.flight, 'altitudeInertial')!.values };
  };
  const noteOf = (f: { notes: string[] }) => f.notes.find((s) => s.includes('stops being readable'));

  it('leaves an honestly drifting channel completely alone', () => {
    // The fixture's inertial runs 10% high the whole way — exactly the drift the note beside
    // this channel describes, and the reason the analysis stays on the baro. Truncating it
    // would delete a real cross-check. This is the case that must never fire, and on the
    // corpus it is `jan10`, which keeps 100% of its samples.
    const { flight, values } = inertialOf(blueRavenAppLow());
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
    expect(noteOf(flight)).toBeUndefined();
  });

  it('cuts at a single-sample step of about 2^16 ft — a counter wrapping, not a rocket', () => {
    // **This has to be a TALL flight, and that is the whole point of the fixture.** On an
    // ordinary sport flight the two bounds are not independently observable: any step of 2^16
    // ft also lands the channel further from the barometer than the whole flight is high, so
    // the divergence bound fires at the same sample and the wrap bound could be deleted
    // without a single test noticing. Only where the flight is TALLER than the field's span
    // does the wrap stand alone — which is exactly the corpus case it was written for, meraki
    // at 247,754 ft in a field that tops out at 32,767.
    const csv = tallFlight({ wrapAtRow: 120 });
    const { flight, values } = inertialOf(csv);
    expect(Number.isFinite(values[119]), 'the sample before the wrap survives').toBe(true);
    expect(Number.isFinite(values[120]), 'the wrap itself is withheld').toBe(false);
    expect(values.slice(121).every((v) => !Number.isFinite(v))).toBe(true);
    expect(noteOf(flight), 'a withheld value says why').toMatch(/stops being readable/);

    // …and prove the OTHER bound could not have done it: at the cut the two instruments are
    // still closer together than the flight is high, so only the wrap explains this.
    const baro = getChannel(flight, 'altitude')!.values;
    const peak = Math.max(...Array.from(baro).filter(Number.isFinite));
    expect(Math.abs(rawInertialAt(csv, 120) - baro[120])).toBeLessThan(peak);
  });

  it('cuts where the two recordings differ by more than the whole flight', () => {
    // No wrap anywhere — the channel simply integrates away, one small step at a time, which
    // is `jan18`: -64,762 ft where the barometer reads 823 ft, and not one single-sample step
    // large enough to be a counter rolling over. Ramped at 5 m a sample, far below the field's
    // span, so ONLY the divergence bound can catch this.
    const csv = withInertial(blueRavenAppLow(), 80, (i, prev) => prev - (i - 79) * 5 * 3.280839895);
    const { flight, values } = inertialOf(csv);
    const firstCut = values.findIndex((v) => !Number.isFinite(v));
    expect(firstCut, 'it is cut somewhere').toBeGreaterThan(80);
    expect(values.slice(0, firstCut).every((v) => Number.isFinite(v))).toBe(true);
    expect(values.slice(firstCut).every((v) => !Number.isFinite(v))).toBe(true);
    expect(noteOf(flight)).toMatch(/stops being readable/);
  });

  it('says when it stopped and what the two instruments read there', () => {
    const csv = withInertial(blueRavenAppLow(), 80, (i, prev) => prev - (i - 79) * 5 * 3.280839895);
    const { flight } = inertialOf(csv);
    const note = noteOf(flight)!;
    // The note has to be actionable: a time on the record's own clock, and BOTH readings, so
    // the flyer can see which instrument stopped rather than being told a channel vanished.
    expect(note).toMatch(/\d+\.\d s into this record/);
    expect(note).toMatch(/ft where the barometer reads/);
  });

  it('never touches the altitude a flight is actually READ from', () => {
    // The dangerous case, and the reason the mapping's `inertAltIdx !== altIdx` guard is
    // load-bearing rather than tidy: a file with no barometric column is analysed FROM its
    // inertial altitude, so no second channel is built and there is nothing for this to
    // withhold. Withholding the channel a flight is read from would delete the flight, which
    // is a far worse failure than the one being fixed.
    //
    // The fixture carries a 2^16 ft step ON THAT COLUMN, so the bound would have something to
    // bite if it ever reached it — without that, `inert` and `baro` would be the same array,
    // the divergence would be identically zero, and this test could not fail whatever the
    // code did. No corpus file is in this state (all four Blue Ravens carry a barometric
    // column); reading a wrapping channel as the analysis source is a separate problem this
    // change deliberately does not touch.
    const header =
      'Year,Month,Day,Time,Flight_Time_(s),Sync,Temperature_(F),Batt_Volts,Velocity_Up,Inertial_Altitude,Tilt_Angle_(deg)';
    const lines = [header];
    let prev = 0;
    for (let i = 0; i < 300; i++) {
      const s2 = i / 150;
      const h = 300 * Math.max(0, s2 <= 1 ? 1 - (1 - s2) ** 2 : 1 - (s2 - 1) ** 2);
      const v = (h - prev) / 0.05;
      prev = h;
      const ft = h / 0.3048 - (i >= 200 ? 65536 : 0);
      lines.push(
        `2025,5,24,08:29:54,${(i * 0.05).toFixed(2)},${(i * 20) % 250},70,9.3,${(v / 0.3048).toFixed(1)},${ft.toFixed(1)},5.0`,
      );
    }
    const res = importFlight({ name: 'inert-only LR.csv', text: lines.join('\n') });
    if (res.kind !== 'flight') throw new Error('expected a flight');
    const alt = getChannel(res.flight, 'altitude')!;
    expect(getChannel(res.flight, 'altitudeInertial'), 'no second recording exists here').toBeUndefined();
    expect(Array.from(alt.values).every((x) => Number.isFinite(x)), 'every sample survives').toBe(true);
    expect(res.flight.notes.some((n) => n.includes('stops being readable'))).toBe(false);
  });

});

/** The real files, because a synthetic fixture only proves the parser agrees with the fixture.
 *
 *  Skipped rather than failed where the corpus is absent, the way every corpus-backed suite here
 *  is — but the skip is visible in the count, so a run that examined nothing cannot read like a
 *  run that passed. */
const CORPUS_DIR = 'lib/parsers/__corpus__/blueraven/';
/** The four app-CSV low-rate exports. Each carries `Tilt_Angle_(deg)`, `Future_Angle_(deg)` and
 *  `Roll_Angle_(deg)`; verified by reading the headers, not assumed from the vendor's manual. */
const LR_FILES = [
  'blueraven__trf-lemiv-l3__BlRv_SN1537_LR_04-12-2025_12_45_49.csv',
  'blueraven__trf-f1machbuster-jan10__BLRVN87-bckup LR_01-10-2026_14_55_30.csv',
  'blueraven__trf-f1machbuster-jan18__BlRv_159F1cm LR_01-18-2026_10_48_41.csv',
  'blueraven__reddit-meraki2-121km__BlueRaven-LR.csv',
];
/** The serial `@ LOG_LOW` capture. It carries no angle columns at all, which makes it the
 *  "this board did not record it" half of the milestone's own done-when. */
const LR_SERIAL = 'blueraven__issuiuc-sg1.2-20231118__SG1.2-Sustainer-November-BlueRaven-Low.txt';

const corpusPresent = existsSync(CORPUS_DIR + LR_FILES[0]);

/** The roll-angle column's own extremes, read straight out of the file with no parsing in
 *  between, so the assertion compares against the FILE rather than against another copy of the
 *  code under test. */
function rawRollExtremes(text: string): { min: number; max: number; n: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const head = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const ci = head.findIndex((h) => h.includes('roll') && h.includes('angle'));
  let min = Infinity;
  let max = -Infinity;
  let n = 0;
  for (const line of lines.slice(1)) {
    const v = Number(line.split(',')[ci]);
    if (!Number.isFinite(v)) continue;
    n++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max, n };
}

describe('Blue Raven roll angle, over the real corpus', () => {
  it.skipIf(!corpusPresent)('every app-CSV low-rate export yields the board’s roll angle, matching its own column', () => {
    for (const name of LR_FILES) {
      const text = readFileSync(CORPUS_DIR + name, 'utf8');
      const res = importFlight({ name, text });
      if (res.kind !== 'flight') throw new Error(`${name} did not parse as a flight`);
      const roll = getChannel(res.flight, 'rollAngle');
      expect(roll, `${name}: roll angle present`).toBeTruthy();
      expect(roll!.unit, `${name}: degrees`).toBe('°');

      // Degrees are stored as-is — there is no angle quantity in the unit converter — so the
      // channel's extremes must be the column's extremes exactly. A conversion sneaking in
      // (or a wrong column being picked up) fails here rather than being noticed later on a
      // chart nobody is checking.
      const raw = rawRollExtremes(text);
      const finite = Array.from(roll!.values).filter(Number.isFinite);
      expect(finite.length, `${name}: every stated sample survives`).toBe(raw.n);
      expect(Math.min(...finite), `${name}: min matches the file`).toBeCloseTo(raw.min, 6);
      expect(Math.max(...finite), `${name}: max matches the file`).toBeCloseTo(raw.max, 6);

      // No rate is invented from an angle. This is the regression that mattered: the column
      // used to arrive as `rollRate`, so every one of these files reported a roll RATE whose
      // peak was really a cumulative angle — jan18 reaches 24,240° and meraki 26,099°.
      expect(getChannel(res.flight, 'rollRate'), `${name}: no rate invented`).toBeUndefined();

      // The board's own limit travels with the channel.
      expect(res.flight.notes.some((n) => n.includes('integrates its measured roll rate')), `${name}: caveat carried`).toBe(true);

      // And the projection stays refused on every one of them.
      expect(
        res.flight.channels.some((c) => c.label.toLowerCase().includes('future')),
        `${name}: the future angle is not a channel`,
      ).toBe(false);
    }
  });

  it.skipIf(!existsSync(CORPUS_DIR + LR_SERIAL))('a board that recorded no angle says nothing about one', () => {
    const text = readFileSync(CORPUS_DIR + LR_SERIAL, 'utf8');
    const res = importFlight({ name: LR_SERIAL, text });
    if (res.kind !== 'flight') throw new Error('expected a flight');
    expect(getChannel(res.flight, 'rollAngle'), 'no roll angle in a serial capture').toBeUndefined();
    expect(getChannel(res.flight, 'tilt'), 'no tilt either').toBeUndefined();
    expect(res.flight.notes.some((n) => n.includes('integrates its measured roll rate')), 'and no caveat about one').toBe(false);
  });
});
