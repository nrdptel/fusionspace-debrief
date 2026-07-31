'use client';

import type { RecentMeta } from '@/lib/recents';
import { proposeGroups } from '@/lib/proposeGroups';
import { planGrouping } from '@/lib/flightGroups';
import { Button } from './ui';

/** These look like one flight — offered, with the evidence, and refusable.
 *
 *  D3 makes a flyer find the pair by hand. This offers it, and the offer is a suggestion BESIDE
 *  the files rather than a state the logbook is already in: nothing is grouped until the flyer
 *  presses, because a wrong automatic merge fabricates one flight out of two and every downstream
 *  reading inherits it.
 *
 *  **It renders wherever a drop can land the flyer, which is why it is a component rather than a
 *  block inside the logbook.** It began inside `RecentFlights`, and a walk of the built export
 *  showed that is the one place a flyer is NOT looking after dropping two files: both surfaces
 *  switch to the comparison, and the analyze route returns early on `phase === 'compare'` without
 *  rendering the logbook at all. An offer nobody sees at the moment it applies is the "feature
 *  reachable only by knowing it is there" tell.
 *
 *  Accepting runs the same `planGrouping` the manual press runs, so there is one code path and
 *  nothing new in the data model — and the primary is a SUGGESTION, so the row control that
 *  nominates a different recording still decides which one reports the flight. */
export default function GroupProposalBanner({
  recents,
  arrived,
  onGroup,
  onDismiss,
}: {
  recents: RecentMeta[];
  /** Logbook ids the drop that just happened produced. A grouping is only ever offered over
   *  these — never over the whole logbook — so the offer is about the files the flyer just
   *  dropped, and saying no to it is final without anything having to be stored. */
  arrived: string[];
  onGroup: (changes: { id: string; flightId: string | null }[]) => void | Promise<void>;
  onDismiss?: () => void;
}) {
  // Only the first is shown: two offers at once is a decision a flyer has to unpick rather than
  // take, and a launch day rarely produces two stamped pairs in one drop.
  const proposal = proposeGroups(recents.filter((r) => arrived.includes(r.id)))[0];
  if (!proposal) return null;

  const names = proposal.ids.map((id) => recents.find((r) => r.id === id)?.name ?? id);

  return (
    <div
      role="status"
      className="mb-3 rounded-md border border-indigo-300/70 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-100"
    >
      <p>
        <strong className="font-medium">{names.length} of these look like one flight</strong> —{' '}
        <span className="font-mono text-xs">{names.join(', ')}</span>. {proposal.reason}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={async () => {
            await onGroup(planGrouping(proposal.ids, proposal.suggestedPrimaryId));
            onDismiss?.();
          }}
        >
          Yes, one flight
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDismiss?.()}>
          No, separate flights
        </Button>
      </div>
    </div>
  );
}
