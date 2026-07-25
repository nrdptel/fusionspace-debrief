import { describe, it, expect } from 'vitest';
import { plotSvg } from './svgChart';

const x = Array.from({ length: 50 }, (_, i) => i * 0.1);
const altitude = x.map((t, i) => (i < 25 ? i * 40 : Math.max(0, 1000 - (i - 25) * 30)));
const mach = x.map((_, i) => (i < 25 ? i * 0.05 : Math.max(0, 1.2 - (i - 25) * 0.04)));

describe('plotSvg', () => {
  const svg = plotSvg({
    x,
    series: [
      { label: 'Altitude (ft)', color: '#6366f1', axis: 'left', values: altitude },
      { label: 'Mach', color: '#10b981', axis: 'right', values: mach },
    ],
    xLabel: 'Time (s)',
    leftLabel: 'ft',
    rightLabel: 'Mach',
  });

  it('produces a valid, self-contained SVG document', () => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg.trim()).toMatch(/<\/svg>$/);
    expect(svg).not.toContain('http://'.replace('http', 'xlink')); // no external refs
  });

  it('draws one path per series in its colour, with axis labels and a legend', () => {
    expect((svg.match(/<path /g) ?? []).length).toBe(2);
    expect(svg).toContain('stroke="#6366f1"');
    expect(svg).toContain('stroke="#10b981"');
    expect(svg).toContain('Time (s)'); // x-axis label
    expect(svg).toContain('Altitude (ft)'); // legend entry
  });

  it('breaks a series path at NaN gaps rather than drawing across them', () => {
    const gappy = altitude.slice();
    gappy[20] = NaN;
    const s = plotSvg({ x, series: [{ label: 'a', color: '#000', axis: 'left', values: gappy }], xLabel: 't', leftLabel: 'ft' });
    const path = s.match(/<path d="([^"]+)"/)![1];
    expect((path.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(2); // pen lifts and restarts
  });

  it('draws labelled event markers inside the x-range and skips ones outside it', () => {
    const s = plotSvg({
      x,
      series: [{ label: 'alt', color: '#000', axis: 'left', values: altitude }],
      xLabel: 't',
      leftLabel: 'ft',
      markers: [
        { x: 1.2, label: 'apogee', color: '#22c55e' },
        { x: 999, label: 'off-range', color: '#f00' },
      ],
    });
    expect(s).toContain('stroke-dasharray="3 3"'); // the marker rule
    expect(s).toContain('>apogee<');
    expect(s).not.toContain('>off-range<'); // outside the x-range, skipped
  });

  it('escapes labels and returns a bare frame when there is no finite data', () => {
    const s = plotSvg({ x: [0, 1], series: [{ label: 'x', color: '#000', axis: 'left', values: [NaN, NaN] }], xLabel: 'a & b', leftLabel: '' });
    expect(s).toContain('<svg');
    expect(s).not.toContain('<path'); // nothing finite to draw
    const titled = plotSvg({ x, series: [{ label: 'v', color: '#000', axis: 'left', values: altitude }], xLabel: 't', leftLabel: 'ft', title: 'a & <b>' });
    expect(titled).toContain('a &amp; &lt;b&gt;');
  });
});

describe('plotSvg — framing a window inside the record', () => {
  // A record that holds a long pad wait before a short flight: 300 s at zero, then a
  // 20 s arc. Drawn whole, the arc is the last 6% of the axis and its shape is lost.
  const x = Float64Array.from({ length: 320 }, (_, i) => i);
  const alt = Float64Array.from(x, (t) => (t < 300 ? 0 : Math.max(0, 100 - (t - 310) * (t - 310))));

  it('draws only the requested window, and ranges y inside it', () => {
    const whole = plotSvg({ x, series: [{ label: 'alt', color: '#000', axis: 'left', values: Array.from(alt) }], xLabel: 't', leftLabel: 'm' });
    const framed = plotSvg({
      x,
      series: [{ label: 'alt', color: '#000', axis: 'left', values: Array.from(alt) }],
      xLabel: 't',
      leftLabel: 'm',
      xRange: [299, 320],
    });
    expect(framed).not.toBe(whole);
    // The whole-record figure's axis starts at the file; the framed one at the flight.
    expect(whole).toContain('>0<');
    expect(framed).toContain('>300<');
    expect(framed).not.toContain('>50<'); // no tick at 50 s — that stretch isn't in view
  });

  it('clamps a window wider than the record rather than drawing into a corner', () => {
    const wide = plotSvg({ x, series: [{ label: 'alt', color: '#000', axis: 'left', values: Array.from(alt) }], xLabel: 't', leftLabel: 'm', xRange: [-1000, 5000] });
    const whole = plotSvg({ x, series: [{ label: 'alt', color: '#000', axis: 'left', values: Array.from(alt) }], xLabel: 't', leftLabel: 'm' });
    expect(wide).toBe(whole);
  });
});
