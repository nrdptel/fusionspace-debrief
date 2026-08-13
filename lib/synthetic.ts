/**
 * Flights Debrief made up, and the sentence that says so.
 *
 * **Why this exists at all, and why it is the most dangerous file in the repo.** `ROADMAP.md`'s D10
 * needs a demonstration for every shipped capability, and three of them have no real public log to
 * demonstrate with: the column mapper on a file Debrief does not recognise, a saturated
 * accelerometer, and a staged flight logged on two devices. The private corpus cannot ship — no
 * blanket licence, and real names, launch-site GPS and device serials in the files — so the owner's
 * own suggestion in `ON-2` is the only lawful route: made-up logs.
 *
 * That collides head-on with the sharpest invariant in `MAINTAINING.md`. Debrief is a MEASUREMENT
 * instrument: every number it prints is a reading of a real recording. A synthesized flight
 * presented as a flight breaks that promise more seriously than any missing feature would — so the
 * rule D10 sets, and this module enforces, is that **a synthetic flight says so on every surface
 * that can carry it out of the app**, and is never counted in any accuracy or validation figure.
 *
 * **The label lives IN THE FILE, not on the button that offered it.** That is the load-bearing
 * decision here and it was not the obvious one. Attaching "this is a sample" at the sample path
 * would have been three lines — and it would have been a property of how the flight was OPENED
 * rather than of what the flight IS. Save the record, mail the CSV to a club-mate, drop it back in
 * six months later, and the claim has to survive all of it. A marker in the file's own metadata
 * block survives, because every one of those routes carries the file. `SYNTHETIC_KEY` is read by
 * the generic table reader exactly the way a logger's own summary block is.
 *
 * **Nothing here models anything.** The profile below is not a simulation and must never be
 * described as one: it is a piecewise curve chosen to exercise Debrief's readers — a boost, a
 * coast, an apogee, two descent rates and a landing — with numbers that look like a real flight so
 * the demonstration is legible. Debrief does not predict flights, and a file this module writes is
 * evidence of nothing.
 */

/** The metadata key a generated file carries, and the one the readers look for. */
export const SYNTHETIC_KEY = 'Synthetic';

/**
 * The sentence a synthetic flight carries, and the only place it is written.
 *
 * One constant because it has to appear identically in the file, on every surface, and in every
 * export — and because the asymmetry check in `lib/synthetic.test.ts` looks for exactly this
 * string. A second phrasing would still compile and would still be a lie somewhere.
 */
export const SYNTHETIC_NOTE =
  'This flight is SYNTHETIC — numbers Debrief made up to demonstrate what it can read. ' +
  'It is not a recording of anything, nothing here was flown, and no figure from it means anything ' +
  'about a real rocket.';

/**
 * The short form, for a surface too narrow for the sentence — a logbook row, a table cell, a
 * column header, a line drawn on a 1200×630 image.
 *
 * **A tag, never a replacement.** The sentence above is the claim; this points at it, exactly the
 * way the logbook's apogee tags point at the report's caveat. It is deliberately a single
 * shouted word rather than a polite phrase, because the surfaces that take it are the ones a
 * figure travels through on its way somewhere else — a spreadsheet, a clipboard, a screenshot —
 * where nothing else on screen will say it.
 */
export const SYNTHETIC_TAG = 'SYNTHETIC';

/**
 * The claim in one line, for a surface that needs the sentence but cannot spend a paragraph.
 *
 * **Written because the first cut spent 230 px of an 844 px phone on the same 200 characters
 * twice** — once at the top of the report and once above the readings. The second copy earns its
 * place (the readings grid is the part that gets screenshotted, printed and scrolled straight to,
 * and a screenshot does not carry the top of the page) but it does not earn a second full
 * paragraph, and a screen reader reading the identical sentence out twice is worse than the
 * duplication looks. `DESIGN.md` §4: when in doubt, tighten.
 */
export const SYNTHETIC_SHORT = `${SYNTHETIC_TAG} — Debrief made this flight up. Nothing here was flown.`;

/**
 * Does this flight say Debrief made it up?
 *
 * **Matched on the note, which is where the claim actually lives.** `lib/flight/build.ts` puts
 * `SYNTHETIC_NOTE` at the head of `notes` when a file carried the marker, and `toCanonical` /
 * `fromCanonical` write notes verbatim — so this is true of a flight read from the file, of the
 * same flight re-imported from a saved record, and of one restored from a logbook backup, without
 * any of those hops needing to know about a new field. A dedicated boolean on `RawFlight` would
 * have been dropped by four of the five persistence hops, which is the measurement that put the
 * claim in the notes in the first place.
 *
 * Exact equality rather than a substring: the sentence returned by `syntheticFromRows` is always
 * Debrief's own, never the file's, so nobody can weaken the claim by editing their copy — and
 * nobody can trip this by writing the word "synthetic" in a logbook note either.
 */
export function isSynthetic(flight: { notes?: readonly string[] }): boolean {
  return (flight.notes ?? []).some((n) => n === SYNTHETIC_NOTE);
}

/**
 * The column a table grows when one of its rows is a flight Debrief MADE UP, and what each row
 * says in it.
 *
 * **A COLUMN and not a caption row**, and the precedent is not rocketry's. `COMPETITION.md` row 41
 * measures how the instrumentation world marks un-measured data: NMEA 0183 puts simulation mode in
 * *every sentence* (GGA quality `8`, FAA mode `S`), HL7 v2 makes it a required field on *every
 * message* (MSH-11 Processing ID), and DICOM marks *every instance* `ORIGINAL` or `DERIVED`. The
 * shared principle is **per-record redundancy**: the claim lives in a field the consumer must
 * already parse to get the numbers at all. Both destinations here are a spreadsheet, where a
 * caption above the header is a cell that a sort moves away from the rows it was about; a per-row
 * value survives a sort, a filter, and a partial paste.
 *
 * That is also what settles the data CSV, which `ROADMAP.md`'s D10 had carried open as *"a column
 * or a decision"*: a CSV has no comment syntax every reader agrees on — a leading `#` breaks a
 * spreadsheet's column detection, which is why that export carries no build stamp either — so the
 * marker cannot ride in a header. A column is a thing every CSV reader already parses.
 *
 * **The header states a fact rather than asking a question, and that was a correction.** It read
 * `Real flight?` answered with `SYNTHETIC` / `flown` — a yes/no header answered with nouns, which
 * in the destination cannot be filtered on the question as posed and leaves a reader inferring the
 * polarity.
 *
 * Here rather than beside either caller, because the logbook's clipboard table and the flight's
 * data CSV are two surfaces answering one question, and two answers to one question is how a
 * caveat ends up phrased two ways.
 */
export const PROVENANCE_COLUMN = 'Provenance';

/** What one row says in that column. Never blank for a real flight: an empty cell reads as missing
 *  data rather than as a recording, and this column exists to be unambiguous. */
export function provenanceCell(synthetic: boolean | undefined): string {
  return synthetic ? `${SYNTHETIC_TAG} — made up by Debrief, not flown` : 'recorded';
}

/**
 * What that column says when a table's flights run along its COLUMNS and only some are made up.
 *
 * **The claim goes on whichever axis the flight varies along, and a wide export has two.** Every
 * sink above puts one flight on a row, so `provenanceCell` per row answers the whole question. A
 * channel export is the other shape: the comparison overlay writes one column per flight per
 * channel over a shared time base, so a row is an instant that several flights share and cannot
 * carry a single answer. There the per-flight cell is the column HEADER — `syntheticHeader` below —
 * and this sentence is the row-level pointer to it, so the claim still survives selecting the data
 * block without the header row, which is the failure `PROVENANCE_COLUMN` exists to prevent.
 *
 * It names no count. "2 of 5 are made up" would be a second thing to keep true when a flyer hides
 * a flight, and the tagged headers already answer *which*.
 */
export const PROVENANCE_MIXED =
  `${SYNTHETIC_TAG} — some of these columns are flights Debrief made up, not flown; ` +
  'each one is tagged in its own column header';

/**
 * A column header for data that came from a flight Debrief made up.
 *
 * **Because a column is the unit that travels.** `SampleTable` copies one channel to the clipboard
 * on its own, and a spreadsheet user selects a column before they select a block — so a made-up
 * column that carries the claim only in a *different* column arrives bare at the place it is read.
 * The tag rather than the sentence: a header is the narrowest cell in the file, and
 * `SYNTHETIC_TAG` is what `SYNTHETIC_SHORT` and the logbook's own cells already point with.
 */
export function syntheticHeader(label: string, synthetic: boolean | undefined): string {
  return synthetic ? `${SYNTHETIC_TAG} — ${label}` : label;
}

/**
 * The band a made-up flight wears on an IMAGE, and the one place its geometry and colours live.
 *
 * **A picture is skimmed, so the claim is a filled band rather than a line of text** — the reading
 * `FlightCard` arrived at first, and this is that decision shared rather than resembled. An image
 * is the sink where an unlabelled figure travels furthest: a `.png` or `.svg` of a plot goes into a
 * forum post or a cert document with no report around it, no file to re-read and no metadata block
 * anyone will open, so a caveat that lives beside the image on screen reaches none of that.
 *
 * §2's caveat wash, in the values THIS APP RENDERS — the v4 ramp, measured out of the built
 * stylesheet the same way `lib/design-system.test.ts`'s ramps are. The first cut carried Tailwind
 * 3's `#b45309` / `#fcd34d` and justified keeping them with "`e2e/analyze.spec.ts` reads the card's
 * band back by exact value, so converge when that assertion is next touched". **A pre-push review
 * checked: no such assertion exists.** The card walk reads pixels back by CHANNEL THRESHOLDS
 * (`r > 230 && g > 200 && b < 200`), which both the v3 and v4 borders satisfy — so the stated
 * blocker was imaginary and the divergence had no reason to survive a single commit. Converged
 * here. The ink is rated rather than assumed: `#bb4d00` on `#fffbeb` is 4.85:1, above AA.
 */
export const SYNTHETIC_BAND = {
  /** amber-50, the same wash §2 gives a caveat on screen. */
  fill: '#fffbeb',
  /** amber-300, as this app renders it (Tailwind 3's was `#fcd34d`). */
  edge: '#ffd230',
  /** amber-700 — 4.85:1 on the wash above. */
  ink: '#bb4d00',
} as const;

/**
 * What the band says over a figure drawn from N flights, of which `madeUp` were invented.
 *
 * **It names WHICH, not how many — the same answer `PROVENANCE_MIXED` gives, and for the same
 * reason.** The first cut counted ("1 of these 3 flights is one Debrief made up"), and a pre-push
 * review pointed out that the sibling export packed in the SAME `compare-debrief.zip` does the
 * opposite on purpose: that docblock says *"It names no count… the tagged headers already answer
 * which."* Two documents in one bundle phrasing one question two contradictory ways is the exact
 * failure this module exists to prevent, so the figure tags its LEGEND — `syntheticHeader` on each
 * made-up flight's series label — and the band points at it. A count also answers the less useful
 * half: a reader told one of three traces is fabricated, with no way to tell which, is worse off
 * than one told to read the legend.
 *
 * Returns null when there is nothing to say, so a figure of real flights is drawn exactly as it was
 * before this existed.
 */
export function syntheticBandLine(madeUp: number, total: number): string | null {
  if (madeUp <= 0) return null;
  // The singular sentence is about ONE flight, and a figure can hold several. Saying "Debrief made
  // this flight up" over a two-trace image is a false singular claim — caught by the same review,
  // and the plural branch below already existed one line away.
  if (madeUp >= total) {
    return total > 1
      ? `${SYNTHETIC_TAG} — all ${total} of these flights are ones Debrief made up, not flown.`
      : SYNTHETIC_SHORT;
  }
  return `${SYNTHETIC_TAG} — some of these flights are ones Debrief made up, not flown; each is tagged in the legend.`;
}

/** One point on a generated profile. Seconds from ignition, metres AGL, metres per second. */
export interface SynthSample {
  t: number;
  altitude: number;
  velocity: number;
}

/** The shape of a generated flight, in SI, before it is written to any format. */
export interface SynthFlight {
  /** Why this flight was made up — what capability it exists to demonstrate. */
  demonstrates: string;
  samples: SynthSample[];
}

/**
 * A plainly-shaped flight: boost, coast to apogee, drogue, main, landing.
 *
 * **Deterministic, and that is a requirement rather than a convenience.** The generated file is
 * committed so the app can serve it statically, and `lib/synthetic.test.ts` regenerates it and
 * compares byte for byte — which only works if this function has no clock and no randomness in it.
 * The same rule the workflow scripts follow, for the same reason.
 *
 * The piecewise curve, and the arithmetic is deliberately visible rather than tuned:
 *   0.00–1.60 s  motor burn, net 108.2 m/s² after gravity — burnout at 173.1 m/s, Mach 0.51 at sea
 *                level, so this is a subsonic flight and Debrief is never asked to claim otherwise
 *   1.60–19.2 s  coast under gravity alone, so apogee is where velocity crosses zero, not a
 *                number chosen here: 1,666.4 m, which is 5,467 ft
 *   apogee       drogue out, settling to 7.5 m/s down
 *   150 m AGL    main out, settling to 4.2 m/s down — a canopy a flyer would recognise as sane
 *   257.2 s      landing, and the record stops. 5,144 samples at 20 Hz, about 100 KB of CSV
 *
 * Every figure in that list was MEASURED off the generator rather than predicted from the
 * constants, because an earlier version of this comment did the arithmetic in its head and got
 * burnout wrong by 15 m/s.
 *
 * Drag is ignored on the way up, which is why the apogee is higher than a real motor of this
 * impulse would give. Said here rather than hidden: this is a demonstration curve, and a reader
 * who checks the physics should find the simplification stated rather than have to infer it.
 */
export function demoFlight(demonstrates: string): SynthFlight {
  const BURN = 1.6;
  const THRUST_ACCEL = 118;
  const G = 9.80665;
  const DROGUE = 7.5;
  const MAIN = 4.2;
  const MAIN_AT = 150;
  const DT = 0.05;

  const samples: SynthSample[] = [];
  let t = 0;
  let altitude = 0;
  let velocity = 0;

  // Boost, then coast. Apogee is where the coast crosses zero rather than a number chosen here.
  while (velocity >= 0 || altitude <= 0) {
    samples.push({ t, altitude, velocity });
    const a = t < BURN ? THRUST_ACCEL - G : -G;
    velocity += a * DT;
    altitude += velocity * DT;
    t += DT;
    if (t > 60) break; // a bound, never reached by the numbers above
  }

  // Descent: drogue to `MAIN_AT`, then main to the ground. Each leg is a constant rate, because a
  // demonstration of a descent-rate reading wants two legs that are obviously different.
  while (altitude > 0) {
    const rate = altitude > MAIN_AT ? DROGUE : MAIN;
    velocity = -rate;
    altitude = Math.max(0, altitude - rate * DT);
    t += DT;
    samples.push({ t, altitude, velocity });
  }

  return {
    demonstrates,
    samples: samples.map((s) => ({
      t: round(s.t, 2),
      altitude: round(s.altitude, 2),
      velocity: round(s.velocity, 2),
    })),
  };
}

function round(v: number, places: number): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

/**
 * Write a flight as a CSV the COLUMN MAPPER has to handle — which is the whole point of it.
 *
 * The column names are deliberately ones no parser claims: `Elapsed`, `Height`, `Rate`, in feet and
 * feet per second. A flyer keeping data in a spreadsheet writes headers like these, and Debrief's
 * answer to that is the mapper — a shipped capability with no demonstration until this file
 * existed. Choosing names a parser WOULD recognise would send it down an auto-detect path and
 * demonstrate the wrong thing.
 *
 * The metadata block ahead of the header is the same shape a logger's own summary block takes, so
 * it costs the reader nothing new: `AnalyzedTable.headerRow` already skips it.
 */
export function toMapperCsv(flight: SynthFlight): string {
  const M_TO_FT = 3.280839895;
  const lines: string[] = [
    `${SYNTHETIC_KEY},${JSON.stringify(SYNTHETIC_NOTE)}`,
    `Demonstrates,${JSON.stringify(flight.demonstrates)}`,
    '',
    'Elapsed,Height,Rate',
  ];
  for (const s of flight.samples) {
    lines.push(
      `${s.t.toFixed(2)},${(s.altitude * M_TO_FT).toFixed(1)},${(s.velocity * M_TO_FT).toFixed(1)}`,
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Is this file one Debrief made up?
 *
 * Reads the marker out of a file's metadata rows — the block ahead of the header that
 * `AnalyzedTable` already separates from the data. Returns the sentence to show, or null.
 *
 * **Matched on the KEY, not on the sentence**, so a flyer who edits the wording in their copy still
 * gets a labelled flight; and the sentence returned is always `SYNTHETIC_NOTE` rather than whatever
 * the file said, so nobody can weaken the claim by editing the file. Those two together are what
 * make this a marker rather than a message.
 */
export function syntheticFromRows(rows: string[][]): string | null {
  for (const row of rows) {
    if (row.length && row[0].trim().toLowerCase() === SYNTHETIC_KEY.toLowerCase()) {
      return SYNTHETIC_NOTE;
    }
  }
  return null;
}

/** How far into a file the marker may sit. See `syntheticFromText`. */
const METADATA_SCAN_LINES = 40;

/**
 * The same marker, read straight off a file's TEXT — for the route `syntheticFromRows` cannot see.
 *
 * **`syntheticFromRows` is called from exactly one place: `analyzeTable`, on the COLUMN-MAPPER
 * path.** A file a named parser recognises never goes through it, so a made-up flight written in a
 * format Debrief parses arrived with no marker at all and every surface downstream read it as a
 * recording — the whole labelling chain rests on `isSynthetic`, which reads a note only the mapper
 * path was adding. Measured 2026-08-13 by prepending the marker to three real fixtures: all three
 * still auto-detected, and all three came back `isSynthetic === false`.
 *
 * Not reachable before that date, because every generated file was a mapper file by construction.
 * It becomes reachable the moment a generated flight is written in a real logger's format, which is
 * what D10's staged pair needs — a pair cannot go through the mapper, which takes one file at a
 * time.
 *
 * **Only the leading lines**, because the marker rides in the metadata block ahead of the header by
 * definition, and a scan of a 100 MB log for a word that can only be in its first few rows is a
 * cost paid on every import for nothing. Deliberately generous: a logger's own summary block can be
 * long, and `AnalyzedTable.headerRow` already skips blocks of this size.
 */
export function syntheticFromText(text: string): string | null {
  const lines = text.split(/\r?\n/, METADATA_SCAN_LINES);
  return syntheticFromRows(lines.map((l) => l.split(',')));
}
