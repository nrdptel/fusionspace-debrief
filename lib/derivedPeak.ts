// What a peak speed DIFFERENTIATED OUT OF AN ALTITUDE costs, as a measured range rather than a
// word — and in one place, rather than retyped into every surface that says it.
//
// The safety invariant asks for an accuracy claim to be "a range with their basis, not a
// flattering single number", and for a caveat to name its error's DIRECTION and size wherever the
// corpus can measure them. The corpus can, through its own strongest ground truth: it is grouped
// by flight, so where one recording MEASURED the speed and another derived it, the second bounds
// the first.
//
// **Why this file exists rather than the sentence being written out six times.** It was. Six
// sites carried the figures as prose — `lib/compare.ts`, `lib/report.ts` twice,
// `lib/analyze/index.ts` twice and `components/CompareView.tsx` — and they had drifted from the
// corpus and from each other:
//
//   - several still published **+30%**, which no pair in this corpus produces any more. **It was
//     honest when it was written and went stale, which is the more useful failure to understand.**
//     It was the endurance flight's PerfectFlite StratoLogger against its AltusMetrum TeleMetrum —
//     Mach 1.19 against a measured 0.93. Debrief now WITHHOLDS that StratoLogger peak: it sits
//     0.050 s after liftoff at 30.5 m AGL, off a log that opens below the pad, and the ascent-noise
//     guard refuses it. So the pair did not disagree, it stopped existing —
//     `lib/parsers/corpus.test.ts` says exactly this above its own pair list, and the figure went
//     on being printed anyway because nothing connected the two. **That is the whole argument for
//     this file:** the enumeration shrinks as the guards get better, which is not a regression, and
//     a published figure has to shrink with it rather than be remembered;
//   - three said "the corpus flight**s** that carry both", which reads as several independent
//     flights. The real set is two flights and four pairs, and one of those pairs is a single
//     device exported two ways — see `isolatesMethod` below, which is the distinction that makes
//     the number mean something rather than merely be true.
//
// `lib/parsers/corpus.test.ts` recomputes these from the real files and fails if they move, so the
// published figures cannot drift from the corpus again — and cannot be quoted without the basis,
// because the basis is a field here rather than a habit.

/** One derived recording measured against a recording of the SAME flight that measured its speed. */
export interface DerivedPeakPair {
  /** The corpus flight group both recordings belong to. */
  group: string;
  /** How the derived peak was obtained, in the flyer's terms. */
  from: string;
  /** True where BOTH reads come off the same device on the same flight — one export carrying the
   *  velocity channel, the other not — so no INSTRUMENT differs. Not quite the method alone: see
   *  the note on the table below about the accelerometer the derived side also drops. The other pairs are two instruments, where method and instrument are mixed
   *  and the figure is an upper bound on what differentiating costs rather than a measurement of
   *  it. Quoting the wide pairs as though they isolated the method is the error this flag exists
   *  to prevent. */
  isolatesMethod: boolean;
  /** Signed % by which the derived peak exceeded the measured one, ON THE SPEEDS. */
  speedPct: number;
  /** The same comparison ON THE MACH NUMBERS, which is a different ratio and must never be quoted
   *  under the other's name — the same GPS pair is +5% on the speeds and +8% on the Mach. */
  machPct: number;
}

/**
 * Measured over the corpus, and recomputed from the real logs by `lib/parsers/corpus.test.ts` on
 * every run.
 *
 * **The set is a SUPERSET on purpose, and that is not tidiness — it is the only shape that can be
 * honest here.** A container's checked-out fixtures and the release asset `corpus.lock.json` pins
 * are not guaranteed to be the same corpus, and on 2026-08-01 they were not: a local checkout found
 * four pairs and CI, running the pinned release, found six. A figure that has to be printed in a
 * browser cannot be computed from a corpus, so it is baked here — and the test therefore holds
 * these to CONTAIN what the corpus in front of it finds, rather than to equal it. A pair the corpus
 * shows and this list omits is a failure; a pair listed here that a smaller corpus cannot reproduce
 * is not.
 *
 * | pair | what it isolates | speeds |
 * |---|---|---|
 * | a TeleMetrum's CSV export against its own `.eeprom` | no instrument differs — one device, one flight, two exports; the binary carries no velocity column so the analysis differentiates the altitude instead | +4% |
 * | a Blue Raven's measured speed against a Featherweight GPS on the same flight | + a coarse 2.1 Hz altitude | +5% |
 * | the same Blue Raven against an Eggtimer Quantum baro | + a second barometer | +23% |
 * | an EasyMega against a second recording of the stargazer flight | + a second barometer | +66% |
 * | the same Blue Raven against an Eggtimer Proton baro | + a barometer through the transonic push | +110% |
 * | a TeleMetrum against the sg1.1 PerfectFlite StratoLogger | + a second barometer, reading the other way | **−14%** |
 *
 * **THE LAST ROW IS THE IMPORTANT ONE.** An earlier version of this file asserted that every
 * derived peak reads high, and built a `DERIVED_PEAK_ALWAYS_HIGH` constant on it, because the four
 * pairs a local checkout could see all did. CI, on the pinned corpus, found one that reads
 * **13.7% low**. So a derived peak is **not a bound in either direction** — usually high, sometimes
 * by a lot, and occasionally low. The app said exactly that before ("the error runs both ways") and
 * a well-meant correction to "reads high" would have been a regression on the one claim a flyer
 * acts on. It is recorded at this length because the wrong version was already written once.
 *
 * **+4% is the closest thing here to the cost of the method alone**, and it is still a floor rather
 * than that cost exactly: the CSV's speed is AltOS's own barometer-plus-accelerometer solution,
 * while the `.eeprom` read differentiates the altitude and ignores the axial accelerometer it also
 * carries. So it measures "differentiate AND drop the accelerometer".
 */
export const DERIVED_PEAK_PAIRS: readonly DerivedPeakPair[] = [
  { group: 'iss-sg1.1-20231001', from: 'the same device’s own binary download', isolatesMethod: true, speedPct: 4, machPct: 4 },
  { group: 'trf-lemiv-l3-20250412', from: 'a GPS altitude at 2.1 Hz', isolatesMethod: false, speedPct: 5, machPct: 8 },
  { group: 'trf-lemiv-l3-20250412', from: 'a barometric altitude', isolatesMethod: false, speedPct: 23, machPct: 27 },
  { group: 'iss-stargazer1-20230507', from: 'a barometric altitude', isolatesMethod: false, speedPct: 66, machPct: 66 },
  { group: 'trf-lemiv-l3-20250412', from: 'a barometric altitude', isolatesMethod: false, speedPct: 110, machPct: 116 },
  { group: 'iss-sg1.1-20231001', from: 'a second barometer, reading the other way', isolatesMethod: false, speedPct: -14, machPct: -17 },
] as const;

/** How many distinct FLIGHTS the pairs rest on. */
export const DERIVED_PEAK_FLIGHTS = 3;

/** Whether every pair runs the same way. **It does not** — see the table above. Kept as a named
 *  constant rather than deleted, because the honest answer to "is a derived peak an upper bound?"
 *  is the single most load-bearing fact on this page, and a reader should find it stated rather
 *  than have to infer it from a list of signs. */
export const DERIVED_PEAK_ALWAYS_HIGH = false;

/** The range on one basis, as a phrase — `"5% to 110%"`. Never mix the two bases in one sentence
 *  without naming both, which is the mistake this module was extracted to stop. */
export function derivedPeakRange(basis: 'speed' | 'mach'): string {
  const pcts = DERIVED_PEAK_PAIRS.map((p) => (basis === 'speed' ? p.speedPct : p.machPct));
  const lo = Math.min(...pcts);
  const hi = Math.max(...pcts);
  // Signed, because the low end is negative and "14% to 110%" would read as a magnitude and hide
  // the direction — which is the whole thing this range exists to state.
  return `${lo > 0 ? '+' : ''}${lo}% to ${hi > 0 ? '+' : ''}${hi}%`;
}

/** The figures on one basis, listed — `"5%, 23% and 110%"`. */
export function derivedPeakList(basis: 'speed' | 'mach'): string {
  const pcts = DERIVED_PEAK_PAIRS.map((p) => (basis === 'speed' ? p.speedPct : p.machPct)).sort((a, b) => a - b);
  return pcts.map((p) => `${p > 0 ? '+' : ''}${p}%`).reduce((acc, s, i, arr) => (i === 0 ? s : `${acc}${i === arr.length - 1 ? ' and ' : ', '}${s}`), '');
}

/** The clause a surface prints beside a mixed-source cross-check: the direction, the range, and
 *  the basis it rests on — all three, because any two of them without the third is a claim Debrief
 *  cannot stand behind. */
export function derivedPeakCaveat(): string {
  const n = DERIVED_PEAK_PAIRS.length;
  return (
    `The recordings mix a value the device measured with one differentiated out of an altitude, ` +
    `which usually reads HIGH at the peak and is not a bound in either direction — ` +
    `${derivedPeakRange('speed')} across the ${n} corpus pairs on ${DERIVED_PEAK_FLIGHTS} flights ` +
    `that carry both — so that spread is partly method rather than a measure of how far the two ` +
    `recordings really disagree.`
  );
}
