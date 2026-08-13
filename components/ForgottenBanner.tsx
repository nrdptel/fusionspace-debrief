'use client';

import { UNNOTED_MAX } from '@/lib/recents';
import { Notice } from './ui';

/** `data.csv ×3` rather than `data.csv, data.csv, data.csv` — a list whose whole job is telling a
 *  flyer WHICH launch day went is unreadable when a folder of identically-named files is pruned. */
function namesWithCounts(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
}

/**
 * What the last drop COST, named — and it renders wherever that drop lands the flyer.
 *
 * The logbook keeps the last `UNNOTED_MAX` un-noted flights on this device and silently deletes
 * the rest to make room. The prune has always run; saying nothing about it meant a flyer found out
 * by counting, days later, with nothing to do about it, because the deletion is already done and
 * the pruned rows' labels, notes and read windows do not come back.
 *
 * **It began as a block inside `RecentFlights`, and that is the one place a flyer is NOT looking
 * after a drop.** Both the analyze route and `/compare` return early on their own phase without
 * rendering the logbook at all, so on every screen a drop actually lands on, the notice did not
 * exist. Measured: drop a 13th distinct log and stay on the report and nothing on the page says a
 * flight was deleted; `e2e/logbook.spec.ts` only ever saw it because it clicks "Analyze another
 * flight" after every drop. This is verbatim the defect `GroupProposalBanner` was hoisted out of
 * the same component to fix, on the same argument, one file away — so it is a component now for
 * the same reason rather than a fourth copy of the JSX.
 *
 * **The live region is the MESSAGE, not the box** — §5's rule for `Notice`, and this banner is the
 * reason the rule is worded that way. `role="status"` implies `aria-atomic`, so a region wrapping
 * the "Got it" button re-announces the whole banner — the count, every file name, the full
 * sentence — whenever `forgotten` changes under it.
 */
export default function ForgottenBanner({
  forgotten,
  onDismiss,
}: {
  /** File names the prune deleted, in the order it deleted them. Empty renders nothing. */
  forgotten: string[];
  /** Absent where there is nowhere to put a dismiss control; the banner then clears on the next
   *  drop like any other per-drop report. */
  onDismiss?: () => void;
}) {
  if (forgotten.length === 0) return null;
  return (
    <Notice className="mb-3">
      <p role="status">
        <strong className="font-medium">
          {forgotten.length === 1 ? 'One flight was' : `${forgotten.length} flights were`} forgotten
        </strong>{' '}
        to make room: <span className="font-mono">{namesWithCounts(forgotten)}</span>. The logbook keeps the last{' '}
        {UNNOTED_MAX} un-noted flights on this device — add a <span aria-hidden="true">✎</span> note to a flight and
        it stays for good.
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-1.5 font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
        >
          Got it
        </button>
      )}
    </Notice>
  );
}
