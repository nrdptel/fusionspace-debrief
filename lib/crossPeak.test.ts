import { describe, it, expect } from 'vitest';
import { peakAgreement, peakTimeTolerance } from './crossPeak';

// The case this exists for is in the corpus: a GPS altitude solution that lags so far
// behind the flight that it sits at pad level through the whole climb and peaks 34 s later,
// under drogue, at 742 m against a 762 m barometric apogee. Judged on height alone that is
// a 2.7% agreement — a wrong number wearing a green badge.

describe('peakAgreement', () => {
  it('agrees when both the height and the instant line up', () => {
    expect(peakAgreement({ value: 2880, time: 23.1 }, { value: 2836, time: 22.4 })).toBe('agree');
  });

  it('differs when they saw the same instant and disagree about the height', () => {
    expect(peakAgreement({ value: 3400, time: 22.6 }, { value: 2836, time: 22.4 })).toBe('differ');
  });

  it('refuses to call a coincidence corroboration', () => {
    // sg1.1: 742 m at t=46.7 s against 762 m at t=13.0 s.
    expect(peakAgreement({ value: 742, time: 46.7 }, { value: 762, time: 13.0 })).toBe(
      'different-peak',
    );
  });

  it('is decided by time first, whatever the heights say', () => {
    // Even an exact height match is not corroboration when the instants can't be the same.
    expect(peakAgreement({ value: 762, time: 46.7 }, { value: 762, time: 13.0 })).toBe(
      'different-peak',
    );
  });

  it('falls back to the heights when a recording has no time', () => {
    expect(peakAgreement({ value: 2880, time: null }, { value: 2836, time: 22.4 })).toBe('agree');
    expect(peakAgreement({ value: 3400, time: 22.6 }, { value: 2836, time: null })).toBe('differ');
  });

  it('never divides by a nonsense apogee', () => {
    expect(peakAgreement({ value: 100, time: null }, { value: 0, time: null })).toBe('differ');
  });
});

describe('peakTimeTolerance', () => {
  it('has a floor for a short flight, and scales with a long one', () => {
    expect(peakTimeTolerance(4)).toBe(2); // a 1 Hz receiver still needs a couple of seconds
    expect(peakTimeTolerance(40)).toBe(6);
  });

  it('keeps a genuine pair of recordings together', () => {
    // The corpus's redundant pairs sit within a second of each other.
    expect(peakAgreement({ value: 2880, time: 23.1 }, { value: 2836, time: 22.4 })).not.toBe(
      'different-peak',
    );
  });
});
