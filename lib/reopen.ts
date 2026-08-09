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
import { flightTimeOrigin, highRateStream } from './parsers/blueraven';
import { readHighRateOnto } from './highRate';
import { buildFlight } from './flight/build';
import type { ColumnRole } from './flight/columns';
import type { ReportedValue } from './flight/types';
import type { RecentFlight } from './recents';

/** The stored record re-read as a flight, applying a hand-made mapping when it carries one
 *  and re-reading the device summary it was paired with when it carries one of those.
 *  Falls back to the mapper result — never to a wrong flight — if the stored mapping no
 *  longer builds (an edited backup, a role this build no longer has). */
export function importRecent(rec: Pick<RecentFlight, 'name' | 'text' | 'bytes' | 'mapping' | 'summaryText' | 'highRateText'>): ImportResult {
  // `bytes` where the row has them — a raw binary download's text is a lossy view of it,
  // so re-reading that text would hand the parser a different file than the one dropped.
  const base = withHighRate(withSummary(importFlight({ name: rec.name, text: rec.text, ...(rec.bytes ? { bytes: rec.bytes } : {}) }), rec.summaryText), rec.text, rec.highRateText);
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
      // **The file's own statement that it is not a recording, put back.** `lib/mapped.ts` passes
      // this on the way IN and this is the way BACK, so leaving it out means a flight Debrief made
      // up reopens as an ordinary flight — and the mapper is the only route such a file takes, so
      // it is the reopen that matters rather than an edge of one. The erasure went further than
      // the screen: `fileFacts` reads the rebuilt flight, a reopen is a save, and a save is a
      // replace in place, so one click on the logbook row would have deleted the stored
      // `synthetic` flag for good — after which the made-up apogee could wear the ★ that says
      // "highest of your remembered flights". Found by the pre-push review of the change that
      // introduced the field.
      ...(base.table.synthetic ? { synthetic: base.table.synthetic } : {}),
    });
    return withHighRate(withSummary({ kind: 'flight', flight, parser: MAPPED_BY_HAND, confidence: 1 }, rec.summaryText), rec.text, rec.highRateText);
  } catch {
    // The mapping doesn't fit this file any more — ask rather than guess.
    return base;
  }
}

/** Put a stored high-rate stream back onto a re-read flight, exactly as the original drop did.
 *
 *  Re-REDUCED here rather than restored from stored values, for the same reason `withSummary`
 *  re-reads the summary: the reduction is this feature's most likely thing to improve, and a flight
 *  saved today should get tomorrow's version of it without the flyer re-dropping two files.
 *
 *  **This is what makes the drop's own note true.** Without it the traces were on the report until
 *  the page reloaded, and a comparison built from ids — which re-reads every flight through this
 *  function — never had them, while the note said "its traces are on the channel explorer". A
 *  stream that no longer parses simply contributes nothing. */
function withHighRate(result: ImportResult, lowRateText: string, highRateText?: string): ImportResult {
  if (!highRateText || result.kind !== 'flight') return result;
  const stream = highRateStream(highRateText);
  if (!stream) return result;
  return { ...result, flight: readHighRateOnto(result.flight, stream, flightTimeOrigin(lowRateText) ?? 0) };
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
  // Keyed on source AND metric, the same rule `lib/ingest.ts` pairs on. A stored summary can
  // only ever meet `device` figures here — a prediction is not persisted — so the two keys agree
  // today; they are written the same way so they cannot disagree tomorrow.
  const key = (v: ReportedValue) => `${v.source}:${v.metric}`;
  const already = new Set((result.flight.reported ?? []).map(key));
  const added = figures.reported.filter((v) => !already.has(key(v)));
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
