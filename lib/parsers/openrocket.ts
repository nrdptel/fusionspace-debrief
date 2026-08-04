// An OpenRocket `.ork` design file — and specifically the PREDICTION inside it.
//
// This is the first file Debrief reads that describes a flight nobody flew. It is not a
// recording and it never becomes one: a `.ork` holds a rocket design plus the summary
// figures OpenRocket's own simulator computed for it, and Debrief's job is to say how the
// real flight compared with what was predicted — never to simulate, fit, or correct.
// `MAINTAINING.md`'s measurement-not-simulation spine is the reason this file reads ten
// numbers and refuses to do anything else with them.
//
// Clean-room from OpenRocket's published file-format page, which names these ten
// `flightdata` attributes explicitly. Deliberately NOT read: the `databranch` time series
// and the `status` vocabulary, both of which that page defers to the (GPL-3) reference
// implementation for. The ten attributes are enough for the cross-check and they are the
// part that is actually documented.
//
// **Units: what is proved, and what is only inferred.** The spec page defines no unit for any
// of the ten, so this matters and the distinction is worth stating exactly rather than
// rounding up to "SI is proved".
//
//   PROVED, per file, on every file: `maxvelocity / maxmach` is the speed of sound if and
//   only if the velocity is metres per second. On the corpus fixture the five simulations
//   give 340.1, 338.7, 339.1, 339.1 and 339.1. `readPrediction` re-runs that check on every
//   file it opens and drops any run that fails it.
//
//   INFERRED for the other nine: OpenRocket's developer guide states the program "always
//   uses internally pure SI units", and these ten attributes are written from that one
//   internal model — so a build writing feet for the altitude would be writing feet for the
//   velocity too, and would fail the check above. That is strong evidence, not proof: a
//   build that converted ONLY on export, and only for some attributes, would pass. Nothing
//   in the file can settle it, and claiming otherwise would be the false precision this
//   project exists not to publish.
//
// An earlier version of this comment, and of the README line beside it, said the ten were
// proved. One is.

import { ParseGuidanceError, type Parser, type ParseInput } from './types';
import type { ReportedValue } from '../flight/types';
import { decodeXml, looksLikeZip, readCentralDirectory, readMember, tagAttr, type ZipContext } from '../zipRead';

/** The member inside the archive that holds the design. Fixed by the format. */
const DESIGN_MEMBER = 'rocket.ork';

const ZIP: ZipContext = {
  what: '.ork',
  resaveAdvice: 'Re-save it from OpenRocket and try again.',
  fail: (message) => {
    throw new ParseGuidanceError(message);
  },
};

/** A `.ork` is a ZIP wearing another extension, exactly as an `.xlsx` is. */
export function looksLikeOrk(name: string, bytes: Uint8Array): boolean {
  return looksLikeZip(bytes) && /\.ork$/i.test(name);
}

/** Unzip a `.ork` and hand back the design XML. The async pre-step that exists because
 *  `Parser.parse` is synchronous — the same shape `fileToText` already uses for `.xlsx`. */
export async function orkToXml(bytes: Uint8Array): Promise<string> {
  const entries = readCentralDirectory(bytes, ZIP);
  const member = entries.get(DESIGN_MEMBER);
  if (!member) {
    throw new ParseGuidanceError(
      `This .ork archive has no ${DESIGN_MEMBER} inside it, so there is no design to read. It may be corrupt — re-save it from OpenRocket.`,
    );
  }
  return new TextDecoder('utf-8').decode(await readMember(bytes, member, ZIP));
}

/** The ten figures an OpenRocket simulation states, in the order they read best. Each
 *  carries the `ReportedValue` metric it becomes; the last four name quantities Debrief
 *  deliberately measures no counterpart for, and `compareReported` yields them no verdict.
 *  See the note on those members in `lib/flight/types.ts` for why the nearest field is the
 *  wrong answer rather than a near-enough one. */
const FLIGHTDATA: readonly { attr: string; metric: ReportedValue['metric']; label: string }[] = [
  { attr: 'maxaltitude', metric: 'apogeeAltitude', label: 'Apogee' },
  { attr: 'maxvelocity', metric: 'maxVelocity', label: 'Max velocity' },
  { attr: 'maxacceleration', metric: 'maxAcceleration', label: 'Max acceleration' },
  { attr: 'maxmach', metric: 'maxMach', label: 'Max Mach' },
  { attr: 'timetoapogee', metric: 'timeToApogee', label: 'Time to apogee' },
  { attr: 'flighttime', metric: 'flightTime', label: 'Flight time' },
  { attr: 'groundhitvelocity', metric: 'groundHitVelocity', label: 'Ground-hit velocity' },
  { attr: 'launchrodvelocity', metric: 'launchRodVelocity', label: 'Launch-rod velocity' },
  { attr: 'deploymentvelocity', metric: 'deploymentVelocity', label: 'Deployment velocity' },
  { attr: 'optimumdelay', metric: 'optimumDelay', label: 'Optimum delay' },
];

/** One simulation's stated outcome. */
export interface PredictedRun {
  /** The simulation's own name, e.g. "Simulation 3 - too short delay". */
  name: string | null;
  /** `status` as the file states it. Carried, never TRUSTED: OpenRocket's format page
   *  shows one example value and defines none, so a rule keyed on it would be built on
   *  a vocabulary nobody has published. It is surfaced so a flyer can see what their own
   *  file says. */
  status: string | null;
  /** The figures this simulation states, in canonical SI. Never partial: a run missing
   *  any of the ten is dropped whole rather than compared on the half it has. */
  values: ReportedValue[];
  /** True when this run carries a saved time series. `StorageOptions.saveSimulationData`
   *  defaults to false, so most `.ork` files carry none — and a prediction with no series
   *  must say so rather than draw a line through its own summary scalars. */
  hasSeries: boolean;
}

export interface Prediction {
  /** The design's name, as the file states it. */
  rocket: string | null;
  /** What wrote the file, e.g. "OpenRocket 24.12". */
  creator: string | null;
  runs: PredictedRun[];
}

/** Speed of sound used only to CHECK the file's units, never to compute anything.
 *
 *  Deliberately loose at both ends, because the launch conditions are the flyer's to set and
 *  the Mach is taken at the altitude of the peak. Downward: a high flight peaks in colder
 *  air, and c falls with √T — 280 m/s is about −52 °C, colder than the tropopause. Upward:
 *  c = 331.3·√(1 + T/273.15) reaches 360 m/s at about 49 °C, which is a real desert launch
 *  site, so the ceiling is set beyond it rather than at it. The band only has to separate
 *  metres per second from the alternatives, and it does by a wide margin: feet per second
 *  would land near 1116, three times outside. */
const SOUND_MIN = 280;
const SOUND_MAX = 380;

function num(tag: string, attr: string): number | null {
  const raw = tagAttr(tag, attr);
  if (raw === null) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

/** Isolate each `<simulation …>` … `</simulation>` block, with the start tag kept.
 *
 *  A self-closing `<simulation … />` is skipped rather than sliced from, and that is not a
 *  hypothetical: OpenRocket writes one for a simulation that has never been run, and taking
 *  `indexOf('</simulation>')` from it would run past the empty element and swallow the NEXT
 *  simulation's `flightdata` — reporting one run's figures twice, under two names. */
function simulationBlocks(xml: string): string[] {
  const out: string[] = [];
  const re = /<simulation\b[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] === '/') continue; // <simulation … /> — an element with no content at all
    const end = xml.indexOf('</simulation>', m.index);
    // An unclosed final element is truncated XML. Read what is there rather than throwing;
    // an incomplete run fails the ten-attribute test below and is dropped on its own merits.
    out.push(xml.slice(m.index, end < 0 ? xml.length : end));
  }
  return out;
}

/** The text of the first `<tag>…</tag>` in a fragment, or null. A self-closing `<tag/>`
 *  counts as PRESENT AND EMPTY rather than absent, so a caller can tell "no name element"
 *  from "an element holding no name" — the two want different fallbacks. */
function firstElementText(fragment: string, tag: string): string | null {
  const empty = new RegExp(`<${tag}\\b[^>]*/>`);
  const full = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`);
  const f = fragment.match(full);
  const e = fragment.match(empty);
  // Whichever comes first in the fragment is the one that is actually first.
  if (f && e) return e.index! < f.index! ? '' : decodeXml(f[1]).trim();
  if (e) return '';
  return f ? decodeXml(f[1]).trim() : null;
}

/**
 * The design's own name.
 *
 * `<rocket>` opens with `<name>`, then `<subcomponents>` holding stages and parts that each
 * carry a `<name>` of their own. So the search is bounded at `<subcomponents>`: an UNNAMED
 * design writes `<name/>`, and reading the first `<name>` after `<rocket` would then walk
 * straight into the first stage and report "Sustainer" as the name of the rocket — which is
 * the failure the previous version of this function had while its comment claimed the
 * opposite. An empty name reads as no name, not as the next thing along.
 */
function readRocketName(xml: string): string | null {
  const open = xml.match(/<rocket\b[^>]*>/);
  if (!open) return null;
  const start = open.index! + open[0].length;
  const sub = xml.indexOf('<subcomponents', start);
  const head = xml.slice(start, sub < 0 ? Math.min(xml.length, start + 4000) : sub);
  const name = firstElementText(head, 'name');
  return name ? name : null;
}

/** Why a `.ork` yielded no prediction — the three cases need different sentences. */
export type NoPrediction =
  /** Not an OpenRocket file at all. */
  | 'not-openrocket'
  /** A design whose simulations have never been run: no `flightdata` anywhere. */
  | 'never-simulated'
  /** Simulations exist and state figures, but none survived — an incomplete attribute set,
   *  or figures whose units could not be confirmed. Telling this flyer to go and run a
   *  simulation would be wrong; they already have. */
  | 'unusable';

export interface PredictionRead {
  prediction: Prediction | null;
  why: NoPrediction | null;
  /** The design's name, which is readable even when no prediction is. */
  rocket: string | null;
}

/**
 * Read every simulation summary a `.ork` design states, and say why when there is none.
 *
 * A `.ork` really can carry a rocket and no prediction — inventing one from the geometry
 * would be simulating — but "no prediction" has three causes and they want three different
 * sentences. A flyer whose design has never been simulated should be told to run one; a
 * flyer whose five simulations were all dropped for an unreadable figure should not, because
 * they already did and the instruction is a dead end.
 */
export function readPredictionDetail(xml: string): PredictionRead {
  if (!/<openrocket\b/.test(xml)) return { prediction: null, why: 'not-openrocket', rocket: null };
  const root = xml.match(/<openrocket\b[^>]*>/)?.[0] ?? '';
  const creator = tagAttr(root, 'creator');
  const rocket = readRocketName(xml);

  const runs: PredictedRun[] = [];
  let stated = 0;
  for (const block of simulationBlocks(xml)) {
    const tag = block.match(/<flightdata\b[^>]*>/)?.[0];
    if (!tag) continue; // a simulation that was never run states no flightdata at all
    stated++;

    const values: ReportedValue[] = [];
    let complete = true;
    for (const f of FLIGHTDATA) {
      const v = num(tag, f.attr);
      if (v === null) {
        complete = false;
        break;
      }
      values.push({ metric: f.metric, label: f.label, value: v, source: 'predicted' });
    }
    if (!complete) continue;

    // Prove the units on this run's own numbers before keeping any of them. A Mach of
    // zero is a design that never moves; there is nothing to check and nothing to trust.
    const speed = values.find((v) => v.metric === 'maxVelocity')?.value ?? NaN;
    const mach = values.find((v) => v.metric === 'maxMach')?.value ?? NaN;
    if (!(mach > 0) || !Number.isFinite(speed)) continue;
    const sound = speed / mach;
    if (sound < SOUND_MIN || sound > SOUND_MAX) continue;

    runs.push({
      // `block` opens with the <simulation> start tag and the simulation's own <name> is
      // the first element inside it.
      name: firstElementText(block, 'name'),
      status: tagAttr(block.match(/<simulation\b[^>]*>/)?.[0] ?? '', 'status'),
      values,
      hasSeries: /<databranch\b/.test(block),
    });
  }

  if (runs.length === 0) {
    return { prediction: null, why: stated === 0 ? 'never-simulated' : 'unusable', rocket };
  }
  return { prediction: { rocket, creator, runs }, why: null, rocket };
}

/** The prediction a `.ork` states, or null. The common case; use `readPredictionDetail`
 *  when the REASON there is none has to be turned into a sentence. */
export function readPrediction(xml: string): Prediction | null {
  return readPredictionDetail(xml).prediction;
}

/**
 * The registered parser.
 *
 * A `.ork` is NOT a flight, so `parse` never returns one — it refuses, the way a device
 * summary does, with a sentence naming what the file is and what it needs alongside it.
 * Without this the file would fall to the generic column mapper, which would offer a
 * flyer a table of XML with nothing to map and no way forward.
 */
export const openRocketParser: Parser = {
  id: 'openrocket',
  label: 'OpenRocket design (prediction)',

  detect(input: ParseInput): number {
    // `fileToText` has already unzipped a `.ork`, so what arrives here is the design XML.
    if (!/^\s*<\?xml|^\s*<openrocket\b/.test(input.text.slice(0, 200))) return 0;
    if (!/<openrocket\b/.test(input.text.slice(0, 400))) return 0;
    return /\.ork$/i.test(input.name) ? 1 : 0.8;
  },

  parse(input: ParseInput): never {
    const { prediction, why, rocket } = readPredictionDetail(input.text);
    // The name is read off the design, so it is available in EVERY branch — including the
    // ones where no prediction could be. A refusal that cannot name the file it is refusing
    // is the least useful place to drop it.
    const name = rocket ? `“${rocket}” ` : '';
    const lead = `This is an OpenRocket design file ${name}— a rocket and its simulations, not a recording of a flight.`;

    if (!prediction) {
      // Three causes, three sentences. Telling a flyer whose simulations Debrief could not
      // read to "run a simulation" would be a dead end: they already ran five.
      const rest =
        why === 'never-simulated'
          ? ' It states no simulation results, so there is nothing to compare a flight against yet.' +
            ' Run a simulation in OpenRocket, save the design, then drop it in beside your flight log.'
          : ' It does state simulation results, but not in a form Debrief can read — either a figure is' +
            ' missing from every run, or the units could not be confirmed, and a number Debrief cannot' +
            ' place is one it will not publish. Re-saving the design from a current OpenRocket is worth a try.';
      throw new ParseGuidanceError(lead + rest);
    }

    const n = prediction.runs.length;
    throw new ParseGuidanceError(
      `${lead} It states ${n === 1 ? 'one simulation' : `${n} simulations`}, which Debrief can show beside the flight ` +
        'you actually flew. Drop it in together with the flight log from your altimeter.',
    );
  },
};
