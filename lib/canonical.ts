// The canonical flight record: `RawFlight` written out, and read back as the same flight.
//
// D11's point is not a convenience export. It is a test of the architecture this repo already
// commits to — every importer and the column mapper are thin producers of ONE internal model,
// and the analyzer only ever sees that model. If that is true, a round-trip is nearly free;
// wherever it is not free, a parser is smuggling format-specific state past the model, and
// finding those is the reason to build this.
//
// **It writes the MEASUREMENT, never the reading.** Nothing derived goes in the file: no
// metrics, no events, no warnings, no provenance verdicts. The analyzer runs again on import,
// so a flight archived today gets every later improvement to the analysis rather than being
// frozen at the version that wrote it. That is the same rule `lib/recents.ts` follows when it
// stores a row's SOURCE rather than its figures, and it is why writing `analysis.series.velocity`
// back as a `velocity` channel would be a bug rather than a shortcut — a `Channel` is what an
// instrument recorded, and a derived speed entering that list flips `maxVelocitySource` from
// `baro` to `device` and silently promotes a derived value to a measured one, which the
// measurement-not-simulation invariant forbids outright.
//
// **The schema id is `debrief.record/1`, deliberately not `debrief.flight/1`.** That one is
// taken, by `analysisJson` in `lib/report.ts` — a document of Debrief's READ of a flight, in
// the flyer's display units, which cannot round-trip and is not meant to. One is what Debrief
// concluded; this is what the instrument recorded. Keeping the ids apart is what stops a later
// session mistaking either for the other.
//
// Three things a naive JSON of this model gets wrong, each measured rather than assumed:
//
//   1. `JSON.stringify(new Float64Array([0, 1.5]))` is `{"0":0,"1":1.5}` — an object, not an
//      array — so a naive writer emits index-keyed blobs and everything downstream that calls
//      `.subarray` on the result throws.
//   2. `JSON.stringify(NaN)` is `null`, and `Float64Array.from([null])[0]` is `0`. NaN is this
//      model's gap marker ("NaN marks a gap"), and `altitudeGps` is NaN wherever the receiver
//      had no fix — so a GPS dropout would re-import as a real 0 m reading, which is a wrong
//      number on a surface a flyer would act on rather than a missing one.
//   3. `gravityRemoved` is knowledge only a parser has — it is a property of the file format,
//      not something the numbers reveal — and it is optional, so a writer that lets `undefined`
//      fall out and a reader that defaults it read the same flight at two different peak
//      accelerations.

import { buildFields } from './buildInfo';
import type { Channel, ChannelKind, PredictedTrace, RawFlight, ReportedValue } from './flight/types';
import type { FlownAt } from './flight/flownAt';
import type { RepeatedSpan } from './highRateRepeats';

/** The schema token. Anchored on by the parser's `detect`, so it must not change casually. */
export const CANONICAL_SCHEMA = 'debrief.record/1';

/** The extension the app writes and offers. */
export const CANONICAL_EXTENSION = '.json';

/** A number, or the sentinel a non-finite one is written as. See note 2 above. */
type Scalar = number | 'NaN' | 'Infinity' | '-Infinity';

/**
 * Every `ChannelKind`, listed once so a round-trip can refuse a kind it does not know rather
 * than degrading it to `'other'`.
 *
 * The sensor-frame kinds (`accelAxis`, `angularRate`, `attitudeQuaternion`) exist precisely so
 * the analyzer CANNOT read them as `accelAxial` / `rollRate`: a high-rate stream reaches Debrief
 * reduced to an envelope, and a metric computed off one would be a number taken from a trace
 * built for looking at. Silently widening an unknown kind to `'other'` on import would be the
 * same class of mistake pointing the other way, so an unrecognised kind is a refusal.
 *
 * `satisfies` rather than a plain annotation: the compiler checks this list against the union,
 * so ADDING a kind to `ChannelKind` without adding it here fails `npm run build`. That is the
 * repo's standing rule for two lists that must agree — a test holds them side by side and fails
 * when they drift — done at the type level, where it costs nothing to run.
 */
export const CANONICAL_CHANNEL_KINDS = [
  'altitude',
  'altitudeInertial',
  'pressure',
  'temperature',
  'accelAxial',
  'accelTotal',
  'velocity',
  'rollRate',
  'rollAngle',
  'tilt',
  'voltage',
  'latitude',
  'longitude',
  'altitudeGps',
  'satellites',
  'accelAxis',
  'angularRate',
  'attitudeQuaternion',
  'other',
] as const satisfies readonly ChannelKind[];

// …and the other direction: every kind in the union is in the list. A kind REMOVED from
// `ChannelKind` while still listed here would otherwise sit unnoticed.
type MissingKind = Exclude<ChannelKind, (typeof CANONICAL_CHANNEL_KINDS)[number]>;
const _kindsAreExhaustive: MissingKind extends never ? true : never = true;
void _kindsAreExhaustive;

interface CanonicalChannel {
  kind: ChannelKind;
  label: string;
  unit: string;
  values: Scalar[];
  /** Written only when the parser set it, so presence round-trips as presence. */
  gravityRemoved?: boolean;
}

interface CanonicalPredicted {
  rocket: string;
  time: Scalar[];
  altitude: Scalar[];
}

/**
 * The flyer's statement that this recording is one of several of ONE flight.
 *
 * **Deliberately not part of the flight.** `RawFlight` is what one instrument recorded, and
 * "these two files are one flight" is not something an instrument records — it is something the
 * flyer said afterwards, in the logbook, and `lib/flightGroups.ts` exists precisely because
 * INFERRING it is the dangerous problem. So it rides beside the measurement, outside the
 * `RawFlight` fields, exactly as `build` does: `fromCanonical` never sees it and the analyzer
 * cannot reach it.
 *
 * `flight` is the primary recording's logbook id, which makes it a device-local token that is
 * meaningless on its own — and that is all it has to be. It is never resolved against the
 * importing device's logbook; it only has to be EQUAL across the records written from one
 * flight, so the drop path can tell which of the files in front of it belong together.
 */
export interface CanonicalGrouping {
  /** The flight this recording belongs to. Opaque, and equal across every record of one flight. */
  flight: string;
  /** Whether this is the recording the flight is reported by. */
  reports: boolean;
  /** How many recordings the flight had when this record was written. Stated so a flyer who
   *  drops two records of a four-recording flight can be told that two are missing rather than
   *  being shown a flight that quietly claims to be complete. */
  of: number;
}

/**
 * The flyer's statement about a per-stage COMPOSITE: that this recording is one of several stages
 * of one launch, and which of them flew first.
 *
 * **A different relation from `CanonicalGrouping`, and kept separate for that reason.** A grouping
 * says *these files are one flight recorded twice* — same launch, same airframe, two instruments.
 * A stage set says *these files are different PARTS of one launch*, each recording a different
 * airframe after separation. Merging the two into one field would let a restore read one as the
 * other, and `lib/composite.ts` exists precisely because those two claims must never be confused:
 * a composite merges nothing and adds only ORDER, which is the one thing no single recording has.
 *
 * Like the grouping, this is something the flyer SAID — `lib/composite.ts`: "nothing in the
 * records establishes that they belong to one launch" — so it rides outside the `RawFlight`
 * fields where the analyzer cannot reach it.
 */
export interface CanonicalStage {
  /** The stage set this recording belongs to. Opaque, and equal across every record of one set. */
  set: string;
  /** Whether the flyer said THIS recording flew as the first stage. */
  first: boolean;
}

/**
 * How far into the file `readGrouping` looks.
 *
 * The block is written immediately after the build stamp and before `source`, so it lands in the
 * first couple of hundred characters of every record this code writes. Reading it out of the head
 * rather than parsing the file again is not a micro-optimisation: `importFlight` has ALREADY
 * parsed the whole record by the time the drop path wants the grouping, and a record carries
 * every sample of every channel — re-parsing tens of megabytes to read three short fields would
 * double the cost of opening a set of them.
 */
const GROUPING_HEAD = 2048;

/**
 * The file's shape.
 *
 * Keyed off `RawFlight` with `satisfies`, so a field ADDED to the model without being handled
 * here fails the type-check rather than silently going missing from every archived flight. This
 * is the one guard that cannot be forgotten, because it runs in `npm run build`.
 */
interface CanonicalRecord {
  schema: typeof CANONICAL_SCHEMA;
  /** Which build of Debrief wrote this file. Not part of the flight — `fromCanonical` ignores it,
   *  and it is deliberately absent from the field-by-field round-trip comparison, because it says
   *  nothing about the measurement. It is here so a record archived in March can be traced to the
   *  code that read it when a number is questioned in June. See `lib/buildInfo.ts`. */
  build?: string;
  builtAt?: string;
  /** The flyer's grouping statement. Not part of the flight — see `CanonicalGrouping`. Written
   *  here, ahead of the series, so `readGrouping` can find it without parsing the file again. */
  grouping?: CanonicalGrouping;
  /** The flyer's per-stage statement, where this record was written from a composite. Same
   *  placement and the same reason. See `CanonicalStage`. */
  stage?: CanonicalStage;
  source: string;
  format: string;
  formatLabel: string;
  time: Scalar[];
  channels: CanonicalChannel[];
  meta: Record<string, string | number>;
  notes: string[];
  flownAt?: FlownAt;
  reported?: ReportedValue[];
  repeatedSpans?: RepeatedSpan[];
  predicted?: CanonicalPredicted;
}

const encodeScalar = (v: number): Scalar =>
  Number.isFinite(v) ? v : Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity';

const decodeScalar = (v: Scalar): number =>
  typeof v === 'number' ? v : v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : -Infinity;

/** A series out. `Array.from` first: a `Float64Array` does not stringify as an array. */
const encodeSeries = (a: Float64Array): Scalar[] => Array.from(a, encodeScalar);

const decodeSeries = (a: readonly Scalar[]): Float64Array => {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = decodeScalar(a[i]);
  return out;
};

/**
 * A flight, as the bytes of a canonical record.
 *
 * Full precision: `JSON.stringify` emits the shortest representation that round-trips a double
 * exactly (ECMA-262), so no digits are lost and no tolerance is involved. The file is therefore
 * larger than the log it came from, which is the honest cost of carrying every sample.
 */
export function toCanonical(
  flight: RawFlight,
  /** The flyer's statements about this recording's place among others, where they made any. An
   *  options object rather than positional parameters: there are two now and they are unrelated,
   *  so a call site passing one should not have to mention the other. */
  says: { grouping?: CanonicalGrouping; stage?: CanonicalStage } = {},
): string {
  const record = {
    schema: CANONICAL_SCHEMA,
    ...buildFields(),
    // Presence, not truthiness: a flight of one recording states nothing, which is what every
    // record written before this existed also states, so both read back identically.
    ...(says.grouping === undefined ? {} : { grouping: says.grouping }),
    ...(says.stage === undefined ? {} : { stage: says.stage }),
    source: flight.source,
    format: flight.format,
    formatLabel: flight.formatLabel,
    time: encodeSeries(flight.time),
    channels: flight.channels.map((c) => ({
      kind: c.kind,
      label: c.label,
      unit: c.unit,
      values: encodeSeries(c.values),
      // Presence, not truthiness: a channel whose parser set it to `false` is a different fact
      // from one whose parser never spoke, and both must come back as they went out.
      ...(c.gravityRemoved === undefined ? {} : { gravityRemoved: c.gravityRemoved }),
    })),
    meta: flight.meta,
    notes: flight.notes,
    ...(flight.flownAt === undefined ? {} : { flownAt: flight.flownAt }),
    ...(flight.reported === undefined ? {} : { reported: flight.reported }),
    ...(flight.repeatedSpans === undefined ? {} : { repeatedSpans: flight.repeatedSpans }),
    ...(flight.predicted === undefined
      ? {}
      : {
          predicted: {
            rocket: flight.predicted.rocket,
            time: encodeSeries(flight.predicted.time),
            altitude: encodeSeries(flight.predicted.altitude),
          },
        }),
  } satisfies CanonicalRecord;

  return JSON.stringify(record);
}

/** Thrown when a file claims to be a canonical record but is not one we can trust. */
export class CanonicalFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalFormatError';
  }
}

const isScalarArray = (v: unknown): v is Scalar[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number' || x === 'NaN' || x === 'Infinity' || x === '-Infinity');

/**
 * A canonical record, back as the flight it was written from.
 *
 * Refuses rather than repairs. A record this function cannot read fully is a record whose
 * flight would be subtly different from the one archived, and a flight that is subtly different
 * is worse than one that failed to open — the flyer can see the second happen.
 */
export function fromCanonical(text: string): RawFlight {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CanonicalFormatError('This file is not readable JSON.');
  }
  if (typeof raw !== 'object' || raw === null) throw new CanonicalFormatError('This file is not a flight record.');
  const r = raw as Partial<CanonicalRecord>;

  if (r.schema !== CANONICAL_SCHEMA) {
    throw new CanonicalFormatError(
      `This file says it is “${String(r.schema)}”, and Debrief writes “${CANONICAL_SCHEMA}”.`,
    );
  }
  if (!isScalarArray(r.time)) throw new CanonicalFormatError('This flight record has no time base.');
  if (!Array.isArray(r.channels)) throw new CanonicalFormatError('This flight record has no channels.');

  const known = new Set<string>(CANONICAL_CHANNEL_KINDS);
  const channels: Channel[] = r.channels.map((c, i) => {
    if (typeof c !== 'object' || c === null) throw new CanonicalFormatError(`Channel ${i + 1} is not a channel.`);
    if (!known.has(c.kind)) {
      // Never widen to 'other'. A kind this build does not know is a file written by a newer
      // Debrief, and guessing what the analyzer should do with it is how a sensor-frame trace
      // ends up read as a body-axis measurement.
      throw new CanonicalFormatError(
        `This record carries a “${String(c.kind)}” channel, which this version of Debrief does not know how to read.`,
      );
    }
    if (!isScalarArray(c.values)) throw new CanonicalFormatError(`Channel “${c.label}” has no values.`);
    if (c.values.length !== r.time!.length) {
      throw new CanonicalFormatError(
        `Channel “${c.label}” has ${c.values.length} values against ${r.time!.length} times.`,
      );
    }
    return {
      kind: c.kind,
      label: c.label,
      unit: c.unit,
      values: decodeSeries(c.values),
      ...(c.gravityRemoved === undefined ? {} : { gravityRemoved: c.gravityRemoved }),
    };
  });

  const predicted: PredictedTrace | undefined = r.predicted
    ? {
        rocket: r.predicted.rocket,
        time: decodeSeries(r.predicted.time),
        altitude: decodeSeries(r.predicted.altitude),
      }
    : undefined;

  return {
    source: r.source ?? '',
    format: r.format ?? 'canonical',
    formatLabel: r.formatLabel ?? 'Debrief flight record',
    time: decodeSeries(r.time),
    channels,
    meta: r.meta ?? {},
    notes: r.notes ?? [],
    ...(r.flownAt === undefined ? {} : { flownAt: r.flownAt }),
    ...(r.reported === undefined ? {} : { reported: r.reported }),
    ...(r.repeatedSpans === undefined ? {} : { repeatedSpans: r.repeatedSpans }),
    ...(predicted === undefined ? {} : { predicted }),
  };
}

/** Cheap enough to run on every dropped file: the schema token near the head of the text. */
export function looksCanonical(text: string): boolean {
  return text.slice(0, 400).includes(`"schema":"${CANONICAL_SCHEMA}"`);
}

/**
 * The grouping statement a record carries, or null where it carries none.
 *
 * **Ignores rather than refuses, which is the opposite of `fromCanonical` and is deliberate.**
 * That function refuses a record it cannot read fully because a flight that is subtly different
 * from the archived one is worse than one that failed to open. A grouping cannot make a flight
 * subtly different: it is not in the flight. Dropping an unreadable one degrades to exactly the
 * state before this existed — two flights in the logbook, joinable in one click — and that is
 * visible to the flyer, where refusing the file would lose the measurement outright.
 *
 * `of` is required to be at least 2 because a grouping of one recording is not a grouping, and
 * `flight` must be non-empty: an empty token would bucket every record that carries one together.
 */
export function readStage(text: string): CanonicalStage | null {
  // Same head window and the same ignore-rather-than-refuse rule as `readGrouping`: a statement
  // about which files go together cannot make a flight subtly different, because it is not in
  // the flight.
  const m = /"stage":(\{[^{}]*\})/.exec(text.slice(0, GROUPING_HEAD));
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const g = raw as Partial<CanonicalStage>;
  if (typeof g.set !== 'string' || g.set === '') return null;
  if (typeof g.first !== 'boolean') return null;
  return { set: g.set, first: g.first };
}

export function readGrouping(text: string): CanonicalGrouping | null {
  // The braces are excluded from the body match so this cannot run away across the whole file
  // when a record carries no grouping at all — which is nearly every record.
  const m = /"grouping":(\{[^{}]*\})/.exec(text.slice(0, GROUPING_HEAD));
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const g = raw as Partial<CanonicalGrouping>;
  if (typeof g.flight !== 'string' || g.flight === '') return null;
  if (typeof g.reports !== 'boolean') return null;
  if (typeof g.of !== 'number' || !Number.isInteger(g.of) || g.of < 2) return null;
  return { flight: g.flight, reports: g.reports, of: g.of };
}
