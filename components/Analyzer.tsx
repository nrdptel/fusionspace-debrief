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

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'mapping'; fileName: string; table: AnalyzedTable; suggested: ColumnMapping[] }
  | { phase: 'report'; flight: RawFlight; analysis: FlightAnalysis }
  | { phase: 'error'; message: string };

const SAMPLE_URL = '/samples/sample-altusmetrum.csv';

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

  useEffect(() => {
    setSys(readInitialUnits());
  }, []);

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

  const ingest = useCallback((name: string, text: string) => {
    try {
      const result = importFlight({ name, text });
      if (result.kind === 'flight') {
        setState({ phase: 'report', flight: result.flight, analysis: analyzeFlight(result.flight) });
      } else {
        setState({ phase: 'mapping', fileName: name, table: result.table, suggested: result.suggested });
      }
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Could not read this file.' });
    }
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setState({ phase: 'loading' });
      try {
        const text = await file.text();
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
      ingest('sample-altusmetrum.csv', await res.text());
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
        setState({ phase: 'report', flight, analysis: analyzeFlight(flight) });
      } catch (err) {
        setState({ phase: 'error', message: err instanceof Error ? err.message : 'Could not analyse this file.' });
      }
    },
    [state],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

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
        <FlightReport flight={state.flight} analysis={state.analysis} sys={sys} onToggleUnits={toggleUnits} />
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
    </div>
  );
}
