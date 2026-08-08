// What the file pickers offer a flyer, in one place.
//
// The two surfaces that take a flight file disagreed about this. The analyze page's picker
// filtered on a hand-typed `accept` list and the comparison's filtered on nothing at all, so
// the same file could be greyed out on one screen and selectable on the other. Worse, the
// hand-typed list had drifted behind the parsers: `.pf2` is PerfectFlite's own export format,
// `perfectflite.ts` returns 0.95 confidence on the extension alone, the corpus carries a .pf2
// fixture and the README names the logger — and a flyer who clicked "Choose a flight log file"
// with one in the folder watched the browser grey it out. A format the app advertises and
// parses is not one the picker may refuse.
//
// `accept` is a HINT, never a gate: every browser offers an "all files" escape and a drop
// bypasses it entirely, and `importFlight` is what actually decides. So the list exists to put
// the likely files first, and the rule for it is that it must never be NARROWER than what the
// app can read.

/** Extensions a parser recognises by name, plus the text and spreadsheet shapes the generic
 *  mapper reads. `.eeprom` and `.rff` are here because the raw download off an Altus Metrum
 *  or a MissileWorks RRC3 card is now a file Debrief reads — a picker that greys out a
 *  format the app parses is the same bug `.pf2` was. `lib/fileAccept.test.ts` holds this against the parsers and fails when a
 *  parser starts keying on an extension this list doesn't offer.
 *
 *  `.ork` is an OpenRocket design, and `.xtra` / `.bin` are raw downloads off an Entacore
 *  AIM and off an unidentified board. None of the three is a flight Debrief will analyse —
 *  but each is RECOGNISED, and answering "this is an AIM XTRA download, here is what to do
 *  with it" is a thing the app does that it cannot do for a file the picker greyed out. The
 *  rule is about what the app can READ, which is a wider set than what it turns into a
 *  flight; `.xtra` and `.bin` had been outside the list on the narrower reading, so the
 *  flyer most in need of that sentence was the one who could not reach it. */
export const FLIGHT_FILE_EXTENSIONS = [
  '.csv',
  // Debrief's own flight record. The picker must never be narrower than what the app can read,
  // and since 2026-08-08 the app both writes and reads this one — the `.pf2` bug this file's
  // header describes, pointing at a format we published ourselves.
  '.json',
  '.txt',
  '.log',
  '.tsv',
  '.dat',
  '.pf2',
  '.xlsx',
  '.eeprom',
  '.rff',
  '.ork',
  '.xtra',
  '.bin',
] as const;

const FLIGHT_FILE_MIME = [
  'application/json',
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** The `accept` attribute for every picker that takes a flight log. */
export const FLIGHT_FILE_ACCEPT = [...FLIGHT_FILE_EXTENSIONS, ...FLIGHT_FILE_MIME].join(',');
