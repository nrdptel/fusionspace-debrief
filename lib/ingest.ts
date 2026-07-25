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
import { hasMappableColumns } from './flight/columns';
import { analyzeAsync } from './analyze/runner';
import { saveRecent } from './recents';
import { fileToText } from './fileText';
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
  /** Device-summary files: headline figures for a flight logged elsewhere, held for the
   *  caller to pair with the log they belong to. */
  summaries: { name: string; figures: NonNullable<ReturnType<typeof summaryFigures>> }[];
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
  const mappable: { name: string; text: string }[] = [];
  const summaries: IngestOutcome['summaries'] = [];

  for (const file of files) {
    if (results.length >= max) break;
    let text = '';
    try {
      if (file.size > MAX_BYTES) {
        skipped.push({ name: file.name, why: 'too large to read in the browser' });
        continue;
      }
      text = await fileToText(file.name, new Uint8Array(await file.arrayBuffer()));
      const result = importFlight({ name: file.name, text });
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
      const savedId = await saveRecent({
        name: file.name,
        formatLabel: result.flight.formatLabel,
        apogeeM: analysis.metrics.apogeeAltitude ?? null,
        maxVelocityMs: Number.isFinite(analysis.metrics.maxVelocity) ? analysis.metrics.maxVelocity : null,
        ...(result.flight.flownAt ? { flownAt: result.flight.flownAt } : {}),
        text,
      });
      results.push({ name: file.name, formatLabel: result.flight.formatLabel, flight: result.flight, analysis, text, savedId });
    } catch (e) {
      // A device summary throws on the way through the parsers, but it isn't rubbish: it
      // holds the altimeter's own figures for a flight logged beside it.
      const figures = text ? summaryFigures(text) : null;
      if (figures) {
        summaries.push({ name: file.name, figures });
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
  return { results, skipped, mappable, summaries };
}
