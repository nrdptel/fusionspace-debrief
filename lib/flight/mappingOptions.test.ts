import { describe, it, expect } from 'vitest';
import { prefillUnit, unitOptionsFor } from './mappingOptions';

describe('the unit a column arrives preselected with', () => {
  it('keeps a Fahrenheit the file actually stated', () => {
    // The wrong number this closes. A PerfectFlite StratoLogger writes its temperature as
    // `58.7F` in every cell; `unitFromCells` resolves that to the canonical `'f'` correctly, and
    // the mapper then threw it away because its own options are spelled `'F'`. The column
    // arrived as Celsius, and 58.7 °C is 138 °F on the report — which is what a cold walk of the
    // built app measured before this was traced.
    expect(prefillUnit('temperature', 'f')).toBe('F');
    expect(prefillUnit('temperature', 'F')).toBe('F');
    expect(prefillUnit('temperature', 'k')).toBe('K');
  });

  it('answers in the option list’s own spelling, never the caller’s', () => {
    // What is stored has to be a string this module offers, or the <select> shows no selection
    // and `build.ts` looks up a converter that isn't there.
    for (const role of ['temperature', 'altitude', 'velocity', 'pressure'] as const) {
      for (const opt of unitOptionsFor(role)) {
        expect(prefillUnit(role, opt.toLowerCase()), `${role}/${opt}`).toBe(opt);
        expect(prefillUnit(role, opt.toUpperCase()), `${role}/${opt}`).toBe(opt);
        expect(unitOptionsFor(role), `${role}/${opt}`).toContain(prefillUnit(role, opt));
      }
    }
  });

  it('falls back to the first option when the file said nothing it can use', () => {
    // Unchanged behaviour, and the reason the defect was silent: this is a perfectly reasonable
    // default, so nothing looked wrong when a correctly-read unit fell through to it.
    expect(prefillUnit('temperature', null)).toBe('C');
    expect(prefillUnit('temperature', undefined)).toBe('C');
    expect(prefillUnit('temperature', '')).toBe('C');
    // A unit that belongs to a different quantity is not smuggled in.
    expect(prefillUnit('temperature', 'ft')).toBe('C');
    expect(prefillUnit('altitude', 'kPa')).toBe('ft');
  });

  it('says nothing for a role that offers no units', () => {
    // `rollAngle` and `tilt` deliberately have no entry — see the comment on UNIT_OPTIONS. An
    // empty string is what the mapper stores, and `build.ts` passes the column through untouched.
    expect(prefillUnit('rollAngle', 'deg')).toBe('');
    expect(prefillUnit('tilt', 'deg')).toBe('');
  });

  it('is not fooled by surrounding whitespace', () => {
    expect(prefillUnit('temperature', ' f ')).toBe('F');
    expect(prefillUnit('velocity', ' MPH ')).toBe('mph');
  });
});
