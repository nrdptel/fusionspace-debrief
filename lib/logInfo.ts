// Factual metadata about a loaded log — "what am I actually looking at": the
// logger and its reported identity, how fast and how long it sampled, whether
// the clock is steady, and which channels it recorded. Everything here is read
// straight from the parsed flight; nothing is inferred or analyzed.

import type { RawFlight } from './flight/types';
import { medianDt } from './analyze/signal';

export interface LogChannelInfo {
  label: string;
  unit: string;
}

export interface LogInfo {
  /** Median samples per second, or null when the clock can't be read. */
  sampleHz: number | null;
  sampleCount: number;
  /** Span from the first to the last sample, seconds. */
  durationSec: number;
  /** Whether the sample interval is roughly constant across the log. */
  uniform: boolean;
  channels: LogChannelInfo[];
  /** Selected key/value metadata the parser pulled from the file. */
  meta: { key: string; value: string }[];
}

/** Turn a parser's metadata key (often a lowercase token) into a tidy label. */
function prettyKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function describeLog(flight: RawFlight): LogInfo {
  const time = flight.time;
  const n = time.length;
  const dt = medianDt(time);
  const sampleHz = dt > 0 ? 1 / dt : null;
  const durationSec = n >= 2 ? time[n - 1] - time[0] : 0;

  // "Uniform" = the gaps barely vary. Compare the spread of intervals to the
  // median; a steady logger sits well under a few percent.
  let uniform = true;
  if (n >= 3 && dt > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 1; i < n; i++) {
      const d = time[i] - time[i - 1];
      if (d <= 0) continue;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    uniform = Number.isFinite(min) && Number.isFinite(max) && max - min < dt * 0.25;
  }

  const channels = flight.channels.map((c) => ({ label: c.label, unit: c.unit }));
  const meta = Object.entries(flight.meta).map(([key, value]) => ({
    key: prettyKey(key),
    value: String(value),
  }));

  return { sampleHz, sampleCount: n, durationSec, uniform, channels, meta };
}
