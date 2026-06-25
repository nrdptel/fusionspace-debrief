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
import { saveRecent, listRecents, getRecent, removeRecent, clearRecents, type RecentMeta } from '@/lib/recents';
import { decodeFlight, payloadFromHash } from '@/lib/share';

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'mapping'; fileName: string; text: string; table: AnalyzedTable; suggested: ColumnMapping[] }
  | { phase: 'report'; flight: RawFlight; analysis: FlightAnalysis; analyzedAt: number; text: string }
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
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
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
      <DropZone onFile={onFile} onSample={onSample} busy={state.phase === 'loading'} />
      {state.phase === 'loading' && (
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Reading…</p>
      )}
      {state.phase === 'error' && (
        <div className="rounded-lg border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          {state.message}
        </div>
      )}
      {state.phase !== 'loading' && (
        <RecentFlights recents={recents} sys={sys} onOpen={openRecent} onRemove={removeOne} onClear={clearAll} />
      )}
    </div>
  );
}
