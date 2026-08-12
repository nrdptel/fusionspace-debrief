// Save a plot as a PNG a flyer can put in a cert document.
//
// This is `lib/copyTable.ts`'s sibling and is written to match it: a table's answer to "get this
// into my write-up" is copy-paste, and a chart's is an image file. Both are one job the app does
// from several surfaces, and both belong in one place for the same reason.
//
// **It existed three times, byte for byte.** `FlightReport`, `CompareView` and `ChannelExplorer`
// each carried the same eleven-line body, differing only in which ref they read and what they
// called the file (the declarations differed in form too — one `function`, two `const`) — the `ACTION_BTN`-in-six-files shape `ROADMAP.md`'s P1 opening audit removed
// once already, restarted for chart export. Three copies of a canvas composite is three places for
// a transparent background or a device-pixel-ratio bug to be fixed in two of.
//
// Two details are load-bearing and were in all three copies, so they are kept and stated here
// rather than left to be rediscovered:
//
//   - **The background is filled before the plot is drawn.** A `<canvas>` is transparent where
//     nothing was painted, and a transparent PNG dropped into a light document shows a flight drawn
//     in near-black on near-black when it was captured in dark mode. The fill is the page's own
//     background, so the image matches the screen it was taken from.
//
//     **And that is why it takes the PAGE theme rather than the figure theme, which is the first
//     thing a reader will want to change.** `useFigureDark` governs the exported SVG, which is
//     re-rendered from the data and can be drawn in either scheme. This is not: it composites the
//     LIVE canvas, whose pixels uPlot already drew in the page's theme. Filling a light background
//     under a dark-themed plot would be strictly worse than what it does now. Making the PNG follow
//     the figure theme means re-rendering the chart off-screen, which is a real change and not a
//     one-line swap of `dark` for `figureDark`.
//   - **The copy goes through a second canvas** rather than calling `toBlob` on uPlot's own. The
//     plot's canvas is live — uPlot redraws it on hover, on a units change and on a resize — so
//     encoding it directly races the cursor.

import { download } from './download';
import { SYNTHETIC_BAND } from './synthetic';

/**
 * Write the first `<canvas>` inside `host` to a PNG download.
 *
 * `host` is an element rather than the canvas itself because every call site holds a ref to the
 * container: uPlot owns the canvas and replaces it, so a ref to the canvas goes stale on the first
 * resize while a ref to what contains it does not.
 *
 * Does nothing where there is no canvas or no 2D context — a plot that has not drawn yet is not an
 * error, and a surface that offers the button before the chart exists is a separate defect from
 * this one.
 */
export function savePlotPng(
  host: HTMLElement | null | undefined,
  opts: { dark: boolean; filename: string; syntheticNote?: string | null },
): void {
  const canvas = host?.querySelector('canvas');
  if (!canvas) return;
  // **A made-up flight's plot says so ON the image, above the plot rather than over it.** The
  // canvas GROWS by the band's height instead of the band being drawn on top: a chart's top-left
  // is where uPlot puts the first series' peak, so overlaying would cover the very trace the figure
  // exists to show. Same band as the SVG export beside it and the shareable card
  // (`lib/synthetic.ts#SYNTHETIC_BAND`) — one answer, three renderers, because an image is the sink
  // an unlabelled figure travels furthest through: it leaves with no report around it, no file to
  // re-read and no metadata block anyone will open.
  //
  // Scaled by the canvas's own device-pixel ratio rather than assuming 1: `canvas.width` is device
  // pixels and `clientWidth` is CSS pixels, so a band sized in CSS pixels renders half-height on a
  // 2× display — legible on the machine it was written on and not on a laptop.
  //
  // The IMAGE grows and the plot is drawn below at full size — the SVG writer does the same, and
  // its first cut did not: it grew the top margin inside a fixed height and compressed the plot by
  // 9%, so one chart's `.svg` and `.png` in one bundle had different aspect ratios.
  const note = opts.syntheticNote ?? null;
  const dpr = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1;
  const bandH = note ? Math.round(34 * dpr) : 0;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height + bandH;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = opts.dark ? '#09090b' : '#ffffff'; // solid background, not transparent
  ctx.fillRect(0, 0, out.width, out.height);
  if (note) {
    const pad = Math.round(8 * dpr);
    ctx.fillStyle = SYNTHETIC_BAND.fill;
    ctx.fillRect(pad, pad, out.width - pad * 2, bandH - pad * 2);
    ctx.strokeStyle = SYNTHETIC_BAND.edge;
    ctx.lineWidth = Math.max(1, Math.round(2 * dpr));
    ctx.strokeRect(pad, pad, out.width - pad * 2, bandH - pad * 2);
    ctx.fillStyle = SYNTHETIC_BAND.ink;
    ctx.font = `700 ${Math.round(14 * dpr)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textBaseline = 'middle';
    // **`maxWidth`, because the chart's width is the phone's.** Without it `fillText` clips at the
    // canvas edge and the claim renders as a shorter sentence that reads as finished: measured at
    // this font, the band needs ~550 CSS px and a 390 px phone gives the chart ~350, so
    // "…are ones Debrief made up, not flown." simply stops. A condensed sentence is legible and
    // true; a truncated one is neither. `FlightCard` measures and truncates every string it draws
    // for the same reason, and this copy of the band had dropped that half.
    const textX = pad + Math.round(12 * dpr);
    ctx.fillText(note, textX, Math.round(bandH / 2), Math.max(1, out.width - textX - pad));
  }
  ctx.drawImage(canvas, 0, bandH);
  out.toBlob((blob) => blob && download(blob, opts.filename));
}
