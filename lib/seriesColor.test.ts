import { describe, it, expect } from 'vitest';
import { withSeriesColors } from './seriesColor';

describe('the flyer’s series colours', () => {
  const flights = [
    { id: 'a', color: '#6366f1' },
    { id: 'b', color: '#10b981' },
    { id: 'c', color: '#f59e0b' },
  ];

  it('overrides only the flights the flyer chose, leaving the palette for the rest', () => {
    // An override MAP, not a replacement palette: colouring one flight must not make the flyer
    // colour the other five, and a flight they never touched keeps whatever the palette
    // assigns — including a palette that changes later.
    const out = withSeriesColors(flights, { b: '#ff0000' });
    expect(out.map((f) => f.color)).toEqual(['#6366f1', '#ff0000', '#f59e0b']);
  });

  it('returns the same array when nothing is overridden', () => {
    // Identity, not a copy: this sits in a `useMemo` feeding the chart, and a fresh array every
    // render would re-initialise uPlot and throw away the flyer's zoom.
    expect(withSeriesColors(flights, {})).toBe(flights);
  });

  it('ignores an id that is not in this comparison', () => {
    const out = withSeriesColors(flights, { zzz: '#ff0000' });
    expect(out.map((f) => f.color)).toEqual(['#6366f1', '#10b981', '#f59e0b']);
  });

  it('does not mutate the flights it was given', () => {
    const before = flights.map((f) => f.color);
    withSeriesColors(flights, { a: '#123456' });
    expect(flights.map((f) => f.color)).toEqual(before);
  });
});
