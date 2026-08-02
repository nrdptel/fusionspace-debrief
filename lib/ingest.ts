// Read a batch of dropped files into flights, once, for every surface that takes a drop.
//
// A launch day's folder is not a list of flight logs. It mixes loggers Debrief
// auto-detects with files that need the column mapper, a Blue Raven's high-rate half that
// carries no altitude, a device summary that holds headline figures and no record at all,
// and the odd note-to-self. What happens to each of those is a set of rules, and the rules
// have to be the same wherever a flyer drops the folder — the analyze page or the
// comparison surface — or the two surfaces quietly disagree about what a launch day is.
//
// Everything here runs in the browser on the flyer's own device; `saveRecent` writes to
// this browser's logbook and nothing leaves it.

import { importFlight, ParseGuidanceError } from './parsers';
import { summaryFigures } from './parsers/deviceSummary';
import { flightTimeOrigin, highRateStream, type HighRateStream } from './parsers/blueraven';
import { halvesOfOneDownload, namesContradict, readHighRateOnto } from './highRate';
import { hasMappableColumns } from './flight/columns';
import { analyzeAsync } from './analyze/runner';
import { attachHighRateText, attachSummaryText, saveRecent } from './recents';
import { fileToText, textIsTheFile } from './fileText';
import type { RawFlight } from './flight/types';
import type { FlightAnalysis } from './analyze/types';

/** Far above any real flight log; a bigger file is a mistake, not a flight. */
export const MAX_BYTES = 64 * 1024 * 1024;

export interface IngestedFlight {
  name: string;
  formatLabel: string;
  flight: RawFlight;
  analysis: FlightAnalysis;
  text: string;
  /** The logbook key it was stored under, or null where storage was unavailable. */
  savedId: string | null;
}

export interface IngestOutcome {
  /** The flights, in the order they were dropped, capped at `max`. */
  results: IngestedFlight[];
  /** What couldn't be used at all, each with a reason worth reading. */
  skipped: { name: string; why: string }[];
  /** Files that aren't a known format but do hold columns of numbers — the flyer can map
   *  them one at a time, so they are offered rather than reported as failures. */
  mappable: { name: string; text: string }[];
  /** Device-summary files that found NO flight in this drop to belong to. A summary that
   *  did pair is not here — its figures are already on the flight, and it is named in
   *  `paired` instead. */
  summaries: { name: string; figures: NonNullable<ReturnType<typeof summaryFigures>>; text: string }[];
  /** "<summary file> → <log file>", one per summary that was read onto a flight. Empty on
   *  the ordinary single-file drop. */
  paired: string[];
  /** "<high-rate file> → <flight file>", one per high-rate stream read onto its flight.
   *
   *  **Separate from `paired` deliberately.** Both surfaces render `paired` with copy that names
   *  "the device's own summary" and its cross-check; a high-rate stream is neither — it is the
   *  other half of the same recording, carrying traces rather than figures to check against. One
   *  list would have told a flyer who dropped two Blue Raven halves that Debrief had read a
   *  summary file they do not have. */
  highRatePaired: string[];
  /** Flights this drop pushed out of the logbook. The logbook keeps a bounded window of
   *  un-noted flights (every entry holds the whole file text), and a launch day's folder is
   *  most of that window — so the third day quietly ate the first. Named now, so the flyer
   *  hears about it while they can still do something about it. */
  forgotten: string[];
  /** Files this drop NEVER OPENED, because `max` flights had already been read.
   *
   *  They appeared in no field at all before — not `results`, not `skipped` — so a caller could
   *  not tell they existed. The analyze page recomputed the shortfall from its own input list and
   *  said "Showing 6 of 8 files"; the compare surface had nothing to recompute from and counted
   *  what came BACK instead, so it said nothing at all on an empty comparison, and on a loaded one
   *  it named the wrong files. They are not in the logbook either — nothing read them — which the
   *  drop box's own copy promises they would be, so a surface has to be able to say so. */
  unread: string[];
}

/** Does this file name belong to the rocket a summary names? Compared on letters and digits
 *  only, so "BlRv_SN1537_LR_04-12-2025.csv" matches a summary for "BlRv_SN1537". */
function sameRocket(fileName: string, rocket: string): boolean {
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = fold(rocket);
  return key.length >= 4 && fold(fileName).includes(key);
}

/**
 * Put each device summary onto the flight it belongs to.
 *
 * This lives HERE, and not in the surface that happens to have needed it first, for the
 * reason at the top of this file: the rules have to be the same wherever a flyer drops the
 * folder. They were not. The pairing sat inside the analyze page, so dropping a Blue Raven
 * log and its summary on `/` produced a cross-check panel, while dropping the SAME two files
 * on `/compare` produced "a device summary for “BlRv_159F1cm”, not a flight record" and
 * nothing else — the word "cross-check" appeared nowhere on the page.
 *
 * Beside Debrief's read, never merged into it: the figures land in `reported`, and a figure
 * the log already stated for itself wins, because that one came from the flight record.
 * Anything the summary stated but Debrief could not use rides across as a note.
 */
function pairSummaries(results: IngestedFlight[], summaries: IngestOutcome['summaries']): {
  paired: string[];
  unpaired: IngestOutcome['summaries'];
  remember: { id: string; text: string }[];
} {
  const paired: string[] = [];
  const unpaired: IngestOutcome['summaries'] = [];
  const remember: { id: string; text: string }[] = [];
  for (const s of summaries) {
    const target =
      results.find((r) => sameRocket(r.name, s.figures.rocket)) ??
      // One flight and one summary in a drop are each other's, whatever they are called.
      (results.length === 1 && summaries.length === 1 ? results[0] : undefined);
    if (!target) {
      unpaired.push(s);
      continue;
    }
    const already = new Set((target.flight.reported ?? []).map((v) => v.metric));
    const added = s.figures.reported.filter((v) => !already.has(v.metric));
    const notes = s.figures.notes.filter((n) => !target.flight.notes.includes(n));
    target.flight = {
      ...target.flight,
      ...(added.length ? { reported: [...(target.flight.reported ?? []), ...added] } : {}),
      ...(notes.length ? { notes: [...target.flight.notes, ...notes] } : {}),
      ...(target.flight.flownAt ?? s.figures.flownAt ? { flownAt: target.flight.flownAt ?? s.figures.flownAt } : {}),
    };
    paired.push(`${s.name} → ${target.name}`);
    // …and the logbook keeps the summary's TEXT beside the log's, so reopening this flight
    // tomorrow reads it again rather than losing the cross-check.
    if (target.savedId) remember.push({ id: target.savedId, text: s.text });
  }
  return { paired, unpaired, remember };
}

/**
 * Put each high-rate stream onto the flight whose other half recorded it.
 *
 * Same shape as `pairSummaries` above and for the same reason: a file that threw on the way
 * through the parsers is not always rubbish, and which flight it belongs to can only be decided
 * once every file in the drop has been read. It lives here rather than on a surface so that
 * dropping a Blue Raven's two halves on `/compare` and on the analyze page mean the same thing.
 *
 * **A stream that finds no flight is skipped with the parser's own words, unchanged.** Dropping
 * one alone is still not a flight — it has no altitude — and the guidance it gets is still "drop
 * the low-rate file instead". That is the whole point of the pairing: it only ever fires when the
 * flyer already did.
 */
function pairHighRate(
  results: IngestedFlight[],
  streams: { name: string; stream: HighRateStream; why: string; text: string }[],
): { paired: string[]; unpaired: { name: string; why: string }[]; remember: { id: string; text: string }[] } {
  const paired: string[] = [];
  const unpaired: { name: string; why: string }[] = [];
  const remember: { id: string; text: string }[] = [];
  for (const s of streams) {
    // Only a Blue Raven can be the other half of a Blue Raven download. Without this a stream
    // would attach to whatever else happened to be in the folder on a name coincidence.
    const candidates = results.filter((r) => r.flight.format === 'blueraven');
    const target =
      candidates.find((r) => halvesOfOneDownload(s.name, r.name)) ??
      // One Blue Raven flight and one stream in a drop are each other's, whatever they are
      // called — the same rule `pairSummaries` uses, and it covers a renamed half. **Unless the
      // names positively contradict**: `pairSummaries` can fall back freely because a summary
      // carries the rocket it belongs to, and a stream carries nothing at all, so without this
      // one download's 500 Hz traces get drawn on another download's flight under a note saying
      // both halves are one board's record of one flight.
      (candidates.length === 1 && streams.length === 1 && !namesContradict(s.name, candidates[0].name)
        ? candidates[0]
        : undefined);
    if (!target) {
      unpaired.push({ name: s.name, why: s.why });
      continue;
    }
    target.flight = readHighRateOnto(target.flight, s.stream, flightTimeOrigin(target.text) ?? 0);
    paired.push(`${s.name} → ${target.name}`);
    // …and the logbook keeps the stream's TEXT beside the log's, so reopening this flight tomorrow
    // reads it again. Without this the traces vanished on reload and were never in a comparison
    // built from ids at all, while the drop's note said they were on the explorer.
    if (target.savedId) remember.push({ id: target.savedId, text: s.text });
  }
  return { paired, unpaired, remember };
}

/**
 * Read every dropped file, analyse the ones that are flights, and remember them.
 *
 * `max` caps the number of *flights*, not input files: parsing keeps going past a file that
 * doesn't auto-detect so a valid later file can still fill a slot, and stops once there are
 * enough. Each save is awaited rather than fired and forgotten, so the logbook's per-save
 * prune can't race itself.
 */
export async function ingestFiles(files: File[], max: number): Promise<IngestOutcome> {
  const results: IngestedFlight[] = [];
  const skipped: { name: string; why: string }[] = [];
  /** Flights the per-save prune pushed out of the logbook while reading this drop — a
   *  launch day's worth of files is enough to do it, and it used to happen in silence. */
  const forgotten: string[] = [];
  const mappable: { name: string; text: string }[] = [];
  const summaries: IngestOutcome['summaries'] = [];
  /** Blue Raven high-rate streams, held until every file is read so each can find its flight. */
  const highRate: { name: string; stream: HighRateStream; why: string; text: string }[] = [];
  const unread: string[] = [];

  for (const [i, file] of files.entries()) {
    if (results.length >= max) {
      // Named rather than dropped on the floor. Everything from here on is unopened.
      unread.push(...files.slice(i).map((f) => f.name));
      break;
    }
    let text = '';
    try {
      if (file.size > MAX_BYTES) {
        skipped.push({ name: file.name, why: 'too large to read in the browser' });
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      text = await fileToText(file.name, bytes);
      const result = importFlight({ name: file.name, text, bytes });
      if (result.kind !== 'flight') {
        // Kept, not dropped: a surface can offer to open the mapper on it. Only where
        // there is something to map — a binary download or a note to self reaches the
        // mapper too, and offering it would send the flyer to a screen that can only tell
        // them the file isn't a flight.
        if (hasMappableColumns(result.table)) mappable.push({ name: file.name, text });
        else skipped.push({ name: file.name, why: 'has no columns of numbers in it — not a flight log' });
        continue;
      }
      const analysis = await analyzeAsync(result.flight);
      const saved = await saveRecent({
        name: file.name,
        formatLabel: result.flight.formatLabel,
        apogeeM: analysis.metrics.apogeeAltitude ?? null,
        maxVelocityMs: Number.isFinite(analysis.metrics.maxVelocity) ? analysis.metrics.maxVelocity : null,
        ...(result.flight.flownAt ? { flownAt: result.flight.flownAt } : {}),
        text,
        // A raw binary download does not survive as text — keep the file itself, or the
        // logbook row reopens as mojibake. See `textIsTheFile`.
        ...(textIsTheFile(text) ? {} : { bytes }),
      });
      for (const n of saved.forgotten) forgotten.push(n);
      results.push({ name: file.name, formatLabel: result.flight.formatLabel, flight: result.flight, analysis, text, savedId: saved.id });
    } catch (e) {
      // A device summary throws on the way through the parsers, but it isn't rubbish: it
      // holds the altimeter's own figures for a flight logged beside it.
      const figures = text ? summaryFigures(text) : null;
      if (figures) {
        summaries.push({ name: file.name, figures, text });
        continue;
      }
      // A Blue Raven high-rate file throws too, and it is not rubbish either: it is the other
      // half of one board's record of one flight. Held aside like a summary, because whether its
      // flight is in this drop can only be answered once every file has been read.
      const stream = text && e instanceof ParseGuidanceError ? highRateStream(text) : null;
      if (stream) {
        highRate.push({ name: file.name, stream, why: (e as ParseGuidanceError).message, text });
        continue;
      }
      // A guidance error explains itself (the Blue Raven high-rate file); anything else is
      // just unreadable.
      skipped.push({
        name: file.name,
        why: e instanceof ParseGuidanceError ? e.message : 'couldn’t be read as a flight',
      });
    }
  }
  // …and only now, with every file read, can a summary be matched to the log it belongs to.
  const { paired, unpaired, remember } = pairSummaries(results, summaries);
  // The same for a high-rate stream, which is the other half of a flight rather than a file about
  // one. An unpaired stream keeps the parser's own guidance, so dropping one alone is unchanged.
  const hr = pairHighRate(results, highRate);
  skipped.push(...hr.unpaired);
  for (const r of hr.remember) await attachHighRateText(r.id, r.text);
  for (const r of remember) await attachSummaryText(r.id, r.text);
  for (const s of unpaired) {
    // Two different facts, and only one of them is ever true. With no flights in the drop the
    // log really isn't here. With flights in it, Debrief has one and cannot tell it is the
    // right one — the match is the rocket name the summary states appearing in a log's FILE
    // NAME, which holds for what the device's own software writes out and not for a file the
    // flyer renamed. Saying "its flight log wasn't in this drop" there is a claim Debrief is
    // not entitled to make, and can be flatly false: the log can be sitting in the same drop
    // under another name.
    skipped.push({
      name: s.name,
      why:
        results.length === 0
          ? `the device's own summary for “${s.figures.rocket}”, but its flight log wasn't in this drop`
          : `the device's own summary for “${s.figures.rocket}” — no log in this drop is named for that rocket, so Debrief can't tell which flight it belongs to`,
    });
  }
  return { results, skipped, mappable, summaries: unpaired, paired, highRatePaired: hr.paired, forgotten, unread };
}

/** The sentence a surface shows when a high-rate stream was read onto its flight.
 *
 *  Built here rather than at each call site for the reason at the top of this file: the analyze
 *  page and the comparison surface both take a drop, and a fact stated in two places drifts into
 *  two facts. It says what was done to the samples, because "read the high-rate file" would let a
 *  flyer believe every one of its 192,001 rows is on the chart. */
export function highRateNote(highRatePaired: string[]): string {
  return (
    `Read the high-rate half of this flight alongside it (${highRatePaired.join('; ')}) — both files ` +
    `are one board's record of one flight and share its flight clock. Its gyro, accelerometer and ` +
    `attitude traces are on the channel explorer; each point is the largest sample the board ` +
    `recorded at that instant, so the peaks are the board's own.`
  );
}

/** How many names one "not read" sentence will print before it starts counting instead. A drop can
 *  carry 200 files (`MAX_DROPPED_FILES`), and an uncapped list ran to 7,500 characters — nearly
 *  four phone screens of filenames above the comparison they were meant to annotate. */
export const MAX_NAMED_UNREAD = 6;

/**
 * The sentence a surface shows when a drop was too full to read everything, built HERE rather than
 * written out at each call site — the two surfaces had already drifted into computing this fact
 * two different ways, which is what this module exists to stop.
 *
 * Three things it is careful about, each one a claim an earlier draft got wrong:
 *
 *  * it says the files were NOT READ, which is always true, and only adds "not in your logbook"
 *    when that is certain. A logbook entry is identified by name, parser and bytes — so when an
 *    unread file shares its NAME with one that was read (a launch day of six `data.csv`s is the
 *    documented case, and a folder drop yields basenames), a row with that name is sitting in the
 *    logbook and the flyer cannot tell which file it is;
 *  * it says to drop them again to READ them, not to KEEP them. Nothing opened these files, so
 *    nothing knows they are flights: a pad photo or a note-to-self past the cap gets named here
 *    and then rejected on the second drop, and "keep" would have promised otherwise;
 *  * it stops naming at `MAX_NAMED_UNREAD` and counts the rest.
 */
export function unreadNote(unread: string[], read: string[], max: number): string {
  if (unread.length === 0) return '';
  const one = unread.length === 1;
  const shown = unread.slice(0, MAX_NAMED_UNREAD);
  const rest = unread.length - shown.length;
  const names = shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '');
  // A name that also came back as a flight is a name the logbook now holds, whichever file it was.
  const readNames = new Set(read);
  const absent = unread.every((n) => !readNames.has(n));
  const logbook = absent
    ? ` ${one ? "It isn't" : "They aren't"} in your logbook either — drop ${one ? 'it' : 'them'} on their own to read ${one ? 'it' : 'them'}.`
    : ` Drop ${one ? 'it' : 'them'} on their own to read ${one ? 'it' : 'them'}.`;
  return ` A comparison holds ${max} flights, so reading stopped there: ${one ? '1 file was' : `${unread.length} files were`} not read — ${names}.${logbook}`;
}
