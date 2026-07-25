import { describe, it, expect } from 'vitest';
import {
  SYSTEM_UNITS,
  decodeUnits,
  encodeUnits,
  fmtAccel,
  fmtLength,
  fmtPressure,
  fmtSpeed,
  fmtTemp,
  isSystem,
  speedIn,
  systemOf,
  unitsOf,
  type Units,
} from './display';

describe('per-quantity units', () => {
  const custom: Units = { length: 'ft', speed: 'mph', accel: 'm/s²', temp: '°C', pressure: 'kPa' };

  it('resolves either a named system or an explicit set', () => {
    expect(unitsOf('imperial')).toEqual(SYSTEM_UNITS.imperial);
    expect(unitsOf('metric')).toEqual(SYSTEM_UNITS.metric);
    expect(unitsOf(custom)).toBe(custom);
  });

  it('formats each quantity in its own chosen unit', () => {
    // 300 m/s is 671 mph; 200 m/s² is 200 m/s² (not 20.4 g).
    expect(fmtSpeed(300, custom)).toBe('671 mph');
    expect(fmtAccel(200, custom)).toBe('200 m/s²');
    // …while the untouched quantities keep the unit that was chosen for them.
    expect(fmtLength(1000, custom)).toBe('3,281 ft');
    expect(fmtTemp(20, custom)).toBe('20 °C');
    expect(fmtPressure(100000, custom)).toBe('100 kPa');
  });

  it('keeps a value in g to one decimal and one in m/s² to none', () => {
    // The same acceleration: 1.5 g reads as a decimal, 15 m/s² as a whole number.
    expect(fmtAccel(14.71, 'imperial')).toBe('1.5 g');
    expect(fmtAccel(14.71, { ...SYSTEM_UNITS.metric, accel: 'm/s²' })).toBe('15 m/s²');
  });

  it('reports the system a choice sits closest to, for the inputs still keyed to one', () => {
    expect(systemOf('imperial')).toBe('imperial');
    expect(systemOf(custom)).toBe('imperial'); // altitude in feet → ounces and inches
    expect(systemOf({ ...custom, length: 'm' })).toBe('metric');
  });

  it('knows when a choice is exactly a named system', () => {
    expect(isSystem('imperial', 'imperial')).toBe(true);
    expect(isSystem(SYSTEM_UNITS.metric, 'metric')).toBe(true);
    expect(isSystem(custom, 'imperial')).toBe(false);
    expect(isSystem(custom, 'metric')).toBe(false);
  });

  it('every speed unit converts', () => {
    for (const speed of ['ft/s', 'mph', 'm/s', 'km/h', 'kt'] as const) {
      const v = speedIn(100, { ...SYSTEM_UNITS.imperial, speed });
      expect(Number.isFinite(v), speed).toBe(true);
      expect(v, speed).toBeGreaterThan(0);
    }
    expect(speedIn(100, { ...SYSTEM_UNITS.imperial, speed: 'km/h' })).toBeCloseTo(360, 0);
    expect(speedIn(100, { ...SYSTEM_UNITS.imperial, speed: 'kt' })).toBeCloseTo(194.4, 1);
  });
});

describe('encoding a unit choice', () => {
  it('round-trips a named system and a custom set', () => {
    expect(encodeUnits('imperial')).toBe('ft');
    expect(encodeUnits('metric')).toBe('m');
    expect(decodeUnits('ft')).toBe('imperial');
    expect(decodeUnits('m')).toBe('metric');
    const custom: Units = { length: 'm', speed: 'kt', accel: 'ft/s²', temp: '°F', pressure: 'psi' };
    expect(decodeUnits(encodeUnits(custom))).toEqual(custom);
  });

  it('still reads the older spellings, so an old shared link keeps working', () => {
    expect(decodeUnits('metric')).toBe('metric');
    expect(decodeUnits('imperial')).toBe('imperial');
  });

  it('rejects anything that isn’t a unit choice rather than half-parsing it', () => {
    expect(decodeUnits(null)).toBeNull();
    expect(decodeUnits('')).toBeNull();
    expect(decodeUnits('ft.mph')).toBeNull(); // too few
    expect(decodeUnits('ft.furlongs/fortnight.g.°F.psi')).toBeNull(); // unknown speed
    expect(decodeUnits('nonsense')).toBeNull();
  });

  it('a set that equals a system encodes as that system, so links stay short', () => {
    expect(encodeUnits(SYSTEM_UNITS.imperial)).toBe('ft');
    expect(encodeUnits(SYSTEM_UNITS.metric)).toBe('m');
  });
});
