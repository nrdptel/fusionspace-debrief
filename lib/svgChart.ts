// Render the explorer's plotted data to a standalone SVG — a vector export, so a
// flyer can drop a crisp, scalable chart straight into a report, cert document or
// slide (and recolour it in the document if they like), rather than a fixed-size
// PNG. Pure and framework-free: it takes the same series the on-screen chart draws
// and returns an SVG string; nothing here touches the DOM or the network.

export interface SvgSeries {
  label: string;
  color: string;
  /** Which y-axis this series is read against (mixed units use a right axis). */
  axis: 'left' | 'right';
  values: Float64Array | number[];
}

export interface SvgMarker {
  x: number;
  label: string;
  color: string;
}

export interface SvgChartOpts {
  x: Float64Array | number[];
  series: SvgSeries[];
  xLabel: string;
  leftLabel: string;
  rightLabel?: string;
  title?: string;
  /** Event markers (liftoff, apogee, …) drawn as labelled vertical rules. */
  markers?: SvgMarker[];
  width?: number;
  height?: number;
  dark?: boolean;
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

function finiteExtent(values: (Float64Array | number[])[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const arr of values) {
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** A "nice" round step for an axis of `n` ticks over [min, max]. */
function niceStep(min: number, max: number, n: number): number {
  const raw = (max - min) / Math.max(1, n - 1);
  if (!(raw > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nice * pow;
}

function ticksFor(min: number, max: number, n = 5): number[] {
  if (!(max > min)) return [min];
  const step = niceStep(min, max, n);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.5; v += step) out.push(v);
  return out;
}

/** Compact tick label — enough precision for the step, without trailing noise. */
function fmt(v: number, step: number): string {
  const places = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step)));
  return (Math.round(v * 10 ** places) / 10 ** places).toLocaleString('en-US', { maximumFractionDigits: places });
}

/** Render a line chart of `series` against `x` to an SVG document string. */
export function plotSvg(opts: SvgChartOpts): string {
  const width = opts.width ?? 900;
  const height = opts.height ?? 460;
  const dark = opts.dark ?? false;
  const ink = dark ? '#e4e4e7' : '#27272a';
  const faint = dark ? '#3f3f46' : '#e4e4e7';
  const sub = dark ? '#a1a1aa' : '#71717a';
  const bg = dark ? '#09090b' : '#ffffff';

  const left = opts.series.filter((s) => s.axis === 'left');
  const right = opts.series.filter((s) => s.axis === 'right');
  const hasRight = right.length > 0;

  const mL = 62;
  const mR = hasRight ? 62 : 22;
  const mT = opts.title ? 52 : 34;
  const mB = 46;
  const plotL = mL;
  const plotT = mT;
  const plotW = Math.max(1, width - mL - mR);
  const plotH = Math.max(1, height - mT - mB);

  const xExt = finiteExtent([opts.x]);
  const lExt = finiteExtent(left.map((s) => s.values));
  const rExt = finiteExtent(right.map((s) => s.values));
  if (!xExt || (!lExt && !rExt)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${bg}"/></svg>`;
  }
  const [xMin, xMax] = xExt;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">`);
  parts.push(`<rect width="${width}" height="${height}" fill="${bg}"/>`);
  if (opts.title) parts.push(`<text x="${mL}" y="26" font-size="15" font-weight="600" fill="${ink}">${xmlEscape(opts.title)}</text>`);

  const sx = (v: number) => plotL + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const syFor = (ext: [number, number]) => (v: number) => plotT + plotH - ((v - ext[0]) / (ext[1] - ext[0] || 1)) * plotH;

  // Left-axis gridlines + ticks (the reference grid), then the frame.
  const axisExt = lExt ?? rExt!;
  const syL = syFor(axisExt);
  const lStep = niceStep(axisExt[0], axisExt[1], 5);
  for (const t of ticksFor(axisExt[0], axisExt[1])) {
    const y = syL(t);
    parts.push(`<line x1="${plotL}" y1="${y.toFixed(1)}" x2="${plotL + plotW}" y2="${y.toFixed(1)}" stroke="${faint}" stroke-width="1"/>`);
    parts.push(`<text x="${plotL - 8}" y="${(y + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="${sub}">${fmt(t, lStep)}</text>`);
  }
  if (hasRight && rExt) {
    const syR = syFor(rExt);
    const rStep = niceStep(rExt[0], rExt[1], 5);
    for (const t of ticksFor(rExt[0], rExt[1])) {
      const y = syR(t);
      parts.push(`<text x="${plotL + plotW + 8}" y="${(y + 4).toFixed(1)}" font-size="11" text-anchor="start" fill="${sub}">${fmt(t, rStep)}</text>`);
    }
  }

  // X ticks.
  const xStep = niceStep(xMin, xMax, 6);
  for (const t of ticksFor(xMin, xMax, 6)) {
    const x = sx(t);
    parts.push(`<line x1="${x.toFixed(1)}" y1="${plotT}" x2="${x.toFixed(1)}" y2="${plotT + plotH}" stroke="${faint}" stroke-width="1"/>`);
    parts.push(`<text x="${x.toFixed(1)}" y="${plotT + plotH + 18}" font-size="11" text-anchor="middle" fill="${sub}">${fmt(t, xStep)}</text>`);
  }
  parts.push(`<rect x="${plotL}" y="${plotT}" width="${plotW}" height="${plotH}" fill="none" stroke="${ink}" stroke-width="1"/>`);

  // Event markers — labelled vertical rules, drawn under the series lines.
  for (const m of opts.markers ?? []) {
    if (!Number.isFinite(m.x) || m.x < xMin || m.x > xMax) continue;
    const mx = sx(m.x);
    parts.push(`<line x1="${mx.toFixed(1)}" y1="${plotT}" x2="${mx.toFixed(1)}" y2="${plotT + plotH}" stroke="${m.color}" stroke-width="1" stroke-dasharray="3 3" opacity="0.85"/>`);
    parts.push(`<text x="${(mx + 3).toFixed(1)}" y="${plotT + 11}" font-size="10" fill="${m.color}">${xmlEscape(m.label)}</text>`);
  }

  // Axis labels.
  parts.push(`<text x="${plotL + plotW / 2}" y="${height - 8}" font-size="12" text-anchor="middle" fill="${ink}">${xmlEscape(opts.xLabel)}</text>`);
  if (opts.leftLabel) parts.push(`<text transform="translate(16 ${plotT + plotH / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${ink}">${xmlEscape(opts.leftLabel)}</text>`);
  if (hasRight && opts.rightLabel) parts.push(`<text transform="translate(${width - 14} ${plotT + plotH / 2}) rotate(90)" font-size="12" text-anchor="middle" fill="${ink}">${xmlEscape(opts.rightLabel)}</text>`);

  // Series paths.
  for (const s of opts.series) {
    const ext = s.axis === 'right' && rExt ? rExt : axisExt;
    const sy = syFor(ext);
    let d = '';
    let pen = false;
    for (let i = 0; i < s.values.length && i < opts.x.length; i++) {
      const xv = opts.x[i];
      const yv = s.values[i];
      if (Number.isFinite(xv) && Number.isFinite(yv)) {
        d += `${pen ? 'L' : 'M'}${sx(xv).toFixed(1)} ${sy(yv).toFixed(1)} `;
        pen = true;
      } else {
        pen = false;
      }
    }
    if (d) parts.push(`<path d="${d.trim()}" fill="none" stroke="${s.color}" stroke-width="1.75" stroke-linejoin="round"/>`);
  }

  // Legend.
  let lx = plotL;
  const ly = opts.title ? 40 : 22;
  for (const s of opts.series) {
    parts.push(`<rect x="${lx}" y="${ly - 9}" width="12" height="12" rx="2" fill="${s.color}"/>`);
    parts.push(`<text x="${lx + 17}" y="${ly + 1}" font-size="11" fill="${ink}">${xmlEscape(s.label)}</text>`);
    lx += 30 + s.label.length * 6.2;
  }

  parts.push('</svg>');
  return parts.join('\n');
}
