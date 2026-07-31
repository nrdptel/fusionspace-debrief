'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { buildComposite, fmtCompositeTime, type Composite } from '@/lib/composite';
import { compareFromLogbook, idsFromParam, withIds } from '@/lib/compareFromLogbook';
import type { StitchRefusal } from '@/lib/stitch';
import { fmtLength } from '@/lib/display';
import { useUnits } from './UnitsProvider';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { Button, Card, Chip, EmptyState, ErrorState, Readout } from './ui';

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
 * - **No staging mark.** No corpus record holds two separable burns, so `EventType` has no
 *   `separation` member and nothing here may invent one.
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
  | { kind: 'ready'; composite: Composite; names: string[] };

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
    const built = buildComposite(
      inputs.map((i) => ({ name: i.name, analysis: i.analysis })),
      stated,
    );
    if (!built.ok) {
      setState({ kind: 'refused', refusal: built.refusal });
      return;
    }
    setState({ kind: 'ready', composite: built.composite, names: inputs.map((i) => i.name) });
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

  const { composite, names } = state1!;

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

      {composite.burns.length > 0 && (
        <Card as="section" aria-labelledby="burns-heading" title={<span id="burns-heading">What each board called the burn</span>}>
          <p className="-mt-1 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Until the stages separate every board is in the same airframe recording the same burn — so
            these ought to agree, and where they do not it is usually the two detectors disagreeing
            about what &ldquo;burnout&rdquo; means rather than the flight. Debrief shows them and gates
            on none of it: across the corpus a <em>measured</em> burn runs 0.8&ndash;6.0&nbsp;s and a{' '}
            <em>derived</em> one 0.05&ndash;23.9&nbsp;s, so a spread between two of them can be a
            definition rather than a discrepancy.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {composite.burns.map((b) => (
              <Readout
                key={b.name}
                label={b.name}
                value={`${b.durationS.toFixed(2)} s`}
                sub={<Chip label="from" value={b.provenance} mono={false} />}
              />
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
