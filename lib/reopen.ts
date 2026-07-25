// Re-read a flight the logbook already holds.
//
// An auto-detected flight re-reads itself: the file names its own format, and `importFlight`
// finds it again every time. A flight the flyer mapped by hand does not — the file is a
// generic CSV and always will be, so the *answer* has to come back with it. The logbook
// stores that answer beside the text (`RecentFlight.mapping`), and this is the one place
// that puts the two together, so every surface that reopens a flight — the report, the
// comparison built from ids — gets the same one.
//
// Without it, the mapping was lost the moment the flight went into the logbook: reopening
// asked for it again, and a comparison built by id skipped the flight outright.

import { importFlight, type ImportResult } from './parsers';
import { buildFlight } from './flight/build';
import type { ColumnRole } from './flight/columns';
import type { RecentFlight } from './recents';

/** The stored record re-read as a flight, applying a hand-made mapping when it carries one.
 *  Falls back to the mapper result — never to a wrong flight — if the stored mapping no
 *  longer builds (an edited backup, a role this build no longer has). */
export function importRecent(rec: Pick<RecentFlight, 'name' | 'text' | 'mapping'>): ImportResult {
  const base = importFlight({ name: rec.name, text: rec.text });
  if (base.kind !== 'mapping' || !rec.mapping?.length) return base;
  try {
    const flight = buildFlight({
      source: rec.name,
      format: 'csv',
      formatLabel: 'Generic CSV',
      headers: base.table.headers,
      dataRows: base.table.dataRows,
      mappings: rec.mapping.map((m) => ({ index: m.index, role: m.role as ColumnRole, unit: m.unit })),
      reported: base.table.reported,
    });
    return { kind: 'flight', flight, parser: MAPPED_BY_HAND, confidence: 1 };
  } catch {
    // The mapping doesn't fit this file any more — ask rather than guess.
    return base;
  }
}

/** Stands in for the parser that read the file, because none did: the flyer did. Carries the
 *  same shape so every consumer of an `AutoResult` can read it without a special case. */
const MAPPED_BY_HAND = {
  id: 'mapped',
  label: 'Generic CSV',
  detect: () => 0,
  parse: () => {
    throw new Error('not a detector — a stored hand-made mapping');
  },
};
