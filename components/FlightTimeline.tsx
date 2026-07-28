import type { FlightEvent, FlightMetrics } from '@/lib/analyze/types';
import { fmtSpeed, fmtTime } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { flightPhases, type Phase } from '@/lib/phases';
import { landedInRecord } from '@/lib/readings';

// Phase colours drawn from the app's existing palette (altitude indigo, velocity
// emerald, acceleration amber, plus a sky for the drogue leg).
const PHASE_COLOR: Record<Phase['key'], string> = {
  boost: '#f59e0b',
  coast: '#6366f1',
  drogue: '#0ea5e9',
  main: '#10b981',
  descent: '#10b981',
};

/** A proportional, at-a-glance bar of the flight's phases — boost, coast and the
 *  descent legs — with each phase's duration (and descent rate where it applies).
 *  Purely the shape of the flight you flew, off the detected events. */
export default function FlightTimeline({
  events,
  metrics,
  sys,
}: {
  events: FlightEvent[];
  metrics: FlightMetrics;
  sys: UnitChoice;
}) {
  const phases = flightPhases(events);
  const total = phases.reduce((s, p) => s + p.duration, 0);
  if (phases.length < 2 || total <= 0) return null;

  // A descent-rate sub-label where the phase has one. `flightPhases` emits `drogue` +
  // `main` where it resolved a deployment and a single `descent` where it did not — and in
  // that second case the rate is `wholeDescentRate`, because `mainDescentRate` is null by
  // construction (a whole-descent average must never be published under the label a flyer
  // sizes a parachute against). Reading `mainDescentRate` for the `descent` key therefore
  // left the one chip that prints a duration and a rate side by side showing the duration
  // alone — on most descents, since the corpus resolves a main on only 7 of 25.
  const rateFor = (p: Phase): string | null => {
    const r =
      p.key === 'drogue'
        ? metrics.drogueDescentRate
        : p.key === 'main'
          ? metrics.mainDescentRate
          : p.key === 'descent'
            ? metrics.wholeDescentRate
            : null;
    return r != null && Number.isFinite(r) ? fmtSpeed(r, sys) : null;
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Flight timeline</h3>
        {/* The span is only "to landing" when the record reached the ground. It is the
            caption on the one widget claiming to summarise the whole flight, and it read
            "2.6 s liftoff to landing" on a 3,548 ft log whose last sample is still climbing
            at 1,057 ft/s — nonsense on its face, and the same claim on 15 of the 42 corpus
            flights that render a timeline at all, several of them ending in coast. */}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {fmtTime(total)} {landedInRecord(metrics) ? 'liftoff to landing' : 'liftoff to the end of the record'}
        </span>
      </div>

      {/* Proportional bar — decorative; the chips below carry the same facts as text. */}
      <div
        aria-hidden="true"
        className="mt-3 flex h-3 w-full overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-800"
      >
        {phases.map((p) => (
          <div
            key={p.key}
            title={`${p.label}: ${fmtTime(p.duration)}`}
            style={{ width: `${(p.duration / total) * 100}%`, backgroundColor: PHASE_COLOR[p.key] }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {phases.map((p) => {
          const rate = rateFor(p);
          return (
            <li key={p.key} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: PHASE_COLOR[p.key] }}
                aria-hidden="true"
              />
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{p.label}</span>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {fmtTime(p.duration)}
                {rate && ` · ${rate}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
