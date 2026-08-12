import { describe, it, expect } from 'vitest';
import { plotSvg } from './svgChart';
import { SYNTHETIC_BAND, SYNTHETIC_SHORT, syntheticBandLine } from './synthetic';

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

/**
 * **An image is the sink an unlabelled figure travels furthest through.** A `.png` or `.svg` of a
 * plot goes into a forum post or a cert document with no report around it, no file to re-read and
 * no metadata block anyone will open — so a caveat that lives beside the image on screen reaches
 * none of that, and the claim is drawn ON the figure.
 */
describe('plotSvg — a figure of a flight Debrief made up', () => {
  const base = {
    x: Float64Array.from([0, 1, 2]),
    series: [{ label: 'Altitude', color: '#4f39f6', axis: 'left' as const, values: Float64Array.from([0, 50, 100]) }],
    xLabel: 'Time (s)',
    leftLabel: 'ft',
  };

  it('draws the claim in a band, and moves the plot down rather than over it', () => {
    const plain = plotSvg(base);
    const marked = plotSvg({ ...base, syntheticNote: SYNTHETIC_SHORT });
    expect(marked).toContain(SYNTHETIC_SHORT);
    expect(marked).toContain(SYNTHETIC_BAND.fill);
    expect(marked).toContain(SYNTHETIC_BAND.ink);
    /**
     * **The PLOT FRAME moved down and kept its height, and reading the right element is the whole
     * assertion.** A chart's top-left is where the first series' peak is drawn, so a band painted
     * over it covers the trace the figure exists to show.
     *
     * The first version of this matched "the first `<rect>` with a `y`" in each string — which is
     * the plot frame in `plain` and the BAND'S OWN rect in `marked`. It compared two different
     * elements, so it said only "a band was drawn". A pre-push review built the mutant (band drawn,
     * plot NOT moved) and it passed verbatim; two SINKS rows pointed at this test by name. Matched
     * on the frame's own `x` now, which is `mL` and the same in both figures.
     */
    const frame = (svg: string) => svg.match(/<rect x="62" y="(\d+(?:\.\d+)?)" width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
    const [, plainY, , plainH] = frame(plain)!;
    const [, markedY, , markedH] = frame(marked)!;
    expect(Number(markedY) - Number(plainY), 'the plot frame moved down by exactly the band').toBe(34);
    // …and the FIGURE grew rather than the plot being squeezed into a fixed height. The first cut
    // grew the top margin alone and compressed the plot 380 → 346 px, rescaling every gridline, so
    // a demonstration's figure was a differently-shaped plot rather than the real one with a band.
    expect(markedH, 'the plot keeps its height — the figure grew').toBe(plainH);
    expect(marked).toContain(`height="${460 + 34}"`);
    expect(plain).toContain('height="460"');
  });

  it('names WHICH rather than how many, and never makes a singular claim about several flights', () => {
    // A comparison figure holds a demonstration beside a recording, and the sibling export packed
    // in the same bundle answers this by TAGGING each made-up column rather than counting —
    // `PROVENANCE_MIXED`'s own docblock rejects a count by name. Two documents in one ZIP phrasing
    // one question two ways is the failure this module exists to prevent, so the band points at
    // the legend and the legend carries `syntheticHeader`.
    expect(syntheticBandLine(1, 3)).toBe(
      'SYNTHETIC — some of these flights are ones Debrief made up, not flown; each is tagged in the legend.',
    );
    expect(syntheticBandLine(2, 3)).toBe(syntheticBandLine(1, 3));
    // **A multi-flight figure never gets the SINGULAR sentence.** `SYNTHETIC_SHORT` says "Debrief
    // made this flight up", which is a false claim over a two-trace image.
    expect(syntheticBandLine(3, 3)).toBe('SYNTHETIC — all 3 of these flights are ones Debrief made up, not flown.');
    expect(syntheticBandLine(1, 1), 'one flight takes the one-flight sentence').toBe(SYNTHETIC_SHORT);
    expect(syntheticBandLine(0, 3), 'a figure of recordings says nothing').toBeNull();
  });

  it('carries the claim on the DEGENERATE figure too, where there is no trace to draw', () => {
    // The early return for an all-non-finite series is a live path — a flyer picks which channel to
    // plot — and the first cut returned a bare document from it, so a made-up flight's figure could
    // leave with no claim at all. One band, emitted from one place, on both exits.
    const empty = plotSvg({ ...base, series: [{ ...base.series[0], values: Float64Array.from([NaN, NaN, NaN]) }], syntheticNote: SYNTHETIC_SHORT });
    expect(empty).toContain(SYNTHETIC_SHORT);
    expect(empty).toContain(SYNTHETIC_BAND.fill);
  });

  it('leaves a figure of recordings byte-identical to what it drew before the claim existed', () => {
    // The other direction, and the one that stops the band becoming furniture: a real flight's
    // figure is not reshaped for a demonstration's sake.
    expect(plotSvg({ ...base, syntheticNote: null })).toBe(plotSvg(base));
    expect(plotSvg({ ...base, syntheticNote: syntheticBandLine(0, 2) })).toBe(plotSvg(base));
  });

  it('escapes the band text, because it is drawn into markup', () => {
    // Every other string this writer takes goes through `xmlEscape`; a new one that does not is how
    // a label breaks the document it is written into.
    expect(plotSvg({ ...base, syntheticNote: 'a & b <c>' })).toContain('a &amp; b &lt;c&gt;');
  });
});
