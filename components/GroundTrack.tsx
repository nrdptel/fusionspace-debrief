'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { UnitSystem } from '@/lib/display';
import { fmtLength, lengthIn, UNIT_LABEL } from '@/lib/display';
import { groundTrack, recoveryStats, compass } from '@/lib/gps';
import { useIsDark } from './useIsDark';

/** A round ring spacing (1/2/5 × 10ⁿ) giving a handful of rings across `maxM`. */
function niceStep(maxM: number): number {
  const raw = maxM / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const mult = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return Math.max(1, mult * pow);
}

/** The recovery (walkback) view: a north-up, equal-scale ground track of where
 *  the rocket drifted and came down relative to the pad, with the headline
 *  distance/bearing. Shown only when a flight carries a GPS lat/lon track. */
export default function GroundTrack({ lat, lon, sys }: { lat: Float64Array; lon: Float64Array; sys: UnitSystem }) {
  const dark = useIsDark();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  const track = useMemo(() => groundTrack(lat, lon), [lat, lon]);
  const stats = useMemo(() => (track ? recoveryStats(track) : null), [track]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => setWidth(host.clientWidth));
    ro.observe(host);
    setWidth(host.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track || !stats || width <= 0) return;
    const size = Math.min(width, 420);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ink = dark ? '#e4e4e7' : '#27272a'; // zinc-200 / zinc-800
    const grid = dark ? 'rgba(82,82,91,0.5)' : 'rgba(212,212,216,0.8)';
    const accent = '#6366f1';
    const land = '#f43f5e';
    ctx.clearRect(0, 0, size, size);

    const { east, north } = track;
    // Equal-scale bounds about the pad, with a little breathing room.
    let half = 10;
    for (let i = 0; i < east.length; i++) {
      if (!Number.isFinite(east[i]) || !Number.isFinite(north[i])) continue;
      half = Math.max(half, Math.abs(east[i]), Math.abs(north[i]));
    }
    half *= 1.12;
    const margin = 16;
    const scale = (size / 2 - margin) / half;
    const px = (e: number) => size / 2 + e * scale;
    const py = (n: number) => size / 2 - n * scale; // north is up

    // Range rings centred on the pad, labelled in the display unit.
    const step = niceStep(half);
    ctx.strokeStyle = grid;
    ctx.fillStyle = dark ? '#71717a' : '#a1a1aa';
    ctx.font = '10px var(--font-geist-mono, monospace)';
    ctx.lineWidth = 1;
    for (let r = step; r <= half; r += step) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${Math.round(lengthIn(r, sys))} ${UNIT_LABEL[sys].length}`, size / 2 + 3, py(r) + 11);
    }

    // North indicator (top-centre).
    ctx.fillStyle = ink;
    ctx.font = 'bold 11px var(--font-geist-sans, sans-serif)';
    ctx.textAlign = 'center';
    ctx.fillText('N', size / 2, 12);
    ctx.textAlign = 'start';

    // The track itself, skipping gaps in the fix.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < east.length; i++) {
      if (!Number.isFinite(east[i]) || !Number.isFinite(north[i])) {
        pen = false;
        continue;
      }
      const x = px(east[i]);
      const y = py(north[i]);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();

    // Pad marker (origin).
    ctx.strokeStyle = ink;
    ctx.fillStyle = dark ? '#18181b' : '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Landing marker (✕).
    const lx = px(stats.landingEast);
    const ly = py(stats.landingNorth);
    ctx.strokeStyle = land;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx - 5, ly - 5);
    ctx.lineTo(lx + 5, ly + 5);
    ctx.moveTo(lx + 5, ly - 5);
    ctx.lineTo(lx - 5, ly + 5);
    ctx.stroke();
  }, [track, stats, width, dark, sys]);

  if (!track || !stats) return null;

  const bearing = Math.round(stats.landingBearing);
  const ariaLabel = `Ground track: landed ${fmtLength(stats.landingDistance, sys)} from the pad, bearing ${bearing} degrees ${compass(
    stats.landingBearing,
  )}, having drifted up to ${fmtLength(stats.maxDrift, sys)} from the pad.`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Recovery</h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">north up · from GPS</span>
      </div>

      <div ref={hostRef} className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <canvas ref={canvasRef} role="img" aria-label={ariaLabel} className="mx-auto block" />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Landed from pad" value={fmtLength(stats.landingDistance, sys)} />
        <Stat label="Bearing" value={`${bearing}° ${compass(stats.landingBearing)}`} />
        <Stat label="Max drift" value={fmtLength(stats.maxDrift, sys)} />
      </dl>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Walk from the pad toward {compass(stats.landingBearing)} ({bearing}°) to recover it; the cross marks
        the last GPS fix. Positions are GPS — good to a few metres.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}
