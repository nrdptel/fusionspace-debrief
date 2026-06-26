'use client';

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useEffect, useRef } from 'react';

// Charts that share a syncKey share a hover cursor and zoom range, so the
// altitude/velocity/acceleration plots read as one linked view.
const zoomGroups = new Map<string, Set<uPlot>>();

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
  /** Text alternative for the canvas, for screen readers. */
  ariaLabel?: string;
  /** Charts sharing this key share a hover cursor and zoom range. */
  syncKey?: string;
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
  ariaLabel,
  syncKey,
}: ChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

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
      let prevCx = -Infinity;
      let stagger = 0;
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
        // Drop the label a line when it would crowd the previous one.
        stagger = cx - prevCx < 64 ? (stagger + 1) % 3 : 0;
        ctx.fillText(m.label, cx + 3, u.bbox.top + 11 + stagger * 12);
        prevCx = cx;
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
      scales: { x: { time: false }, y: {}, ...(hasRight ? { y2: {} } : {}) },
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
          value: (_u: uPlot, v: number | null) =>
            v == null ? '—' : s.axis === 'right' ? yFmtRight(v) : yFmt(v),
        })),
      ],
      hooks: { draw: [drawMarkers], setScale: syncKey ? [syncZoom] : [] },
    };

    const data: uPlot.AlignedData = [time, ...series.map((s) => s.values)];
    const plot = new uPlot(opts, data, host);
    plotRef.current = plot;

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
      if (syncKey) {
        const set = zoomGroups.get(syncKey);
        set?.delete(plot);
        if (set && set.size === 0) zoomGroups.delete(syncKey);
      }
      plot.destroy();
      plotRef.current = null;
    };
  }, [time, series, markers, dark, height, fmt, fmtRight, xFmt, xLabel, syncKey]);

  return <div ref={hostRef} className="w-full" role="img" aria-label={ariaLabel} />;
}
