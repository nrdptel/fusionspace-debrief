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

/**
 * Who recorded this, in one line — the board's own identity as the FILE stated it.
 *
 * **Written for the two exports that had nowhere to put it and a schema field waiting.**
 * `COMPETITION.md` row 44: GPX 1.1 reserves `<src>`, annotated verbatim *"Source of data. Included
 * to give user some idea of reliability and accuracy of data"* and legal on `trk`, `wpt` and
 * `trkpt`; KML 2.2 reserves `<ExtendedData>`, which Google Earth shows in the balloon by default.
 * Debrief used neither, so a track handed to somebody else said nothing about which instrument
 * drew it — while AltosUI puts serial and flight number in its KML document name and repeats them
 * on every row of its CSV. Row 43 measured that: device identity is the one metadata field this
 * field does not omit.
 *
 * Only the keys that IDENTIFY the recording, and in a fixed order — the whole `meta` map is a
 * parser's free-form bag and includes ground level, sample rate and whatever else a file carried,
 * which is a panel's job rather than a track file's. Returns null when the file named nothing, so
 * a caller writes no element at all rather than an empty one.
 */
export function recordedBy(flight: RawFlight): string | null {
  const meta = flight.meta;
  const at = (want: string): string | null => {
    for (const [k, v] of Object.entries(meta)) {
      if (k.toLowerCase().replace(/[^a-z]/g, '') === want) {
        const s = String(v).trim();
        if (s) return s;
      }
    }
    return null;
  };
  const parts = [
    at('device') ?? at('product'),
    at('serial') != null ? `serial ${at('serial')}` : null,
    at('flight') != null ? `flight ${at('flight')}` : null,
    at('callsign') != null ? `callsign ${at('callsign')}` : null,
  ].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : null;
}
