'use client';

import type { EventType } from '@/lib/analyze/types';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { ChipButton } from './ui';

/** Flight order, so the chips read the way the flight went rather than alphabetically. */
export const EVENT_ORDER: EventType[] = ['liftoff', 'burnout', 'apogee', 'drogue', 'main', 'landing'];

/** The event types present in a set of events, in flight order — never a control for something
 *  the record doesn't contain. */
export function eventTypesPresent(types: Iterable<EventType>): EventType[] {
  const seen = new Set(types);
  return EVENT_ORDER.filter((t) => seen.has(t));
}

/**
 * Which events are called out on a plot, as chips.
 *
 * Two surfaces ask this question — the single-flight explorer and the comparison overlay — and
 * they ask it of the same stored answer (`debrief.hiddenEvents`), so a flyer who turns landing
 * off on one page does not find it back on the other. They shared the storage before they shared
 * the control, which is the half that drifts: the chips carry an accessible name that says what
 * pressing them DOES, and a second copy of thirty lines of that is a second copy to get wrong.
 *
 * Stored as the set that is HIDDEN, so the default shows everything and a logger that starts
 * reporting a new event type shows it without anyone opting in.
 */
export default function EventChips({
  types,
  hidden,
  onToggle,
  label = 'Events',
  className = '',
}: {
  types: EventType[];
  hidden: string[];
  onToggle: (type: EventType) => void;
  /** The row's own label. The comparison says "Flight events" because "Events" beside a table of
   *  several flights reads as a column heading. */
  label?: string;
  className?: string;
}) {
  if (types.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      {types.map((t) => {
        const on = !hidden.includes(t);
        const name = t[0].toUpperCase() + t.slice(1);
        return (
          <ChipButton
            key={t}
            pressed={on}
            // Elsewhere on these pages a button reading "Burnout" scrolls a table to that sample.
            // The visible chip stays one word because the row label and the colour dot say which
            // control this is; the accessible name carries the action, so a screen reader isn't
            // offered two identical "Burnout" buttons that do different things.
            aria-label={on ? `Stop marking ${name.toLowerCase()} on the plot` : `Mark ${name.toLowerCase()} on the plot`}
            onClick={() => onToggle(t)}
            title={on ? `Stop calling out ${name.toLowerCase()} on the plot` : `Call out ${name.toLowerCase()} on the plot`}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: on ? EVENT_COLOR[t] : 'transparent', boxShadow: on ? undefined : 'inset 0 0 0 1px currentColor' }}
            />
            {name}
          </ChipButton>
        );
      })}
      <span className="text-xs text-zinc-500 dark:text-zinc-400">kept on this device</span>
    </div>
  );
}
