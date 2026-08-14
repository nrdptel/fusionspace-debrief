'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { readFirstStage, stageKey, writeFirstStage } from '@/lib/firstStage';
import { toCanonical } from '@/lib/canonical';
import { readRecent } from '@/lib/recents';
import { importRecent } from '@/lib/reopen';
import { zip, type ZipEntry } from '@/lib/zip';
import { download } from '@/lib/download';
import { buildComposite, fmtCompositeTime, type Composite, type CompositeRecording } from '@/lib/composite';
import { stageTiles } from '@/lib/readings';
import { compareFromLogbook, idsFromParam, withIds } from '@/lib/compareFromLogbook';
import { MAX_COMPARE } from '@/lib/compare';
import { ingestFiles } from '@/lib/ingest';
import { STAGES_SAMPLE, sampleFiles } from '@/lib/samples';
import { STORAGE_WRITE_REFUSED } from '@/lib/recents';
import type { StitchRefusal } from '@/lib/stitch';
import { fmtLength } from '@/lib/display';
import { useUnits } from './UnitsProvider';
import { EVENT_COLOR } from '@/lib/eventStyle';
import ForgottenBanner from './ForgottenBanner';
import { Button, Card, Chip, CopyTableButton, EmptyState, ErrorState, Frame, Loading, Notice, Readout } from './ui';
import { PROVENANCE_COLUMN, provenanceCell, SYNTHETIC_TAG, SYNTHETIC_SHORT } from '@/lib/synthetic';

/**
 * One timeline across several per-stage recordings of one launch.
 *
 * A staged flight logged on separate devices is several files that each hold part of one launch,
 * and no single one of them has the thing a flyer actually wants: the ORDER. This puts every
 * recording's marks on the clock they share — the launch, which every stage leaves the pad at —
 * and says which recording each mark came from.
 *
 * **What it will not do, and why each was refused by measurement rather than by preference**
 * (`ROADMAP.md` D4 and `lib/composite.ts` carry the corpus numbers):
 *
 * - **No merged reading.** No composite altitude, no composite speed. Two stages' recordings are
 *   independent measurements of different parts of one flight.
 * - **No staging mark.** `EventType` has no `separation` member and nothing here may invent one.
 *   One corpus record does hold two separable burns; nothing yet tells it apart from a single-motor
 *   flight with a corrupted stretch. See `lib/composite.ts`.
 * - **No time to a tenth.** Two boards bolted into ONE airframe still disagree by half a second
 *   once aligned, so times print in whole seconds and marks within a second are shown as
 *   unordered rather than sequenced.
 * - **No cross-check panel.** `/compare` will happily report a 30% apogee "disagreement" between
 *   a booster and a sustainer that are behaving exactly as designed. On this surface the flyer has
 *   already said these are stages, so that panel would be a warning about nothing.
 *
 * The address is the state, exactly as on `/compare`: `?ids=…` is read on arrival and on
 * back/forward, so a composite reloads, bookmarks, and pastes into a club thread.
 */

/** Which recording the flyer says flew first. Kept per id-set rather than per flight, because it
 *  is a statement about this ASSEMBLY — the same booster log is the first stage of one launch and
 *  just a flight on its own. */
type State =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'unreadable'; why: string }
  | { kind: 'refused'; refusal: StitchRefusal }
  /** `recordings` carries each one's whole analysis, not a formatted reading: the units control
   *  sits on this surface too, and tiles built at load time would have kept whichever system was
   *  chosen when the composite was assembled. */
  /** `synthetic` is whether ANY recording in the composite is a flight Debrief made up. Carried
   *  on the state rather than recomputed at render, because the recordings are re-read from the
   *  logbook here and the answer belongs to the assembly. */
  | { kind: 'ready'; composite: Composite; names: string[]; recordings: CompositeRecording[]; synthetic: boolean };

export default function StitchSurface() {
  const { sys } = useUnits();
  /** **Starts at `loading`, not `empty`, and that is a correction rather than a preference.**
   *  Every route here is a static export, so whatever this renders on the first pass is baked into
   *  `out/stitch/index.html` and served to a flyer before a line of JS runs. Starting at `empty`
   *  prerendered *"Nothing to assemble yet — Tick them in the logbook"* into the page, so a flyer
   *  opening a composite PERMALINK — the address this surface exists to mint — was told their
   *  composite did not exist, until ~1.4 MB of JS hydrated and the ids in the URL were read.
   *
   *  This is the logbook's own shipped defect on a second surface: `RecentFlights` used an empty
   *  list as the discriminator for three different states and promised a returning flyer with
   *  fifty flights that their logbook was empty. `loading` is the honest answer here because
   *  before the effect runs Debrief genuinely does not know yet — and it resolves to `empty` a
   *  moment later for a flyer who arrived with no ids, which is a state becoming true rather than
   *  a claim turning out false. */
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [ids, setIds] = useState<string[]>([]);
  const [firstStage, setFirstStage] = useState<string | undefined>(undefined);
  /** What the last "Save records" press did. `DESIGN.md` §5's five states: a control that writes
   *  files says whether it wrote them. */
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  /** What the sample offer did, when it did not simply work. §5 again: the files come from this
   *  site, so a lost connection is the real failure and the flyer is told which one it was. */
  const [sampleNote, setSampleNote] = useState<string | null>(null);
  /** What loading the sample COST, if the logbook's prune took flights to make room. Reported here
   *  rather than swallowed, because this surface renders no logbook of its own and a flyer who
   *  pressed one button is owed the same accounting a drop gets — that silence was a Sev-1 on the
   *  two surfaces that already had this banner. */
  const [forgotten, setForgotten] = useState<string[]>([]);

  const load = useCallback(async (wanted: string[]) => {
    setIds(wanted);
    if (wanted.length < 2) {
      setState({ kind: 'empty' });
      return;
    }
    setState({ kind: 'loading' });
    const { inputs, skipped } = await compareFromLogbook(wanted);
    // A missing stage is NOT a degraded composite. `/compare` drops an unreadable id and carries
    // on, which is right there — five good flights should not be lost to one bad file. Here the
    // whole point is that these recordings are parts of one launch, so a part that did not load
    // means the timeline has a hole in it and saying nothing would be the wrong answer.
    if (inputs.length < wanted.length) {
      setState({
        kind: 'unreadable',
        why: skipped.length
          ? skipped.map((s) => `${s.name} — ${s.why}`).join('; ')
          : 'one of those flights is no longer in this logbook',
      });
      return;
    }
    const stated = readFirstStage(wanted);
    setFirstStage(stated);
    // `synthetic` per recording rather than once for the assembly: `compareFromLogbook` reads it
    // off each flight itself (so it works on a logbook row saved before the field existed), and
    // the timeline's rows come from DIFFERENT flights — one made-up stage beside a real one has to
    // label exactly the marks it drew.
    const recordings: CompositeRecording[] = inputs.map((i) => ({
      name: i.name,
      analysis: i.analysis,
      synthetic: i.synthetic,
    }));
    const built = buildComposite(recordings, stated);
    if (!built.ok) {
      setState({ kind: 'refused', refusal: built.refusal });
      return;
    }
    setState({
      kind: 'ready',
      composite: built.composite,
      names: inputs.map((i) => i.name),
      recordings,
      // `compareFromLogbook` reads it off the flight itself, so this works on a logbook row
      // saved before the field existed.
      synthetic: inputs.some((i) => i.synthetic),
    });
  }, []);

  /**
   * Open the staged-pair sample: a booster and a sustainer this surface can assemble.
   *
   * **Why this surface offers a sample of its own rather than sending the flyer to `/compare`.**
   * The empty state's only exit needed two per-stage recordings of one launch, which is the rarest
   * thing a first-time visitor could be asked for — rarer than the two boards `/compare` asks for,
   * because it takes a two-stage rocket AND two altimeters AND a flyer who kept both files. So the
   * one surface demonstrating a capability no rival tool has (`COMPETITION.md` row 40) could not
   * demonstrate it at all.
   *
   * **It goes into the LOGBOOK and then into the address, which is not a detour.** A composite here
   * is assembled from logbook ids by construction (`compareFromLogbook`) and its whole product is
   * an address that reloads — so a sample that skipped the logbook would be a second, private path
   * to a composite that could not be bookmarked, which is the defect `lib/samples.ts` records
   * slice 1 removing. `ingestFiles` is the same reader a dropped folder goes through.
   *
   * A `stages` sample is deliberately NOT offered on the analyze page: dropped together these two
   * files build a comparison, and a comparison of a booster against a sustainer reports their
   * apogees disagreeing by a factor of ten as if that were a finding. See `Sample.kind`.
   */
  const openStagesSample = useCallback(async () => {
    const sample = STAGES_SAMPLE;
    if (!sample) return;
    setState({ kind: 'loading' });
    setSampleNote(null);
    setForgotten([]);
    try {
      const { results, forgotten: pruned } = await ingestFiles(await sampleFiles(sample), MAX_COMPARE);
      setForgotten(pruned);
      const got = results.map((r) => r.savedId).filter((v): v is string => !!v);
      if (got.length < 2) {
        // A browser that refuses the write is the one real failure that is not the network, and it
        // is not recoverable HERE: a composite is read back out of the logbook, so two recordings
        // that were never kept cannot be assembled however well they parsed.
        setState({ kind: 'empty' });
        setSampleNote(
          results.length < 2
            ? 'The sample loaded but could not be read as two recordings — please reload the page and try again.'
            : `The sample was read, but ${STORAGE_WRITE_REFUSED} — and a composite is assembled from your logbook, so there is nothing here to assemble.`,
        );
        return;
      }
      window.history.pushState(null, '', withIds(new URL(window.location.href), got));
      await load(got);
    } catch {
      setState({ kind: 'empty' });
      setSampleNote(
        'The sample could not be loaded — it is fetched from this site, so a lost connection is the usual cause.',
      );
    }
  }, [load]);

  // Follow the address bar rather than keeping a private idea of what is on screen — the same
  // contract `/compare` settled on, so a Back that returns here shows what the URL says.
  useEffect(() => {
    const apply = () => void load(idsFromParam(new URLSearchParams(window.location.search).get('ids')));
    apply();
    // Back/forward is a different composite, so whatever the last press cost is not about the
    // screen the flyer is arriving at. Same reasoning as `chooseFirstStage`, and it cannot swallow
    // the sample's own report: that press calls `load` directly rather than going through here.
    const onPop = () => {
      setForgotten([]);
      apply();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [load]);

  const state1 = state.kind === 'ready' ? state : null;

  /**
   * Save one canonical flight record per recording, each carrying the flyer's per-stage
   * statement, zipped.
   *
   * **This surface wrote nothing at all before.** "Copy the timeline" and "Copy a link" were the
   * whole output, while `/compare` writes .md, .html, .json, .csv and a ZIP for the same flyer —
   * so the one multi-source structure that only exists here left the app as clipboard text.
   *
   * The flights are loaded AT CLICK TIME rather than held in state. `CompareInput` deliberately
   * carries analyses and not `RawFlight`s, because a composite of four recordings would then hold
   * every sample of every channel in React state for the whole visit; a button press can afford
   * one read each.
   */
  const saveRecords = useCallback(async () => {
    setSaveMsg('Building records…');
    try {
      const set = stageKey(ids);
      const entries: ZipEntry[] = [];
      for (const id of ids) {
        const { rec } = await readRecent(id);
        if (!rec) continue;
        const result = importRecent(rec);
        if (result.kind !== 'flight') continue;
        const stem = rec.name.replace(/\.[^.]+$/, '');
        entries.push({
          name: `${stem}-debrief-record.json`,
          // `first` is the flyer's statement, per recording. `set` is shared by every record in
          // the drop, which is what lets the statement be put back on a device that has never
          // seen these ids.
          data: toCanonical(result.flight, { stage: { set, first: rec.name === firstStage } }),
        });
      }
      if (entries.length === 0) {
        setSaveMsg('None of these recordings could be re-read from the logbook, so nothing was saved.');
        return;
      }
      download(await zip(entries), 'debrief-stages.zip');
      setSaveMsg(
        `Saved ${entries.length} flight records${firstStage ? ', carrying which one flew first' : ''} — drop them back in together and the composite comes back.`,
      );
      setTimeout(() => setSaveMsg(null), 6000);
    } catch {
      setSaveMsg('Couldn’t build the records in this browser — each flight’s own report still has “Save record”.');
    }
  }, [ids, firstStage]);

  const chooseFirstStage = useCallback(
    (name: string | undefined) => {
      writeFirstStage(ids, name);
      setFirstStage(name);
      // The prune report belongs to the press that caused it. It could not outlive anything while
      // it rendered on one branch a successful press never reaches; now that it reaches `ready`,
      // reordering the stages would carry a report of a deletion two interactions ago. Cleared
      // here rather than inside `load`, which the sample press itself calls immediately after
      // setting it — clearing there would wipe the report before it was ever shown.
      setForgotten([]);
      void load(ids);
    },
    [ids, load],
  );

  /**
   * What the last press COST, on whatever screen it leaves the flyer.
   *
   * **It was mounted on ONE of the five branches, and that one is the failure path.**
   * `openStagesSample` sets `forgotten` and then, on success, `load(got)` puts this surface into
   * `ready` — so the accounting rendered only when the sample could NOT be assembled, which is
   * exactly when nothing was saved and nothing was pruned. Press the sample with a nearly-full
   * logbook and Debrief deleted rows — their stored text, labels, notes, crops and grouping — and
   * said nothing on the screen it left you on. IndexedDB rows do not come back and there is no
   * undo.
   *
   * This is verbatim the Sev-1 that put `ForgottenBanner` in its own file: the notice reached only
   * the surface a flyer is NOT on after a drop. That fix hoisted it out of `RecentFlights` and
   * fitted it to the report and to `/compare`; this route got the import and one call site on the
   * branch a flyer rarely sees. It was blind on `unreadable` and `refused` too — both reachable
   * from the same press, since `load(got)` can land on either.
   *
   * **Every branch a press can LEAVE a flyer on, which is not the same as every branch.**
   * `loading` deliberately does not get it: `openStagesSample` sets `forgotten` and then `load()`
   * sets `loading` in the same batch, so mounting it there would announce a completed deletion on
   * a screen that says Debrief is still looking. The report belongs on the screen the press
   * settles on.
   *
   * One element rather than four copies of the JSX — but note that is a convenience and not a
   * guard: a sixth branch returning without `{forgottenBanner}` compiles and renders exactly as
   * this bug did. What would make it structural is a wrapper the branches return INTO, and that is
   * a larger refactor of a 650-line component than a Sev-1 fix should carry.
   */
  const forgottenBanner = <ForgottenBanner forgotten={forgotten} onDismiss={() => setForgotten([])} />;

  if (state.kind === 'loading') {
    // Was a `<Card aria-busy>` with no live region: `aria-busy` marks a region stale, it
    // announces nothing, so this said nothing at all to a screen reader.
    return (
      <Card>
        {/* "Looking for" rather than "Reading", because this copy is now also what the STATIC
            EXPORT prerenders — before the ids in the URL have been read, claiming Debrief is
            reading recordings would assert that there are some. Looking for them is true whether
            this address names two or none. */}
        <Loading>Looking for the recordings…</Loading>
      </Card>
    );
  }

  if (state.kind === 'empty') {
    return (
      <>
        {/* What loading the sample cost, if anything. Above the empty state, because it is about
            the press the flyer just made rather than about the state they are looking at. */}
        {forgottenBanner}
        {sampleNote && (
          <Notice className="mb-3">
            <p role="status">{sampleNote}</p>
          </Notice>
        )}
        <EmptyState
          title="Nothing to assemble yet"
          what={
            <>
              A composite needs two or more recordings of one launch — a booster and a sustainer, each on
              its own altimeter. Tick them in the logbook on the comparison surface, then come back with
              them in the address.
            </>
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button href="/compare" variant="primary">
                Pick flights on Compare
              </Button>
              {/* The one surface whose subject a first-time visitor almost certainly cannot supply.
                  Offered second, because a flyer who HAS their own two files should reach for them
                  first — `DESIGN.md` §5 gives one primary per state. */}
              {STAGES_SAMPLE && (
                <span className="inline-flex items-center gap-1.5">
                  <Button onClick={() => void openStagesSample()} title={STAGES_SAMPLE.shows}>
                    {STAGES_SAMPLE.label}
                  </Button>
                  {/* A sample Debrief MADE UP says so BEFORE it is opened — the same question the
                      analyze page's offers answer, and a different one from every export sink:
                      does a flyer know what they are about to look at. */}
                  {STAGES_SAMPLE.synthetic && (
                    <Chip
                      tone="warn"
                      value={
                        <>
                          {SYNTHETIC_TAG}
                          <span className="sr-only"> — flights Debrief made up, not recordings</span>
                        </>
                      }
                    />
                  )}
                </span>
              )}
            </div>
          }
        />
      </>
    );
  }

  if (state.kind === 'unreadable') {
    return (
      <>
        {forgottenBanner}
        <ErrorState
          what="One of these recordings could not be read, so there is a hole in the timeline."
          expected={
            <>
              {state.why}. A composite is only worth reading when every stage is in it, so Debrief will
              not assemble a partial one.
            </>
          }
          action={
            <Button href={`/compare/?ids=${ids.join(',')}`}>Open what did read, side by side</Button>
          }
        />
      </>
    );
  }

  if (state.kind === 'refused') {
    return (
      <>
        {forgottenBanner}
        <ErrorState
          what={`Debrief can’t put ${state.refusal.recordings.length === 1 ? 'this recording' : 'these recordings'} on one clock: ${state.refusal.recordings.join(', ')}`}
          expected={
            <>
              {state.refusal.why} Debrief lines stages up on the launch, because that is the one instant
              every stage of a rocket shares. A stage that missed it could only be placed by guessing a
              staging delay, and a guessed composite reads exactly like a measured one — so there is no
              fallback here on purpose.
            </>
          }
          action={
            <Button href={`/compare/?ids=${ids.join(',')}`}>Read them side by side instead</Button>
          }
        />
      </>
    );
  }

  const { composite, names, recordings, synthetic } = state1!;
  // Built at render, so a unit switch reaches every stage's numbers — the same contract every
  // other reading on every other surface has.
  const stages = recordings.map((r) => ({
    name: r.name,
    tiles: stageTiles(r.analysis.metrics, sys),
    burn: composite.burns.find((b) => b.name === r.name) ?? null,
  }));

  return (
    <>
      {/* **The branch a successful sample press actually lands on**, and the one this banner never
          reached. Above the standing caveat, because it is about the press the flyer just made
          rather than about the composite they are now reading.

          OUTSIDE the `space-y-4` below, deliberately: the banner carries its own `mb-3`, and as a
          first child of that container it would compose into a 28 px gap — off §4's scale, and
          unlike the two surfaces that already render this banner, where `mb-3` is its only
          spacing. */}
      {forgottenBanner}
      <div className="space-y-4">
        {/* The method and its standing caveat, once, above the readings — never per row, which would
          be twenty repetitions of one sentence. `verified` is false on every composite there is. */}
      <Card tone="warn">
        <p className="text-sm font-medium">This composite is your statement, not a measurement.</p>
        <p className="mt-1 text-sm">
          The recordings are lined up on the <strong>launch</strong> — the one instant every stage of a
          rocket shares. Nothing in the files establishes that they belong to the same launch, or that
          each one actually contains it; you are saying so by assembling them. Times are good to about
          a second, so two marks within a second of each other are <em>not</em> ordered by this table,
          and it says which those are.
        </p>
      </Card>

      <Card
        as="section"
        aria-labelledby="which-flew-first"
        title={<span id="which-flew-first">Which recording flew as the first stage?</span>}
      >
        <p className="-mt-1 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          This is a label, not a setting. Every stage leaves the pad together, so the alignment does not
          read it and the times do not change — it only orders marks that land at the same instant.
        </p>
        <div className="flex flex-wrap gap-2">
          {names.map((n) => (
            <Button
              key={n}
              variant={firstStage === n ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={firstStage === n}
              onClick={() => chooseFirstStage(firstStage === n ? undefined : n)}
            >
              {n}
            </Button>
          ))}
        </div>
      </Card>

      <Card as="section" aria-labelledby="composite-timeline" pad={false}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-4 pb-3">
          <h2 id="composite-timeline" className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            {composite.marks.length} marks across {names.length} recordings
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Lined up on the launch · times in whole seconds
          </p>
        </div>
        {/* The timeline is the card a cert write-up quotes and the card a flyer screenshots, and
            it sat above the only notice this route carried — so a made-up composite read as a
            launch until you scrolled past the table. Same treatment as the readings below and as
            `MetricGrid`'s: the short form, above the numbers, on the card that holds them. */}
        {synthetic && (
          <div className="px-4 pb-3">
            <Notice as="p" tone="warn" data-synthetic="timeline">
              {SYNTHETIC_SHORT}
            </Notice>
          </div>
        )}
        {/* A staged flight's mark timeline is the thing a cert write-up quotes, and it was
            readable and nothing else. The altitude column carries its unit in the header rather
            than in every cell, because a spreadsheet sorts a column of bare numbers and will not
            sort "1,234 ft". The tie marker travels as a word: "↳" says nothing once it is out of
            this table and next to the row above it.

            The `Provenance` column appears only when one of these recordings is made up, and it
            answers PER ROW off the MARK — the same column and the same wording the logbook's
            clipboard table uses, because both land in a spreadsheet where a caption above the
            header is a cell a sort moves away from the rows it was about. Per row matters more
            here than anywhere else it appears: this is the one table whose rows come from
            different flights. */}
        {composite.marks.length > 0 && (
          <div className="px-4 pb-2">
            <CopyTableButton
              label="Copy the timeline"
              title="Copy these marks — as a table for a spreadsheet or document, and as tab-separated text everywhere else"
              header={[
                'Time (s)',
                'Mark',
                'Recording',
                `Its own altitude (${fmtLength(0, sys).replace(/^[\d.,]+\s*/, '')})`,
                ...(synthetic ? [PROVENANCE_COLUMN] : []),
                'Note',
              ]}
              rows={() =>
                composite.marks.map((m) => [
                  fmtCompositeTime(m.t),
                  m.label,
                  m.recording,
                  m.altitudeM == null ? '—' : fmtLength(m.altitudeM, sys).replace(/\s*[a-zA-Z]+$/, ''),
                  ...(synthetic ? [provenanceCell(m.synthetic)] : []),
                  m.tiedWithPrevious ? 'within a second of the mark above — not ordered against it' : '',
                ])
              }
            />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50">
              <tr>
                <th
                  scope="col"
                  className="border-y border-zinc-200 px-4 py-2 text-left text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-zinc-800 dark:text-zinc-400"
                >
                  Time
                </th>
                <th
                  scope="col"
                  className="border-y border-zinc-200 px-4 py-2 text-left text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-zinc-800 dark:text-zinc-400"
                >
                  Mark
                </th>
                <th
                  scope="col"
                  className="border-y border-zinc-200 px-4 py-2 text-left text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-zinc-800 dark:text-zinc-400"
                >
                  Recording
                </th>
                <th
                  scope="col"
                  className="border-y border-zinc-200 px-4 py-2 text-right text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-zinc-800 dark:text-zinc-400"
                >
                  Its own altitude
                </th>
              </tr>
            </thead>
            <tbody>
              {composite.marks.map((m, i) => (
                <tr key={`${m.recording}-${m.type}-${i}`} className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-2 font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                    {m.tiedWithPrevious ? (
                      <span className="text-zinc-500 dark:text-zinc-400" title="Within a second of the mark above — this table does not order these two">
                        ↳ {fmtCompositeTime(m.t)}
                      </span>
                    ) : (
                      fmtCompositeTime(m.t)
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: EVENT_COLOR[m.type] }}
                      />
                      {m.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs break-all text-zinc-600 dark:text-zinc-400">
                    {m.recording}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                    {m.altitudeM == null ? '—' : fmtLength(m.altitudeM, sys)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
          Every altitude is on its own recording&apos;s pad datum, so they are four readings and never
          one. To read them against each other,{' '}
          <Link href={`/compare/?ids=${ids.join(',')}`} className="underline underline-offset-2">
            put them side by side
          </Link>
          .
        </p>
      </Card>

      {/* What each stage did, on its own recording.
          The composite has always had every recording's full analysis in hand and shown one number
          off it — the burn — so a flyer who wanted the sustainer's own apogee, its peak speed or
          the thrust-to-weight it left the pad at had to leave, open each file separately, and hold
          three reports in their head. Every figure here is one board's reading of the part of the
          launch it flew, and none of them is combined with any other: a booster's apogee is where
          the BOOSTER came down. That is the same rule `lib/composite.ts` applies to the marks. */}
      {stages.length > 0 && (
        <Card
          as="section"
          aria-labelledby="per-stage-heading"
          title={<span id="per-stage-heading">What each recording read on its own</span>}
        >
          {/* **The one screen sink the 2026-08-09 audit missed entirely**, found by the pre-push
              review of the slice that was supposed to have found all of them. `/stitch` is a
              top-level route that prints every stage's apogee, max speed and burn by name, and
              unlike the report there is no surface above it to carry a caveat — so a composite
              assembled from made-up recordings read exactly like a launch. The short form, above
              the readings, which is where §5 says a `Notice` goes. */}
          {synthetic && (
            <Notice as="p" tone="warn" data-synthetic="composite" className="mb-3">
              {SYNTHETIC_SHORT}
            </Notice>
          )}
          <p className="-mt-1 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Each of these is one board&apos;s own reading of the part of the launch it flew, on its own
            pad datum and its own clock — <strong className="font-medium">never combined</strong>. A
            booster&apos;s apogee is where the booster came down, not a stage of one number. Where a
            reading is missing, that board did not record what it needed.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* `data-stage` / `data-reading` are the hooks `MetricGrid` already uses for the
                single-flight grid — a reading has to be reachable by NAME, or a walk of this
                surface can only assert that some numbers are present somewhere. */}
            {stages.map((s) => (
              <Frame key={s.name} data-stage={s.name} className="p-4">
                <h3 className="font-mono text-xs break-all text-zinc-600 dark:text-zinc-400">
                  {s.name}
                  {firstStage === s.name && (
                    <span className="ml-2 font-sans text-zinc-500 dark:text-zinc-400">· you said this flew first</span>
                  )}
                </h3>
                {s.tiles.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {s.tiles.map((t) => (
                      <Readout key={t.label} data-reading={t.label} label={t.label} value={t.value} sub={t.sub} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    Nothing this panel reports is in this recording — it carries no altitude, speed or
                    acceleration Debrief could read.
                  </p>
                )}
                {s.burn && (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Burn located <Chip label="from" value={s.burn.provenance} mono={false} /> — across the
                    corpus a <em>measured</em> burn runs 0.8–6.0 s and a <em>derived</em> one 0.05–23.9 s,
                    so a spread between two boards can be a definition rather than a discrepancy. Until the
                    stages separate every board is in the same airframe recording the same burn.
                  </p>
                )}
              </Frame>
            ))}
          </div>
        </Card>
      )}

      {composite.silent.length > 0 && (
        <Card tone="sunken">
          <p className="text-sm">
            Nothing was marked on {composite.silent.join(', ')} — {composite.silent.length === 1 ? 'it is' : 'they are'}{' '}
            in the composite and contributed no rows.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button href={`/compare/?ids=${ids.join(',')}`}>Read these side by side</Button>
        <Button onClick={saveRecords}>Save these records</Button>
        {saveMsg && (
          <p role="status" className="w-full text-sm text-zinc-600 dark:text-zinc-300">
            {saveMsg}
          </p>
        )}
        <Button
          onClick={() => {
            const url = new URL(window.location.href);
            void navigator.clipboard?.writeText(withIds(url, ids));
          }}
        >
          Copy a link to this composite
        </Button>
        </div>
      </div>
    </>
  );
}
