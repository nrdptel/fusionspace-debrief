'use client';

import { useState } from 'react';
import type { RecentMeta } from '@/lib/recents';
import { distinguishingLabels, proposeGroups } from '@/lib/proposeGroups';
import { planGrouping } from '@/lib/flightGroups';
import { Button, Segmented } from './ui';

/** A label long enough to read and short enough not to push the page sideways. `Segmented` lays
 *  its options out in a row, so an unbounded label from a flyer-renamed file is a horizontal
 *  scrollbar on the whole document: measured at a 390 px viewport, a 25-character label took
 *  `document.scrollWidth` to 423 px against a 390 px client. The full name is still in the
 *  sentence directly above, so nothing is hidden by clipping it here. */
const clip = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

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
  // Which recording reports the flight, if the flyer accepts. Seeded from the proposal's
  // suggestion and overridable BEFORE the press — the offer names a primary, it does not pick a
  // winner between two instruments. `null` means "still on the suggestion", so a proposal that
  // changes underneath (another file lands in the same drop) cannot leave this pointing at a row
  // that is no longer in it.
  const [chosen, setChosen] = useState<string | null>(null);
  if (!proposal) return null;

  const names = proposal.ids.map((id) => recents.find((r) => r.id === id)?.name ?? id);
  const primaryId = chosen != null && proposal.ids.includes(chosen) ? chosen : proposal.suggestedPrimaryId;
  const labels = distinguishingLabels(names);

  return (
    <section
      aria-label="Files that may be one flight"
      className="mb-3 rounded-md border border-indigo-300/70 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-100"
    >
      {/* The live region is the MESSAGE, not the whole panel. It used to wrap everything, which
          was harmless while nothing inside it changed — and stopped being harmless the moment a
          control moved in: `role="status"` implies `aria-atomic`, so every press of "Reported by"
          re-announced the count, both file names in full and the whole reason sentence over the
          flyer's own action, before saying what they had just selected. */}
      <p role="status">
        <strong className="font-medium">{names.length} of these look like one flight</strong> —{' '}
        <span className="font-mono text-xs">{names.join(', ')}</span>. {proposal.reason}
      </p>
      {/* Which recording reports the flight, chosen BEFORE accepting rather than corrected after.
          The row control could always change it, but only once the flight existed — so the one
          moment a flyer is actually looking at both files was the one moment they could not say.
          §5 gives `Segmented` 2–5 options; beyond that it is the wrong control, and the row
          control after accepting is still there, so the offer degrades to its suggestion rather
          than rendering a vocabulary this system does not have.

          **What is deliberately NOT on these options is each recording's apogee.** It was there
          and came out. `RecentMeta` stores `apogeeM` with no `apogeeIsFloor` beside it, and that
          flag is real — a record whose log ends at its own peak reports a LOWER BOUND. Printing
          it bare, on the control that decides which instrument reports the flight, would push a
          flyer toward the larger of two numbers when the larger one may be the floor. That is the
          same defect as publishing a Cd off a refused velocity, one surface further on. Two
          altimeters are two independent measurements and Debrief does not pick a winner between
          them; what each one read belongs where it is already shown with its context, on the
          recording strip after the flight exists. */}
      {proposal.ids.length <= 5 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">Reported by</span>
          <Segmented
            ariaLabel="Which recording reports this flight"
            value={primaryId}
            onChange={setChosen}
            options={proposal.ids.map((id, i) => ({ value: id, label: clip(labels[i]) }))}
          />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={async () => {
            await onGroup(planGrouping(proposal.ids, primaryId));
            onDismiss?.();
          }}
        >
          Yes, one flight
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDismiss?.()}>
          No, separate flights
        </Button>
      </div>
    </section>
  );
}
