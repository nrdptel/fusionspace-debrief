'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { importFlight, ParseGuidanceError } from '@/lib/parsers';
import { summaryFigures } from '@/lib/parsers/deviceSummary';
import type { AnalyzedTable } from '@/lib/flight/columns';
import { buildFlight, type ColumnMapping } from '@/lib/flight/build';
import type { RawFlight } from '@/lib/flight/types';
import { analyzeAsync } from '@/lib/analyze/runner';
import type { FlightAnalysis } from '@/lib/analyze/types';
import { decodeUnits, encodeUnits, systemOf, type UnitChoice, type Units } from '@/lib/display';
import DropZone from './DropZone';
import RecognizedFormats from './RecognizedFormats';
import ColumnMapper from './ColumnMapper';
import FlightReport from './FlightReport';
import RecentFlights from './RecentFlights';
import { useLogbook } from './useLogbook';
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
  /** `what` names what is being read, so a six-second wait on a phone says which file
   *  it is working on rather than only that it is working. */
  | { phase: 'loading'; what?: { name: string; bytes?: number } }
  | { phase: 'mapping'; fileName: string; text: string; table: AnalyzedTable; suggested: ColumnMapping[] }
  | { phase: 'report'; flight: RawFlight; analysis: FlightAnalysis; analyzedAt: number; text: string; note?: string }
  /** `ids` are the logbook keys the dropped files were saved under, when storage allowed
   *  it — enough to offer this comparison at its own address on /compare. */
  | { phase: 'compare'; comparison: Comparison; note?: string; ids?: string[] }
  | { phase: 'error'; message: string };

const SAMPLE_URL = '/samples/sample-altusmetrum.csv';
const MAX_BYTES = 64 * 1024 * 1024; // 64 MB — far above any real flight log

const tick = () => new Promise((r) => setTimeout(r, 0));

/** What a batch drop couldn't read, said plainly. Names the files — a flyer who dropped a
 *  folder needs to know *which* one is missing — and keeps a logger's own guidance
 *  (a Blue Raven's high-rate half, a device summary) rather than flattening it. */
function skippedNote(skipped: { name: string; why: string }[]): string {
  const one = skipped.length === 1;
  const listed = skipped.map((s) => `${s.name} — ${s.why}`).join('; ');
  return `${one ? 'One dropped file was' : `${skipped.length} dropped files were`} left out of this comparison: ${listed}.`;
}

/** The same account when only ONE file of a batch turned out to be readable, so there is a
 *  single flight report where the flyer asked for a comparison. Saying "here is a report"
 *  and nothing else leaves them to notice the other files went missing by counting. */
function loneFlightNote(dropped: number, skipped: { name: string; why: string }[]): string {
  const listed = skipped.map((s) => `${s.name} — ${s.why}`).join('; ');
  return `Only one of those ${dropped} files could be read as a flight, so this is a single report rather than a comparison. Left out: ${listed}.`;
}

/** What a summary file contributed, so the flyer can see the drop did something with it
 *  rather than wondering why one of their two files vanished. */
function pairedNote(paired: string[]): string {
  return `Read the device's own summary alongside the flight (${paired.join('; ')}) — its figures are shown beside Debrief's read as a cross-check, not merged into it.`;
}

/** Does this file name belong to the rocket a summary names? Compared on letters and digits
 *  only, so "BlRv_SN1537_LR_04-12-2025.csv" matches a summary for "BlRv_SN1537". */
function sameRocket(fileName: string, rocket: string): boolean {
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = fold(rocket);
  return key.length >= 4 && fold(fileName).includes(key);
}

function readInitialUnits(): UnitChoice {
  if (typeof window === 'undefined') return 'imperial';
  // A shared link's units win over this device's remembered choice, so a link opens
  // reading the way its sender saw it.
  return (
    decodeUnits(new URLSearchParams(window.location.search).get('u')) ??
    decodeUnits(window.localStorage.getItem('debrief.units')) ??
    'imperial'
  );
}

/** Remember the choice on this device and put it in the URL, so a refresh, a shared
 *  link and the next visit all read the same way. */
function rememberUnits(next: UnitChoice): void {
  try {
    const code = encodeUnits(next);
    window.localStorage.setItem('debrief.units', code);
    const url = new URL(window.location.href);
    url.searchParams.set('u', code);
    window.history.replaceState(null, '', url);
  } catch {
    /* a private window with storage blocked — the choice still applies to this view */
  }
}

/**
 * What the wait says. On a desktop a big log is read in about a second and this barely
 * shows; on a phone at the field an 11 MB log takes six, which is long enough that a bare
 * "Reading…" reads as stuck and gets tapped again. So it names the file, states its size
 * where that is why it is slow, and moves — while repeating the one thing a flyer might
 * otherwise wonder about a long wait: nothing is being sent anywhere.
 */
function ReadingNote({ what }: { what?: { name: string; bytes?: number } }) {
  const mb = what?.bytes != null ? what.bytes / 1024 / 1024 : null;
  return (
    <div role="status" aria-live="polite" className="text-center text-sm text-zinc-500 dark:text-zinc-400">
      <p>
        <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500 align-middle" />
        Reading {what?.name ? <span className="font-mono text-xs">{what.name}</span> : 'the file'}…
      </p>
      {mb != null && mb >= 2 && (
        <p className="mt-1 text-xs">
          {mb.toFixed(1)} MB — a log this size takes a few seconds to read and analyze here on
          your device. Nothing is being sent anywhere.
        </p>
      )}
    </div>
  );
}

export default function Analyzer() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [sys, setSys] = useState<UnitChoice>('imperial');
  // The logbook and everything done to it, shared with the comparison surface so a note
  // added on either shows on both.
  const logbook = useLogbook();
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

  useEffect(() => {
    setSys(readInitialUnits());
    logbook.refresh();
  }, [logbook.refresh]);

  // The fast path: the whole set flips between feet and metres, discarding any
  // per-quantity overrides — one click back to a familiar system.
  const toggleUnits = useCallback(() => {
    setSys((prev) => {
      const next: UnitChoice = systemOf(prev) === 'imperial' ? 'metric' : 'imperial';
      rememberUnits(next);
      return next;
    });
  }, []);

  const setUnits = useCallback((next: Units) => {
    setSys(next);
    rememberUnits(next);
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
            ...(result.flight.flownAt ? { flownAt: result.flight.flownAt } : {}),
            text,
          }).then(logbook.refresh);
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
    [logbook.refresh, beginLoad],
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
      setState({ phase: 'loading', what: { name: file.name, bytes: file.size } });
      try {
        // Read from the bytes, not file.text(): an .xlsx workbook is unzipped to
        // CSV, and a UTF-16 export (RRC3 mDACS, Excel "Unicode Text", …) is decoded
        // from its BOM rather than assumed UTF-8.
        const text = await fileToText(file.name, new Uint8Array(await file.arrayBuffer()));
        await tick(); // let the loading state paint before parsing
        await ingest(file.name, text);
      } catch (err) {
        // A deliberate, user-facing message (e.g. an .xlsx that couldn't be
        // unzipped) should reach the flyer, not be hidden behind a generic line.
        setState({
          phase: 'error',
          message: err instanceof ParseGuidanceError ? err.message : 'Could not read this file.',
        });
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
      const results: { name: string; formatLabel: string; flight: RawFlight; analysis: FlightAnalysis; text: string; savedId: string | null }[] = [];
      // Cap on the number of *flights we can show*, not on input files: keep
      // parsing past a file that fails to auto-detect so a valid later file can
      // still fill a slot, and stop once the comparison is full.
      // Whatever a batch couldn't read, and why. A launch day's folder mixes loggers
      // Debrief auto-detects with files that need the column mapper, a Blue Raven's
      // high-rate half, a device summary — dropping those on the floor without a word
      // leaves the flyer counting flights to notice one is missing.
      const skipped: { name: string; why: string }[] = [];
      // A dropped device summary isn't a flight, but it isn't rubbish either: it holds the
      // altimeter's OWN headline figures for the flight in the log beside it. Held aside
      // here and paired up below, so the pair a Featherweight app writes reads as one
      // flight with a cross-check rather than one flight and one rejected file.
      const summaries: { name: string; figures: NonNullable<ReturnType<typeof summaryFigures>> }[] = [];
      for (const file of list) {
        if (results.length >= MAX_COMPARE) break;
        let text = '';
        try {
          if (file.size > MAX_BYTES) {
            skipped.push({ name: file.name, why: 'too large to read in the browser' });
            continue;
          }
          text = await fileToText(file.name, new Uint8Array(await file.arrayBuffer()));
          const result = importFlight({ name: file.name, text });
          if (result.kind !== 'flight') {
            skipped.push({ name: file.name, why: 'needs its columns mapped, which only works one file at a time' });
            continue;
          }
          const analysis = await analyzeAsync(result.flight);
          // Awaited (not fire-and-forget) so the per-save prune doesn't race itself.
          const savedId = await saveRecent({
            name: file.name,
            formatLabel: result.flight.formatLabel,
            apogeeM: analysis.metrics.apogeeAltitude ?? null,
            maxVelocityMs: Number.isFinite(analysis.metrics.maxVelocity) ? analysis.metrics.maxVelocity : null,
            ...(result.flight.flownAt ? { flownAt: result.flight.flownAt } : {}),
            text,
          });
          results.push({ name: file.name, formatLabel: result.flight.formatLabel, flight: result.flight, analysis, text, savedId });
        } catch (e) {
          const figures = text ? summaryFigures(text) : null;
          if (figures) {
            summaries.push({ name: file.name, figures });
            continue;
          }
          // A guidance error explains itself (the Blue Raven high-rate file); anything
          // else is just unreadable.
          const why = e instanceof ParseGuidanceError ? e.message : 'couldn’t be read as a flight';
          skipped.push({ name: file.name, why });
        }
      }

      // Pair each summary with the log it belongs to. The key is the rocket name the
      // summary itself states, which the app also puts in the log's file name — data, not a
      // naming convention — falling back to the obvious case of one flight and one summary.
      const paired: string[] = [];
      for (const s of summaries) {
        const target =
          results.find((r) => sameRocket(r.name, s.figures.rocket)) ??
          (results.length === 1 && summaries.length === 1 ? results[0] : undefined);
        if (!target) {
          skipped.push({
            name: s.name,
            why: `the device's own summary for “${s.figures.rocket}”, but its flight log wasn't in this drop`,
          });
          continue;
        }
        // Beside Debrief's read, never merged into it: the figures land in `reported`,
        // which is what the cross-check panel compares against. A figure the log already
        // stated for itself wins — that one came from the flight record.
        const already = new Set((target.flight.reported ?? []).map((v) => v.metric));
        const added = s.figures.reported.filter((v) => !already.has(v.metric));
        target.flight = {
          ...target.flight,
          ...(added.length ? { reported: [...(target.flight.reported ?? []), ...added] } : {}),
          ...(target.flight.flownAt ?? s.figures.flownAt ? { flownAt: target.flight.flownAt ?? s.figures.flownAt } : {}),
        };
        paired.push(`${s.name} → ${target.name}`);
      }
      logbook.refresh();
      if (results.length >= 2) {
        const inputs = results.map((r, i) => ({ id: `${r.name}-${i}`, name: r.name, formatLabel: r.formatLabel, analysis: r.analysis, ...(r.flight.flownAt ? { flownAt: r.flight.flownAt } : {}) }));
        const notes: string[] = [];
        // Only when the cap actually held some flights back from a larger drop.
        if (results.length === MAX_COMPARE && list.length > MAX_COMPARE) {
          notes.push(`Showing ${MAX_COMPARE} of ${list.length} files — compare up to ${MAX_COMPARE} at once.`);
        }
        if (paired.length > 0) notes.push(pairedNote(paired));
        if (skipped.length > 0) notes.push(skippedNote(skipped));
        // Every dropped flight went into the logbook, so this comparison HAS an address —
        // offer it rather than leaving a view that vanishes on reload.
        const ids = results.map((r) => r.savedId).filter((v): v is string => !!v);
        set({
          phase: 'compare',
          comparison: buildComparison(inputs),
          note: notes.join(' ') || undefined,
          ...(ids.length === results.length ? { ids } : {}),
        });
      } else if (results.length === 1) {
        const r = results[0];
        set({
          phase: 'report',
          flight: r.flight,
          analysis: r.analysis,
          analyzedAt: Date.now(),
          text: r.text,
          note:
            skipped.length > 0
              ? loneFlightNote(list.length, skipped)
              : paired.length > 0
                ? pairedNote(paired)
                : undefined,
        });
      } else {
        set({
          phase: 'error',
          message: 'None of those files auto-detected as a flight. Open them one at a time to map the columns by hand.',
        });
      }
    },
    [onFile, logbook.refresh, beginLoad],
  );

  const onSample = useCallback(async () => {
    setState({ phase: 'loading', what: { name: 'the sample flight' } });
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
          reported: table.reported,
        });
        set({ phase: 'loading' });
        const analysis = await analyzeAsync(flight);
        set({ phase: 'report', flight, analysis, analyzedAt: Date.now(), text });
        void saveRecent({
          name: fileName,
          formatLabel: 'Generic CSV',
          apogeeM: analysis.metrics.apogeeAltitude ?? null,
          maxVelocityMs: Number.isFinite(analysis.metrics.maxVelocity) ? analysis.metrics.maxVelocity : null,
          ...(flight.flownAt ? { flownAt: flight.flownAt } : {}),
          text,
        }).then(logbook.refresh);
      } catch (err) {
        set({ phase: 'error', message: err instanceof Error ? err.message : 'Could not analyze this file.' });
      }
    },
    [state, logbook.refresh, beginLoad],
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

  // Comparing from the logbook happens on the comparison surface, which can be reloaded,
  // bookmarked and opened beside a single flight — the ids are all it needs, and they are
  // logbook keys on this device, not flight data.
  // The unit choice rides along, so a comparison opens reading the way this page did even
  // when it came from a shared `?u=` link that was never stored on this device.
  const compareRecents = useCallback(
    (ids: string[]) => {
      window.location.href = `/compare?ids=${ids.map(encodeURIComponent).join(',')}&u=${encodeUnits(sys)}`;
    },
    [sys],
  );

  // Back up the whole logbook to a file you keep, and restore it on another
  // machine (or after a clear). Still entirely on-device — nothing is uploaded.
  // A logbook row on another surface (the comparison page) links here to read one flight:
  // `/?open=<id>`. The flight itself never travels — only its logbook id, which this page
  // resolves against the same on-device store.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open');
    if (!id) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    window.history.replaceState(null, '', url);
    void openRecent(id);
    // openRecent is stable; this runs once for the id the page arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A shared link carries the flight in the URL fragment; decode and analyze it.
  useEffect(() => {
    const payload = payloadFromHash(window.location.hash);
    if (!payload) return;
    setState({ phase: 'loading', what: { name: 'the shared flight' } });
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
        {/* What the drop couldn't read. Not print:hidden — a report a flyer keeps should
            say which of their files it didn't cover. It stays out of the flight's own
            exports, which describe this flight rather than the folder it arrived in. */}
        {state.note && (
          <p
            role="status"
            className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
          >
            {state.note}
          </p>
        )}
        <FlightReport
          flight={state.flight}
          analysis={state.analysis}
          analyzedAt={state.analyzedAt}
          sourceText={state.text}
          sys={sys}
          onToggleUnits={toggleUnits}
          onSetUnits={setUnits}
        />
      </div>
    );
  }

  if (state.phase === 'compare') {
    return (
      <CompareView
        comparison={state.comparison}
        note={state.note}
        sys={sys}
        onToggleUnits={toggleUnits}
        onSetUnits={setUnits}
        onBack={reset}
        permalink={state.ids && state.ids.length >= 2 ? `/compare?ids=${state.ids.join(',')}&u=${encodeUnits(sys)}` : undefined}
      />
    );
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
      {state.phase === 'loading' && <ReadingNote what={state.what} />}
      {state.phase === 'error' && (
        <div className="rounded-lg border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          {state.message}
        </div>
      )}
      {state.phase !== 'loading' && <RecognizedFormats />}
      {state.phase !== 'loading' && (
        <RecentFlights
          recents={logbook.recents}
          sys={sys}
          onOpen={openRecent}
          onRemove={logbook.remove}
          onClear={logbook.clear}
          onCompare={compareRecents}
          onNote={logbook.note}
          onExport={logbook.exportAll}
          onImport={logbook.importAll}
        />
      )}
    </div>
  );
}
