// Putting a logger's high-rate stream onto the flight its low-rate half recorded.
//
// A Blue Raven comes home with TWO files for one flight: a low-rate log at 50 Hz carrying
// altitude, velocity and the flight profile, and a high-rate stream at 500 Hz carrying gyro,
// accelerometer and the board's own attitude solution. The high-rate half has no altitude, so it
// is not a flight and `lib/parsers/blueraven.ts` refuses it as one — correctly, and that refusal
// is untouched. But the consequence was that the richest recording a flyer owns reached no surface
// at all: drop both halves, which is exactly what the vendor's downloader hands you, and Debrief
// read one and told you to drop the other.
//
// ## This is NOT stitching, and reaching for `lib/stitch.ts` would import an estimate
//
// `lib/stitch.ts` aligns per-stage logs from DIFFERENT boards, each with its own clock, and every
// alignment it returns carries `verified: false` because nothing in the records establishes the
// offset. None of that applies here. One board writes both files off ONE flight clock, so the
// alignment is not estimated — it is the same `Flight_Time_(s)` column in both.
//
// Measured over all four corpus pairs, first sample against first sample:
//
//   trf-lemiv-l3     HR −2.040 s   LR −1.960 s     0.080 s apart
//   f1machbuster-10  HR −2.028 s   LR −1.920 s     0.108 s apart
//   f1machbuster-18  HR −2.022 s   LR −1.960 s     0.062 s apart
//   reddit-meraki2   HR −2.038 s   LR −1.940 s     0.098 s apart
//
// Every pair opens on a common −2 s pre-launch buffer and the residue is the sample phase of a
// 500 Hz stream against a 50 Hz one. There is no offset to solve for, so none is solved for.
//
// **One shift IS applied, and it is read out of the file rather than solved for.** `buildFlight`
// re-bases every parsed flight so its own first sample is t=0, so the flight's clock is its file's
// `Flight_Time` minus that file's earliest value. The stream is shifted by the SAME quantity —
// `flightTimeOrigin` of the low-rate half — which puts the two back on the one column they shared
// to begin with. Using the stream's own first sample instead would be wrong by the 0.062–0.108 s
// above: small, and an invented approximation standing where an exact number was available.
//
// ## Why the obvious implementation is a Sev-1, and what is done instead
//
// The high-rate stream has ten samples for every low-rate one, and the flight model gives all of a
// flight's channels one time base (`lib/flight/types.ts`), so the stream has to be reduced onto the
// flight's clock to be plotted beside it at all. **Linear resampling — the obvious reduction, and
// the one `lib/parsers/multiTimebase.ts` already offers — destroys the peaks.** Measured over the
// four pairs, peak magnitude retained after resampling 500 Hz onto the 50 Hz grid:
//
//   f1machbuster-18  Accel_Z   264.35 g → 81.95 g    69.0% of the peak GONE
//   trf-lemiv-l3     Accel_Z    22.35 g →  8.58 g    61.6% gone
//   reddit-meraki2   Accel_Z    58.85 g → 29.31 g    50.2% gone
//   f1machbuster-10  Gyro_X   1912.3 °/s → 1107.3    42.1% gone
//
// A flyer reading 82 g where the board recorded 264 g is the "wrong number on a surface a flyer
// would act on" that `MAINTAINING.md` ranks first, and D8's own decomposition forbids exactly this
// ("no decimation that could move a reported peak").
//
// So for a RATE — gyro, accelerometer — the reduction keeps, at each of the flight's own sample
// instants, **the largest-magnitude sample the board actually recorded in that window**. Nothing is
// averaged, interpolated or invented, and every plotted point is a real sample from the file. The
// peak is preserved by construction: every high-rate sample falls in exactly one window, and each
// window keeps its own largest, so the largest overall survives whichever window it landed in.
// `lib/highRate.test.ts` pins that against the raw columns over every corpus pair, and it is
// falsifiable — swapping the extremum for a midpoint sample turns it red on all four.
//
// What this costs, stated rather than hidden: between the peaks the trace is an ENVELOPE of the
// stream, not the stream. It never understates what the board recorded and never shows a value the
// board did not record, which is the honest direction for a reduction whose alternative is
// discarding the file.
//
// ## An ATTITUDE is reduced the other way, and getting that wrong invented a rotation
//
// The same reduction applied to the quaternion is not conservative — it is meaningless. |q| is 1 by
// construction, so there is no peak to preserve, and the four components only say anything TOGETHER.
// Reduced independently they came from four different instants: the merged norm averaged **1.0132**
// on `jan10` and **1.0089** on `lemiv` against an exact 1, which is not a rotation and not an
// attitude the board ever solved — while the note beside it called it "the board's own attitude
// solution". The attitude channels take ONE whole sample per window instead, chosen once and shared
// by all four, so what is plotted is a rotation the board actually computed.

import type { HighRateStream } from './parsers/blueraven';
import type { Channel, RawFlight } from './flight/types';
import { LAUNCH_TOLERANCE_S, launchStampFromName } from './proposeGroups';

/** The vendor's own high-rate / low-rate marker in a file name, as a delimiter-bounded token.
 *
 *  Bounded rather than a substring because the marker letters sit inside the names these files
 *  actually have: `BlRv_SN1537_LR_…` contains "lR" inside "BlRv" and `BLRVN87-bckup LR_…` contains
 *  "LRV", so a plain `includes('lr')` pairs a file with itself. Anchored on a non-alphanumeric
 *  boundary it reads only the token the downloader wrote. */
const HR_MARKER = /(^|[^A-Za-z0-9])(hr|high(?:rate)?)(?=[^A-Za-z0-9]|$)/i;
const LR_MARKER = /(^|[^A-Za-z0-9])(lr|low(?:rate)?)(?=[^A-Za-z0-9]|$)/i;

/** A file name with its high/low marker taken out, folded to letters and digits.
 *
 *  Two halves of one download differ in exactly that token — `BlRv_SN1537_HR_04-12-2025_12_45_49`
 *  against `…_LR_…`, `BlueRaven-HighRate` against `BlueRaven-LR` — so removing it makes the two
 *  names equal. Everything else about them, including the launch second D6 reads for grouping, is
 *  left in place, so two DIFFERENT flights downloaded on one day do not collapse together. */
function pairingKey(name: string, marker: RegExp): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(marker, '$1')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Do these two file names look like the two halves of one Blue Raven download?
 *
 *  A file NAME is not a measurement — the same caution `lib/proposeGroups.ts` records about D6's
 *  launch stamp applies here, and for the same reason: this survives a copy but not a rename. It is
 *  used only to decide which of several flights in one drop a stream belongs to, and the flight it
 *  picks must already be a Blue Raven. */
export function halvesOfOneDownload(highRateName: string, lowRateName: string): boolean {
  if (!HR_MARKER.test(highRateName)) return false;
  const hr = pairingKey(highRateName, HR_MARKER);
  // The low-rate half usually says so, but need not: a flyer who renamed one half still gets the
  // pairing when the remainder matches, and the caller's own single-candidate rule covers the rest.
  const lr = LR_MARKER.test(lowRateName) ? pairingKey(lowRateName, LR_MARKER) : pairingKey(lowRateName, /$^/);
  return hr.length >= 4 && hr === lr;
}

/** Do these two names positively CONTRADICT each other about which flight they are?
 *
 *  Different from `halvesOfOneDownload` returning false, and the difference is what makes the
 *  caller's "one flight and one stream in this drop are each other's" fallback safe. Two names can
 *  fail to match because a flyer renamed one — the case the fallback exists for — or because they
 *  are demonstrably two different launches, and only the second must refuse.
 *
 *  The evidence is D6's launch stamp: Featherweight's downloader writes the launch second into the
 *  file name, so two stamps that disagree are the vendor's own software saying these came off the
 *  board as separate flights. `lib/proposeGroups.ts` measured the tolerance — 120 s, against a
 *  widest true spread of 5 s and a nearest true refusal at 956 s — and it is reused rather than
 *  re-derived. Where either name carries no stamp there is no contradiction to find, so this is
 *  false and the fallback may proceed. */
export function namesContradict(a: string, b: string): boolean {
  const stampA = launchStampFromName(a);
  const stampB = launchStampFromName(b);
  if (!stampA || !stampB) return false;
  return Math.abs(Date.parse(stampA + 'Z') - Date.parse(stampB + 'Z')) / 1000 > LAUNCH_TOLERANCE_S;
}

/**
 * Reduce one high-rate channel onto the flight's own sample instants, keeping the extremes.
 *
 * Each output sample is the largest-magnitude input sample in the window centred on that instant —
 * the window running to the midpoint of each neighbouring pair, so every input falls in exactly one
 * output and no sample is counted twice or missed.
 *
 * Input samples more than half a flight-sample outside the flight's own span are DROPPED rather
 * than folded into the end windows. They are real, but the flight record does not cover the moment
 * they happened, and pushing them into the last window would draw a spike at a time it did not
 * occur — `f1machbuster-10`'s stream runs 20 s past the end of its low-rate log and is the case
 * that makes this matter. The end windows do reach the same half-step past the first and last
 * instants that every interior window reaches past its own, because that is the instant those
 * samples belong to; what they do not do is absorb the other 19.99 s. NaN marks every instant the
 * stream did not reach, which is what the chart already renders as a gap.
 */
function windowsOf(streamTime: Float64Array, flightTime: Float64Array): [lo: number, hi: number][] {
  const n = flightTime.length;
  // Two instants are the minimum that define a window at all; one sample gives no spacing to take
  // a half-step from and produced a NaN window, which silently emptied every channel while the
  // drop still reported the file as read.
  if (n < 2 || streamTime.length === 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const lo = i === 0 ? flightTime[0] - (flightTime[1] - flightTime[0]) / 2 : (flightTime[i - 1] + flightTime[i]) / 2;
    const hi = i === n - 1 ? flightTime[n - 1] + (flightTime[n - 1] - flightTime[n - 2]) / 2 : (flightTime[i] + flightTime[i + 1]) / 2;
    return [lo, hi] as [number, number];
  });
}

/** Reduce a RATE — a gyro or accelerometer trace, where the peak is the thing worth keeping. */
function extremumOnto(streamTime: Float64Array, values: Float64Array, windows: [number, number][]): Float64Array {
  const out = new Float64Array(windows.length).fill(NaN);
  let cursor = 0;
  for (let i = 0; i < windows.length; i++) {
    const [lo, hi] = windows[i];
    while (cursor < streamTime.length && streamTime[cursor] < lo) cursor++;
    let best = NaN;
    let bestMag = -1;
    for (let j = cursor; j < streamTime.length && streamTime[j] < hi; j++) {
      const v = values[j];
      if (!Number.isFinite(v)) continue;
      const mag = Math.abs(v);
      if (mag > bestMag) {
        bestMag = mag;
        best = v;
      }
    }
    out[i] = best;
  }
  return out;
}

/**
 * Which single stream sample represents each window — the one nearest its instant, or −1.
 *
 * **Computed once and shared by every coherent channel, which is the entire point.** A quaternion's
 * four components are one rotation; reducing them independently assembles a 4-tuple out of four
 * different instants, and the result is not a rotation at all. Measured before this existed: the
 * merged norm averaged 1.0132 on `jan10` and 1.0089 on `lemiv` where a unit quaternion is exactly
 * 1, and `readHighRateOnto` was presenting that as "the board's own attitude solution".
 *
 * There is also nothing for an extremum to preserve here — |q| is 1 by construction, so the
 * largest component is a fact about which way the rocket happened to be pointing, not a peak.
 */
function representativeSamples(streamTime: Float64Array, windows: [number, number][], flightTime: Float64Array): Int32Array {
  const pick = new Int32Array(windows.length).fill(-1);
  let cursor = 0;
  for (let i = 0; i < windows.length; i++) {
    const [lo, hi] = windows[i];
    while (cursor < streamTime.length && streamTime[cursor] < lo) cursor++;
    let bestGap = Infinity;
    for (let j = cursor; j < streamTime.length && streamTime[j] < hi; j++) {
      const gap = Math.abs(streamTime[j] - flightTime[i]);
      if (gap < bestGap) {
        bestGap = gap;
        pick[i] = j;
      }
    }
  }
  return pick;
}

function sampleOnto(values: Float64Array, pick: Int32Array): Float64Array {
  const out = new Float64Array(pick.length).fill(NaN);
  for (let i = 0; i < pick.length; i++) if (pick[i] >= 0) out[i] = values[pick[i]];
  return out;
}

/**
 * Read a high-rate stream onto a flight, returning the flight with its channels added.
 *
 * The flight is returned rather than mutated in place… except that `lib/ingest.ts` assigns the
 * result straight back, exactly as `pairSummaries` does beside it. Nothing here touches the
 * flight's own channels, its time base or its analysis: these are additional traces to look at,
 * and no reading is computed off them. That is deliberate for this slice — a number read off an
 * envelope would need its own validation, and D8 keeps that for the slice that does it properly.
 */
export function readHighRateOnto(flight: RawFlight, stream: HighRateStream, lowRateOriginS: number): RawFlight {
  // Both halves state the same `Flight_Time`; the flight was re-based off its own earliest sample
  // when it was parsed, so the stream takes that same subtraction and lands where it always was.
  const onFlightClock = stream.time.map((t) => t - lowRateOriginS) as Float64Array;
  const windows = windowsOf(onFlightClock, flight.time);
  if (windows.length === 0) return flight;
  const pick = representativeSamples(onFlightClock, windows, flight.time);
  const added: Channel[] = stream.channels.map((c, i) => ({
    ...c,
    values: stream.coherent[i] ? sampleOnto(c.values, pick) : extremumOnto(onFlightClock, c.values, windows),
  }));
  const covered = added.some((c) => c.values.some(Number.isFinite));
  if (!covered) return flight;

  const notes = [
    `Read the ${stream.rateHz} Hz high-rate stream from this flight's other file onto the ` +
      `${Math.round((flight.time.length - 1) / (flight.time[flight.time.length - 1] - flight.time[0]))} Hz ` +
      `flight clock — both halves are one board's record of one flight and share its ` +
      `Flight_Time column, so nothing was aligned or estimated. On the gyro and accelerometer ` +
      `traces each plotted point is the largest sample the board recorded in that instant's ` +
      `window, so the peaks are the board's own and between them the trace is an envelope rather ` +
      `than the stream itself. The attitude components are one whole sample per instant instead, ` +
      `because four components picked separately would not be a rotation the board ever solved.`,
  ];
  // Which way is up the rocket, and how that was reached — a flyer looking at six traces called
  // X, Y and Z otherwise has no way to tell which one is the roll rate. Stated with the evidence
  // rather than asserted, and absent entirely on a record that could not establish it.
  const long = stream.longAxis;
  if (long) {
    notes.push(
      `The airframe's long axis is this board's ${long.letter} — measured, not assumed: over the ` +
        `${long.restSeconds.toFixed(1)} s this record sat still before it moved, the accelerometer ` +
        `felt ${long.restG.toFixed(2)} g of gravity lying ${long.offDeg.toFixed(1)}° off that axis, ` +
        `which is a rocket standing on a rail. So ${long.letter} is the one along the rocket: its ` +
        `gyro reads the roll rate and its accelerometer the axial load, and the other two read ` +
        `across the airframe. Naming them is all this does — no reading is computed off these ` +
        `traces, which are an envelope rather than the board's full stream.`,
    );
  }
  if (stream.saturated.length > 0) {
    notes.push(
      `The sensor behind ${stream.saturated.join(', ')} RAILED during this flight — it wrote its ` +
        `maximum repeatedly, so the true rate went at least that high and the recording cannot say ` +
        `how much higher. Read those peaks as a floor, not as a measurement.`,
    );
  }
  return {
    ...flight,
    channels: [...flight.channels, ...added],
    notes: [...flight.notes, ...notes.filter((n) => !flight.notes.includes(n))],
  };
}
