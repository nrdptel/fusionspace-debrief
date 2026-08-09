'use client';

/**
 * "Which simulation flew?" — the one fact a flight log cannot carry and the flyer can.
 *
 * A `.ork` accumulates a simulation per motor. `predictionFigures` refuses to pick one and that
 * refusal stays the default; this control is how a flyer overrides it with something they know
 * and the file does not. Everything it does is a statement attributed to them — see
 * `lib/predictionChoice.ts` for why that attribution is the safety spine rather than politeness.
 *
 * **`ChipButton`, not `Segmented`, and the count is not the reason.** `DESIGN.md` §5 gives
 * `Segmented` for "2–5 mutually exclusive options, all visible", and five simulations is exactly
 * that range — but `Segmented` is a single `inline-flex` row and these labels carry a name plus an
 * apogee ("Simulation 3 - too short delay · 198 m"). Five of those in one unwrapping row is a
 * horizontal overflow at 390 px, which §8 rules out, and a design may state more than five anyway.
 * `ChipButton` wraps, carries `pressed`, and is already the vocabulary for a row of toggles.
 *
 * The five states, checked rather than assumed: this surface is only rendered for an offer that
 * exists, so `empty` cannot be reached — a design stating one simulation needs no choice and a
 * design that paired with nothing is reported in `skipped`. There is no `loading` (the runs were
 * read during the drop), no `error` (nothing here can fail), and no `offline` (nothing here
 * touches the network — `DESIGN.md` §5's own census clause). `extrapolated` is not a state a
 * choice can be in. What it does own is a way BACK: "Don't compare one" is always present and
 * always live, so a flyer cannot reach a state they can't leave.
 */

import { ChipButton, Card } from './ui';
import { summariseRuns, type PredictionOffer, type SimulationChoice as Choice } from '@/lib/predictionChoice';
import { fmtLength } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';

export default function SimulationChoice({
  offer,
  choice,
  onChoice,
  sys,
}: {
  offer: PredictionOffer;
  choice: Choice;
  onChoice: (choice: Choice) => void;
  sys: UnitChoice;
}) {
  const runs = summariseRuns(offer.prediction);
  const rocket = offer.prediction.rocket ?? 'this design';

  return (
    <Card as="section" tone="sunken" aria-labelledby="simchoice-heading">
      <p id="simchoice-heading" className="mb-0.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Which simulation flew?
      </p>
      {/* Deliberately NOT a restatement of the refusal sitting a few lines above it in "How this
          file was read". That note has to name every simulation, because it travels into the
          exports where these chips do not exist; saying the same sentence twice on one screen is
          the redundancy the craft bar calls a tell. This says what the CONTROL does. */}
      <p className="mb-2.5 text-sm text-zinc-500 dark:text-zinc-400">
        A flight log doesn’t name the motor, so Debrief won’t choose for you. If you know which one
        flew, name it below — that one is compared beside your flight, as your statement rather than
        a reading. Nothing here changes what Debrief measured. Each run shows the apogee it
        predicted and, where the design states one, its own word for how current it is.
      </p>
      <div role="group" aria-label="Which simulation flew" className="flex flex-wrap gap-2">
        {runs.map((run) => (
          <ChipButton
            key={run.index}
            pressed={choice === run.index}
            onClick={() => onChoice(choice === run.index ? null : run.index)}
            title={
              run.status
                ? `Your design file states this simulation as “${run.status}”. Debrief carries that word without interpreting it — OpenRocket publishes no list of what its values mean.${run.hasSeries ? ' This one also saved its altitude curve.' : ''}`
                : undefined
            }
          >
            {run.name ?? `Simulation ${run.index + 1}`}
            {run.apogee != null && (
              // The apogee is what tells five runs apart when the names are OpenRocket's own
              // defaults. `text-zinc-500` is §2's tertiary role, which is the same value in
              // both themes on purpose.
              <span className="text-zinc-500">· {fmtLength(run.apogee, sys)}</span>
            )}
            {run.status && (
              // **Visible, not only a `title`.** A simulation can be one the design has since
              // been edited past, and picking it compares a flight against numbers that predate
              // the edit — so the file's own word for its freshness has to be readable at the
              // pad, where there is no hover at all. `DESIGN.md` §5 rules a hover-only affordance
              // out before §8 does, and the first version of this chip had exactly one.
              //
              // Shown VERBATIM for every run, never interpreted, because that is the whole
              // caution `PredictedRun.status` was written with: OpenRocket's format page shows
              // one example value and defines none, so any rule keyed on the vocabulary — even
              // "warn unless it says uptodate" — would be built on a list nobody has published.
              // Debrief repeats what the file says and leaves the reading to the flyer.
              <span className="text-zinc-500">· {run.status}</span>
            )}
          </ChipButton>
        ))}
        <ChipButton
          pressed={choice === null}
          dashed
          onClick={() => onChoice(null)}
          title="Compare no simulation — Debrief's own default, and what it does when nobody says which flew"
        >
          Don’t compare one
        </ChipButton>
      </div>
    </Card>
  );
}
