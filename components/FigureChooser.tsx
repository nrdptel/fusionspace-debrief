'use client';

// Which plots a DOCUMENT carries. Shared by the two surfaces that produce documents — the
// single-flight report and the comparison — because they were doing the same job and only one
// of them offered the choice: the report filtered its figures through the flyer's stored
// selection while the comparison exported a hardcoded altitude/velocity/acceleration, so a
// flyer who turned Acceleration off still got it in the comparison bundle. `CONTRIBUTING.md`'s
// rule for the readings lists applies here too — where two surfaces do the same job they share
// a module rather than a resemblance.
//
// This is about the document, never the analysis: every figure a flight supports is still drawn
// on screen, and turning them all off leaves a report of numbers, which is a legitimate answer
// for a table-only write-up.

import { Chip } from './ui';

export default function FigureChooser({
  titles,
  hidden,
  onToggle,
  what,
}: {
  /** Every figure this surface could carry, chosen or not. */
  titles: string[];
  /** The ones turned off, by title — the same off-list `lib/reportProfile.ts` stores, so a
   *  figure a flight gains later appears rather than being excluded by a list written before
   *  it existed. */
  hidden: string[];
  onToggle: (title: string) => void;
  /** Which artefacts the choice reaches, named so the control says what it does. */
  what: string;
}) {
  if (titles.length < 2) return null;
  const allOff = titles.every((t) => hidden.includes(t));
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Figures in the report</span>
      {titles.map((t) => {
        const on = !hidden.includes(t);
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(t)}
            // Named "<title> figure", not "<title>". The comparison surface already has a
            // channel picker whose buttons are Altitude / Velocity / Acceleration, and a second
            // set with the identical accessible name would make every existing query for one of
            // them ambiguous — for a screen-reader user as much as for a test. The visible label
            // stays the bare title; only the accessible name says which control this is.
            aria-label={`${t} figure`}
            title={`${on ? 'Leave out' : 'Include'} the ${t.toLowerCase()} plot — applies to ${what}`}
            className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
              on
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-zinc-300 bg-white text-zinc-500 line-through hover:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500'
            }`}
          >
            {t}
          </button>
        );
      })}
      {allOff ? (
        <Chip tone="accent" mono={false} value="None — the document carries its numbers and no plots." />
      ) : (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Applies to {what}.</span>
      )}
    </div>
  );
}
