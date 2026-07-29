'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MAX_COMPARE, type Comparison } from '@/lib/compare';
import { compareFromLogbook, idsFromParam, withIds } from '@/lib/compareFromLogbook';
import { encodeUnits } from '@/lib/display';
import { useUnits } from './UnitsProvider';
import { useLogbook } from './useLogbook';
import { ingestFiles } from '@/lib/ingest';
import { MAPPING_BUSY } from '@/lib/dropCopy';
import { importFlight } from '@/lib/parsers';
import { flightFromMapping } from '@/lib/mapped';
import type { AnalyzedTable } from '@/lib/flight/columns';
import type { ColumnMapping } from '@/lib/flight/build';
import ColumnMapper from './ColumnMapper';
import RecentFlights from './RecentFlights';
import CompareView from './CompareView';
import DropOverlay from './DropOverlay';
import { useWindowFileDrop } from './useWindowFileDrop';

/**
 * The comparison surface: a launch day's flights lined up side by side, as its own route.
 *
 * Why a route rather than a state of the analyze page. A comparison is *about a set*, and the
 * set lives in this browser's logbook — so it can be named in the URL (`?ids=…`), reloaded,
 * bookmarked, and kept open in a second tab beside a single flight's report. Before this, a
 * comparison vanished on reload and there was no way back to it but rebuilding it by hand.
 *
 * What it is NOT: a second copy of the analyze page. Reading one flight lives on `/`; this
 * surface only assembles, reconciles and exports several. Dropping files here is offered
 * because a flyer who lands on it with a folder shouldn't be sent away, and those files go
 * into the logbook like any other, which is what makes the resulting view addressable.
 */
export default function CompareSurface() {
  const logbook = useLogbook();
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [state, setState] = useState<'picking' | 'loading' | 'ready' | 'mapping'>('picking');
  const [note, setNote] = useState<string | null>(null);
  /** Files from the last drop that aren't a format Debrief knows but do hold columns of
   *  numbers. Kept so this surface can offer the mapper on them, rather than naming them in
   *  a sentence and sending the flyer to another page to start the drop over. */
  const [mappable, setMappable] = useState<{ name: string; text: string }[]>([]);
  /** The file currently open in the mapper, and the comparison it goes back to. */
  const [mapping, setMapping] = useState<{
    fileName: string;
    text: string;
    table: AnalyzedTable;
    suggested: ColumnMapping[];
    addToIds: string[];
  } | null>(null);

  // Units are a whole-app choice, owned above the header so the control is on every surface
  // — this page used to keep a second copy of the same reader and writer.
  const { sys } = useUnits();

  /** Assemble the given logbook ids, and put them in the URL so the view is reloadable. */
  const load = useCallback(async (ids: string[], pushUrl: boolean, extraNote?: string) => {
    if (ids.length < 2) return;
    setState('loading');
    const { comparison: built, skipped, used } = await compareFromLogbook(ids);
    if (!built) {
      setComparison(null);
      setState('picking');
      setNote(
        used === 1
          ? 'Only one of those flights could be read, so there’s nothing to compare it against yet.'
          : `Couldn’t read those flights: ${skipped.map((s) => `${s.name} — ${s.why}`).join('; ')}`,
      );
      return;
    }
    setComparison(built);
    setState('ready');
    // A drop can have its own account of what it left out; keep both, since a file the
    // drop couldn't use and a logbook id that no longer reads are different problems.
    const own = skipped.length > 0 ? `Left out: ${skipped.map((s) => `${s.name} — ${s.why}`).join('; ')}.` : '';
    const both = [own, extraNote].filter(Boolean).join(' ');
    setNote(both || null);
    if (pushUrl) {
      window.history.pushState(null, '', withIds(new URL(window.location.href), ids));
    }
  }, []);

  // Restore from the URL on arrival, and again on back/forward — the surface follows the
  // address bar rather than keeping its own private idea of what's on screen.
  useEffect(() => {
    const apply = () => {
      const ids = idsFromParam(new URLSearchParams(window.location.search).get('ids'));
      if (ids.length >= 2) void load(ids, false);
      else {
        setComparison(null);
        setState('picking');
      }
    };
    apply();
    window.addEventListener('popstate', apply);
    return () => window.removeEventListener('popstate', apply);
  }, [load]);

  const onCompare = useCallback((ids: string[]) => void load(ids, true), [load]);

  /**
   * Files dropped here. A flyer who lands on the surface called "Compare flights" with a
   * launch day's folder was being sent to the analyze page to drop it and come back — the
   * one action this page is named for was the one it couldn't take.
   *
   * The reading of the folder is `lib/ingest`, shared with the analyze page, so the two
   * surfaces can't disagree about what a launch day holds. Everything lands in the logbook
   * on the way through, which is what gives the resulting comparison an address.
   */
  // The same window-level catch the analyze page uses: this surface has a compact drop box,
  // but a file released in the margins, on the logbook, or on a loaded comparison used to
  // make the browser navigate away to the raw CSV. See components/useWindowFileDrop.ts.
  const onDropFiles = useCallback(
    async (files: File[]) => {
      const list = files.filter(Boolean);
      if (list.length === 0) return;
      setState('loading');
      setNote(null);
      const { results, skipped, mappable: mappableFiles, paired, forgotten } = await ingestFiles(list, MAX_COMPARE);
      logbook.reportForgotten(forgotten);
      logbook.refresh();

      const ids = results.map((r) => r.savedId).filter((v): v is string => !!v);
      // A file that needs mapping is only offered when the flights it would join have an
      // address — that address is what it rejoins them at. Without one, it goes back to
      // being named in the left-out sentence.
      const offerable = ids.length >= 2 ? mappableFiles : [];
      setMappable(offerable);

      // A summary that PAIRED is no longer "left out" — its figures are on the flight and it
      // is named below instead. One that found no log to belong to is already in `skipped`,
      // with the reason ingest gives it, so it isn't listed twice.
      const left = [
        ...skipped.map((s) => `${s.name} — ${s.why}`),
        ...(offerable.length > 0 ? [] : mappableFiles.map((m) => `${m.name} — needs its columns mapped, one file at a time`)),
      ];
      const leftNote = left.length > 0 ? ` Left out: ${left.join('; ')}.` : '';
      const pairedNote =
        paired.length > 0
          ? ` Read the device's own summary alongside the flight (${paired.join('; ')}) — its figures are shown beside Debrief's read as a cross-check, not merged into it.`
          : '';

      if (ids.length >= 2) {
        void load(ids, true, `${leftNote}${pairedNote}`.trim() || undefined);
        return;
      }
      setState('picking');
      setNote(
        results.length === 0
          ? `Nothing in that drop could be read as a flight.${leftNote}`
          : `Added ${results.map((r) => r.name).join(', ')} to your logbook — tick ${results.length === 1 ? 'it' : 'them'} with another flight to compare.${leftNote}${pairedNote}`,
      );
    },
    [load, logbook],
  );

  const back = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('ids');
    window.history.pushState(null, '', url);
    setComparison(null);
    setState('picking');
    setNote(null);
    setMappable([]);
  }, []);

  /**
   * Open the mapper on one file from this drop, without leaving the surface.
   *
   * The comparison this file rejoins is named by the ids already in the address bar, so
   * mapping it is a round trip rather than a departure: the flyer stays on the page they
   * dropped a launch day onto. It used to be a sentence — "needs its columns mapped, which
   * happens on the analyze page" — with nothing to press, on the one surface whose whole job
   * is assembling a set.
   */
  const onMapFile = useCallback(
    (name: string) => {
      const file = mappable.find((m) => m.name === name);
      const addToIds = idsFromParam(new URLSearchParams(window.location.search).get('ids'));
      if (!file || addToIds.length < 2) return;
      try {
        const result = importFlight({ name: file.name, text: file.text });
        if (result.kind !== 'mapping') {
          setNote(`${file.name} could not be opened for mapping.`);
          return;
        }
        setMapping({ fileName: file.name, text: file.text, table: result.table, suggested: result.suggested, addToIds });
        setState('mapping');
      } catch (err) {
        setNote(err instanceof Error ? err.message : `Could not read ${file.name}.`);
      }
    },
    [mappable],
  );

  /** Back out of the mapper: the comparison is still at its own address, so return to it
   *  rather than to an empty drop zone, and leave the file on offer to try again. */
  const cancelMapping = useCallback(() => {
    setMapping(null);
    setState(comparison ? 'ready' : 'picking');
  }, [comparison]);

  const onMappingSubmit = useCallback(
    async (mappings: ColumnMapping[]) => {
      if (!mapping) return;
      const { fileName, text, table, addToIds } = mapping;
      setState('loading');
      try {
        const { save } = await flightFromMapping(fileName, text, table, mappings);
        // Awaited: the id it was saved under is what names it in the comparison, and with
        // no id there is nothing to add — say so rather than appear to have dropped it.
        const id = await save;
        logbook.refresh();
        setMapping(null);
        setMappable((prev) => prev.filter((m) => m.name !== fileName));
        if (!id) {
          setState(comparison ? 'ready' : 'picking');
          setNote(`${fileName} was read, but this browser wouldn’t store it, so it can’t join the comparison.`);
          return;
        }
        await load([...addToIds, id], true);
      } catch (err) {
        setMapping(null);
        setState(comparison ? 'ready' : 'picking');
        setNote(err instanceof Error ? err.message : `Could not analyze ${fileName}.`);
      }
    },
    [mapping, comparison, load, logbook],
  );

  // Only the mapper refuses — see the note in Analyzer.tsx; a drop during `loading`
  // supersedes the load in flight rather than being turned away.
  const canTakeADrop = state !== 'mapping';
  const { dragging } = useWindowFileDrop({ onFiles: (files) => void onDropFiles(files), accept: canTakeADrop });

  if (state === 'mapping' && mapping) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <DropOverlay show={dragging} accept={canTakeADrop} reason={MAPPING_BUSY} />
        <ColumnMapper
          table={mapping.table}
          suggested={mapping.suggested}
          fileName={mapping.fileName}
          onCancel={cancelMapping}
          onSubmit={onMappingSubmit}
        />
      </div>
    );
  }

  if (state === 'ready' && comparison) {
    return (
      <>
        <DropOverlay show={dragging} accept={canTakeADrop} reason={MAPPING_BUSY} />
        <CompareView
          comparison={comparison}
          note={note ?? undefined}
          sys={sys}
          onBack={back}
          backLabel="← Compare other flights"
          headingLevel="h1"
          mappable={mappable.map((m) => m.name)}
          onMapFile={onMapFile}
        />
      </>
    );
  }

  const enough = logbook.recents.length >= 2;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <DropOverlay show={dragging} accept={canTakeADrop} reason={MAPPING_BUSY} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Compare flights
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Line up to {MAX_COMPARE} flights from your logbook — a launch day, a season, or several
          altimeters that flew the same rocket — and read their curves and numbers side by side.
          Independent measurements stay independent: they&apos;re shown next to each other, never
          averaged into one figure.{' '}
          <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            Reading a single flight lives on the analyze page
          </Link>
          .
        </p>
      </div>

      {state === 'loading' && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
          Reading the flights…
        </p>
      )}

      {note && (
        <p
          role="status"
          className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {note}
        </p>
      )}

      {/* Add flights right here. Deliberately compact rather than the analyze page's hero
          drop zone: on this surface adding files is a step towards a comparison, not the
          headline. Shown whether or not the logbook already has enough — a flyer with a
          season logged still arrives with today's folder. */}
      {/* No drag handlers of its own: the window owns the gesture now (useWindowFileDrop),
          so a drop lands the same way whether it hits this box, the logbook below it, or the
          margin beside it — and a local handler here would have ingested the same files a
          second time as the event bubbled. The box stays as the visible affordance and the
          file picker. */}
      <div
        className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center transition dark:border-zinc-700"
      >
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {logbook.recents.length === 0
            ? 'Your logbook is empty — drop a launch day’s files here to start'
            : !enough
              ? 'One flight in your logbook — a comparison needs at least two'
              : 'Drop more flight logs here to add them'}
        </p>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          Drop {MAX_COMPARE} or fewer and they&apos;re compared straight away; they go into the
          logbook below on the way through, and never leave this device.
        </p>
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500">
          Choose flight logs
          <input
            type="file"
            multiple
            className="sr-only"
            aria-label="Choose flight logs to compare"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) void onDropFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </label>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Reading one flight, and mapping a file Debrief doesn&apos;t recognize, live on the{' '}
          <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            analyze page
          </Link>
          .
        </p>
      </div>

      {/* The logbook itself, with its own search, sort and per-flight notes: ticking two or
          more is how a comparison starts here. Same component and same state as the analyze
          page, so a note added on either shows on both. */}
      <RecentFlights
        recents={logbook.recents}
        sys={sys}
        onOpen={(id) => {
          // Reading one flight belongs on the analyze page, which can restore it from the
          // logbook by id — so the row still works from this surface.
          window.location.href = `/?open=${encodeURIComponent(id)}`;
        }}
        onRemove={logbook.remove}
        onClear={logbook.clear}
        onCompare={onCompare}
        onNote={logbook.note}
        onExport={logbook.exportAll}
        onImport={logbook.importAll}
        forgotten={logbook.forgotten}
        onDismissForgotten={logbook.clearForgotten}
      />
    </div>
  );
}
