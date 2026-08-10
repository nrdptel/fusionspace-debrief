'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlightMetrics, FlightSeries } from '@/lib/analyze/types';
import { fmtLength } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { flightCardStats } from '@/lib/flightCard';
import { recordingLine, type ReportMeta } from '@/lib/report';
import { download } from '@/lib/download';
import { Button, Frame } from './ui';
import { SYNTHETIC_SHORT } from '@/lib/synthetic';

// The card is drawn on white at a fixed social-friendly size, regardless of the
// app's theme, so it reads cleanly wherever it's pasted.
const W = 1200;
const H = 630;
const PAD = 64;
const INK = '#18181b'; // zinc-900
const MUTED = '#71717a'; // zinc-500
const ACCENT = '#6366f1'; // indigo-500
const LINE = '#e4e4e7'; // zinc-200

function drawCard(
  canvas: HTMLCanvasElement,
  data: {
    stem: string;
    formatLabel: string;
    /** Which recording of the flight this is, when it has several. */
    recording?: ReportMeta['recording'];
    series: FlightSeries;
    metrics: FlightMetrics;
    sys: UnitChoice;
    xRange?: [number, number];
    /** The readings this flyer has turned off — the card honours the same list the grid
     *  and every report do, so a hidden reading does not reappear on the shareable image. */
    hidden?: string[];
    /** Whether these numbers come from a flight Debrief MADE UP.
     *
     *  **This is the sink where an unlabelled figure travels furthest.** The card exists to be
     *  posted to a club chat or a forum: it leaves the device as a picture, with no report around
     *  it, no file to re-read and no metadata block a reader will open. Every other surface can
     *  point at something; an image has to carry the whole claim itself. */
    synthetic: boolean;
  },
) {
  const { stem, formatLabel, series, metrics, sys, xRange, hidden, recording, synthetic } = data;
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  const sans =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  // Masthead.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MUTED;
  ctx.font = `600 18px ${sans}`;
  ctx.fillText('DEBRIEF · FLIGHT REPORT', PAD, PAD + 6);

  ctx.fillStyle = INK;
  ctx.font = `600 30px ${mono}`;
  let name = stem;
  // Truncate the filename to the space before the format chip.
  const maxName = W - PAD * 2 - 200;
  while (name.length > 4 && ctx.measureText(name).width > maxName) name = name.slice(0, -1);
  if (name !== stem) name = name.slice(0, -1) + '…';
  ctx.fillText(name, PAD, PAD + 48);

  // Format chip (right-aligned with the filename row).
  ctx.font = `600 18px ${sans}`;
  const chipText = formatLabel;
  const chipW = ctx.measureText(chipText).width + 28;
  const chipX = W - PAD - chipW;
  const chipY = PAD + 22;
  ctx.fillStyle = '#eef2ff'; // indigo-50
  roundRect(ctx, chipX, chipY, chipW, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#4f46e5'; // indigo-600
  ctx.fillText(chipText, chipX + 14, chipY + 23);

  // Which recording of the flight this is, where the flyer has said it was flown on more than
  // one altimeter. This is the one surface that LEAVES the device — it exists to be posted to a
  // club chat or a forum — so it is the worst place for two images of ONE launch to go out with
  // different apogees and nothing saying they are the same flight. The file name alone cannot
  // say it; every other document Debrief writes says it; this said nothing.
  if (recording) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 18px ${sans}`;
    ctx.fillText(recordingLine(recording), PAD, PAD + 76);
  }

  // **A flight Debrief made up says so ON the image**, in §2's caveat amber, in a filled band
  // rather than a line of text — a picture is skimmed, and a grey sentence under a 56 px apogee
  // is not read. Drawn before the stats so it sits above them, and the stat block is pushed down
  // by exactly its height so nothing overlaps at any recording/synthetic combination.
  const SYNTH_BAND = 46;
  if (synthetic) {
    const bandY = PAD + (recording ? 92 : 66);
    ctx.fillStyle = '#fffbeb'; // amber-50, the same wash §2 gives a caveat on screen
    roundRect(ctx, PAD, bandY, W - PAD * 2, SYNTH_BAND - 8, 8);
    ctx.fill();
    ctx.strokeStyle = '#fcd34d'; // amber-300
    ctx.lineWidth = 2;
    roundRect(ctx, PAD, bandY, W - PAD * 2, SYNTH_BAND - 8, 8);
    ctx.stroke();
    ctx.fillStyle = '#b45309'; // amber-700
    ctx.font = `700 20px ${sans}`;
    ctx.fillText(SYNTHETIC_SHORT, PAD + 14, bandY + 26);
  }

  // Stat blocks.
  const stats = flightCardStats(metrics, sys, hidden);
  const cols = stats.length;
  const blockW = (W - PAD * 2) / cols;
  const statTop = PAD + (recording ? 132 : 110) + (synthetic ? SYNTH_BAND : 0);
  stats.forEach((s, i) => {
    const x = PAD + i * blockW;
    ctx.fillStyle = MUTED;
    ctx.font = `600 16px ${sans}`;
    ctx.fillText(s.label.toUpperCase(), x, statTop);
    ctx.fillStyle = i === 0 ? ACCENT : INK;
    // Shrink the value to fit its column so a long figure (e.g. "8,022 ft")
    // can't run into the next stat.
    const avail = blockW - 18;
    let size = i === 0 ? 56 : 44;
    do {
      ctx.font = `700 ${size}px ${mono}`;
      if (ctx.measureText(s.value).width <= avail) break;
      size -= 2;
    } while (size > 24);
    ctx.fillText(s.value, x, statTop + (i === 0 ? 58 : 50));
    if (s.sub) {
      ctx.fillStyle = MUTED;
      // Fit the sub to its column the same way the value above it is fitted. It used to
      // hold at most "Mach 0.6" and drew at a fixed size; now it carries the provenance
      // too ("Mach 2.64 · derived", "measured · may be clipped"), which is wider than a
      // quarter of the card at 18 px and would otherwise run into the next stat.
      let subSize = 18;
      do {
        ctx.font = `500 ${subSize}px ${sans}`;
        if (ctx.measureText(s.sub).width <= avail) break;
        subSize -= 1;
      } while (subSize > 11);
      ctx.fillText(s.sub, x, statTop + 84);
    }
  });

  // Altitude curve in the lower band.
  const chartTop = statTop + 130;
  const chartH = H - chartTop - PAD - 24;
  const chartL = PAD;
  const chartR = W - PAD;
  drawAltitude(ctx, series, metrics, sys, chartL, chartTop, chartR - chartL, chartH, mono, sans, xRange);

  // Footer.
  ctx.fillStyle = MUTED;
  ctx.font = `500 18px ${sans}`;
  ctx.fillText('debrief.fusionspace.co', PAD, H - PAD + 8);
  const priv = 'read locally — never uploaded';
  ctx.fillText(priv, W - PAD - ctx.measureText(priv).width, H - PAD + 8);
}

function drawAltitude(
  ctx: CanvasRenderingContext2D,
  series: FlightSeries,
  metrics: FlightMetrics,
  sys: UnitChoice,
  x: number,
  y: number,
  w: number,
  h: number,
  mono: string,
  sans: string,
  xRange?: [number, number],
) {
  const { time, altitude } = series;
  const n = Math.min(time.length, altitude.length);
  let t0 = Infinity;
  let t1 = -Infinity;
  let aMax = -Infinity;
  let apoIdx = 0;
  for (let i = 0; i < n; i++) {
    const a = altitude[i];
    const t = time[i];
    if (!Number.isFinite(a) || !Number.isFinite(t)) continue;
    // The card draws the flight, not the file: a pad wait outside the window would
    // otherwise squeeze the whole climb into the last inch of the curve.
    if (xRange && (t < xRange[0] || t > xRange[1])) continue;
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
    if (a > aMax) {
      aMax = a;
      apoIdx = i;
    }
  }
  if (!(t1 > t0) || !(aMax > 0)) return;
  const px = (t: number) => x + ((t - t0) / (t1 - t0)) * w;
  const py = (a: number) => y + h - (Math.max(0, a) / aMax) * h;

  // Baseline.
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();

  // Filled curve.
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < n; i++) {
    const a = altitude[i];
    const t = time[i];
    if (!Number.isFinite(a) || !Number.isFinite(t)) continue;
    const X = px(t);
    const Y = py(a);
    if (!started) {
      ctx.moveTo(X, Y);
      started = true;
    } else {
      ctx.lineTo(X, Y);
    }
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = ACCENT;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Soft fill under the curve.
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(99,102,241,0.10)';
  ctx.fill();

  // Apogee marker + label.
  const aX = px(time[apoIdx]);
  const aY = py(aMax);
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(aX, aY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `600 20px ${sans}`;
  const label = `apogee ${fmtLength(metrics.apogeeAltitude, sys)}`;
  const lw = ctx.measureText(label).width;
  const lx = Math.min(Math.max(x, aX - lw / 2), x + w - lw);
  ctx.fillStyle = '#4f46e5';
  ctx.fillText(label, lx, Math.max(y + 22, aY - 14));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A compact, shareable image of the flight — headline numbers and the altitude
 * curve, branded and drawn on white so it reads anywhere it's pasted. Save it as
 * a PNG or copy it straight to the clipboard for a club chat or forum post. Drawn
 * from the flight already in the browser; nothing is uploaded.
 */
export default function FlightCard({
  series,
  metrics,
  sys,
  stem,
  formatLabel,
  xRange,
  hidden,
  recording,
  synthetic,
}: {
  series: FlightSeries;
  metrics: FlightMetrics;
  sys: UnitChoice;
  stem: string;
  formatLabel: string;
  /** The window the report's charts are framed on, so the card draws the same flight
   *  they do rather than the whole record. */
  xRange?: [number, number];
  /** The readings this flyer has turned off, from the same stored profile the grid and
   *  every report read. */
  hidden?: string[];
  /** Which recording of the flight this is, when the flyer has said it was recorded more than
   *  once — so two cards of ONE launch cannot go out to a forum as two launches. */
  recording?: ReportMeta['recording'];
  /** Whether these numbers come from a flight Debrief MADE UP. Required, with no default, for the
   *  same reason `MetricGrid`'s is: the safe-looking default is the DEFECT value, and this is the
   *  one surface that leaves the device as a picture with nothing around it to correct a wrong
   *  answer. */
  synthetic: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawCard(canvas, { stem, formatLabel, series, metrics, sys, xRange, hidden, recording, synthetic });
  }, [series, metrics, sys, stem, formatLabel, xRange, hidden, recording, synthetic]);

  const save = useCallback(() => {
    canvasRef.current?.toBlob((blob) => blob && download(blob, `${stem}-card.png`));
  }, [stem]);

  const copy = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        // ClipboardItem isn't everywhere; fall back to a download if writing fails.
        const Item = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
        if (!Item || !navigator.clipboard?.write) throw new Error('no clipboard image support');
        await navigator.clipboard.write([new Item({ 'image/png': blob })]);
        setMsg('Card copied — paste it into a post.');
      } catch {
        download(blob, `${stem}-card.png`);
        setMsg('Copying images isn’t supported here, so the card was saved instead.');
      }
      setTimeout(() => setMsg(null), 4000);
    });
  }, [stem]);

  return (
    <section aria-labelledby="flight-card-heading" className="print:hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="flight-card-heading" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Flight card
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            A shareable image — the headline numbers and the altitude curve. Save it or copy it for a club chat or forum.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={copy} title="Copy the flight card image to the clipboard">
            Copy card
          </Button>
          <Button size="sm" onClick={save} title="Save the flight card as a PNG">
            Save card
          </Button>
        </div>
      </div>
      <Frame
        as="canvas"
        ref={canvasRef}
        role="img"
        aria-label={`Shareable flight card for ${stem}: apogee ${fmtLength(metrics.apogeeAltitude, sys)} with the altitude curve.`}
        className="w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
      />
      {msg && (
        <p role="status" aria-live="polite" className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {msg}
        </p>
      )}
    </section>
  );
}
