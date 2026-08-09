'use client';

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useEffect, useRef, useState } from 'react';
import { finiteMinMax } from '@/lib/range';

// Charts that share a syncKey share a hover cursor and zoom range, so the
// altitude/velocity/acceleration plots read as one linked view.
const zoomGroups = new Map<string, Set<uPlot>>();

// Auto-range a y-scale from the finite data, robust to uPlot mis-ranging a
// series that's been NaN-padded onto a shared grid. The compare overlay pads a
// shorter flight with NaN out to the common time base; uPlot returns a null
// data range for such a series, which nulls the whole scale so nothing draws.
// When uPlot hands us a usable range we keep it (identical to its default);
// when it doesn't, we scan the series on this scale ourselves.
function rangeFinite(
  u: uPlot,
  scaleKey: string,
  dataMin: number | null,
  dataMax: number | null,
): uPlot.Range.MinMax {
  let lo = dataMin;
  let hi = dataMax;
  if (lo == null || hi == null || !Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = Infinity;
    hi = -Infinity;
    for (let i = 1; i < u.series.length; i++) {
      const s = u.series[i];
      if (s.scale !== scaleKey || s.show === false) continue;
      const r = finiteMinMax(u.data[i] as ArrayLike<number | null | undefined>);
      if (r) {
        if (r[0] < lo) lo = r[0];
        if (r[1] > hi) hi = r[1];
      }
    }
    if (lo > hi) return [0, 1];
  }
  return uPlot.rangeNum(lo, hi, 0.1, true);
}

// uPlot finds the x-extent by reading the first and last samples (it assumes a
// sorted x), and then ranges y only over the points whose x falls in that window.
// When x is a non-monotonic channel (the explorer plotting one channel against
// another) those endpoints collapse both scales. Bracket the series with two
// sentinel samples carrying the true min and max x — and a null y, so they draw
// nothing — so uPlot's endpoint read gives the real x-extent and every point is
// in view for the y-range. For a sorted (time) axis this is skipped entirely.
function bracketUnsortedX(time: Float64Array, series: ChartSeries[]): uPlot.AlignedData {
  const ext = finiteMinMax(time);
  if (!ext) return [time, ...series.map((s) => s.values)];
  const [xMin, xMax] = ext;
  const n = time.length;
  const x = new Float64Array(n + 2);
  x[0] = xMin;
  x.set(time, 1);
  x[n + 1] = xMax;
  const ys = series.map((s) => {
    const y = new Float64Array(n + 2).fill(NaN);
    y.set(s.values, 1);
    return y;
  });
  return [x, ...ys];
}

/** Set the x-range on every chart in a sync group (used by the zoom presets). */
export function focusRange(syncKey: string, min: number, max: number) {
  const set = zoomGroups.get(syncKey);
  if (!set) return;
  for (const u of set) u.setScale('x', { min, max });
}

export interface ChartSeries {
  label: string;
  values: Float64Array;
  stroke: string;
  width?: number;
  /** Which y-axis/scale to bind to. Defaults to the left axis. */
  axis?: 'left' | 'right';
  /** Dash pattern, in canvas units — `[6, 4]` for a predicted trace. A dashed line is how this
   *  app says "not measured", and it is deliberately the PREDICTION that is dashed rather than
   *  the flight: the measurement is the reference here, and Project APEX dashing the measured
   *  trace instead (COMPETITION.md row 32) encodes the opposite idea about which is which. */
  dash?: number[];
  /** Draw straight through gaps rather than breaking the line at them. Needed by any series
   *  living on a UNION time base (see `lib/overlay.ts`), where every instant belonging to the
   *  other trace is a NaN in this one — without it a merged overlay renders as nothing but
   *  isolated points. */
  spanGaps?: boolean;
}

export interface ChartMarker {
  x: number;
  label: string;
  color: string;
}

export interface ChartProps {
  time: Float64Array;
  series: ChartSeries[];
  markers?: ChartMarker[];
  dark: boolean;
  height?: number;
  /** Format a y value for the (left) axis and the hover legend. */
  fmt?: (v: number) => string;
  /** Format a value for the right axis, when any series binds to it. */
  fmtRight?: (v: number) => string;
  /** Format an x value for the axis and the hover legend. Defaults to seconds. */
  xFmt?: (v: number) => string;
  /** Legend label for the x series. Defaults to "time". */
  xLabel?: string;
  /** Whether the x-data is sorted ascending (true for a time axis). When false —
   *  e.g. plotting one channel against another, where x is non-monotonic — uPlot
   *  is told to scan for the x-extent instead of reading the (meaningless) first
   *  and last samples, which would otherwise collapse the axis. */
  xSorted?: boolean;
  /** Text alternative for the canvas, for screen readers. */
  ariaLabel?: string;
  /** Charts sharing this key share a hover cursor and zoom range. */
  syncKey?: string;
  /** Called with the visible x-range on init and whenever it changes (zoom). */
  onView?: (min: number, max: number) => void;
  /** The x-window to open on. Without it the chart opens on the whole series. Used to
   *  frame a plot on the flight rather than on the file: a logger armed on the pad can
   *  record minutes before liftoff, and every one of those seconds is axis the flight
   *  doesn't get. Applied once, after the plot is built, rather than through uPlot's
   *  `scales.x.range` — that callback is consulted on every `setScale`, not only when the
   *  scale auto-ranges, so a window set there would pin the axis and swallow every zoom.
   *  The data outside stays in the series: the double-click reset and the "Full record"
   *  preset both reach it. */
  xRange?: [number, number];
}

export default function Chart({
  time,
  series,
  markers = [],
  dark,
  height = 240,
  fmt,
  fmtRight,
  xFmt,
  xLabel,
  xSorted = true,
  ariaLabel,
  syncKey,
  onView,
  xRange,
}: ChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Where uPlot's legend is moved to after init — see the block that moves it. */
  const legendRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  /** Where the keyboard has walked to, as a sample index. A ref rather than state: it is read
   *  and written inside one key press and never drives a render on its own — the reading a
   *  sighted user sees is uPlot's own legend, which is not React's to re-render. */
  const cursorIdx = useRef<number | null>(null);
  const [announced, setAnnounced] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const axisColor = dark ? '#a1a1aa' : '#52525b'; // zinc-400 / zinc-600
    const gridColor = dark ? 'rgba(63,63,70,0.4)' : 'rgba(228,228,231,0.8)';
    const yFmt = fmt ?? ((v: number) => String(v));
    const yFmtRight = fmtRight ?? yFmt;
    const xTick = xFmt ?? ((v: number) => `${v}s`);
    const hasRight = series.some((s) => s.axis === 'right');

    const drawMarkers = (u: uPlot) => {
      const ctx = u.ctx;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.font = '10px var(--font-geist-mono, monospace)';
      // Where each label row is free again — the x its last label ended at. A label goes on the
      // lowest row whose text has run out before this marker, which is the only rule that
      // actually guarantees no overlap.
      //
      // The previous rule dropped a line whenever a marker came within a fixed 64 px of the one
      // before it and wrapped back to the top every third label. Both halves fail once a plot
      // carries more than a couple of markers: 64 px is a guess about text it never measured, and
      // the wrap put the fourth crowded label straight back on top of the first. A comparison
      // overlay draws every flight's events, so on two flights a burnout landed on a burnout.
      const rowFreeFrom: number[] = [];
      for (const m of markers) {
        const cx = Math.round(u.valToPos(m.x, 'x', true));
        if (cx < u.bbox.left || cx > u.bbox.left + u.bbox.width) continue;
        ctx.strokeStyle = m.color;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, u.bbox.top);
        ctx.lineTo(cx, u.bbox.top + u.bbox.height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = m.color;
        const textX = cx + 3;
        const end = textX + ctx.measureText(m.label).width + 6; // 6 px of air before the next
        let row = rowFreeFrom.findIndex((freeFrom) => textX >= freeFrom);
        if (row < 0) row = rowFreeFrom.length;
        rowFreeFrom[row] = end;
        ctx.fillText(m.label, textX, u.bbox.top + 11 + row * 12);
      }
      ctx.restore();
    };

    // Propagate a zoom (x-range change) to the other charts in the group.
    const syncZoom = (u: uPlot, scaleKey: string) => {
      if (scaleKey !== 'x' || !syncKey) return;
      const { min, max } = u.scales.x;
      const peers = zoomGroups.get(syncKey);
      if (!peers || min == null || max == null) return;
      for (const p of peers) {
        if (p === u) continue;
        const s = p.scales.x;
        if (s.min !== min || s.max !== max) p.setScale('x', { min, max });
      }
    };

    // Fan a scale change out to the sync group and report the visible range.
    const onSetScale = (u: uPlot, scaleKey: string) => {
      if (scaleKey !== 'x') return;
      if (syncKey) syncZoom(u, scaleKey);
      if (onView) {
        const { min, max } = u.scales.x;
        if (min != null && max != null) onView(min, max);
      }
    };

    const opts: uPlot.Options = {
      width: host.clientWidth || 600,
      height,
      padding: [12, 8, 0, 0],
      cursor: {
        y: false,
        points: { show: true },
        drag: { x: true, y: false },
        ...(syncKey ? { sync: { key: syncKey } } : {}),
      },
      legend: { show: true, live: true },
      scales: {
        x: { time: false },
        y: { range: (u, dMin, dMax) => rangeFinite(u, 'y', dMin, dMax) },
        ...(hasRight ? { y2: { range: (u, dMin, dMax) => rangeFinite(u, 'y2', dMin, dMax) } } : {}),
      },
      axes: [
        {
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor, width: 1 },
          values: (_u, vals) => vals.map((v) => xTick(v)),
          font: '11px var(--font-geist-sans, sans-serif)',
        },
        {
          scale: 'y',
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor, width: 1 },
          size: 56,
          values: (_u, vals) => vals.map((v) => yFmt(v)),
          font: '11px var(--font-geist-sans, sans-serif)',
        },
        ...(hasRight
          ? [
              {
                scale: 'y2',
                side: 1 as const,
                stroke: axisColor,
                grid: { show: false },
                ticks: { stroke: gridColor, width: 1 },
                size: 56,
                values: (_u: uPlot, vals: number[]) => vals.map((v) => yFmtRight(v)),
                font: '11px var(--font-geist-sans, sans-serif)',
              },
            ]
          : []),
      ],
      series: [
        { label: xLabel ?? 'time', value: (_u, v) => (v == null ? '' : xFmt ? xFmt(v) : `${v.toFixed(2)} s`) },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.stroke,
          width: s.width ?? 1.75,
          scale: s.axis === 'right' ? 'y2' : 'y',
          points: { show: false },
          ...(s.dash ? { dash: s.dash } : {}),
          ...(s.spanGaps ? { spanGaps: true } : {}),
          value: (_u: uPlot, v: number | null) =>
            v == null ? '—' : s.axis === 'right' ? yFmtRight(v) : yFmt(v),
        })),
      ],
      hooks: { draw: [drawMarkers], setScale: syncKey || onView ? [onSetScale] : [] },
    };

    const data: uPlot.AlignedData = xSorted ? [time, ...series.map((s) => s.values)] : bracketUnsortedX(time, series);
    const plot = new uPlot(opts, data, host);
    plotRef.current = plot;

    // Open on the requested window (see `xRange`). Done here, once, so uPlot treats it as
    // an ordinary zoom the flyer can zoom out of.
    if (xRange && xRange[1] > xRange[0]) plot.setScale('x', { min: xRange[0], max: xRange[1] });

    /* The legend rows are CONTROLS, and until this ran they were not shaped like any.
     *
     * Measured 2026-08-09 on `/compare` with the two-altimeter sample: clicking a legend row adds
     * `u-off` to it and the flight's trace disappears from the plot. That is a real capability —
     * two traces overlaid is exactly when a flyer wants one of them out of the way — and uPlot
     * ships it as a bare `<th>` with `cursor: pointer`. No role, so no screen reader is told it
     * does anything; no `tabindex`, so no keyboard can reach it; 30x67 px at 390 px, well under
     * §8's floor. Hiding a trace was therefore a POINTER-ONLY capability, which is the state
     * `DESIGN.md` §8 forbids and the failure this whole milestone exists to remove.
     *
     * It also slipped every touch sweep this repo has ever run, and the reason is worth keeping:
     * `e2e/touchTargets.ts` enumerates ROLES — `button, [role=button], nav a …` — and a `<th>`
     * carries none. Naming these as switches is what puts them INSIDE that check rather than
     * beside it; the floor is then held by the existing sweep rather than by a new special case.
     *
     * `role="switch"` rather than `role="button"` because the state is the point: a screen reader
     * says "Show sample-pnut on the chart, switch, on", which is the whole control in five words.
     */
    const legend = plot.root.querySelector<HTMLElement>('.u-legend');

    /* …and the legend has to come OUT of the plot element to be one.
     *
     * uPlot appends its legend inside the same root it draws into, and that root is this chart's
     * `role="img"` host — the element a keyboard user focuses to read values off the trace. A
     * focusable control inside an `img` is `nested-interactive`, which axe fails and which is a
     * genuine contradiction rather than a lint: an image does not contain switches. Caught by
     * `e2e/a11y.spec.ts` the first time this ran, which is the check working.
     *
     * So it moves to a sibling. That is also the honest structure — the traces are the picture and
     * the legend is the control strip beside it — and it takes the legend out from under
     * `.uplot { width: min-content }`, so a stacked row can be the full width of the card. */
    if (legend && legendRef.current) legendRef.current.appendChild(legend);

    // Row 0 is the x series. It carries the time reading and toggles nothing, so it stays text —
    // giving it a switch role would announce a control that does not exist.
    const switches = Array.from(legend?.querySelectorAll<HTMLElement>('tr.u-series') ?? [])
      .map((row, i) => ({ th: row.querySelector<HTMLElement>('th'), i }))
      .filter((r): r is { th: HTMLElement; i: number } => r.i > 0 && r.th != null);
    for (const { th, i } of switches) {
      th.setAttribute('role', 'switch');
      th.setAttribute('tabindex', '0');
      th.setAttribute('aria-label', `Show ${series[i - 1]?.label ?? `series ${i}`} on the chart`);
    }
    const syncSwitches = () => {
      for (const { th, i } of switches) {
        th.setAttribute('aria-checked', plot.series[i]?.show === false ? 'false' : 'true');
      }
    };
    syncSwitches();

    // Enter and Space press it, which is what `switch` promises. Routed through the element's own
    // `click` so uPlot remains the only thing that toggles a series — a second code path would be
    // a second definition of what "hidden" means, and they would drift.
    const onLegendKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const th = (e.target as HTMLElement | null)?.closest<HTMLElement>('th[role="switch"]');
      if (!th) return;
      e.preventDefault(); // Space scrolls the page otherwise
      th.click();
    };
    // Bubbled, so it runs AFTER uPlot's own handler on the row and reads the state it just set.
    // One listener on the legend rather than one per row, for the same reason as everywhere else.
    legend?.addEventListener('keydown', onLegendKey);
    legend?.addEventListener('click', syncSwitches);

    // Touch zoom. uPlot binds only mouse events, so on a phone — where this tool
    // is built to be used, reading a log at the field — the charts couldn't be
    // zoomed at all. Add a two-finger pinch on the x-axis (one finger still
    // scrolls the page, so the gestures never fight) and a double-tap to reset.
    // The pinch anchors both fingers to the data points they grabbed, like a map.
    const over = plot.over;
    // The full x-extent for double-tap reset, read from the data (uPlot's scale
    // isn't finalised at this point). For an unsorted x the bracket sentinels carry
    // the true min/max, so this is the real extent either way.
    const xExtent = finiteMinMax(data[0] as ArrayLike<number | null | undefined>);
    const fullMin = xExtent ? xExtent[0] : 0;
    const fullMax = xExtent ? xExtent[1] : 1;
    let pinch: { d1: number; d2: number } | null = null;
    let pinched = false;
    let lastTapAt = 0;
    const fracOf = (clientX: number, rect: DOMRect) => (clientX - rect.left) / rect.width;

    /** One finger reads a value at a time — the thing a flight chart is FOR.
     *
     *  uPlot drives its cursor, and therefore its live legend, off MOUSE events. Every touch
     *  handler here returned unless exactly two fingers were down, so on a phone the legend
     *  rendered `time — altitude —` and never filled in: measured at 390 px with `hasTouch`, a
     *  one-finger drag left it empty while the identical drag through a synthetic mouse gave
     *  `time 47.14 s / altitude 6,402`. `DESIGN.md` §8 forbids a hover-only state, and an empty
     *  legend advertising a reading the surface cannot give is worse than not offering one.
     *
     *  Setting the cursor directly is what a touch has to do instead, because there is no hover:
     *  the reading STAYS where the finger left it rather than clearing on lift, so a flyer can
     *  read the number after moving their thumb out of the way. */
    const readAt = (clientX: number, clientY: number) => {
      const rect = over.getBoundingClientRect();
      plot.setCursor({ left: clientX - rect.left, top: clientY - rect.top });
    };

    /** A single finger that has committed to a horizontal drag. Tracked because two other
     *  gestures share these handlers: a horizontal drag must claim the event so the page does not
     *  scroll out from under the reading, while a VERTICAL drag must not — the chart is wide and
     *  short, and swallowing vertical movement would trap the page scroll on the tallest surface
     *  in the app. And a finger that moved is not a tap, so it must not feed the double-tap reset
     *  below and silently zoom out mid-read. */
    let read: { x: number; y: number; moved: boolean } | null = null;
    /** Enough movement to be a deliberate drag rather than the wobble of a tap. */
    const DRAG_SLOP_PX = 6;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        read = { x: t.clientX, y: t.clientY, moved: false };
        readAt(t.clientX, t.clientY);
        return;
      }
      read = null;
      if (e.touches.length !== 2) return;
      const { min, max } = plot.scales.x;
      if (min == null || max == null) return;
      const rect = over.getBoundingClientRect();
      const u1 = fracOf(e.touches[0].clientX, rect);
      const u2 = fracOf(e.touches[1].clientX, rect);
      pinch = { d1: min + u1 * (max - min), d2: min + u2 * (max - min) };
      pinched = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (read && e.touches.length === 1) {
        const t = e.touches[0];
        if (!read.moved) {
          const dx = Math.abs(t.clientX - read.x);
          const dy = Math.abs(t.clientY - read.y);
          // Claim the gesture only once it is clearly a sideways read. Until then let the browser
          // have it, so a flick down the page still scrolls when it starts over a chart.
          if (dx < DRAG_SLOP_PX || dx <= dy) return;
          read.moved = true;
        }
        e.preventDefault();
        readAt(t.clientX, t.clientY);
        return;
      }
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault(); // we own the two-finger gesture — suppress page pinch-zoom
      const rect = over.getBoundingClientRect();
      const u1 = fracOf(e.touches[0].clientX, rect);
      const u2 = fracOf(e.touches[1].clientX, rect);
      if (Math.abs(u2 - u1) < 0.02) return; // fingers vertical / too close to be stable
      const range = (pinch.d2 - pinch.d1) / (u2 - u1);
      const min = pinch.d1 - u1 * range;
      const max = min + range;
      if (max > min) plot.setScale('x', { min, max });
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length > 0) return;
      const dragged = read?.moved === true;
      read = null;
      if (pinched) {
        pinched = false; // a pinch ending isn't a tap
        return;
      }
      // …and neither is a drag along the trace. Without this, reading two values in quick
      // succession would land inside the double-tap window and zoom the chart back out under a
      // flyer who was in the middle of reading it.
      if (dragged) {
        lastTapAt = 0;
        return;
      }
      // Double-tap (two quick single-finger taps) resets to the full range.
      const now = e.timeStamp;
      if (now - lastTapAt < 300) {
        plot.setScale('x', { min: fullMin, max: fullMax });
        lastTapAt = 0;
      } else {
        lastTapAt = now;
      }
    };
    over.addEventListener('touchstart', onTouchStart, { passive: true });
    over.addEventListener('touchmove', onTouchMove, { passive: false });
    over.addEventListener('touchend', onTouchEnd, { passive: true });

    // Report the initial full range so a stats panel can populate before any zoom.
    if (onView) {
      const { min, max } = plot.scales.x;
      if (min != null && max != null) onView(min, max);
    }

    if (syncKey) {
      let set = zoomGroups.get(syncKey);
      if (!set) zoomGroups.set(syncKey, (set = new Set()));
      set.add(plot);
    }

    const ro = new ResizeObserver(() => {
      if (host.clientWidth) plot.setSize({ width: host.clientWidth, height });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      legend?.removeEventListener('keydown', onLegendKey);
      legend?.removeEventListener('click', syncSwitches);
      // It lives outside `plot.root` now, so `plot.destroy()` no longer takes it with it. Without
      // this every effect re-run — a unit change, a theme flip — would stack another dead legend.
      legend?.remove();
      over.removeEventListener('touchstart', onTouchStart);
      over.removeEventListener('touchmove', onTouchMove);
      over.removeEventListener('touchend', onTouchEnd);
      if (syncKey) {
        const set = zoomGroups.get(syncKey);
        set?.delete(plot);
        if (set && set.size === 0) zoomGroups.delete(syncKey);
      }
      plot.destroy();
      plotRef.current = null;
    };
  }, [time, series, markers, dark, height, fmt, fmtRight, xFmt, xLabel, xSorted, syncKey, onView, xRange]);

  /** Read a value off the chart with the keyboard.
   *
   *  The chart already answered a mouse and, since the touch work, a finger — and answered a
   *  keyboard with nothing at all: the host carried `role="img"` and an `aria-label` but no
   *  `tabindex` and no key handling, so it could not even be focused. `GroundTrack` beside it has
   *  had arrow keys, Home/End, PageUp/PageDown and Escape since it was built, which made this an
   *  inconsistency inside one report as much as a gap against a spreadsheet.
   *
   *  It walks the samples in the VISIBLE window rather than the whole file. A logger armed on the
   *  pad can record minutes before liftoff, and the chart deliberately opens framed on the flight
   *  (`xRange`) — so Home and End mean the ends of what is being shown, and a zoom changes what
   *  the arrows traverse, which is what someone looking at the plot would expect them to mean. */
  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    const plot = plotRef.current;
    if (!plot || time.length === 0) return;

    // The window's ends, as sample indices. Only meaningful on a sorted x — plotting one channel
    // against another gives a non-monotonic x where "the range between two times" is not a
    // contiguous run of samples, so there the keyboard walks the whole series.
    let lo = 0;
    let hi = time.length - 1;
    const { min, max } = plot.scales.x;
    if (xSorted && min != null && max != null) {
      while (lo < hi && time[lo] < min) lo++;
      while (hi > lo && time[hi] > max) hi--;
    }

    const at = cursorIdx.current;
    const go = (i: number) => {
      ev.preventDefault();
      const c = Math.max(lo, Math.min(hi, i));
      cursorIdx.current = c;
      // Drive uPlot's own cursor, so the live legend a mouse user reads is the same element the
      // keyboard fills in — one reading, not a second one rendered elsewhere.
      plot.setCursor({ left: plot.valToPos(time[c], 'x'), top: plot.over.clientHeight / 2 });
      setAnnounced(describeAt(c));
    };

    const step = ev.shiftKey ? 10 : 1;
    switch (ev.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        return go(at == null ? lo : at + step);
      case 'ArrowLeft':
      case 'ArrowDown':
        return go(at == null ? hi : at - step);
      case 'Home':
        return go(lo);
      case 'End':
        return go(hi);
      case 'PageDown': {
        // Between the marks the chart already draws — liftoff, burnout, apogee, deployment. The
        // instants a flyer is actually looking for, rather than a fixed jump of N samples.
        const next = markers.map((m) => m.x).filter((x) => x > (at == null ? -Infinity : time[at]));
        if (next.length > 0) go(nearestIndex(Math.min(...next), lo, hi));
        return;
      }
      case 'PageUp': {
        const prev = markers.map((m) => m.x).filter((x) => x < (at == null ? Infinity : time[at]));
        if (prev.length > 0) go(nearestIndex(Math.max(...prev), lo, hi));
        return;
      }
      case 'Escape':
        ev.preventDefault();
        cursorIdx.current = null;
        plot.setCursor({ left: -10, top: -10 });
        setAnnounced('');
        return;
    }
  };

  /** The sample nearest an x value, within the window. */
  function nearestIndex(x: number, lo: number, hi: number): number {
    let best = lo;
    let bestD = Infinity;
    for (let i = lo; i <= hi; i++) {
      const d = Math.abs(time[i] - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** What a screen reader hears. The same numbers, through the same formatters, as the visible
   *  legend — a reading stated twice in two shapes would be two readings to reconcile. A series
   *  the record has no sample for at this instant is left out rather than announced as NaN. */
  function describeAt(i: number): string {
    const x = xFmt ? xFmt(time[i]) : `${time[i].toFixed(2)} s`;
    const parts = [`${xLabel ?? 'time'} ${x}`];
    for (const [n, s] of series.entries()) {
      const v = s.values[i];
      if (!Number.isFinite(v)) continue;
      // A trace the flyer has TURNED OFF is not read out. Found by the pre-push review of the
      // slice that made the legend switches keyboard-reachable, and it is that slice's own
      // consequence: hiding a trace used to need a mouse, and a mouse user does not listen to this
      // announcement. Handing the toggle to a screen-reader user made them the only person who
      // could put the chart into a state where the reading names a line that is not drawn.
      // `plotRef.current` rather than a captured `plot`, because visibility lives in uPlot and
      // nowhere else — a second record of it here would be a second answer to disagree with.
      if (plotRef.current?.series[n + 1]?.show === false) continue;
      const f = s.axis === 'right' ? (fmtRight ?? fmt) : fmt;
      parts.push(`${s.label} ${f ? f(v) : String(v)}`);
    }
    const mark = markers.find((m) => nearestIndex(m.x, 0, time.length - 1) === i);
    return parts.join(', ') + (mark ? `, ${mark.label}` : '');
  }

  return (
    <div className="w-full">
      <div
        ref={hostRef}
        className="w-full"
        role="img"
        /* The instructions ride in the label rather than in visible text under every one of the
           six charts: a keyboard user meets this element by focusing it, which is exactly when a
           label is read out. `GroundTrack` states its keys the same way. */
        aria-label={
          ariaLabel
            ? `${ariaLabel} Focus this chart and use the arrow keys to read a value — Home and End for the ends of the window shown, Page Up and Page Down to step between events, Escape to clear.`
            : undefined
        }
        tabIndex={0}
        onKeyDown={onKeyDown}
      />
      {/* uPlot's legend is moved in here after init. It is a strip of switches — one per trace,
          each showing its colour, its name and its reading at the cursor — so it sits BESIDE the
          picture rather than inside it. Empty until the effect runs, and empty again if uPlot
          never initialises, which is the right thing to render in that case. */}
      <div ref={legendRef} className="w-full" />
      {/* Only key presses write here. A pointer sweeping the plot sets a new reading on nearly
          every pixel of travel, and routing that into a live region would queue an announcement
          per pointer sample — the mistake `GroundTrack` made once and fixed. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announced}
      </p>
    </div>
  );
}
