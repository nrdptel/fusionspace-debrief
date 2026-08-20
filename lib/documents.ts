/**
 * Every document a flyer KEEPS, in one list.
 *
 * **Why this exists, and why its absence was the expensive thing.** The 2026-08-09 surface audit
 * traced what happens to a flight on its way out of the app and found **26 sinks across 6 call
 * sites**, each a separate `download(...)` written where it was needed. `lib/download.ts` is the
 * only thing they share, and it is the wrong chokepoint: it receives an already-serialized `Blob`,
 * so it cannot see a flight, let alone a fact about one.
 *
 * That is fine until something has to be true of EVERY document. Two things already are, and both
 * were being checked against a list hand-kept inside a test file:
 *
 *   - every kept document names the build that wrote it (`lib/buildInfo.ts`, D11 slice 4);
 *   - a flight Debrief made up says so, everywhere it can go (`lib/synthetic.ts`, D10 slice 3).
 *
 * A list in a test cannot fail for the thing it is meant to catch. Adding a seventh export and
 * forgetting to add it to the test leaves the test green and the document unstamped — which is
 * exactly the staleness `ROADMAP.md`'s D10 names when it asks for a check that "enumerates the
 * export surfaces from the same list the exporters are registered in".
 *
 * This is that list. The report's download strip renders from it, so a document that is not here
 * has no button, and a document with a button is checked. Two lists that must agree became one.
 *
 * **What is deliberately NOT here**, so the omissions read as decisions rather than gaps:
 *
 *   - the plot `.png`/`.svg` and the share card — images built from `analysis.series`, not from a
 *     flight, so neither a build stamp nor a sentence has anywhere to live in them;
 *   - the share LINK — `SharePayload` is a name plus the raw file text, and the text is the
 *     document; it carries whatever the file carried;
 *   - the `.zip` bundle — its entries are documents from this list, so it inherits their answers
 *     rather than needing its own;
 *   - `.gpx`/`.kml` — track exports built from GPS fixes. **The stated reason used to be "no header
 *     a sentence could ride in", and since 2026-08-20 that is FALSE of the GPX**: it carries
 *     `<metadata><desc>`, a `<trk><desc>`, a `<src>` naming the instrument, and — after D12 slice 5
 *     — a `<sat>` and `<hdop>` on every point that states them. The real obstacle is the SHAPE of
 *     this registry, not the format: every entry here is `build(flight, analysis, sys, ctx)`, and a
 *     track export needs the ground track — `lat`, `lon`, `landingIndex`, `landed` — which is
 *     derived in `components/GroundTrack.tsx` and is not a fact about the flight. Admitting them
 *     means either computing the track inside the registry or giving `ctx` a `recovery` member the
 *     five existing documents would carry and ignore.
 *
 *     **This matters beyond tidiness: D12's *done when* asks for a check that enumerates the GPS
 *     sinks "from the same registry the exporters are registered in", and it cannot be written
 *     while the two exports whose whole purpose is the coordinate sit outside the only registry
 *     there is.** Measured 2026-08-20: 18 `download(` call sites across 8 files, of which exactly
 *     one routes through this list;
 *   - the comparison's documents — built from a `CompareFlight`, which is a different shape with a
 *     different set of facts about it. They need their own registry when something has to be true
 *     of all of them; inventing one before then would be a list with no check behind it.
 */

import type { RawFlight } from './flight/types';
import type { FlightAnalysis } from './analyze/types';
import type { UnitChoice } from './display';
import { summaryText, summaryMarkdown, summaryHtml, analyzedDataCsv, analysisJson } from './report';
import type { ReportMeta, RecoveryFigures } from './report';
import { toCanonical } from './canonical';
import type { CanonicalGrouping } from './canonical';

/**
 * Everything a document may want beyond the flight itself.
 *
 * **One bag rather than six signatures, and that is what makes the registry possible at all.** The
 * exporters genuinely differ: the prose documents take the flyer's own label and notes and the
 * recovery figures they typed, the `.html` also takes rendered chart SVGs, and the canonical record
 * takes the grouping statement and no units at all. A registry whose `build` took only
 * `(flight, analysis, sys)` would compile and would silently drop the label, the recovery figures
 * and the grouping from every saved document — a regression with no error message. Every field is
 * optional, so a CHECK can call any exporter with nothing and get a valid document.
 */
export interface DocumentContext {
  analyzedAt?: number;
  meta?: ReportMeta;
  recovery?: RecoveryFigures;
  /** Rendered chart SVGs, for the one document that inlines them. */
  figures?: { title: string; svg: string }[];
  /** The flyer's statement that this file is one of several recordings of one flight. */
  grouping?: CanonicalGrouping;
}

/** One document, and everything true of it that a check needs to know. */
export interface KeptDocument {
  /** How it is named in a test failure and on the button. */
  id: 'txt' | 'md' | 'html' | 'csv' | 'json' | 'record';
  /** The button's words on the report's export strip. */
  label: string;
  /** The extension the file gets, with its dot. */
  ext: string;
  /** The button's `title` — what this document is for, in the flyer's terms. */
  title: string;
  /** Build it. `ctx` is optional throughout so a check can call every exporter with nothing. */
  build: (flight: RawFlight, analysis: FlightAnalysis, sys: UnitChoice, ctx?: DocumentContext) => string;
  /** The MIME type its Blob takes. */
  mime: string;
  /**
   * Whether this document carries prose Debrief writes — a build stamp, a caveat, the sentence
   * saying a flight is synthetic.
   *
   * **`false` for the data CSV, and that is a decision with a reason rather than an oversight.**
   * A CSV has no comment syntax every reader agrees on: a leading `#` breaks a spreadsheet's
   * column detection, and this export exists to be pasted into one. D11 slice 4 made the same
   * call for the build stamp and put it on the `.json` that ships beside it in the bundle. The
   * checks assert the ABSENCE here, so the exemption is stated once and cannot drift into being
   * forgotten.
   */
  carriesProse: boolean;
}

export const KEPT_DOCUMENTS: KeptDocument[] = [
  {
    id: 'txt',
    label: 'Save .txt',
    ext: '.txt',
    mime: 'text/plain',
    title: 'Download the summary as a text file',
    build: (f, a, s, c) => summaryText(f, a, s, c?.analyzedAt, c?.meta, c?.recovery),
    carriesProse: true,
  },
  {
    id: 'md',
    label: 'Save .md',
    ext: '.md',
    mime: 'text/markdown',
    title: 'Download a Markdown report — metrics and events as tables, ready for a write-up or a forum post',
    build: (f, a, s, c) => summaryMarkdown(f, a, s, c?.analyzedAt, c?.meta, c?.recovery),
    carriesProse: true,
  },
  {
    id: 'html',
    label: 'Save .html',
    ext: '.html',
    mime: 'text/html',
    title:
      'Download a self-contained HTML report — numbers, events, the logger cross-check and the charts inline, in one file you can open, print, email or archive anywhere (nothing uploaded)',
    build: (f, a, s, c) => summaryHtml(f, a, s, c?.analyzedAt, c?.meta, c?.recovery, c?.figures),
    carriesProse: true,
  },
  {
    id: 'csv',
    label: 'Save .csv',
    ext: '.csv',
    mime: 'text/csv',
    title:
      "Download the whole flight as CSV — Debrief's derived series (altitude, velocity, acceleration, Mach, dynamic pressure) plus every channel the logger recorded (battery, temperature, GPS, tilt …)",
    build: (f, a, s) => analyzedDataCsv(f, a, s),
    carriesProse: false,
  },
  {
    id: 'json',
    label: 'Save .json',
    ext: '.json',
    mime: 'application/json',
    title:
      'Download the full analysis — metrics, events and provenance — as structured JSON, in the chosen units, for a script or another tool',
    build: (f, a, s, c) => analysisJson(f, a, s, c?.analyzedAt, c?.meta, c?.recovery),
    carriesProse: true,
  },
  {
    id: 'record',
    label: 'Save record',
    ext: '-record.json',
    mime: 'application/json',
    // The canonical record is the measurement, not the reading — it takes no units and no
    // analysis, and re-analyses on the way back in. The signature is shared so one list can hold
    // it; the extra arguments are ignored, which is the honest shape rather than a special case.
    title:
      'Download the flight record — every sample of every channel the logger recorded, in SI units, in one file Debrief can open again as this same flight. Unlike the analysis .json this is the measurement rather than the read, so re-opening it re-analyses from scratch. It carries everything the log did, including any GPS position.',
    build: (f, _a, _s, c) => toCanonical(f, c?.grouping ? { grouping: c.grouping } : undefined),
    carriesProse: true,
  },
];

/** Every document that must carry Debrief's own prose — the ones a stamp or a caveat can ride in. */
export function documentsCarryingProse(): KeptDocument[] {
  return KEPT_DOCUMENTS.filter((d) => d.carriesProse);
}
