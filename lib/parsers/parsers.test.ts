import { describe, it, expect } from 'vitest';
import { resolveUnit, convert } from '../units';
import { detectDelimiter, splitLine } from '../csv';
import { analyzeTable } from '../flight/columns';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';

describe('units', () => {
  it('resolves and converts common altimeter units', () => {
    expect(resolveUnit('ft')!.quantity).toBe('length');
    expect(convert(1000, 'ft', 'm')).toBeCloseTo(304.8, 1);
    expect(convert(1, 'g', 'm/s²')).toBeCloseTo(9.80665, 3);
    expect(convert(1013.25, 'hPa', 'Pa')).toBeCloseTo(101325, 0);
    expect(convert(32, 'F', 'C')).toBeCloseTo(0, 6);
  });
});

describe('csv', () => {
  it('detects delimiters and splits quoted fields', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(splitLine('1,"two, still two",3', ',')).toEqual(['1', 'two, still two', '3']);
  });
});

describe('generic CSV column detection', () => {
  it('guesses roles and units from headers', () => {
    const rows = [
      ['Time (s)', 'Altitude (ft)', 'Accel (g)'],
      ['0', '0', '1'],
      ['0.1', '5', '8'],
      ['0.2', '20', '7'],
    ];
    const t = analyzeTable(rows);
    const byRole = Object.fromEntries(t.columns.map((c) => [c.role, c]));
    expect(byRole.time).toBeTruthy();
    expect(byRole.altitude.unit).toBe('ft');
    expect(byRole.accelAxial.unit).toBe('g');
  });
});

describe('generic CSV with a separate units row', () => {
  it('reads names from one row and units from the next', () => {
    const rows = [
      ['Time', 'Altitude', 'Accel'],
      ['s', 'ft', 'g'],
      ['0', '0', '1'],
      ['0.1', '5', '8'],
      ['0.2', '20', '7'],
    ];
    const t = analyzeTable(rows);
    expect(t.headers).toEqual(['Time', 'Altitude', 'Accel']);
    const byRole = Object.fromEntries(t.columns.map((c) => [c.role, c]));
    expect(byRole.altitude.unit).toBe('ft');
    expect(byRole.accelAxial.unit).toBe('g');
    expect(t.dataRows.length).toBe(3);
  });
});

describe('a bare "g" column does not get mis-read as acceleration', () => {
  it('leaves a geoid/GPS g column ignored', () => {
    const rows = [
      ['time', 'g', 'height'],
      ['0', '17.1', '0'],
      ['0.1', '17.1', '5'],
    ];
    const t = analyzeTable(rows);
    const byIndex = Object.fromEntries(t.columns.map((c) => [c.header, c.role]));
    expect(byIndex['g']).toBe('ignore');
    expect(byIndex['height']).toBe('altitude');
  });
});

describe('BOM-prefixed Altus file still detects', () => {
  it('strips a UTF-8 BOM before parsing', () => {
    const text =
      '﻿version,serial,flight,call,time,clock,rssi,lqi,state,state_name,acceleration,pressure,altitude,height,accel_speed,baro_speed,temperature,battery_voltage,drogue_voltage,main_voltage\n' +
      '5,1,1,N,0,0,0,0,1,boost,150,1013.25,100,0,0,0,20,7.4,0,0\n' +
      '5,1,1,N,0.1,0,0,0,1,boost,150,1000,110,10,40,5,20,7.4,0,0';
    const result = importFlight({ name: 'f.csv', text });
    expect(result.kind).toBe('flight');
  });
});

describe('AltOS radio-telemetry CSV', () => {
  // The telemetry log is keyed by tick/ptype (no state_name/pressure columns), with a
  // dominant sensor packet type carrying height/speed in SI. It must parse as an Altus
  // Metrum flight, not fall to the generic mapper (which would read the `v_apogee`
  // voltage column as an altitude).
  function telemetryCsv(): string {
    const header = 'serial,tick,ptype,state,v_batt,v_apogee,ground_pres,acceleration,speed,height,crc';
    const lines = [header];
    // A modest flight to apogee ~230 m, ~20 Hz; a couple of interleaved ptype=8 GPS
    // packets with stale height that must be filtered out.
    let t = 40; // telemetry starts mid-pad-wait
    let prev = 0;
    const G = 9.80665;
    const aBoost = 40;
    const tBurn = 1.5;
    const vB = aBoost * tBurn;
    const hB = 0.5 * aBoost * tBurn * tBurn;
    for (let i = 0; i < 400; i++, t += 0.05) {
      const ft = t - 42;
      let h: number;
      if (ft <= 0) h = 0;
      else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
      else {
        const c = ft - tBurn;
        h = Math.max(0, hB + vB * c - 0.5 * G * c * c);
      }
      const v = (h - prev) / 0.05;
      prev = h;
      lines.push(`7,${t.toFixed(2)},9,3,7.4,4.2,97000,${(v > 0 ? 20 : -5).toFixed(2)},${v.toFixed(2)},${h.toFixed(1)},T`);
      if (i % 60 === 59) lines.push(`7,${t.toFixed(2)},8,3,7.4,4.2,97000,0,0,99999,T`); // GPS packet, stale height
    }
    return lines.join('\n');
  }

  it('parses the telemetry log as an Altus Metrum flight and reads metric height', () => {
    const result = importFlight({ name: 'flight-Telemetry.csv', text: telemetryCsv() });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('altusmetrum');
    const a = analyzeFlight(result.flight);
    const apogeeM = a.metrics.apogeeAltitude;
    // ~230 m. Crucially, the stale ptype=8 GPS rows (height 99999) were filtered out —
    // otherwise apogee would read tens of thousands of metres.
    expect(apogeeM).toBeGreaterThan(180);
    expect(apogeeM).toBeLessThan(300);
  });
});

describe('detection is token-anchored, not substring', () => {
  it('does not treat a CSV that merely contains "vraw" as an Eggtimer file', () => {
    // "vraw_x"/"vfilt_y" are column names, not the bare VRaw/VFilt tokens.
    const text = ['time,vraw_x,vfilt_y,alt', '0,1,2,0', '0.1,1,2,5', '0.2,1,2,9'].join('\n');
    const result = importFlight({ name: 'data.csv', text });
    expect(result.kind).toBe('mapping');
  });
});

describe('units-row detection does not misfire on terse headers', () => {
  it('keeps a short header (T,M,S) as names, not units, when there is no real names row above', () => {
    const rows = [
      ['# my logger'],
      ['T', 'M', 'S'],
      ['0', '0', '0'],
      ['0.1', '5', '12'],
      ['0.2', '20', '30'],
    ];
    const t = analyzeTable(rows);
    expect(t.headers).toEqual(['T', 'M', 'S']);
    expect(t.dataRows.length).toBe(3);
  });
});

describe('real-world messiness: CRLF, trailing commas, blank lines', () => {
  it('parses an Eggtimer Classic export with CRLF and a trailing blank line', () => {
    const text = 'T,Alt,VRaw,VFilt\r\n0,0,0,0\r\n100,2,20,7\r\n200,19,170,69\r\n\r\n';
    const result = importFlight({ name: 'flight.csv', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('eggtimer');
  });

  it('handles a generic CSV with a trailing comma / empty last column', () => {
    const rows = [
      'Time (s),Altitude (m),',
      '0,0,',
      '0.1,5,',
      '0.2,20,',
    ].join('\n');
    const result = importFlight({ name: 'data.csv', text: rows });
    // Either auto-maps or offers a mapping — must not throw and must see the columns.
    if (result.kind === 'mapping') {
      expect(result.table.headers.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Altus Metrum: real files use a single "speed" column, not accel_speed', () => {
  const sample = [
    '# Altus Metrum',
    '# serial 2098',
    'version,serial,flight,call,time,state,state_name,acceleration,pressure,altitude,height,speed,temperature,battery_voltage,altitude,latitude',
    '6,2098,12,KD9LJW,-1.0,3,boost,3.6,98235,260,0,0,28,3.9,218,41.4',
    '6,2098,12,KD9LJW,0.0,3,boost,80,97000,300,40,90,28,3.9,218,41.4',
    '6,2098,12,KD9LJW,0.5,4,fast,0,90000,800,540,120,27,3.9,218,41.4',
  ].join('\n');

  it('detects and maps the speed column to velocity', () => {
    const result = importFlight({ name: 'TeleMetrum.csv', text: sample });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('altusmetrum');
    expect(getChannel(result.flight, 'velocity')).toBeTruthy();
    expect(getChannel(result.flight, 'altitude')).toBeTruthy(); // from "height"
  });
});

describe('Altus Metrum parser', () => {
  const sample = [
    '# Altus Metrum',
    '# serial 1234',
    '# flight 7',
    'version,serial,flight,call,time,clock,rssi,lqi,state,state_name,acceleration,pressure,altitude,height,accel_speed,baro_speed,temperature,battery_voltage,drogue_voltage,main_voltage',
    '5,1234,7,N0CALL,-1.00,0,0,0,0,pad,0.1,1013.25,100,0,0,0,20,7.4,0,0',
    '5,1234,7,N0CALL,0.00,0,0,0,1,boost,150,1013.25,100,0,0,0,20,7.4,0,0',
    '5,1234,7,N0CALL,0.10,0,0,0,1,boost,150,1000.0,110,10,40,5,20,7.4,0,0',
    '5,1234,7,N0CALL,0.20,0,0,0,2,fast,0,980.0,130,30,80,12,20,7.4,0,0',
  ].join('\n');

  it('detects and parses an AltOS export', () => {
    const result = importFlight({ name: 'flight.csv', text: sample });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('altusmetrum');
    const flight = result.flight;
    // height is AGL in metres; velocity comes from accel_speed.
    expect(getChannel(flight, 'altitude')!.unit).toBe('m');
    expect(getChannel(flight, 'velocity')).toBeTruthy();
    expect(getChannel(flight, 'accelAxial')).toBeTruthy();
  });
});
