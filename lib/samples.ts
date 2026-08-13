/**
 * The sample flights the app can open without the flyer supplying a file.
 *
 * **Why there is a registry at all.** Until 2026-08-08 there was one sample, behind one
 * hardcoded URL (`components/Analyzer.tsx`'s `SAMPLE_URL`) — a single baro+GPS log from one
 * logger family, and the entire demonstration surface for ten parsers, the column mapper,
 * multi-recording reconciliation, per-stage stitching, the design overlay and the report
 * builder. That is owner note `ON-2`: "there needs to be more sample flights for showing the
 * different capabilities of the project."
 *
 * **These are REAL recordings, not synthesized ones, and that matters more than convenience.**
 * `ON-2` was filed with the answer that the fixtures cannot ship, and that answer was about the
 * PRIVATE `debrief-fixtures` corpus — which is right about that corpus: no blanket license, and
 * real names, launch-site GPS and device serials in the files. It is not true of
 * `lib/parsers/__fixtures__/`, which is a different set: publicly-shared logs already committed
 * to this public repo and documented with their provenance in that directory's README. Serving
 * one from `public/samples/` publishes nothing that is not already published, so a sample can be
 * a real flight — and the MEASUREMENT invariant never has to be traded for a demonstration.
 *
 * A synthesized log would need a `synthetic` label on every surface that can carry it out of the
 * app, because a made-up flight presented as a reading breaks the promise the whole tool rests
 * on. None of that applies here, which is why this route was taken.
 *
 * **`source` is not decoration.** Every sample says where the recording came from, on the surface
 * that offers it, because a flyer looking at numbers is entitled to know whose flight they are.
 */
export type Sample = {
  id: string;
  /** What the flyer clicks. Names the capability, not the file. */
  label: string;
  /** One line under the label: what this flight shows that the others do not. */
  shows: string;
  /** Where the recording came from — see `lib/parsers/__fixtures__/README.md`. For a `mapping`
   *  sample this is what MADE it, not who flew it, because nobody flew it. */
  source: string;
  /** Files under `public/samples/`, in the order a flyer would drop them. */
  files: string[];
  /**
   * What opening this sample lands the flyer in.
   *
   * `'flight'` — the default and the case every sample was until 2026-08-13 — means a parser
   * recognises the file and the report opens. `'mapping'` means no parser claims it, so it opens
   * the COLUMN MAPPER, which is the whole point of that sample: the mapper is a shipped capability
   * that had no demonstration, and a file a parser recognised could not demonstrate it.
   *
   * `'stages'` means the files are per-stage recordings of ONE launch, which belong on `/stitch`
   * and **must not be offered as an ordinary drop.** Dropping a booster beside a sustainer builds
   * a COMPARISON, and `components/StitchSurface.tsx` sets out why that is the wrong answer for
   * them: `/compare` will report a 30% apogee "disagreement" between two stages that are behaving
   * exactly as designed. A sample that lands a first-time visitor in a false disagreement
   * demonstrates the opposite of the capability it was added for.
   *
   * **It is a KIND rather than a loosened assertion, and that was the trap this milestone flagged
   * in advance.** `lib/samples.test.ts` asserts every single-file sample auto-detects as a flight;
   * a mapper sample cannot, by definition. Widening that assertion to "parses OR needs mapping"
   * would have stopped it failing and stopped it meaning anything — a real sample that silently
   * lost its parser would have passed too. The kind is declared here and each branch is asserted
   * on its own terms.
   */
  kind?: 'flight' | 'mapping' | 'stages';
  /** Set on a sample that is a flight Debrief MADE UP, so every surface that offers it can say so
   *  before a flyer opens it. The file itself carries the marker — see `lib/synthetic.ts` — and
   *  this is the same fact where the OFFER can read it, because a button is a surface too. */
  synthetic?: boolean;
};

export const SAMPLES: Sample[] = [
  {
    id: 'one-flight',
    label: 'Try a sample flight',
    shows: 'One log, read end to end — apogee, speeds, deployments and the recovery track.',
    source: 'Altus Metrum TeleMetrum, ISSUIUC flight-data (2021-10-30). Apogee ≈ 9,322 ft.',
    files: ['sample-altusmetrum.csv'],
  },
  {
    id: 'two-altimeters',
    label: 'Two altimeters, one flight',
    shows:
      'The same flight recorded by two different boards, set side by side as cross-checks — never averaged into one number.',
    source:
      'PerfectFlite Pnut and a Featherweight Raven, both aboard HMC AdvRoc’s Top_Shot. The two agree at ≈ 1,009 ft.',
    files: ['sample-pnut.pf2', 'sample-raven-fip.csv'],
  },
  {
    id: 'device-summary',
    label: 'A log beside its board’s own summary',
    shows:
      'The figures the board itself reported, read from its summary file and set against Debrief’s independent read of the same log.',
    source:
      'Featherweight Blue Raven, posted to The Rocketry Forum by kjh (C40511, H180). The board states 4,034.98 ft and 700.36 ft/s.',
    files: ['sample-blueraven.csv', 'sample-blueraven.summary.csv'],
  },
  {
    id: 'column-mapper',
    label: 'A spreadsheet Debrief has to be told about',
    shows:
      'Columns no parser recognises, mapped by hand into a flight — the answer to any log Debrief does not know. This one is MADE UP, and says so on every surface it reaches.',
    // No figure in this line, deliberately. It read "apogee at 5,467 ft" — the GENERATOR's own
    // curve maximum — while the app reads 5,462 ft off the same file, because Debrief analyses
    // what the file contains rather than what wrote it. Five feet apart is small and it is still
    // two numbers for one apogee on two surfaces a flyer sees together, which is the shape
    // `MAINTAINING.md` names as worse than either alone. The report is where the number belongs.
    source:
      'Generated by lib/synthetic.ts — a piecewise curve, not a simulation and not a recording: a boost, a coast to apogee, two descent rates and a landing.',
    files: ['sample-mapper.csv'],
    kind: 'mapping',
    synthetic: true,
  },
  {
    id: 'saturated-accelerometer',
    label: 'A sensor that ran out of range',
    shows:
      'An accelerometer pinned at its full-scale limit through the boost — Debrief spots the flat top and reports the peak as a floor rather than the truth. This one is MADE UP, and says so on every surface it reaches.',
    // No figure here for the reason the mapper sample's line records, and one further one: the
    // number a reader would quote off this sample is the one Debrief REFUSES to stand behind. A
    // "16 g" on the button would be the app publishing the very figure the report qualifies.
    source:
      'Generated by lib/synthetic.ts — a piecewise curve, not a simulation and not a recording. The height and speed columns are integrated from a 24 g boost; the accelerometer column is that same boost clipped at 16 g, because a barometer does not saturate when an accelerometer does.',
    files: ['sample-saturated.csv'],
    kind: 'mapping',
    synthetic: true,
  },
  {
    id: 'staged-pair',
    label: 'A staged flight, on two altimeters',
    shows:
      'A booster and a sustainer, each logged on its own board, put on the one clock they share — the launch. The booster is on the ground before the sustainer reaches apogee, and no single file says that. This one is MADE UP, and says so on every surface it reaches.',
    // No apogee figure here, for the reason the mapper sample's line records: the generator's own
    // curve maximum and what the app reads off the file are not the same number, and two numbers
    // for one apogee on two surfaces a flyer sees together is worse than either alone. What this
    // line states instead is the ORDER, which is the thing a composite adds and the thing this
    // sample exists to show — and `lib/samples.test.ts` pins it.
    source:
      'Generated by lib/synthetic.ts — two piecewise curves, not a simulation and not a recording. The column names are an Eggtimer Classic’s so Debrief reads them without being told; no Eggtimer, and no device of any kind, recorded either file.',
    files: ['sample-stage-booster.csv', 'sample-stage-sustainer.csv'],
    kind: 'stages',
    synthetic: true,
  },
];

/** Every file the samples need, for the service worker's precache list. */
export const SAMPLE_FILES: string[] = SAMPLES.flatMap((s) => s.files);

/**
 * A sample's files, as real `File` objects, ready for the drop path.
 *
 * **Shared rather than duplicated, and that is the point of it being here.** The analyze page
 * fetched these inline; `/compare` needed the same three lines, and two copies of "turn a sample
 * into files" is exactly how one surface ends up opening a sample through a path the other does
 * not — which is the defect slice 1 removed in the first place, when the sample had its own
 * import path and could therefore only ever be one UTF-8 text file.
 *
 * They are fetched from this site, so a lost connection is the one real failure. The caller says
 * so; this throws.
 */
export async function sampleFiles(sample: Sample): Promise<File[]> {
  return Promise.all(
    sample.files.map(async (name) => {
      const res = await fetch(`/samples/${name}`);
      if (!res.ok) throw new Error(`sample missing: ${name}`);
      return new File([await res.arrayBuffer()], name);
    }),
  );
}

/**
 * The sample a surface should offer when its whole subject is more than one file. Named by id
 * rather than by position: `SAMPLES[1]` would silently become a different flight the day someone
 * reorders the registry, on a surface that can only honestly offer a multi-recording one.
 *
 * **`stages` is excluded, and that is a correctness clause rather than tidiness.** This is what
 * `/compare` offers, and a staged pair is the one multi-file set that surface must not open: two
 * stages of one launch are *supposed* to disagree about apogee, so the cross-check panel would
 * report a 30% discrepancy as a finding. Without this line the pair passes the `files.length > 1`
 * test, and the day it is ordered ahead of the two-altimeter set `/compare` starts demonstrating
 * itself with a false disagreement. `STAGES_SAMPLE` is where a staged pair belongs.
 */
export const MULTI_SAMPLE: Sample | undefined = SAMPLES.find(
  (s) => s.files.length > 1 && s.kind !== 'stages',
);

/** The sample `/stitch` offers: per-stage recordings of one launch, which is the only shape that
 *  surface can honestly demonstrate itself with. Found by kind rather than by id so that a second
 *  staged pair does not need a second call site. */
export const STAGES_SAMPLE: Sample | undefined = SAMPLES.find((s) => s.kind === 'stages');

/** The samples the analyze page offers — everything a flyer can simply DROP.
 *
 *  A `stages` sample is not one of them: dropped together, a booster and a sustainer build a
 *  comparison, and `Sample.kind` sets out why that is the wrong place to land. `/stitch` offers
 *  it instead, on the surface that is about them. */
export const DROPPABLE_SAMPLES: Sample[] = SAMPLES.filter((s) => s.kind !== 'stages');
