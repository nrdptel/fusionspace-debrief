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
import { summaryFigures } from './parsers/deviceSummary';
import { buildFlight } from './flight/build';
import type { ColumnRole } from './flight/columns';
import type { RecentFlight } from './recents';

/** The stored record re-read as a flight, applying a hand-made mapping when it carries one
 *  and re-reading the device summary it was paired with when it carries one of those.
 *  Falls back to the mapper result — never to a wrong flight — if the stored mapping no
 *  longer builds (an edited backup, a role this build no longer has). */
export function importRecent(rec: Pick<RecentFlight, 'name' | 'text' | 'bytes' | 'mapping' | 'summaryText'>): ImportResult {
  // `bytes` where the row has them — a raw binary download's text is a lossy view of it,
  // so re-reading that text would hand the parser a different file than the one dropped.
  const base = withSummary(importFlight({ name: rec.name, text: rec.text, ...(rec.bytes ? { bytes: rec.bytes } : {}) }), rec.summaryText);
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
    return withSummary({ kind: 'flight', flight, parser: MAPPED_BY_HAND, confidence: 1 }, rec.summaryText);
  } catch {
    // The mapping doesn't fit this file any more — ask rather than guess.
    return base;
  }
}

/** Put a stored device summary's figures back onto a re-read flight — beside Debrief's own
 *  read, never merged into it, exactly as the original drop did. The summary is re-READ here
 *  rather than restored from stored values, so a flight saved months ago is read by today's
 *  rules; a figure this build has learned to use appears without the flyer re-dropping
 *  anything. A summary that no longer parses simply contributes nothing. */
function withSummary(result: ImportResult, summaryText?: string): ImportResult {
  if (!summaryText || result.kind !== 'flight') return result;
  const figures = summaryFigures(summaryText);
  if (!figures) return result;
  const already = new Set((result.flight.reported ?? []).map((v) => v.metric));
  const added = figures.reported.filter((v) => !already.has(v.metric));
  const notes = figures.notes.filter((n) => !result.flight.notes.includes(n));
  if (!added.length && !notes.length && !figures.flownAt) return result;
  return {
    ...result,
    flight: {
      ...result.flight,
      ...(added.length ? { reported: [...(result.flight.reported ?? []), ...added] } : {}),
      ...(notes.length ? { notes: [...result.flight.notes, ...notes] } : {}),
      ...(result.flight.flownAt ?? figures.flownAt ? { flownAt: result.flight.flownAt ?? figures.flownAt } : {}),
    },
  };
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
