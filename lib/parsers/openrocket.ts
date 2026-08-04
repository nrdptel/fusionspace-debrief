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
// **Units are proved from the file, not assumed off the spec page**, which defines none.
// `maxvelocity / maxmach` is the speed of sound if and only if the velocity is m/s, and on
// the corpus fixture the five simulations give 340.1, 338.7, 339.1, 339.1 and 339.1 m/s.
// `readPrediction` re-checks that on every file it opens and drops the whole prediction
// when it fails, so a future OpenRocket that writes feet cannot quietly publish a number
// under a metre's label. See `openrocket.test.ts`.

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

/** Speed of sound used only to CHECK the file's units, never to compute anything. The
 *  test is deliberately loose: OpenRocket's own Mach is taken at the altitude of the peak,
 *  where the atmosphere is colder and the speed of sound lower than at sea level, so the
 *  ratio drifts a few percent down the more altitude a flight gains. Anything in this band
 *  is metres per second; feet per second would land near 1116, three times out. */
const SOUND_MIN = 280;
const SOUND_MAX = 360;

function num(tag: string, attr: string): number | null {
  const raw = tagAttr(tag, attr);
  if (raw === null) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

/** Isolate each `<simulation …>` … `</simulation>` block, with the start tag kept. */
function simulationBlocks(xml: string): string[] {
  const out: string[] = [];
  const re = /<simulation\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const end = xml.indexOf('</simulation>', m.index);
    out.push(xml.slice(m.index, end < 0 ? xml.length : end));
  }
  return out;
}

function firstElementText(fragment: string, tag: string): string | null {
  const m = fragment.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1]).trim() : null;
}

/**
 * Read every simulation summary a `.ork` design states.
 *
 * Returns null when the file states no usable prediction at all — a design saved with no
 * simulation run, or one whose figures fail the units check. Null is the honest answer
 * there: a `.ork` really can carry a rocket and no prediction, and inventing one from the
 * geometry would be simulating.
 */
export function readPrediction(xml: string): Prediction | null {
  if (!/<openrocket\b/.test(xml)) return null;
  const root = xml.match(/<openrocket\b[^>]*>/)?.[0] ?? '';
  const creator = tagAttr(root, 'creator');
  // The design's name is the first <name> in the file, inside <rocket>. Read from the
  // rocket element rather than the document so a component's name can never stand in
  // for it on a file whose ordering differs.
  const rocketEl = xml.match(/<rocket\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const rocket = rocketEl ? decodeXml(rocketEl[1]).trim() : null;

  const runs: PredictedRun[] = [];
  for (const block of simulationBlocks(xml)) {
    const tag = block.match(/<flightdata\b[^>]*>/)?.[0];
    if (!tag) continue; // a simulation that was never run states no flightdata at all

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

  if (runs.length === 0) return null;
  return { rocket, creator, runs };
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
    const prediction = readPrediction(input.text);
    const name = prediction?.rocket ? `“${prediction.rocket}” ` : '';
    if (!prediction) {
      throw new ParseGuidanceError(
        `This is an OpenRocket design file ${name}— a rocket and its simulations, not a recording of a flight. ` +
          'It also states no simulation results, so there is nothing to compare a flight against yet. ' +
          'Run a simulation in OpenRocket, save the design, then drop it in beside your flight log.',
      );
    }
    const n = prediction.runs.length;
    throw new ParseGuidanceError(
      `This is an OpenRocket design file ${name}— a prediction, not a recording. ` +
        `It states ${n === 1 ? 'one simulation' : `${n} simulations`}, which Debrief can show beside the flight you actually flew. ` +
        'Drop it in together with the flight log from your altimeter.',
    );
  },
};
