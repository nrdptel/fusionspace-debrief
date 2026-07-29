'use client';

import { clearCaptions } from '@/lib/compareCaption';
import { useCallback, useEffect, useState } from 'react';
import {
  listRecents,
  removeRecent,
  clearRecents,
  updateNote,
  exportLogbook,
  importLogbook,
  type RecentMeta,
} from '@/lib/recents';
import { download } from '@/lib/download';

/**
 * The logbook, and everything a surface does to it. Two surfaces show the same list — the
 * analyze page and the comparison page — and they must agree about it: a note added on one,
 * a flight removed on the other, a backup restored from either. Owning that here means one
 * implementation rather than two that drift, and it keeps the difference between the pages
 * to what they're actually FOR.
 *
 * Everything stays on this device (IndexedDB), like the rest of Debrief's state; every call
 * fails soft, so a private window with storage blocked simply shows no logbook.
 */
export interface Logbook {
  recents: RecentMeta[];
  refresh: () => void;
  /** Flights the most recent drop pushed out of the logbook, so the surface showing the list
   *  can name them. Cleared once the flyer has been told (or acts on it) — this is a report
   *  of one event, not a growing tally. */
  forgotten: string[];
  reportForgotten: (names: string[]) => void;
  clearForgotten: () => void;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  note: (id: string, note: string) => Promise<void>;
  /** Download the whole logbook — flights and notes — as a file the flyer keeps. */
  exportAll: () => Promise<number>;
  /** Merge a backup back in; resolves with how many flights it restored. */
  importAll: (file: File) => Promise<number>;
}

export function useLogbook(): Logbook {
  const [recents, setRecents] = useState<RecentMeta[]>([]);
  const [forgotten, setForgotten] = useState<string[]>([]);

  const refresh = useCallback(() => {
    listRecents().then(setRecents);
  }, []);

  useEffect(refresh, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await removeRecent(id);
      refresh();
    },
    [refresh],
  );

  const clear = useCallback(async () => {
    await clearRecents();
    // The comparison captions go too. Clear's own confirm promises that the file text, notes,
    // report labels and column mappings go with the flights — and these live in localStorage
    // rather than IndexedDB, so nothing was taking them: a title typed onto a launch day
    // outlived "delete all N flights on this device", which makes that sentence untrue, and
    // its key named flights that no longer existed.
    clearCaptions();
    setForgotten([]);
    refresh();
  }, [refresh]);

  const reportForgotten = useCallback((names: string[]) => {
    if (names.length > 0) setForgotten(names);
  }, []);
  const clearForgotten = useCallback(() => setForgotten([]), []);

  const note = useCallback(
    async (id: string, text: string) => {
      await updateNote(id, text);
      refresh();
    },
    [refresh],
  );

  // Resolves with how many flights the file actually holds. `exportLogbook` swallows an
  // IndexedDB failure and still returns a well-formed envelope with an EMPTY flights array, so
  // a storage-blocked browser wrote a `debrief-logbook.json` to Downloads that contained
  // nothing — and the clear-confirm offers this as the way out before the app's only
  // irreversible action. A backup that lands and says nothing is worse than one that fails.
  const exportAll = useCallback(async (): Promise<number> => {
    const json = await exportLogbook();
    download(new Blob([json], { type: 'application/json' }), 'debrief-logbook.json');
    try {
      const flights = (JSON.parse(json) as { flights?: unknown[] }).flights;
      return Array.isArray(flights) ? flights.length : 0;
    } catch {
      return 0;
    }
  }, []);

  const importAll = useCallback(
    async (file: File): Promise<number> => {
      try {
        const n = await importLogbook(await file.text());
        if (n > 0) refresh();
        return n;
      } catch {
        return 0;
      }
    },
    [refresh],
  );

  return { recents, refresh, remove, clear, note, exportAll, importAll, forgotten, reportForgotten, clearForgotten };
}
