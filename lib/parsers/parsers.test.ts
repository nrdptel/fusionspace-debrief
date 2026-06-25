import { describe, it, expect } from 'vitest';
import { resolveUnit, convert } from '../units';
import { detectDelimiter, splitLine } from '../csv';
import { analyzeTable } from '../flight/columns';
import { importFlight } from './index';
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
    expect(getChannel(flight, 'altitude')).toBeTruthy();
    expect(getChannel(flight, 'velocity')).toBeTruthy();
    expect(getChannel(flight, 'pressure')!.unit).toBe('Pa');
    // 1013.25 mBar -> ~101325 Pa
    expect(getChannel(flight, 'pressure')!.values[0]).toBeCloseTo(101325, -1);
  });
});
