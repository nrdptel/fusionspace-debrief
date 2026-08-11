'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { importFlight, ParseGuidanceError } from '@/lib/parsers';
import { importRecent } from '@/lib/reopen';
import { ingestFiles, groupsRestoredNote, highRateNote, predictionNote, unreadNote, MAX_BYTES } from '@/lib/ingest';
import type { AnalyzedTable } from '@/lib/flight/columns';
import { buildFlight, type ColumnMapping } from '@/lib/flight/build';
import { flightFromMapping } from '@/lib/mapped';
import type { RawFlight } from '@/lib/flight/types';
import { analyzeAsync } from '@/lib/analyze/runner';
import { sliceFlight } from '@/lib/flight/slice';
import { indexAtOrAfter, indexAtOrBefore, MIN_CROP_SAMPLES } from './CropControl';
import type { FlightAnalysis } from '@/lib/analyze/types';
import { encodeUnits } from '@/lib/display';
import { useUnits } from './UnitsProvider';
import DropZone from './DropZone';
import RecognizedFormats from './RecognizedFormats';
import WhyDebrief from './WhyDebrief';
import ColumnMapper from './ColumnMapper';
import FlightReport from './FlightReport';
import RecentFlights from './RecentFlights';
import { groupOf } from '@/lib/flightGroups';
import DropOverlay from './DropOverlay';
import { useWindowFileDrop } from './useWindowFileDrop';
import { useLogbook } from './useLogbook';
import CompareView from './CompareView';
import GroupProposalBanner from './GroupProposalBanner';
import {
  fileFacts,
  saveRecent,
  saveCaption,
  saveReadWindow,
  listRecents,
  readRecent,
  STORAGE_REFUSED,
  removeRecent,
  clearRecents,
  updateNote,
  exportLogbook,
  importLogbook,
  type RecentMeta,
  type StoredMapping,
} from '@/lib/recents';
import { buildComparison, MAX_COMPARE, type Comparison } from '@/lib/compare';
import { applySimulationChoice, type PredictionOffer, type SimulationChoice } from '@/lib/predictionChoice';
import { decodeFlight, payloadFromHash } from '@/lib/share';
import { SAMPLES, sampleFiles, type Sample } from '@/lib/samples';
import { fileToText, textIsTheFile } from '@/lib/fileText';
import { download } from '@/lib/download';
import { MAPPING_BUSY } from '@/lib/dropCopy';
import { isSynthetic } from '@/lib/synthetic';
import { Button, ErrorState, Loading, Notice } from './ui';

type State =
  | { phase: 'idle' }
  /** `what` names what is being read, so a six-second wait on a phone says which file
   *  it is working on rather than only that it is working. */
  | { phase: 'loading'; what?: { name: string; bytes?: number } }
  /** `addToIds` is set when this file came out of a batch drop that already built a
   *  comparison: mapping it puts it back with the flights it was dropped alongside,
   *  instead of stranding it as a report of its own. */
  | { phase: 'mapping'; fileName: string; text: string; table: AnalyzedTable; suggested: ColumnMapping[]; addToIds?: string[] }
  /** `savedId` is the logbook key this flight was stored under — the report's own address, and
   *  what the label/notes a flyer types are kept against. Absent where storage was refused. */
  | {
      phase: 'report';
      /** The whole file, whatever stretch of it is on screen — what the crop control offers
       *  and what a re-read is taken from. */
      file: RawFlight;
      /** The stretch the report is OF: the file itself, or a slice of it. Every surface that
       *  joins a recorded channel to the analysis's own series reads this one, so the two
       *  cannot be off by the crop's offset. */
      flight: RawFlight;
      analysis: FlightAnalysis;
      analyzedAt: number;
      text: string;
      note?: string;
      savedId?: string;
      caption?: { label: string; notes: string };
      /** True while another flight in the same file is being read. */
      reading?: boolean;
      /** Why the last stretch the flyer asked for could not be read. */
      readError?: string;
      /** A design dropped beside this flight stating SEVERAL simulations, held for the session
       *  so the flyer can say which one flew. It is not persisted, for the same reason the
       *  prediction itself is not — see `predictionNote`. Absent on every flight without one. */
      simulationOffer?: PredictionOffer;
      /** Which they said. `null`/absent is Debrief's own default of comparing none. */
      simulationChoice?: SimulationChoice;
    }
  /** `ids` are the logbook keys the dropped files were saved under, when storage allowed
   *  it — enough to offer this comparison at its own address on /compare. */
  /** Files in the same drop that need their columns mapped. They are not failures — a
   *  batch can't run the mapper, but the flyer can, one at a time, and each one rejoins
   *  this comparison when they do. */
  | { phase: 'compare'; comparison: Comparison; note?: string; ids?: string[]; mappable?: { name: string; text: string }[] }
  /** `file` is the name of the file that failed, when one file did.
   *
   *  `DESIGN.md` §5 requires an error to name "the file or field that failed", and
   *  `MAINTAINING.md` lists "a control … whose failure names something that isn't on the page"
   *  as a tell. Six of these ten messages named nothing at all — "That file is empty.", "Could
   *  not read this file." — which on a launch day's drop leaves the flyer to work out WHICH of
   *  eight files it meant. Absent where no single file is at fault (a whole folder, the sample). */
  | {
      phase: 'error';
      message: string;
      file?: string;
      /** Debrief RECOGNISED this file and is declining to analyse it, with a reason — a
       *  prediction, a device summary, a raw binary download. Distinct from a file it could
       *  not read, which is what a bare `error` means, and the two must not share a heading:
       *  "Couldn't read A simple model rocket.ork" sat above a sentence explaining that
       *  Debrief had read it well enough to name the design and count its five simulations. */
      recognised?: boolean;
    };


/** What to say when a dropped folder yielded nothing. Shared by both surfaces that take a
 *  drop, so they cannot describe the same gesture two different ways. */
export const emptyFolderMessage = (names: string[]) =>
  `Nothing in ${names.length === 1 ? `“${names[0]}”` : 'those folders'} looked like a flight log — Debrief reads CSV, text and spreadsheet exports, and looks one level or two inside a folder for them.`;

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A stored read window, resolved against this parse of the file. Returns undefined where the
 *  window no longer fits — a file re-parsed shorter, a hand-edited backup — because reading a
 *  stretch that is not the one the flyer chose is worse than reading the file. */
function readToWindow(time: Float64Array, read: { fromS: number; toS: number }): { from: number; to: number } | undefined {
  if (time.length < 4) return undefined;
  const from = indexAtOrAfter(time, read.fromS);
  const to = Math.min(time.length, indexAtOrBefore(time, read.toS) + 1);
  if (!(to - from >= MIN_CROP_SAMPLES)) return undefined;
  if (from === 0 && to === time.length) return undefined; // the whole file is not a crop
  return { from, to };
}


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
 *  and nothing else leaves them to notice the other files went missing by counting.
 *
 *  `alsoUsed` is true when a file that is NOT a flight record still contributed — a device
 *  summary that paired. "Could be read" is then the wrong verb for the others: the summary WAS
 *  read, and four of its figures are in the report. This is the ordinary Blue Raven drop, not
 *  a corner: Featherweight's own software writes the summary, the low-rate log and the
 *  high-rate log side by side, so a flyer who selects the folder drops all three at once. */
function loneFlightNote(dropped: number, skipped: { name: string; why: string }[], alsoUsed = false): string {
  const listed = skipped.map((s) => `${s.name} — ${s.why}`).join('; ');
  const opening = alsoUsed
    ? `Only one of those ${dropped} files is a flight record, so this is a single report rather than a comparison.`
    : `Only one of those ${dropped} files could be read as a flight, so this is a single report rather than a comparison.`;
  return `${opening} Left out: ${listed}.`;
}

/** What a summary file contributed, so the flyer can see the drop did something with it
 *  rather than wondering why one of their two files vanished. */
function pairedNote(paired: string[]): string {
  return `Read the device's own summary alongside the flight (${paired.join('; ')}) — its figures are shown beside Debrief's read as a cross-check, not merged into it.`;
}

/**
 * Give the report on screen an address, or take it away again.
 *
 * The report lived only in React state, so every one of the SEVEN in-app links on that
 * screen — Analyze and Compare in the header, "Read the methods →", and Methods, Validation
 * and Privacy in the footer — destroyed it. Measured: click "Read the methods →", press
 * Back, and you land on an empty drop zone. The flight itself survives in the logbook, but
 * the report's zoom, its label, its notes and any per-quantity unit override do not, and
 * nothing in the URL says which row to reopen.
 *
 * `?open=<id>` already restores a flight — the effect below has always read it. It also
 * DELETED it from the URL immediately, which is precisely what left the address blank. Kept
 * now, so Back, a refresh and a bookmark all land back on the flight.
 *
 * The id is a logbook key on this device, not flight data: nothing about the flight travels,
 * and a link opened elsewhere resolves to nothing and says so.
 */
function rememberOpenId(id: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('open', id);
    else url.searchParams.delete('open');
    window.history.replaceState(null, '', url);
  } catch {
    /* a browser refusing history writes — the report is still on screen */
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
    <Loading
      detail={
        mb != null && mb >= 2 ? (
          <>
            {mb.toFixed(1)} MB — a log this size takes a few seconds to read and analyze here on
            your device. Nothing is being sent anywhere.
          </>
        ) : undefined
      }
    >
      Reading {what?.name ? <span className="font-mono">{what.name}</span> : 'the file'}…
    </Loading>
  );
}

export default function Analyzer() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  // Owned by the app, not by this page — the control lives in the header on every surface
  // now, including the ones with no flight loaded. See components/UnitsProvider.tsx.
  const { sys } = useUnits();
  // The logbook and everything done to it, shared with the comparison surface so a note
  // added on either shows on both.
  const logbook = useLogbook();
  // Analysis is async (it runs in a worker), so a slow load that resolves after a
  // newer one must not overwrite it. Each load bumps this counter and only applies
  // its result if it's still the most recent.
  const reqRef = useRef(0);
  const beginLoad = useCallback(() => {
    const token = ++reqRef.current;
    // Takes an updater as well as a value, so a late arrival (the logbook id, which lands
    // after the save resolves) can be folded into the state this load already set without
    // re-deciding what that state is — and still only if this load is still the current one.
    return (next: State | ((prev: State) => State)) => {
      if (reqRef.current === token) setState(next);
    };
  }, []);

  useEffect(() => {
    logbook.refresh();
  }, [logbook.refresh]);

  const ingest = useCallback(
    /** `mapping` is a hand-made column mapping the logbook kept with this flight, and
     *  `summaryText` the device summary it was dropped alongside — both present only when
     *  reopening one, so a custom file comes back as the flight the flyer made rather than as
     *  the mapper again, and a paired flight comes back with its cross-check. */
    async (
      name: string,
      text: string,
      /** The file's own bytes, where this path has them. A raw binary download's text is a
       *  lossy view of it, so the parsers have to be handed the file itself — and the
       *  logbook has to keep it, or reopening the row re-reads the mojibake. */
      bytes?: Uint8Array,
      mapping?: StoredMapping[],
      summaryText?: string,
      caption?: { label: string; notes: string },
      read?: { fromS: number; toS: number },
    ) => {
      const set = beginLoad();
      try {
        if (text.trim().length === 0) {
          set({ phase: 'error', message: 'It has no contents at all — nothing was read from it.', file: name });
          return;
        }
        const result = importRecent({
          name,
          text,
          ...(bytes ? { bytes } : {}),
          ...(mapping ? { mapping } : {}),
          ...(summaryText ? { summaryText } : {}),
        });
        if (result.kind === 'flight') {
          // The stretch the flyer chose, restored. Stored in SECONDS on the file's own clock
          // and resolved to samples here, against the parse this build makes of the text —
          // so a parser that has since learned to drop a duplicate row still lands on the
          // same moment of the same flight rather than on a shifted index.
          const window = read ? readToWindow(result.flight.time, read) : undefined;
          const analysis = await analyzeAsync(result.flight, window ? { read: window } : undefined);
          set({
            phase: 'report',
            file: result.flight,
            flight: window ? sliceFlight(result.flight, analysis.extent.from, analysis.extent.to) : result.flight,
            analysis,
            analyzedAt: Date.now(),
            text,
            ...(caption ? { caption } : {}),
          });
          void saveRecent({
            name,
            formatLabel: result.flight.formatLabel,
            ...fileFacts(result.flight, analysis),
            ...(mapping ? { mapping } : {}),
            text,
            // The bytes reach the PARSERS on every file — that is what lets a binary format be
            // read at all. They reach the LOGBOOK only for the files whose text is not the
            // file, which is the rule `lib/ingest.ts` follows on the batch path and this one
            // did not: every CSV dropped here was being stored twice.
            ...(bytes && !textIsTheFile(text) ? { bytes } : {}),
          }).then((saved) => {
            rememberOpenId(saved.id);
            // The id arrives after the report is on screen (the save resolves later), so it is
            // folded in rather than waited for — the report should not be held back for it.
            if (saved.id) set((prev) => (prev.phase === 'report' ? { ...prev, savedId: saved.id ?? undefined } : prev));
            // Only an attempted save can discover that writes are refused — a read cannot — and
            // the logbook below is the surface that would otherwise promise to remember the next
            // flight. Note a REOPEN of a flight already stored keeps its id even when the write
            // aborts (the row survives the rollback), so this fires on a genuinely lost flight
            // rather than on every re-save.
            else logbook.reportWriteRefused();
            logbook.reportForgotten(saved.forgotten);
            logbook.refresh();
          });
        } else if (result.table.dataRows.length === 0) {
          set({
            phase: 'error',
            message: 'Debrief found no rows of data in it. Is it a flight log export?',
            file: name,
          });
        } else {
          set({ phase: 'mapping', fileName: name, text, table: result.table, suggested: result.suggested });
        }
      } catch (err) {
        set({
          phase: 'error',
          message: err instanceof Error ? err.message : 'It could not be read.',
          file: name,
          recognised: err instanceof ParseGuidanceError,
        });
      }
    },
    [logbook.refresh, logbook.reportForgotten, logbook.reportWriteRefused, beginLoad],
  );

  /**
   * Read a different stretch of the flight already on screen — one of the other flights in a
   * launch-day download, or a crop the flyer chose.
   *
   * Deliberately NOT a reload: the file is already parsed, so this re-runs the analysis over
   * the same `RawFlight`. The flight, its text and its logbook id all stay exactly as they
   * are, which is what keeps the report's address, its label and its notes attached to the
   * file rather than to whichever stretch of it is being read.
   */
  // The logbook id of whatever is on screen, for the fire-and-forget writes that must not
  // re-create the callback every time the report's state changes.
  const savedIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    savedIdRef.current = state.phase === 'report' ? state.savedId : undefined;
  }, [state]);

  const readStretch = useCallback(
    async (from: number, to: number) => {
      if (state.phase !== 'report') return;
      const file = state.file;
      const token = ++reqRef.current;
      setState((prev) => (prev.phase === 'report' ? { ...prev, reading: true, readError: undefined } : prev));
      try {
        const analysis = await analyzeAsync(file, { read: { from, to } });
        if (reqRef.current !== token) return;
        // The report becomes a report OF the stretch: the same slice the analysis read, so
        // the recorded channels, the GPS fixes and the sample table line up with its series
        // instead of being the whole file's under the crop's clock.
        const shown = sliceFlight(file, analysis.extent.from, analysis.extent.to);
        // Kept with the flight, in seconds, so coming back to it comes back to the stretch
        // the flyer chose rather than to Debrief's own segmentation. Forgotten when they read
        // the whole file again, which is what that button means.
        if (savedIdRef.current) {
          void saveReadWindow(
            savedIdRef.current,
            analysis.extent.source === 'chosen'
              ? { fromS: analysis.extent.startTime, toS: analysis.extent.endTime }
              : null,
          );
        }
        setState((prev) =>
          prev.phase === 'report'
            ? {
                ...prev,
                // `shown` is sliced from `file`, which never carried the design's contribution —
                // so a crop would silently drop a simulation the flyer had chosen, and leave the
                // picker showing it as still chosen. Re-applied here, against the new stretch, so
                // the control and the cross-check cannot disagree about what is being compared.
                flight: prev.simulationOffer
                  ? applySimulationChoice(shown, prev.simulationOffer, prev.simulationChoice ?? null)
                  : shown,
                analysis,
                analyzedAt: Date.now(),
                reading: false,
                readError: undefined,
              }
            : prev,
        );
      } catch (err) {
        // The stretch stays refused rather than half-applied: what is on screen is still the
        // reading it was, and the row says why the new one could not be made.
        if (reqRef.current !== token) return;
        const why = err instanceof Error ? err.message : 'That stretch could not be read.';
        setState((prev) => (prev.phase === 'report' ? { ...prev, reading: false, readError: why } : prev));
      }
    },
    [state],
  );

  /**
   * The flyer says which simulation flew — or takes it back.
   *
   * Applied to the flight already on screen rather than by re-reading anything: a prediction
   * contributes figures, notes and a curve, none of which the analyzer reads, so there is nothing
   * to re-analyse. `applySimulationChoice` strips whatever the last choice left before it adds,
   * which is what lets this be called repeatedly and what makes "Don't compare one" exact.
   */
  const chooseSimulation = useCallback((choice: SimulationChoice) => {
    setState((prev) =>
      // A press that changes nothing changes nothing — pressing the chip already pressed, or
      // "Don't compare one" with nothing chosen. Without this it still built a new flight object,
      // and everything keyed on one rebuilt for a value that had not moved.
      prev.phase === 'report' && prev.simulationOffer && (prev.simulationChoice ?? null) !== choice
        ? {
            ...prev,
            flight: applySimulationChoice(prev.flight, prev.simulationOffer, choice),
            simulationChoice: choice,
          }
        : prev,
    );
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        setState({
          phase: 'error',
          message: `It is ${(file.size / 1024 / 1024).toFixed(0)} MB — larger than Debrief reads in the browser (64 MB). If it's really a single flight, trim it first.`,
          file: file.name,
        });
        return;
      }
      setState({ phase: 'loading', what: { name: file.name, bytes: file.size } });
      try {
        // Read from the bytes, not file.text(): an .xlsx workbook is unzipped to
        // CSV, and a UTF-16 export (RRC3 mDACS, Excel "Unicode Text", …) is decoded
        // from its BOM rather than assumed UTF-8.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const text = await fileToText(file.name, bytes);
        await tick(); // let the loading state paint before parsing
        await ingest(file.name, text, bytes);
      } catch (err) {
        // A deliberate, user-facing message (e.g. an .xlsx that couldn't be
        // unzipped) should reach the flyer, not be hidden behind a generic line.
        setState({
          phase: 'error',
          message: err instanceof ParseGuidanceError ? err.message : 'It could not be read.',
          file: file.name,
          recognised: err instanceof ParseGuidanceError,
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
      // "the file" is wrong for a folder, and this is the longest wait the app has — every file
      // parsed and analysed in turn. Say how many, and how much.
      set({
        phase: 'loading',
        what: { name: `${list.length} files`, bytes: list.reduce((n, f) => n + f.size, 0) },
      });
      await tick();
      // One set of rules for what a launch day's folder holds, shared with the comparison
      // surface so the two can't disagree about it (see lib/ingest.ts).
      // One set of rules for what a launch day's folder holds — including which summary
      // belongs to which log — shared with the comparison surface so the two can't disagree
      // about it (see lib/ingest.ts).
      const { results, skipped, mappable, paired, highRatePaired, predictionPaired, predictionOffers, groupsRestored, forgotten, unread } = await ingestFiles(list, MAX_COMPARE);

      logbook.reportForgotten(forgotten);
      logbook.reportArrived(results.map((r) => r.savedId).filter((id): id is string => !!id));
      if (results.some((r) => !r.savedId)) logbook.reportWriteRefused();
      logbook.refresh();
      if (results.length >= 2) {
        // `synthetic` rides in from the flight itself, exactly as `lib/compareFromLogbook.ts`
        // does it — because there are TWO routes into a comparison and this was the one that
        // did not carry the fact. A flight Debrief made up, dropped alongside real ones, reached
        // the table, the `.csv`, the clipboard, the `.md` and the `.html` with nothing saying so,
        // however carefully the row was assembled downstream: the builder can only label what the
        // input told it. Not reachable today — the marker is read on the mapper route only, and
        // the mapper takes one file at a time — and landed now rather than left for the slice
        // that makes it reachable, which is a generator writing a real logger's format.
        const inputs = results.map((r, i) => ({ id: `${r.name}-${i}`, name: r.name, formatLabel: r.formatLabel, analysis: r.analysis, ...(r.flight.flownAt ? { flownAt: r.flight.flownAt } : {}), ...(isSynthetic(r.flight) ? { synthetic: true } : {}) }));
        const notes: string[] = [];
        // What the cap held back, from `ingestFiles` itself rather than recomputed here. The
        // two surfaces each worked this out their own way, which is what this module exists to
        // stop — and the sentence is built there too, so the claims it makes about a flyer's
        // logbook are made once, where they are tested.
        const notRead = unreadNote(unread, results.map((r) => r.name), MAX_COMPARE).trim();
        if (notRead) notes.push(`Showing ${results.length} of ${list.length} files. ${notRead}`);
        if (paired.length > 0) notes.push(pairedNote(paired));
        if (highRatePaired.length > 0) notes.push(highRateNote(highRatePaired));
        // `shown: false` — this branch assembles a COMPARISON, and the comparison surface carries
        // no reported figures. The design was read; it is not on this screen. See `predictionNote`.
        if (predictionPaired.length > 0) notes.push(predictionNote(predictionPaired, false));
        // A grouping the records themselves carried, put back. Neither a measurement nor half of
        // one — it is the flyer's own earlier statement, so it says so in its own words.
        if (groupsRestored.length > 0) notes.push(groupsRestoredNote(groupsRestored));
        if (skipped.length > 0) notes.push(skippedNote(skipped));
        // Every dropped flight went into the logbook, so this comparison HAS an address —
        // offer it rather than leaving a view that vanishes on reload.
        const ids = results.map((r) => r.savedId).filter((v): v is string => !!v);
        const addressable = ids.length === results.length;
        // A file that needs mapping is only offerable when the flights it would join have
        // an address — that address is how it gets back to them. Without one, say what
        // was left out as before rather than offering a button that can't finish the job.
        if (mappable.length > 0 && !addressable) {
          notes.push(
            skippedNote(
              mappable.map((m) => ({ name: m.name, why: 'needs its columns mapped, which only works one file at a time' })),
            ),
          );
        }
        rememberOpenId(null);
        set({
          phase: 'compare',
          comparison: buildComparison(inputs),
          note: notes.join(' ') || undefined,
          ...(addressable ? { ids } : {}),
          ...(mappable.length > 0 && addressable ? { mappable } : {}),
        });
      } else if (results.length === 1) {
        const r = results[0];
        rememberOpenId(r.savedId ?? null);
        set({
          phase: 'report',
          file: r.flight,
          flight: r.flight,
          analysis: r.analysis,
          analyzedAt: Date.now(),
          text: r.text,
          // The choice lives on THIS branch alone, and that is the same fact `predictionNote`'s
          // `shown` argument carries: the cross-check a chosen simulation fills is on the
          // single-flight report and nowhere else, so offering the control on a comparison would
          // be offering a control whose effect is on another page. Only the first offer is taken
          // — this branch has exactly one flight, and two designs both claiming to predict it is
          // a drop nothing else in the app has a shape for either.
          ...(predictionOffers.length > 0
            ? {
                simulationOffer: predictionOffers[0],
                // Seeded from what the FLIGHT already says, not from nothing. A canonical record
                // keeps the sentence naming the run, so a flyer dropping a saved record back
                // beside the design — which is what that sentence tells them to do — would
                // otherwise open the picker showing "Don't compare one" as pressed, directly
                // above a populated Predicted column.
                ...(predictionOffers[0].stated != null ? { simulationChoice: predictionOffers[0].stated } : {}),
              }
            : {}),
          // Both accounts, not whichever fires first. A drop of the summary + the low-rate log
          // + the high-rate log — what Featherweight's own software writes out together —
          // hits the left-out branch, and the paired note used to be discarded by the
          // ternary: the flyer was told the high-rate file was left out and never told the
          // summary had been read, while its figures sat in the cross-check panel below.
          note:
            [
              skipped.length + mappable.length > 0
                ? loneFlightNote(
                    list.length,
                    [
                      ...skipped,
                      ...mappable.map((m) => ({ name: m.name, why: 'needs its columns mapped, which only works one file at a time' })),
                    ],
                    paired.length > 0,
                  )
                : null,
              paired.length > 0 ? pairedNote(paired) : null,
              // Same reason as the summary beside it: a flyer who dropped both halves is told the
              // second one was READ, rather than being told it was left out.
              highRatePaired.length > 0 ? highRateNote(highRatePaired) : null,
              // A design read onto the flight it predicts — a third thing that is neither a
              // summary nor the other half of a recording, so it says so in its own words.
              predictionPaired.length > 0 ? predictionNote(predictionPaired, true) : null,
              // No grouping note here, and that is a fact about the branch rather than an
              // omission: restoring one needs two records that both opened and both landed in the
              // logbook, and this branch is the one where exactly one flight came back.
            ]
              .filter(Boolean)
              .join(' ') || undefined,
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

  /**
   * Open a sample — through the SAME path a dropped file takes, which the old one did not.
   *
   * It fetched one hardcoded URL, ran the bytes through `decodeBytes` and handed `ingest` a
   * string. Two things followed from that, and both capped what a sample could ever be. The drop
   * path uses `fileToText(name, bytes)`, which unzips an `.xlsx` and sniffs a UTF-16 BOM, so a
   * sample could only ever be a UTF-8 text file — no `.pf2`, no `.eeprom`, no spreadsheet. And it
   * passed no `bytes`, which `lib/parsers/types.ts` calls a lossy view for a binary download.
   *
   * Building real `File` objects and calling `onFiles` removes both, because it stops being a
   * second path: one file goes to `onFile` and gets the column-mapper flow like any other, and
   * several go to the batch import and land on a comparison. That is what lets a sample be two
   * boards recording one flight, which is the capability that had no demonstration at all.
   */
  const onSample = useCallback(
    async (sample: Sample) => {
      setState({
        phase: 'loading',
        what: { name: sample.files.length > 1 ? `${sample.files.length} sample files` : 'the sample flight' },
      });
      try {
        const files = await sampleFiles(sample);
        await tick();
        await onFiles(files);
      } catch {
        setState({
          phase: 'error',
          message:
            'The sample flight could not be loaded — it is fetched from this site, so a lost connection is the usual cause.',
        });
      }
    },
    [onFiles],
  );

  const onMappingSubmit = useCallback(
    async (mappings: ColumnMapping[]) => {
      if (state.phase !== 'mapping') return;
      const { fileName, table, text, addToIds } = state;
      const set = beginLoad();
      try {
        set({ phase: 'loading' });
        // Shared with the comparison surface, which opens the same mapper on a file from a
        // launch day's folder — see lib/mapped.
        const { flight, analysis, save, forgotten } = await flightFromMapping(fileName, text, table, mappings);
        void forgotten.then(logbook.reportForgotten);
        // Mapped out of a batch drop: put it back with the flights it arrived with, at the
        // comparison's own address. Awaited, because the id it was saved under is what
        // names it there — and if the save didn't happen there is nothing to add it to, so
        // the flight is shown on its own rather than silently lost.
        if (addToIds) {
          const id = await save;
          // The mapper's OTHER branch. Review found this one unreported: drop a folder where every
          // log saves (which is what makes the mapper reachable at all), then map the extra file
          // into the quota the batch just filled — the save aborts, this falls through to a lone
          // report, and `reportArrived` has already cleared the flag on the way in.
          if (!id) logbook.reportWriteRefused();
          void logbook.refresh();
          if (id) {
            window.location.href = `/compare?ids=${[...addToIds, id].map(encodeURIComponent).join(',')}&u=${encodeUnits(sys)}`;
            return;
          }
        }
        set({ phase: 'report', file: flight, flight, analysis, analyzedAt: Date.now(), text });
        if (!addToIds)
          void save.then((savedId) => {
            rememberOpenId(savedId);
            // Folded into the report's state, like the auto-detected path does: without it a
            // hand-mapped flight has no id on screen, and everything kept AGAINST that id —
            // the label, the notes, the stretch the flyer chose — silently stops being kept.
            if (savedId) set((prev) => (prev.phase === 'report' ? { ...prev, savedId } : prev));
            else logbook.reportWriteRefused();
            logbook.refresh();
          });
      } catch (err) {
        set({ phase: 'error', message: err instanceof Error ? err.message : 'It could not be analyzed.', file: state.phase === 'mapping' ? state.fileName : undefined });
      }
    },
    [state, logbook.refresh, beginLoad, sys],
  );

  const reset = useCallback(() => {
    rememberOpenId(null);
    setState({ phase: 'idle' });
  }, []);

  // A file dropped ANYWHERE reaches the app, rather than making the browser navigate to it —
  // see components/useWindowFileDrop.ts. The mapper is the ONLY phase that can't take it: a
  // new file there would discard the columns the flyer is part-way through mapping, so the
  // drop is swallowed (still no navigation) and the overlay says so.
  //
  // `loading` deliberately still accepts. Superseding an analysis that is still running is
  // designed behaviour — `beginLoad`'s token counter exists precisely so a slow result can't
  // take the view back from a newer one — and refusing a drop because something is busy is
  // the "fails only when you use it" control this project hunts for. Excluding it here broke
  // `worker.spec.ts`'s "a slow in-flight analysis does not overwrite a newer load", which
  // drops a second file mid-analysis and expects the mapper: the right catch, from the suite
  // that already knew the rule.
  const canTakeADrop = state.phase !== 'mapping';
  const { dragging } = useWindowFileDrop({
    onFiles,
    accept: canTakeADrop,
    // A folder that held no flight log has to SAY so. Feeding the directory entry back to the
    // parser — which is what the browser puts in `dataTransfer.files` for a folder — produced
    // "Could not read this file." about the folder itself, which is the bug, not the report.
    onEmptyFolder: (names) => setState({ phase: 'error', message: emptyFolderMessage(names) }),
  });

  /** Leaving the mapper. A file opened out of a batch drop goes back to the comparison it
   *  came from — dropping the flyer on an empty drop zone would throw away the launch day
   *  they were part-way through. */
  const cancelMapping = useCallback(() => {
    if (state.phase === 'mapping' && state.addToIds && state.addToIds.length >= 2) {
      window.location.href = `/compare?ids=${state.addToIds.map(encodeURIComponent).join(',')}&u=${encodeUnits(sys)}`;
      return;
    }
    setState({ phase: 'idle' });
  }, [state, sys]);

  /** Open the column mapper on one file a batch drop couldn't read, remembering the
   *  comparison it should rejoin. */
  const onMapDropped = useCallback(
    (name: string) => {
      if (state.phase !== 'compare' || !state.mappable || !state.ids) return;
      const file = state.mappable.find((m) => m.name === name);
      if (!file) return;
      const addToIds = state.ids;
      try {
        const result = importFlight({ name: file.name, text: file.text });
        if (result.kind !== 'mapping') {
          setState({ phase: 'error', message: 'It could not be opened for mapping.', file: file.name });
          return;
        }
        setState({
          phase: 'mapping',
          fileName: file.name,
          text: file.text,
          table: result.table,
          suggested: result.suggested,
          addToIds,
        });
      } catch (err) {
        setState({ phase: 'error', message: err instanceof Error ? err.message : `Could not read ${file.name}.` });
      }
    },
    [state],
  );

  const openRecent = useCallback(
    async (id: string) => {
      // Named as soon as the record is in hand rather than left as a bare "Reading the file…".
      // This path is no longer only "clicked a logbook row": a report has an address now, so a
      // reload and a Back both come through here, and both mean parsing and analysing the flight
      // again — six seconds on a phone with an 11 MB log. A wait that long has to say what it is
      // waiting for, or it reads as stuck.
      // Two frames, and NEITHER is the generic "Reading the file…": the first covers the
      // logbook read, which is all that is known before the record is in hand, and the second
      // names the flight once it is. The generic fallback is what this path used to show for
      // the whole wait.
      setState({ phase: 'loading', what: { name: 'your saved flight' } });
      const { rec, blocked } = await readRecent(id);
      if (!rec) {
        // Same condition, same words as every other surface — see `STORAGE_REFUSED`. "Could no
        // longer be read" reads as "your flight is gone" when nothing was ever asked for.
        setState({
          phase: 'error',
          message: blocked
            ? `That link points at a saved flight, but ${STORAGE_REFUSED} — so it can’t be opened here. Drop the file again to read it.`
            : 'That saved flight is no longer in this logbook.',
        });
        return;
      }
      setState({ phase: 'loading', what: { name: rec.name, bytes: rec.bytes?.length ?? rec.text.length } });
      await tick();
      await ingest(rec.name, rec.text, rec.bytes, rec.mapping, rec.summaryText, rec.caption, rec.read);
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
    // Deliberately NOT stripped from the URL any more: it is the report's address, and
    // removing it is what made Back land on an empty drop zone.
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
        <DropOverlay show={dragging} accept={canTakeADrop} reason={MAPPING_BUSY} />
        <Button variant="link" onClick={reset} className="text-sm print:hidden">
          ← Analyze another flight
        </Button>
        {/* What the drop couldn't read. Not print:hidden — a report a flyer keeps should
            say which of their files it didn't cover. It stays out of the flight's own
            exports, which describe this flight rather than the folder it arrived in. */}
        {state.note && (
          <Notice as="p" role="status">
            {state.note}
          </Notice>
        )}
        <FlightReport
          flight={state.flight}
          analysis={state.analysis}
          analyzedAt={state.analyzedAt}
          sourceText={state.text}
          sys={sys}
          caption={state.caption}
          onCaption={state.savedId ? (c) => void saveCaption(state.savedId as string, c) : undefined}
          fileTime={state.file.time}
          fileFlight={state.file}
          onRead={readStretch}
          reading={state.reading}
          readError={state.readError}
          {...(state.savedId ? { recordings: groupOf(logbook.recents, state.savedId)?.recordings, recordingId: state.savedId } : {})}
          onRecording={openRecent}
          simulationOffer={state.simulationOffer}
          simulationChoice={state.simulationChoice}
          onSimulationChoice={state.simulationOffer ? chooseSimulation : undefined}
        />
      </div>
    );
  }

  if (state.phase === 'compare') {
    return (
      <>
        <DropOverlay show={dragging} accept={canTakeADrop} reason={MAPPING_BUSY} />
        {/* The offer belongs where the drop lands the flyer. This branch returns without the
            logbook, so a proposal rendered only inside `RecentFlights` is invisible at exactly
            the moment it applies — measured on the built export before this was moved out. */}
        <GroupProposalBanner
          recents={logbook.recents}
          arrived={logbook.arrived}
          onGroup={logbook.group}
          onDismiss={logbook.clearArrived}
        />
        <CompareView
          comparison={state.comparison}
          note={state.note}
          sys={sys}
          onBack={reset}
          permalink={state.ids && state.ids.length >= 2 ? `/compare?ids=${state.ids.join(',')}&u=${encodeUnits(sys)}` : undefined}
          stitchIds={state.ids && state.ids.length === 2 ? state.ids.join(',') : undefined}
          mappable={state.mappable?.map((m) => m.name)}
          onMapFile={onMapDropped}
        />
      </>
    );
  }

  if (state.phase === 'mapping') {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <DropOverlay show={dragging} accept={canTakeADrop} reason={MAPPING_BUSY} />
        <ColumnMapper
          table={state.table}
          suggested={state.suggested}
          fileName={state.fileName}
          onCancel={cancelMapping}
          onSubmit={onMappingSubmit}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <DropOverlay show={dragging} accept={canTakeADrop} reason={MAPPING_BUSY} />
      <DropZone onFiles={onFiles} onSample={onSample} busy={state.phase === 'loading'} />
      {state.phase === 'loading' && <ReadingNote what={state.what} />}
      {state.phase === 'error' && (
        // `ErrorState`, not a hand-rolled danger card: §5 gives this primitive the duty of naming
        // what failed and what was expected of it, and this is the app's most-hit error surface —
        // every unreadable file on `/` lands here. It keeps `role="alert"`, which the primitive
        // carries: this is the only account of what went wrong, and it REPLACES a status line a
        // screen reader had been following ("Reading …"), so arriving silently means the wait
        // simply stops with nothing said.
        //
        // No action is passed. §5 allows one and there genuinely is one — but it is the drop
        // zone's own "Choose a flight log file" button, rendered immediately above this card, and
        // a second copy of it one element down is the padding §4 warns against rather than a way
        // forward the flyer lacked.
        // Where no single file is at fault — a shared link, the sample, a whole folder — the
        // message IS what failed, and it stands alone. An earlier version always put a generic
        // "That file couldn't be read" in `what` and pushed the real sentence into `expected`,
        // which read as two errors and called a share link a file.
        // A RECOGNISED file gets a different heading, because "Couldn't read" is a lie about
        // it. Debrief read an OpenRocket design well enough to name the rocket and count its
        // five simulations, and read a device summary well enough to quote its figures back —
        // it is declining to call either one a flight, which is a decision and not a failure.
        // The message underneath already explains it; the heading only has to stop
        // contradicting the message.
        <ErrorState
          what={
            state.file ? (
              <>
                {state.recognised ? 'Debrief didn’t analyse ' : 'Couldn’t read '}
                <span className="font-mono">{state.file}</span>
              </>
            ) : (
              state.message
            )
          }
          expected={state.file ? state.message : undefined}
        />
      )}
      {/* Only on the surface a first-time visitor actually lands on. The report and the comparison
          return early above and never reach this block, so what the `idle` test actually excludes
          is the ERROR and mapping states — where a panel of claims under "there's no flight data in
          this file" would be its own small tell. Not pinned: `e2e/smoke.spec.ts` records that an
          assertion about the report would pass whichever way this went. */}
      {state.phase === 'idle' && <WhyDebrief />}
      {state.phase !== 'loading' && <RecognizedFormats />}
      {state.phase !== 'loading' && (
        <RecentFlights
          recents={logbook.recents}
          status={logbook.status}
          sys={sys}
          onOpen={openRecent}
          onRemove={logbook.remove}
          onClear={logbook.clear}
          onCompare={compareRecents}
          onNote={logbook.note}
          onExport={logbook.exportAll}
          onImport={logbook.importAll}
          onGroup={logbook.group}
          forgotten={logbook.forgotten}
          arrived={logbook.arrived}
          onDismissProposal={logbook.clearArrived}
          onDismissForgotten={logbook.clearForgotten}
        />
      )}
    </div>
  );
}
