// A hand-made column mapping, turned into an analysed flight and remembered.
//
// Two surfaces open the column mapper — the analyze page on a file dropped alone or out of
// a batch, and the comparison surface on a file from a launch day's folder — and what they
// do with the answer has to be the same. Not just the analysis: the format label the flight
// carries, the shape the mapping is stored in, and which figures go into the logbook entry
// all decide whether the flight can be reopened later and joined to a comparison by id.
// `lib/reopen` reads that entry back; this is the half that writes it, and the two are a
// pair. Everything here runs on the flyer's own device — `saveRecent` writes to this
// browser's logbook and nothing leaves it.

import { buildFlight, type ColumnMapping } from './flight/build';
import type { AnalyzedTable } from './flight/columns';
import { analyzeAsync } from './analyze/runner';
import { saveRecent } from './recents';
import type { RawFlight } from './flight/types';
import type { FlightAnalysis } from './analyze/types';

/** What a mapped file is called wherever it is shown, and stored under. */
export const MAPPED_FORMAT_LABEL = 'Generic CSV';

export interface MappedFlight {
  flight: RawFlight;
  analysis: FlightAnalysis;
  /** The logbook write, still in flight. A caller that needs the id — to put the flight
   *  back with the ones it was dropped alongside — awaits it; one that only needs the
   *  report on screen doesn't, and refreshes the logbook when it lands. Resolves to null
   *  where storage was unavailable, in which case the flight has no address. */
  save: Promise<string | null>;
  /** Flights the logbook forgot to make room for this one — see `IngestOutcome.forgotten`. */
  forgotten: Promise<string[]>;
}

/**
 * Build, analyse and remember a flight from a table plus the mapping the flyer confirmed.
 * Throws whatever `buildFlight` throws — a mapping with no usable time column, say — for
 * the caller to show in its own voice.
 */
export async function flightFromMapping(
  fileName: string,
  text: string,
  table: AnalyzedTable,
  mappings: ColumnMapping[],
): Promise<MappedFlight> {
  const flight = buildFlight({
    source: fileName,
    format: 'csv',
    formatLabel: MAPPED_FORMAT_LABEL,
    headers: table.headers,
    dataRows: table.dataRows,
    mappings,
    reported: table.reported,
  });
  const analysis = await analyzeAsync(flight);
  const save = saveRecent({
    name: fileName,
    formatLabel: MAPPED_FORMAT_LABEL,
    apogeeM: analysis.metrics.apogeeAltitude ?? null,
    maxVelocityMs: Number.isFinite(analysis.metrics.maxVelocity) ? analysis.metrics.maxVelocity : null,
    ...(flight.flownAt ? { flownAt: flight.flownAt } : {}),
    // The answer, kept with the file. This is what lets the flight be reopened, and joined
    // to a comparison by id, without asking for the mapping again.
    mapping: mappings.map((m) => ({ index: m.index, role: m.role, unit: m.unit })),
    text,
  });
  return { flight, analysis, save: save.then((r) => r.id), forgotten: save.then((r) => r.forgotten) };
}
