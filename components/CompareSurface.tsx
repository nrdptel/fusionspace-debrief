'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MAX_COMPARE, type Comparison } from '@/lib/compare';
import { compareFromLogbook, idsFromParam, withIds } from '@/lib/compareFromLogbook';
import { decodeUnits, encodeUnits, systemOf, type UnitChoice, type Units } from '@/lib/display';
import { useLogbook } from './useLogbook';
import RecentFlights from './RecentFlights';
import CompareView from './CompareView';

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
  const [sys, setSys] = useState<UnitChoice>('imperial');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [state, setState] = useState<'picking' | 'loading' | 'ready'>('picking');
  const [note, setNote] = useState<string | null>(null);

  // Units are a whole-app choice, remembered on this device and carried in the URL — the
  // same rules as the analyze page, read the same way, so a link opens reading alike.
  useEffect(() => {
    setSys(
      decodeUnits(new URLSearchParams(window.location.search).get('u')) ??
        decodeUnits(window.localStorage.getItem('debrief.units')) ??
        'imperial',
    );
  }, []);

  const remember = useCallback((next: UnitChoice) => {
    try {
      const code = encodeUnits(next);
      window.localStorage.setItem('debrief.units', code);
      const url = new URL(window.location.href);
      url.searchParams.set('u', code);
      window.history.replaceState(null, '', url);
    } catch {
      /* storage blocked — the choice still applies to this view */
    }
  }, []);

  const toggleUnits = useCallback(() => {
    setSys((prev) => {
      const next: UnitChoice = systemOf(prev) === 'imperial' ? 'metric' : 'imperial';
      remember(next);
      return next;
    });
  }, [remember]);

  const setUnits = useCallback(
    (next: Units) => {
      setSys(next);
      remember(next);
    },
    [remember],
  );

  /** Assemble the given logbook ids, and put them in the URL so the view is reloadable. */
  const load = useCallback(async (ids: string[], pushUrl: boolean) => {
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
    setNote(
      skipped.length > 0
        ? `Left out: ${skipped.map((s) => `${s.name} — ${s.why}`).join('; ')}.`
        : null,
    );
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

  const back = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('ids');
    window.history.pushState(null, '', url);
    setComparison(null);
    setState('picking');
    setNote(null);
  }, []);

  if (state === 'ready' && comparison) {
    return (
      <CompareView
        comparison={comparison}
        note={note ?? undefined}
        sys={sys}
        onToggleUnits={toggleUnits}
        onSetUnits={setUnits}
        onBack={back}
        backLabel="← Compare other flights"
      />
    );
  }

  const enough = logbook.recents.length >= 2;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
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

      {!enough && (
        <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {logbook.recents.length === 0
              ? 'Your logbook is empty, so there’s nothing to line up yet.'
              : 'One flight in your logbook — a comparison needs at least two.'}
          </p>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Flights are remembered here as you open them.{' '}
            <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              Open a flight
            </Link>{' '}
            — or drop several at once there and they&apos;ll be compared straight away.
          </p>
        </div>
      )}

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
      />
    </div>
  );
}
