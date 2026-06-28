'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { RawFlight } from '@/lib/flight/types';
import type { FlightAnalysis } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { lengthIn, speedIn, accelInG, UNIT_LABEL, fmtLength, fmtSpeed, fmtAccel, fmtTime, fmtMach } from '@/lib/display';
import { summaryText, analyzedDataCsv, reportStem, formatAnalyzedAt } from '@/lib/report';
import { encodeFlight, shareUrl, MAX_SHARE_URL } from '@/lib/share';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { getChannel } from '@/lib/flight/types';
import { buildPlotChannels } from '@/lib/explore';
import { download } from '@/lib/download';
import { useIsDark } from './useIsDark';
import Chart, { focusRange, type ChartMarker } from './Chart';
import MetricGrid from './MetricGrid';
import ChannelExplorer from './ChannelExplorer';
import LogDetails from './LogDetails';
import FlightTimeline from './FlightTimeline';
import GroundTrack from './GroundTrack';

const ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800';

function round(v: number, p: number): string {
  const f = Math.pow(10, p);
  return (Math.round(v * f) / f).toLocaleString('en-US', { maximumFractionDigits: p });
}

export default function FlightReport({
  flight,
  analysis,
  analyzedAt,
  sourceText,
  sys,
  onToggleUnits,
}: {
  flight: RawFlight;
  analysis: FlightAnalysis;
  analyzedAt: number;
  sourceText: string;
  sys: UnitSystem;
  onToggleUnits: () => void;
}) {
  const dark = useIsDark();
  const { series, events, metrics, warnings } = analysis;
  const notes = flight.notes;
  const altChartRef = useRef<HTMLDivElement>(null);
  const printingRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const stem = reportStem(flight.source);
  // A GPS track, when the logger recorded one, drives the recovery (walkback) view.
  const gpsLat = getChannel(flight, 'latitude');
  const gpsLon = getChannel(flight, 'longitude');

  async function shareLink() {
    setShareMsg('Building link…');
    try {
      const payload = await encodeFlight(flight.source, sourceText);
      const url = shareUrl(window.location.origin, window.location.pathname, payload);
      if (url.length > MAX_SHARE_URL) {
        setShareMsg('This flight is too large to share as a link — use Save chart or Copy summary instead.');
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareMsg('Link copied — the flight rides inside it; nothing was uploaded.');
      setTimeout(() => setShareMsg(null), 4000);
    } catch {
      setShareMsg('Couldn’t build a share link in this browser.');
    }
  }

  async function copySummary() {
    const text = summaryText(flight, analysis, sys, analyzedAt);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      download(new Blob([text], { type: 'text/plain' }), `${stem}-debrief.txt`);
    }
  }

  function downloadSummary() {
    download(new Blob([summaryText(flight, analysis, sys, analyzedAt)], { type: 'text/plain' }), `${stem}-debrief.txt`);
  }

  function downloadData() {
    download(new Blob([analyzedDataCsv(analysis, sys)], { type: 'text/csv' }), `${stem}-debrief.csv`);
  }

  // Print a clean flight card. Force a light theme first so the canvas charts
  // (whose pixels are baked at draw time, beyond the reach of print CSS) come
  // out on white, then restore whatever the user had once printing is done.
  function printCard() {
    // Ignore re-entry until the previous print has restored, so a double-click
    // can't capture the already-forced `light` as the "original" theme.
    if (printingRef.current) return;
    printingRef.current = true;

    const el = document.documentElement;
    const hadDark = el.classList.contains('dark');
    const hadLight = el.classList.contains('light');
    el.classList.remove('dark');
    el.classList.add('light');

    const mql = window.matchMedia('print');
    let done = false;
    const restore = () => {
      if (done) return;
      done = true;
      el.classList.toggle('dark', hadDark);
      el.classList.toggle('light', hadLight);
      window.removeEventListener('afterprint', restore);
      mql.removeEventListener?.('change', onMedia);
      printingRef.current = false;
    };
    // Restore on whichever signal the browser gives us: `afterprint`, or the
    // print media-query turning back off. Either way `restore` is idempotent, so
    // we never get stuck in light mode even if only one of them fires.
    const onMedia = (e: MediaQueryListEvent) => {
      if (!e.matches) restore();
    };
    window.addEventListener('afterprint', restore);
    mql.addEventListener?.('change', onMedia);

    // Give React a beat to repaint the charts light before the dialog opens.
    window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // Dialog was blocked/unavailable — nothing got printed, so undo now.
        restore();
      }
    }, 250);
  }

  function saveChartPng() {
    const canvas = altChartRef.current?.querySelector('canvas');
    if (!canvas) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = dark ? '#09090b' : '#ffffff'; // solid background, not transparent
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => blob && download(blob, `${stem}-altitude.png`));
  }

  // Memoized so an unrelated re-render (e.g. clicking Copy summary / Share link,
  // which only flips `copied`/`shareMsg`) doesn't change these prop identities
  // and tear down + rebuild the charts, which would reset any zoom the user set.
  const markers = useMemo<ChartMarker[]>(
    () => events.map((e) => ({ x: e.time, label: e.label.toLowerCase(), color: EVENT_COLOR[e.type] })),
    [events],
  );

  const hasAccel = series.acceleration.some((v) => Number.isFinite(v) && v !== 0);

  // Speed (and Mach, once it's worth showing) at an event — so the events list
  // answers "how fast at burnout / at deployment", not just when and how high.
  const eventSpeed = (index: number): string => {
    const v = series.velocity[index];
    if (!Number.isFinite(v)) return '';
    const m = series.speedOfSound > 0 ? v / series.speedOfSound : NaN;
    return Number.isFinite(m) && Math.abs(m) >= 0.8 ? `${fmtSpeed(v, sys)} · ${fmtMach(m)}` : fmtSpeed(v, sys);
  };

  const altSeries = useMemo(() => [{ label: 'altitude', values: series.altitude, stroke: '#6366f1', width: 2 }], [series.altitude]);
  const velSeries = useMemo(() => [{ label: 'velocity', values: series.velocity, stroke: '#10b981' }], [series.velocity]);
  const accSeries = useMemo(() => [{ label: 'acceleration', values: series.acceleration, stroke: '#f59e0b' }], [series.acceleration]);
  const altFmt = useCallback((v: number) => round(lengthIn(v, sys), 0), [sys]);
  const velFmt = useCallback((v: number) => round(speedIn(v, sys), 0), [sys]);
  const accFmt = useCallback((v: number) => round(accelInG(v), 1), [sys]);

  // Every channel worth plotting, for the flexible explorer below.
  const plotChannels = useMemo(() => buildPlotChannels(flight, series), [flight, series]);

  // A per-flight key links the three charts' hover cursor and zoom range.
  const syncKey = useMemo(() => `flight-${Math.random().toString(36).slice(2)}`, [flight]);

  // One-click zoom presets that frame all three charts to a flight phase.
  const zoomPresets = useMemo(() => {
    const t0 = series.time[0] ?? 0;
    const tEnd = series.time[series.time.length - 1] ?? 0;
    const at = (type: string) => events.find((e) => e.type === type)?.time;
    const lo = at('liftoff');
    const bo = at('burnout');
    const apo = at('apogee');
    const land = at('landing');
    const presets: { label: string; min: number; max: number }[] = [];
    if (lo != null && bo != null && bo > lo) presets.push({ label: 'Boost', min: Math.max(t0, lo - 0.3), max: bo + 1 });
    if (lo != null && apo != null) presets.push({ label: 'Ascent', min: Math.max(t0, lo - 0.3), max: Math.min(tEnd, apo + (tEnd - apo) * 0.05 + 1) });
    if (apo != null && land != null && land > apo) presets.push({ label: 'Descent', min: Math.max(t0, apo - 1), max: land });
    presets.push({ label: 'Full', min: t0, max: tEnd });
    return presets;
  }, [series.time, events]);

  const eventSummary = events.map((e) => `${e.label.toLowerCase()} at ${fmtTime(e.time)}`).join(', ');
  const altLabel = `Line chart: altitude above ground against time, peaking at ${fmtLength(metrics.apogeeAltitude, sys)}. Marked events: ${eventSummary}.`;
  const velLabel = `Line chart: velocity against time${Number.isFinite(metrics.maxVelocity) ? `, peaking at ${fmtSpeed(metrics.maxVelocity, sys)}` : ''}.`;
  const accLabel = `Line chart: acceleration against time${Number.isFinite(metrics.maxAcceleration) ? `, peaking at ${fmtAccel(metrics.maxAcceleration)}` : ''}.`;

  return (
    <div className="space-y-8">
      <h2 className="sr-only">Flight report for {flight.source}</h2>
      {/* Print-only masthead: a printed card should still say what it is. */}
      <div className="hidden print:block">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Debrief · Flight Report</p>
      </div>
      {/* File / format line */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 max-w-full truncate font-mono text-zinc-700 dark:text-zinc-300">
            {flight.source}
          </span>
          <span className="inline-flex shrink-0 items-center rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-300">
            {flight.formatLabel}
          </span>
          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">read locally — never uploaded</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" onClick={copySummary} title="Copy a text summary to the clipboard" className={ACTION_BTN}>
            {copied ? 'Copied ✓' : 'Copy summary'}
          </button>
          <button type="button" onClick={downloadSummary} title="Download the summary as a text file" className={ACTION_BTN}>
            Save .txt
          </button>
          <button
            type="button"
            onClick={downloadData}
            title="Download the analyzed series (time, altitude, velocity, acceleration) as CSV"
            className={ACTION_BTN}
          >
            Save .csv
          </button>
          <button type="button" onClick={saveChartPng} title="Save the altitude chart as a PNG" className={ACTION_BTN}>
            Save .png
          </button>
          <button
            type="button"
            onClick={printCard}
            title="Print a clean flight card (or save it as a PDF) — numbers, events and charts on one page"
            className={ACTION_BTN}
          >
            Print
          </button>
          <button
            type="button"
            onClick={shareLink}
            title="Copy a link with the whole flight encoded in it — decoded in the browser, never uploaded"
            className={ACTION_BTN}
          >
            Share link
          </button>
          <button
            type="button"
            onClick={onToggleUnits}
            aria-label={`Units: ${sys === 'imperial' ? 'feet' : 'meters'}. Switch to ${sys === 'imperial' ? 'meters' : 'feet'}.`}
            className={ACTION_BTN}
          >
            Units: {sys === 'imperial' ? 'feet' : 'meters'}
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? 'Summary copied to the clipboard.' : ''}
          </span>
        </div>
      </div>

      {shareMsg && (
        <p role="status" aria-live="polite" className="text-xs text-zinc-500 dark:text-zinc-400">
          {shareMsg}
        </p>
      )}

      <p className="-mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Analyzed{' '}
        <time dateTime={new Date(analyzedAt).toISOString()}>{formatAnalyzedAt(analyzedAt)}</time>
      </p>

      <LogDetails flight={flight} />

      {warnings.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <p className="mb-1 font-medium text-amber-900 dark:text-amber-100">Worth knowing</p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          <p className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">How this file was read</p>
          <ul className="space-y-1">
            {notes.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <MetricGrid metrics={metrics} sys={sys} />

      <FlightTimeline events={events} metrics={metrics} sys={sys} />

      {/* Charts */}
      {zoomPresets.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Zoom to</span>
          {zoomPresets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => focusRange(syncKey, p.min, p.max)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-500/60 dark:hover:text-indigo-400"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-6">
        <ChartBlock title={`Altitude (${UNIT_LABEL[sys].length} AGL)`}>
          <div ref={altChartRef}>
            <Chart
              time={series.time}
              series={altSeries}
              markers={markers}
              dark={dark}
              height={300}
              fmt={altFmt}
              ariaLabel={altLabel}
              syncKey={syncKey}
            />
          </div>
        </ChartBlock>

        <ChartBlock
          title={`Velocity (${UNIT_LABEL[sys].speed})`}
          note={series.velocitySource === 'device' ? 'logged by the device' : 'derived from altitude'}
        >
          <Chart
            time={series.time}
            series={velSeries}
            markers={markers}
            dark={dark}
            height={200}
            fmt={velFmt}
            ariaLabel={velLabel}
            syncKey={syncKey}
          />
        </ChartBlock>

        {hasAccel && (
          <ChartBlock
            title="Acceleration (g)"
            note={series.accelerationSource === 'device' ? 'logged by the device' : 'derived from velocity'}
          >
            <Chart
              time={series.time}
              series={accSeries}
              markers={markers}
              dark={dark}
              height={200}
              fmt={accFmt}
              ariaLabel={accLabel}
              syncKey={syncKey}
            />
          </ChartBlock>
        )}
        {!hasAccel && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            This logger didn&apos;t record acceleration, so only altitude and velocity are shown.
          </p>
        )}
      </div>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 print:hidden">
        Hover to read all three at a time · drag across a chart to zoom · double-click to reset
      </p>

      {/* Event legend */}
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Events</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <div
              key={e.type + e.index}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: EVENT_COLOR[e.type] }}
                  aria-hidden="true"
                />
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{e.label}</span>
                {e.provenance !== 'measured' && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{e.provenance}</span>
                )}
              </span>
              <span className="text-right font-mono text-xs text-zinc-500 dark:text-zinc-400">
                <span className="block">
                  {fmtTime(e.time)} · {fmtLength(e.altitude, sys)}
                </span>
                {eventSpeed(e.index) && <span className="block">{eventSpeed(e.index)}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {gpsLat && gpsLon && <GroundTrack lat={gpsLat.values} lon={gpsLon.values} sys={sys} stem={stem} />}

      <div className="print:hidden">
        <ChannelExplorer channels={plotChannels} time={series.time} events={events} sys={sys} stem={stem} />
      </div>

      {/* Print-only provenance line, so a card that leaves the screen says where
          it came from. */}
      <p className="hidden text-center text-[11px] text-zinc-500 print:block">
        debrief.fusionspace.co · analyzed {formatAnalyzedAt(analyzedAt)}
      </p>
    </div>
  );
}

function ChartBlock({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">{title}</h3>
        {note && <span className="text-xs text-zinc-500 dark:text-zinc-400">{note}</span>}
      </div>
      {children}
    </div>
  );
}
