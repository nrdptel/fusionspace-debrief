// One stretch of a flight, as a flight.
//
// A record can hold several flights, and a flyer can say which stretch of one is theirs. Both
// come to the same operation: take a window of the samples and keep the model consistent
// across every channel. Everything ELSE about the flight — its source, its format, the notes
// the parser left, the summary figures a paired device file supplied, when it flew — belongs
// to the file and comes across unchanged.
//
// It lives here rather than in the analyzer because the analyzer is not the only caller: a
// report showing a crop has to be OF that crop, or every surface that joins the file's
// recorded channels to the analysis's own series is off by the crop's offset.

import type { RawFlight } from './types';

/** The flight from `start` to `end` (exclusive): the time base and every channel, sliced
 *  together so the model stays consistent. Time is NOT re-zeroed — a segment keeps the
 *  file's clock, which is how a flyer finds it again in their own export. */
export function sliceFlight(flight: RawFlight, start: number, end: number): RawFlight {
  return {
    ...flight,
    time: flight.time.slice(start, end),
    channels: flight.channels.map((c) => ({ ...c, values: c.values.slice(start, end) })),
  };
}
