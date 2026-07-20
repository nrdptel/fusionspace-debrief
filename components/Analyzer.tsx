'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { importFlight } from '@/lib/parsers';
import type { AnalyzedTable } from '@/lib/flight/columns';
import { buildFlight, type ColumnMapping } from '@/lib/flight/build';
import type { RawFlight } from '@/lib/flight/types';
import { analyzeAsync } from '@/lib/analyze/runner';
import type { FlightAnalysis } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import DropZone from './DropZone';
import RecognizedFormats from './RecognizedFormats';
import ColumnMapper from './ColumnMapper';
import FlightReport from './FlightReport';
import RecentFlights from './RecentFlights';
import CompareView from './CompareView';
import {
  saveRecent,
  listRecents,
  getRecent,
  removeRecent,
  clearRecents,
  updateNote,
  exportLogbook,
  importLogbook,
  type RecentMeta,
} from '@/lib/recents';
import { buildComparison, MAX_COMPARE, type Comparison } from '@/lib/compare';
import { decodeFlight, payloadFromHash } from '@/lib/share';
import { decodeBytes } from '@/lib/encoding';
import { fileToText } from '@/lib/fileText';
import { download } from '@/lib/download';

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
  // Analysis is async (it runs in a worker), so a slow load that resolves after a
  // newer one must not overwrite it. Each load bumps this counter and only applies
  // its result if it's still the most recent.
  const reqRef = useRef(0);
  const beginLoad = useCallback(() => {
    const token = ++reqRef.current;
    return (next: State) => {
      if (reqRef.current === token) setState(next);
    };
  }, []);

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
    async (name: string, text: string) => {
      const set = beginLoad();
      try {
        if (text.trim().length === 0) {
          set({ phase: 'error', message: 'That file is empty.' });
          return;
        }
        const result = importFlight({ name, text });
        if (result.kind === 'flight') {
          const analysis = await analyzeAsync(result.flight);
          set({ phase: 'report', flight: result.flight, analysis, analyzedAt: Date.now(), text });
          void saveRecent({
            name,
            formatLabel: result.flight.formatLabel,
            apogeeM: analysis.metrics.apogeeAltitude ?? null,
            maxVelocityMs: Number.isFinite(analysis.metrics.maxVelocity) ? analysis.metrics.maxVelocity : null,
            text,
          }).then(refreshRecents);
        } else if (result.table.dataRows.length === 0) {
          set({
            phase: 'error',
            message: 'Debrief couldn’t find any data rows in this file. Is it a flight log export?',
          });
        } else {
          set({ phase: 'mapping', fileName: name, text, table: result.table, suggested: result.suggested });
        }
      } catch (err) {
        set({ phase: 'error', message: err instanceof Error ? err.message : 'Could not read this file.' });
      }
    },
    [refreshRecents, beginLoad],
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
        // Read from the bytes, not file.text(): an .xlsx workbook is unzipped to
        // CSV, and a UTF-16 export (RRC3 mDACS, Excel "Unicode Text", …) is decoded
        // from its BOM rather than assumed UTF-8.
        const text = await fileToText(file.name, new Uint8Array(await file.arrayBuffer()));
        await tick(); // let the loading state paint before parsing
        await ingest(file.name, text);
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
      const set = beginLoad();
      set({ phase: 'loading' });
      await tick();
      const results: { name: string; formatLabel: string; flight: RawFlight; analysis: FlightAnalysis; text: string }[] = [];
      // Cap on the number of *flights we can show*, not on input files: keep
      // parsing past a file that fails to auto-detect so a valid later file can
      // still fill a slot, and stop once the comparison is full.
      for (const file of list) {
        if (results.length >= MAX_COMPARE) break;
        try {
          if (file.size > MAX_BYTES) continue;
          const text = await fileToText(file.name, new Uint8Array(await file.arrayBuffer()));
          const result = importFlight({ name: file.name, text });
          if (result.kind !== 'flight') continue;
          const analysis = await analyzeAsync(result.flight);
          results.push({ name: file.name, formatLabel: result.flight.formatLabel, flight: result.flight, analysis, text });
          // Awaited (not fire-and-forget) so the per-save prune doesn't race itself.
          await saveRecent({
            name: file.name,
            formatLabel: result.flight.formatLabel,
            apogeeM: analysis.metrics.apogeeAltitude ?? null,
            maxVelocityMs: Number.isFinite(analysis.metrics.maxVelocity) ? analysis.metrics.maxVelocity : null,
            text,
          });
        } catch {
          /* skip this file */
        }
      }
      refreshRecents();
      if (results.length >= 2) {
        const inputs = results.map((r, i) => ({ id: `${r.name}-${i}`, name: r.name, formatLabel: r.formatLabel, analysis: r.analysis }));
        // Only when the cap actually held some flights back from a larger drop.
        const note =
          results.length === MAX_COMPARE && list.length > MAX_COMPARE
            ? `Showing ${MAX_COMPARE} of ${list.length} files — compare up to ${MAX_COMPARE} at once.`
            : undefined;
        set({ phase: 'compare', comparison: buildComparison(inputs), note });
      } else if (results.length === 1) {
        const r = results[0];
        set({ phase: 'report', flight: r.flight, analysis: r.analysis, analyzedAt: Date.now(), text: r.text });
      } else {
        set({
          phase: 'error',
          message: 'None of those files auto-detected as a flight. Open them one at a time to map the columns by hand.',
        });
      }
    },
    [onFile, refreshRecents, beginLoad],
  );

  const onSample = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error('sample missing');
      const text = decodeBytes(new Uint8Array(await res.arrayBuffer()));
      await tick();
      await ingest('sample-altusmetrum.csv', text);
    } catch {
      setState({ phase: 'error', message: 'Could not load the sample flight.' });
    }
  }, [ingest]);

  const onMappingSubmit = useCallback(
    async (mappings: ColumnMapping[]) => {
      if (state.phase !== 'mapping') return;
      const { fileName, table, text } = state;
      const set = beginLoad();
      try {
        const flight = buildFlight({
          source: fileName,
          format: 'csv',
          formatLabel: 'Generic CSV',
          headers: table.headers,
          dataRows: table.dataRows,
          mappings,
        });
        set({ phase: 'loading' });
        const analysis = await analyzeAsync(flight);
        set({ phase: 'report', flight, analysis, analyzedAt: Date.now(), text });
        void saveRecent({
          name: fileName,
          formatLabel: 'Generic CSV',
          apogeeM: analysis.metrics.apogeeAltitude ?? null,
          maxVelocityMs: Number.isFinite(analysis.metrics.maxVelocity) ? analysis.metrics.maxVelocity : null,
          text,
        }).then(refreshRecents);
      } catch (err) {
        set({ phase: 'error', message: err instanceof Error ? err.message : 'Could not analyze this file.' });
      }
    },
    [state, refreshRecents, beginLoad],
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
      await ingest(rec.name, rec.text);
    },
    [ingest],
  );

  const compareRecents = useCallback(async (ids: string[]) => {
    const set = beginLoad();
    set({ phase: 'loading' });
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
            analysis: await analyzeAsync(result.flight),
          });
        } catch {
          /* skip this file */
        }
      }
      if (inputs.length < 2) {
        set({
          phase: 'error',
          message:
            'Need at least two readable flights to compare. Files that needed manual column mapping (Generic CSV) can’t be auto-compared.',
        });
        return;
      }
      set({ phase: 'compare', comparison: buildComparison(inputs) });
    } catch {
      set({ phase: 'error', message: 'Could not build the comparison.' });
    }
  }, [beginLoad]);

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

  const setNote = useCallback(
    async (id: string, note: string) => {
      await updateNote(id, note);
      refreshRecents();
    },
    [refreshRecents],
  );

  // Back up the whole logbook to a file you keep, and restore it on another
  // machine (or after a clear). Still entirely on-device — nothing is uploaded.
  const exportLog = useCallback(async () => {
    const json = await exportLogbook();
    download(new Blob([json], { type: 'application/json' }), 'debrief-logbook.json');
  }, []);

  const importLog = useCallback(
    async (file: File): Promise<number> => {
      try {
        const n = await importLogbook(await file.text());
        if (n > 0) refreshRecents();
        return n;
      } catch {
        return 0;
      }
    },
    [refreshRecents],
  );

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
      <div className="mx-auto w-full max-w-5xl">
        <ColumnMapper
          table={state.table}
          suggested={state.suggested}
          fileName={state.fileName}
          onCancel={reset}
          onSubmit={onMappingSubmit}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <DropZone onFiles={onFiles} onSample={onSample} busy={state.phase === 'loading'} />
      {state.phase === 'loading' && (
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Reading…</p>
      )}
      {state.phase === 'error' && (
        <div className="rounded-lg border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          {state.message}
        </div>
      )}
      {state.phase !== 'loading' && <RecognizedFormats />}
      {state.phase !== 'loading' && (
        <RecentFlights
          recents={recents}
          sys={sys}
          onOpen={openRecent}
          onRemove={removeOne}
          onClear={clearAll}
          onCompare={compareRecents}
          onNote={setNote}
          onExport={exportLog}
          onImport={importLog}
        />
      )}
    </div>
  );
}
