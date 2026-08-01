'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { buildComposite, fmtCompositeTime, type Composite, type CompositeRecording } from '@/lib/composite';
import { stageTiles } from '@/lib/readings';
import { compareFromLogbook, idsFromParam, withIds } from '@/lib/compareFromLogbook';
import type { StitchRefusal } from '@/lib/stitch';
import { fmtLength } from '@/lib/display';
import { useUnits } from './UnitsProvider';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { Button, Card, Chip, CopyTableButton, EmptyState, ErrorState, Frame, Readout } from './ui';

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
const FIRST_STAGE_KEY = 'debrief.firstStage';

function readFirstStage(ids: string[]): string | undefined {
  try {
    const all = JSON.parse(window.localStorage.getItem(FIRST_STAGE_KEY) || '{}') as Record<string, string>;
    return all[ids.join(',')];
  } catch {
    return undefined;
  }
}

function writeFirstStage(ids: string[], name: string | undefined) {
  try {
    const all = JSON.parse(window.localStorage.getItem(FIRST_STAGE_KEY) || '{}') as Record<string, string>;
    if (name == null) delete all[ids.join(',')];
    else all[ids.join(',')] = name;
    window.localStorage.setItem(FIRST_STAGE_KEY, JSON.stringify(all));
  } catch {
    /* a device that refuses storage still gets a composite; it just forgets the statement */
  }
}

type State =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'unreadable'; why: string }
  | { kind: 'refused'; refusal: StitchRefusal }
  /** `recordings` carries each one's whole analysis, not a formatted reading: the units control
   *  sits on this surface too, and tiles built at load time would have kept whichever system was
   *  chosen when the composite was assembled. */
  | { kind: 'ready'; composite: Composite; names: string[]; recordings: CompositeRecording[] };

export default function StitchSurface() {
  const { sys } = useUnits();
  const [state, setState] = useState<State>({ kind: 'empty' });
  const [ids, setIds] = useState<string[]>([]);
  const [firstStage, setFirstStage] = useState<string | undefined>(undefined);

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
    const recordings: CompositeRecording[] = inputs.map((i) => ({ name: i.name, analysis: i.analysis }));
    const built = buildComposite(recordings, stated);
    if (!built.ok) {
      setState({ kind: 'refused', refusal: built.refusal });
      return;
    }
    setState({ kind: 'ready', composite: built.composite, names: inputs.map((i) => i.name), recordings });
  }, []);

  // Follow the address bar rather than keeping a private idea of what is on screen — the same
  // contract `/compare` settled on, so a Back that returns here shows what the URL says.
  useEffect(() => {
    const apply = () => void load(idsFromParam(new URLSearchParams(window.location.search).get('ids')));
    apply();
    window.addEventListener('popstate', apply);
    return () => window.removeEventListener('popstate', apply);
  }, [load]);

  const state1 = state.kind === 'ready' ? state : null;

  const chooseFirstStage = useCallback(
    (name: string | undefined) => {
      writeFirstStage(ids, name);
      setFirstStage(name);
      void load(ids);
    },
    [ids, load],
  );

  if (state.kind === 'loading') {
    return (
      <Card aria-busy="true">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Reading the recordings…</p>
      </Card>
    );
  }

  if (state.kind === 'empty') {
    return (
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
          <Button href="/compare" variant="primary">
            Pick flights on Compare
          </Button>
        }
      />
    );
  }

  if (state.kind === 'unreadable') {
    return (
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
    );
  }

  if (state.kind === 'refused') {
    return (
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
    );
  }

  const { composite, names, recordings } = state1!;
  // Built at render, so a unit switch reaches every stage's numbers — the same contract every
  // other reading on every other surface has.
  const stages = recordings.map((r) => ({
    name: r.name,
    tiles: stageTiles(r.analysis.metrics, sys),
    burn: composite.burns.find((b) => b.name === r.name) ?? null,
  }));

  return (
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
        {/* A staged flight's mark timeline is the thing a cert write-up quotes, and it was
            readable and nothing else. The altitude column carries its unit in the header rather
            than in every cell, because a spreadsheet sorts a column of bare numbers and will not
            sort "1,234 ft". The tie marker travels as a word: "↳" says nothing once it is out of
            this table and next to the row above it. */}
        {composite.marks.length > 0 && (
          <div className="px-4 pb-2">
            <CopyTableButton
              label="Copy the timeline"
              title="Copy these marks — as a table for a spreadsheet or document, and as tab-separated text everywhere else"
              header={['Time (s)', 'Mark', 'Recording', `Its own altitude (${fmtLength(0, sys).replace(/^[\d.,]+\s*/, '')})`, 'Note']}
              rows={() =>
                composite.marks.map((m) => [
                  fmtCompositeTime(m.t),
                  m.label,
                  m.recording,
                  m.altitudeM == null ? '—' : fmtLength(m.altitudeM, sys).replace(/\s*[a-zA-Z]+$/, ''),
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
                    <span className="ml-2 font-sans text-zinc-500 dark:text-zinc-500">· you said this flew first</span>
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
  );
}
