'use client';

import { clearCaptions } from '@/lib/compareMemory';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readRecents,
  removeRecent,
  clearRecents,
  updateNote,
  setFlightIds,
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
  /** Which of `DESIGN.md` §5's states the list is in. `loading` until IndexedDB answers —
   *  which on a static export is every cold load — and `blocked` where it refused outright.
   *  `ready` with an empty `recents` is the only one that means "you have no flights". */
  status: 'loading' | 'ready' | 'blocked';
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
  /** Say which flight some rows are recordings of — or that they are flights of their own
   *  again. One call for the whole statement, so a tab closed halfway through cannot leave
   *  half a flight joined. */
  group: (changes: { id: string; flightId: string | null }[]) => Promise<void>;
  /** Download the whole logbook — flights and notes — as a file the flyer keeps. */
  exportAll: () => Promise<number>;
  /** Merge a backup back in. `blocked` is the browser refusing to write, which a bare count
   *  could not tell from a file with nothing in it — see `importLogbook`. */
  importAll: (file: File) => Promise<{ restored: number; blocked: boolean }>;
  /** Logbook ids the last drop produced — what a grouping may be offered over. */
  arrived: string[];
  reportArrived: (ids: string[]) => void;
  clearArrived: () => void;
}

export function useLogbook(): Logbook {
  const [recents, setRecents] = useState<RecentMeta[]>([]);
  // **`recents.length === 0` was answering three different questions with one number** — the
  // logbook is empty, the read has not come back yet, or the browser refused storage — and the
  // first of those is the only one the surface was written for. It starts as `loading` because
  // the read is asynchronous AND because every route here is a static export: the empty state is
  // PRERENDERED into `out/index.html` and `out/compare/index.html`, so until the bundle hydrates
  // and IndexedDB answers, a flyer with a full logbook was being shown "flights you open are
  // remembered here on this device" and an offer to restore a backup. On every cold load.
  const [status, setStatus] = useState<Logbook['status']>('loading');
  const [forgotten, setForgotten] = useState<string[]>([]);
  const [arrived, setArrived] = useState<string[]>([]);

  // **A failed READ is only "this browser won't keep a logbook" while we have never had one.**
  // `refresh` runs after every remove, note, group, clear and import, so treating any rejection as
  // `blocked` meant one transient failure mid-session replaced a flyer's fifty rows — and their
  // search, notes, export, import and clear along with them — with a confident and probably false
  // diagnosis. Worse than the defect this whole change exists to fix. Once a read has succeeded,
  // the storage is demonstrably not refusing, so a later failure keeps the rows already in hand
  // and leaves the status alone; only a refusal on a logbook we have never successfully read is
  // reported as one.
  const everRead = useRef(false);
  const refresh = useCallback(() => {
    readRecents().then(({ recents: rows, blocked }) => {
      if (blocked && everRead.current) return;
      if (!blocked) everRead.current = true;
      setRecents(rows);
      setStatus(blocked ? 'blocked' : 'ready');
    });
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
    // What was arranged about a comparison goes too — its label, its notes and the order the
    // columns were put in. Clear's own confirm promises that the file text, notes, report labels
    // and column mappings go with the flights, and these live in localStorage rather than
    // IndexedDB, so nothing was taking them: a title typed onto a launch day outlived "delete all
    // N flights on this device", which makes that sentence untrue, and every key named flights
    // that no longer existed.
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

  const group = useCallback(
    async (changes: { id: string; flightId: string | null }[]) => {
      await setFlightIds(changes);
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
    async (file: File): Promise<{ restored: number; blocked: boolean }> => {
      try {
        const out = await importLogbook(await file.text());
        if (out.restored > 0) refresh();
        return out;
      } catch {
        // Reading the FILE failed, which is not the browser refusing storage.
        return { restored: 0, blocked: false };
      }
    },
    [refresh],
  );

  /** Which logbook rows the drop that just happened produced. A grouping is only ever OFFERED
   *  over these — a proposal is about the files a flyer just dropped, not about their whole
   *  logbook, and scoping it this way is also what stops it reappearing forever after they say
   *  no. Transient by design, exactly like `forgotten` beside it. */
  const reportArrived = useCallback((ids: string[]) => {
    setArrived(ids.filter(Boolean));
  }, []);
  const clearArrived = useCallback(() => setArrived([]), []);

  return {
    recents,
    status,
    refresh,
    remove,
    clear,
    note,
    group,
    exportAll,
    importAll,
    forgotten,
    reportForgotten,
    clearForgotten,
    arrived,
    reportArrived,
    clearArrived,
  };
}
