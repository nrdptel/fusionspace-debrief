// Debrief's own flight record, read back in — the other half of `lib/canonical.ts`.
//
// Registered FIRST in `PARSERS`, and that position is load-bearing rather than tidy.
// `importFlight` keeps a match only on a strict `score > best.score`, so ties go to the
// earliest parser in the registry; a canonical parser appended at the end would lose every tie
// to an incumbent returning the same confidence. It anchors on a token no logger writes — the
// schema string, inside the head of the file — so returning 1 costs nothing in false positives.
//
// Without it the app cannot read what it writes. Measured 2026-08-08: all 14 registered parsers
// return 0 on a canonical record, so `importFlight` falls through to the generic table path and
// the column mapper reads the JSON as text — and the flight that comes back is a DIFFERENT
// flight, not a failed one.

import { CANONICAL_SCHEMA, CanonicalFormatError, fromCanonical } from '../canonical';
import { ParseGuidanceError, type Parser } from './types';

/** The whole-logbook backup's own marker (`lib/recents.ts` `EXPORT_KIND`). Not a flight, and
 *  since `.json` became a flight extension it is a file a flyer can now pick on the analyze
 *  page — so it is recognised and explained here rather than handed to the column mapper as a
 *  table of JSON, which is the same reason `deviceSummaryParser` and `openRocketParser` exist. */
const LOGBOOK_BACKUP = '"kind":"debrief-logbook"';

export const canonicalParser: Parser = {
  id: 'canonical',
  label: 'Debrief flight record',

  detect: (input) => {
    const head = input.text.slice(0, 400);
    if (head.includes(`"schema":"${CANONICAL_SCHEMA}"`)) return 1;
    return head.includes(LOGBOOK_BACKUP) ? 1 : 0;
  },

  parse: (input) => {
    if (input.text.slice(0, 400).includes(LOGBOOK_BACKUP)) {
      throw new ParseGuidanceError(
        'This is a Debrief logbook backup — every flight you had saved, not one flight. ' +
          'Restore it from “Recent flights” rather than opening it here, and they all come back at once.',
      );
    }
    try {
      const flight = fromCanonical(input.text);
      // The record names the file it was written from, which is the name a flyer will
      // recognise on a comparison. Keep it, and fall back to this file's own name for a
      // record that somehow carries none.
      return { ...flight, source: flight.source || input.name };
    } catch (e) {
      // A file that says it is a flight record and then isn't gets the reason, not the column
      // mapper. `ParseGuidanceError` is what `importFlight` surfaces to the flyer directly.
      if (e instanceof CanonicalFormatError) throw new ParseGuidanceError(e.message);
      throw e;
    }
  },
};
