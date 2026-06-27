// The flight broken into its phases — boost, coast, and the descent legs — from
// the events the analysis already detected. Pure structure off measured times;
// no estimation, just "here's the shape of the flight you flew".

import type { FlightEvent } from './analyze/types';

export interface Phase {
  key: 'boost' | 'coast' | 'drogue' | 'main' | 'descent';
  label: string;
  /** Phase bounds on the series clock (seconds). */
  start: number;
  end: number;
  duration: number;
}

/** Ordered, contiguous phases between the detected events. A phase is emitted
 *  only when both its bounds are known and positive-length, so a flight missing
 *  (say) a burnout or a separate main simply yields fewer segments. */
export function flightPhases(events: FlightEvent[]): Phase[] {
  const at = (type: FlightEvent['type']): number | null => {
    const e = events.find((ev) => ev.type === type);
    return e ? e.time : null;
  };
  const liftoff = at('liftoff');
  const burnout = at('burnout');
  const apogee = at('apogee');
  const main = at('main');
  const landing = at('landing');

  const out: Phase[] = [];
  const add = (key: Phase['key'], label: string, start: number | null, end: number | null) => {
    if (start != null && end != null && end > start) out.push({ key, label, start, end, duration: end - start });
  };

  add('boost', 'Boost', liftoff, burnout);
  // Coast runs from burnout (or liftoff, if no burnout was detected) to apogee.
  add('coast', 'Coast', burnout ?? liftoff, apogee);
  if (main != null) {
    add('drogue', 'Drogue descent', apogee, main);
    add('main', 'Main descent', main, landing);
  } else {
    add('descent', 'Descent', apogee, landing);
  }
  return out;
}
