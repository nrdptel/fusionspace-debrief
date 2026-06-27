'use client';

import { useCallback, useEffect, useState } from 'react';
import { importFlight } from '@/lib/parsers';
import type { AnalyzedTable } from '@/lib/flight/columns';
import { buildFlight, type ColumnMapping } from '@/lib/flight/build';
import type { RawFlight } from '@/lib/flight/types';
import { analyzeFlight } from '@/lib/analyze';
import type { FlightAnalysis } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import DropZone from './DropZone';
import ColumnMapper from './ColumnMapper';
import FlightReport from './FlightReport';
import RecentFlights from './RecentFlights';
import CompareView from './CompareView';
import { saveRecent, listRecents, getRecent, removeRecent, clearRecents, type RecentMeta } from '@/lib/recents';
import { buildComparison, MAX_COMPARE, type Comparison } from '@/lib/compare';
import { decodeFlight, payloadFromHash } from '@/lib/share';

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'mapping'; fileName: string; text: string; table: AnalyzedTable; suggested: ColumnMapping[] }
  | { phase: 'report'; flight: RawFlight; analysis: FlightAnalysis; analyzedAt: number; text: string }
  | { phase: 'compare'; comparison: Comparison; note?: string }
  | { phase: 'error'; message: string };

const SAMPLE_URL = '/samples/sample-altusmetrum.csv';
const MAX_BYTES = 64 * 1024 * 1024; // 64 MB — far above any real flight log

const tick = () => new Promise((r) => setTimeout(r, 0));

function readInitialUnits(): UnitSystem {
  if (typeof window === 'undefined') return 'imperial';
  const u = new URLSearchParams(window.location.search).get('u');
  if (u === 'm' || u === 'metric') return 'metric';
  if (u === 'ft' || u === 'imperial') return 'imperial';
  const saved = window.localStorage.getItem('debrief.units');
  return saved === 'metric' ? 'metric' : 'imperial';
}

export default function Analyzer() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [sys, setSys] = useState<UnitSystem>('imperial');
  const [recents, setRecents] = useState<RecentMeta[]>([]);

  const refreshRecents = useCallback(() => {
    listRecents().then(setRecents);
  }, []);

  useEffect(() => {
    setSys(readInitialUnits());
    refreshRecents();
  }, [refreshRecents]);

  const toggleUnits = useCallback(() => {
    setSys((prev) => {
      const next: UnitSystem = prev === 'imperial' ? 'metric' : 'imperial';
      try {
        window.localStorage.setItem('debrief.units', next);
        const url = new URL(window.location.href);
        url.searchParams.set('u', next === 'metric' ? 'm' : 'ft');
        window.history.replaceState(null, '', url);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const ingest = useCallback(
    (name: string, text: string) => {
      try {
        if (text.trim().length === 0) {
          setState({ phase: 'error', message: 'That file is empty.' });
          return;
        }
        const result = importFlight({ name, text });
        if (result.kind === 'flight') {
          const analysis = analyzeFlight(result.flight);
          setState({ phase: 'report', flight: result.flight, analysis, analyzedAt: Date.now(), text });
          void saveRecent({
            name,
            formatLabel: result.flight.formatLabel,
            apogeeM: analysis.metrics.apogeeAltitude ?? null,
            text,
          }).then(refreshRecents);
        } else if (result.table.dataRows.length === 0) {
          setState({
            phase: 'error',
            message: 'Debrief couldn’t find any data rows in this file. Is it a flight log export?',
          });
        } else {
          setState({ phase: 'mapping', fileName: name, text, table: result.table, suggested: result.suggested });
        }
      } catch (err) {
        setState({ phase: 'error', message: err instanceof Error ? err.message : 'Could not read this file.' });
      }
    },
    [refreshRecents],
  );

  const onFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        setState({
          phase: 'error',
          message: `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB — larger than Debrief reads in the browser (64 MB). If it's really a single flight, trim it first.`,
        });
        return;
      }
      setState({ phase: 'loading' });
      try {
        const text = await file.text();
        await tick(); // let the loading state paint before the synchronous parse
        ingest(file.name, text);
      } catch {
        setState({ phase: 'error', message: 'Could not read this file.' });
      }
    },
    [ingest],
  );

  // One file → the normal single-flight flow (incl. the column-mapping path for a
  // generic CSV). Several files → import each auto-detected flight and go straight
  // to a comparison (≥2) or its report (exactly 1). Files that need manual column
  // mapping can't be batch-read, so they're skipped here.
  const onFiles = useCallback(
    async (files: File[]) => {
      const list = files.filter(Boolean);
      if (list.length === 0) return;
      if (list.length === 1) {
        onFile(list[0]);
        return;
      }
      setState({ phase: 'loading' });
      await tick();
      const results: { name: string; formatLabel: string; flight: RawFlight; analysis: FlightAnalysis; text: string }[] = [];
      const capped = list.slice(0, MAX_COMPARE);
      for (const file of capped) {
        try {
          if (file.size > MAX_BYTES) continue;
          const text = await file.text();
          const result = importFlight({ name: file.name, text });
          if (result.kind !== 'flight') continue;
          const analysis = analyzeFlight(result.flight);
          results.push({ name: file.name, formatLabel: result.flight.formatLabel, flight: result.flight, analysis, text });
          // Awaited (not fire-and-forget) so the per-save prune doesn't race itself.
          await saveRecent({ name: file.name, formatLabel: result.flight.formatLabel, apogeeM: analysis.metrics.apogeeAltitude ?? null, text });
        } catch {
          /* skip this file */
        }
      }
      refreshRecents();
      if (results.length >= 2) {
        const inputs = results.map((r, i) => ({ id: `${r.name}-${i}`, name: r.name, formatLabel: r.formatLabel, analysis: r.analysis }));
        // Tell the user if more files were dropped than a comparison can show.
        const note =
          list.length > MAX_COMPARE
            ? `Showing the first ${MAX_COMPARE} of ${list.length} files — compare up to ${MAX_COMPARE} at once.`
            : undefined;
        setState({ phase: 'compare', comparison: buildComparison(inputs), note });
      } else if (results.length === 1) {
        const r = results[0];
        setState({ phase: 'report', flight: r.flight, analysis: r.analysis, analyzedAt: Date.now(), text: r.text });
      } else {
        setState({
          phase: 'error',
          message: 'None of those files auto-detected as a flight. Open them one at a time to map the columns by hand.',
        });
      }
    },
    [onFile, refreshRecents],
  );

  const onSample = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error('sample missing');
      const text = await res.text();
      await tick();
      ingest('sample-altusmetrum.csv', text);
    } catch {
      setState({ phase: 'error', message: 'Could not load the sample flight.' });
    }
  }, [ingest]);

  const onMappingSubmit = useCallback(
    (mappings: ColumnMapping[]) => {
      if (state.phase !== 'mapping') return;
      try {
        const flight = buildFlight({
          source: state.fileName,
          format: 'csv',
          formatLabel: 'Generic CSV',
          headers: state.table.headers,
          dataRows: state.table.dataRows,
          mappings,
        });
        const analysis = analyzeFlight(flight);
        setState({ phase: 'report', flight, analysis, analyzedAt: Date.now(), text: state.text });
        void saveRecent({
          name: state.fileName,
          formatLabel: 'Generic CSV',
          apogeeM: analysis.metrics.apogeeAltitude ?? null,
          text: state.text,
        }).then(refreshRecents);
      } catch (err) {
        setState({ phase: 'error', message: err instanceof Error ? err.message : 'Could not analyze this file.' });
      }
    },
    [state],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  const openRecent = useCallback(
    async (id: string) => {
      setState({ phase: 'loading' });
      const rec = await getRecent(id);
      if (!rec) {
        setState({ phase: 'error', message: 'That saved flight could no longer be read.' });
        return;
      }
      await tick();
      ingest(rec.name, rec.text);
    },
    [ingest],
  );

  const compareRecents = useCallback(async (ids: string[]) => {
    setState({ phase: 'loading' });
    try {
      const inputs = [];
      for (const id of ids.slice(0, MAX_COMPARE)) {
        // Each file is independent: one that can't be re-read or re-analyzed is
        // skipped, not allowed to sink the whole comparison.
        try {
          const rec = await getRecent(id);
          if (!rec) continue;
          // Only auto-detected flights can be compared; a generic CSV that needed
          // manual column mapping can't be re-analyzed without that mapping.
          const result = importFlight({ name: rec.name, text: rec.text });
          if (result.kind !== 'flight') continue;
          inputs.push({
            id,
            name: rec.name,
            formatLabel: result.flight.formatLabel,
            analysis: analyzeFlight(result.flight),
          });
        } catch {
          /* skip this file */
        }
      }
      if (inputs.length < 2) {
        setState({
          phase: 'error',
          message:
            'Need at least two readable flights to compare. Files that needed manual column mapping (Generic CSV) can’t be auto-compared.',
        });
        return;
      }
      setState({ phase: 'compare', comparison: buildComparison(inputs) });
    } catch {
      setState({ phase: 'error', message: 'Could not build the comparison.' });
    }
  }, []);

  const removeOne = useCallback(
    async (id: string) => {
      await removeRecent(id);
      refreshRecents();
    },
    [refreshRecents],
  );

  const clearAll = useCallback(async () => {
    await clearRecents();
    refreshRecents();
  }, [refreshRecents]);

  // A shared link carries the flight in the URL fragment; decode and analyze it.
  useEffect(() => {
    const payload = payloadFromHash(window.location.hash);
    if (!payload) return;
    setState({ phase: 'loading' });
    decodeFlight(payload)
      .then((res) =>
        res ? ingest(res.name, res.text) : setState({ phase: 'error', message: 'This shared link couldn’t be read.' }),
      )
      .catch(() => setState({ phase: 'error', message: 'This shared link couldn’t be read.' }));
  }, [ingest]);

  if (state.phase === 'report') {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={reset}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 print:hidden"
        >
          ← Analyze another flight
        </button>
        <FlightReport
          flight={state.flight}
          analysis={state.analysis}
          analyzedAt={state.analyzedAt}
          sourceText={state.text}
          sys={sys}
          onToggleUnits={toggleUnits}
        />
      </div>
    );
  }

  if (state.phase === 'compare') {
    return <CompareView comparison={state.comparison} note={state.note} sys={sys} onToggleUnits={toggleUnits} onBack={reset} />;
  }

  if (state.phase === 'mapping') {
    return (
      <ColumnMapper
        table={state.table}
        suggested={state.suggested}
        fileName={state.fileName}
        onCancel={reset}
        onSubmit={onMappingSubmit}
      />
    );
  }

  return (
    <div className="space-y-4">
      <DropZone onFiles={onFiles} onSample={onSample} busy={state.phase === 'loading'} />
      {state.phase === 'loading' && (
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Reading…</p>
      )}
      {state.phase === 'error' && (
        <div className="rounded-lg border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          {state.message}
        </div>
      )}
      {state.phase !== 'loading' && (
        <RecentFlights
          recents={recents}
          sys={sys}
          onOpen={openRecent}
          onRemove={removeOne}
          onClear={clearAll}
          onCompare={compareRecents}
        />
      )}
    </div>
  );
}
