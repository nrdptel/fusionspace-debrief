// The token half of caveat units. **This module imports nothing, deliberately.**
//
// `lib/analyze` is unit-agnostic by contract (`CONTRIBUTING.md`: the analyzer never sees a file
// format or the UI), so it may not reach for `lib/display` to format a length — the analysis must
// not change when a toggle in the header does. But its prose caveats need to name lengths, and
// until 2026-08-02 they did it by baking metres into the sentence.
//
// **That was a wrong number on a surface a flyer acts on.** A cold walk of a report set to feet
// found an apogee of 9,322 ft followed by three sentences telling the flyer their altitudes read
// "about 93 m too high" and to check "before taking 93 m off it". Subtracting 93 from 9,322 leaves
// them roughly 200 ft out, and nothing on the page says the two figures are in different units —
// the caveat that exists to prevent a wrong altitude was the one asking for the wrong arithmetic.
//
// So the analysis emits a token carrying the SI value and `lib/caveatUnits.ts` — which may import
// the unit system, because it runs at render — substitutes it. Keeping the emitters here is what
// lets the analyzer stay free of the UI.
//
// The token is deliberately LOUD. A consumer that forgets to render shows `{{len:93}}` on screen,
// which is obviously broken; the failure it replaces printed a plausible number in the wrong unit
// and looked completely fine.

/** A length in canonical metres, for a caveat sentence. */
export function lenTok(metres: number): string {
  return `{{len:${Math.round(metres)}}}`;
}

/** A speed in canonical metres per second, for a caveat sentence. */
export function spdTok(metresPerSecond: number): string {
  return `{{spd:${Math.round(metresPerSecond)}}}`;
}

/** Matches either token. Global, so `replace` reaches every one in a sentence — the ground-baseline
 *  caveat carries the same length three times. */
export const CAVEAT_TOKEN = /\{\{(len|spd):(-?\d+(?:\.\d+)?)\}\}/g;

/** Whether a string still carries an unrendered token. Used by the guard test. */
export function hasCaveatToken(s: string): boolean {
  return /\{\{(len|spd):/.test(s);
}
