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
export function savePlotPng(host: HTMLElement | null | undefined, opts: { dark: boolean; filename: string }): void {
  const canvas = host?.querySelector('canvas');
  if (!canvas) return;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = opts.dark ? '#09090b' : '#ffffff'; // solid background, not transparent
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  out.toBlob((blob) => blob && download(blob, opts.filename));
}
