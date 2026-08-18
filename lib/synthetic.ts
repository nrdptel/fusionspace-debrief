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
  /**
   * What an ACCELEROMETER aboard would have written, m/s², where the flight has one.
   *
   * Separate from the acceleration implied by `velocity` on purpose, and that separation is the
   * whole of `saturatedFlight`: a railed sensor and an honest barometer disagree, and a file where
   * they cannot disagree cannot demonstrate the disagreement.
   */
  accel?: number;
  /**
   * Where a GPS receiver aboard would have put the airframe, decimal degrees, where the flight has
   * one — and how many satellites it had in the solution.
   *
   * **`sats` is the load-bearing one and the reason these are here at all.** A coarse-GPS flight is
   * not a flight with a worse position; it is a flight whose receiver SAYS how good each fix was,
   * and Debrief's answer to that (`lib/gpsFix.ts`) is what the sample built on this exists to
   * demonstrate. A generated track with a constant satellite count would demonstrate nothing the
   * front door's first sample does not already show.
   *
   * Optional together, so the flights that had none before this existed write no GPS column at all
   * and their committed bytes do not move.
   */
  lat?: number;
  lon?: number;
  sats?: number;
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

/** Feet per metre. The generated files are written in feet, because every logger whose column
 *  shape they borrow writes feet by default. */
const M_TO_FT = 3.280839895;

/** Standard gravity, for writing an accelerometer's column in g. */
const G0 = 9.80665;

/**
 * A flight whose ACCELEROMETER RAN OUT OF RANGE, and whose barometer did not.
 *
 * **What this exists to demonstrate is a REFUSAL, which is the hardest thing in the app to show a
 * stranger.** Debrief detects a flat top at an accelerometer's peak — a real boost rounds over its
 * maximum, because the rocket loses mass through the burn, so a plateau held dead flat at the
 * highest value in the record is a sensor against its stop — and says the reported maximum is a
 * floor rather than the truth. No public log in the repo rails, and the private corpus cannot ship,
 * so until this file the one shipped behaviour that best expresses the measurement invariant had no
 * demonstration at all.
 *
 * **The file contains its own evidence, and that is what makes it a demonstration rather than an
 * assertion.** The boost curve peaks at 24 g; the accelerometer column is that curve CLIPPED at
 * 16 g, a full-scale limit a flyer will recognise; and the height and speed columns are integrated
 * from the UNCLIPPED curve, because a barometer does not saturate when an accelerometer does. So
 * the numbers in the file really are inconsistent in the way Debrief says they are — a reader who
 * checks can see that the speed column could not have come from the acceleration column.
 *
 * **A mapper file, not a logger's format, and that is a choice this time rather than a constraint.**
 * `stagedPair` had to borrow a real logger's column names because a pair cannot go through the
 * mapper. One file can, the mapper offers `Acceleration (total)` as a role, and a file that borrows
 * nothing makes no claim about any device — so this one borrows nothing.
 *
 * The curve, and the arithmetic is deliberately visible:
 *   3 s on the pad  at rest, and the accelerometer reads 1 g there — which is what an accelerometer
 *                DOES at rest: it measures proper acceleration, so a board sitting on the rail
 *                reads one gravity and a board in free fall reads zero. Without these rows Debrief
 *                says *"the record starts too close to liftoff to read the accelerometer's resting
 *                value, and loggers differ on whether that channel already has gravity removed"* —
 *                a true caveat about a file that need not have earned it, standing between a
 *                stranger and the one sentence this sample exists to show them
 *   0.00–1.20 s  boost. The true acceleration is a half-sine to 24 g and back, which is a SHAPE
 *                chosen to round over its peak the way a real boost does — not a thrust model, and
 *                it must never be described as one. The recorded column is `min(that, 16 g)`
 *   coast        0 g. Drag is ignored here as it is in `demoFlight`, so an unpowered airframe is in
 *                free fall and an accelerometer aboard reads nothing
 *   then         apogee, drogue, main, landing — the same legs `demoFlight` uses, so a reader
 *                comparing the two samples sees one difference and not five. Under a canopy at a
 *                steady rate the net acceleration is zero again, so the column returns to 1 g
 */
export function saturatedFlight(demonstrates: string): SynthFlight {
  const PAD = 3;
  const BURN = 1.2;
  /** What the airframe actually pulled, at the top of the half-sine. */
  const TRUE_PEAK_G = 24;
  /** Where the part stops. ±16 g is an ordinary full-scale limit, which is the point of choosing
   *  it: a flyer reading "about 16 g" beside "the sensor hit its limit" should recognise both. */
  const RAIL_G = 16;
  const DROGUE = 7.5;
  const MAIN = 4.2;
  const MAIN_AT = 150;
  const DT = 0.05;

  const samples: SynthSample[] = [];
  let t = 0;
  let altitude = 0;
  let velocity = 0;

  while (velocity >= 0 || altitude <= 0) {
    // The half-sine is the TRUE thrust acceleration, before gravity. What a sensor aboard would
    // read is the same thing: an accelerometer measures the airframe's specific force, so it reads
    // the thrust term and not the gravity term.
    const thrust = t < BURN ? TRUE_PEAK_G * G0 * Math.sin((Math.PI * t) / BURN) : 0;
    samples.push({
      t,
      altitude,
      velocity,
      // Clipped, and clipped to EXACTLY the rail — a sensor at its stop returns its stop, and the
      // detector looks for a run of samples within a tight band of the record's maximum.
      accel: Math.min(thrust, RAIL_G * G0),
    });
    velocity += (thrust - G0) * DT;
    altitude += velocity * DT;
    t += DT;
    if (t > 60) break; // a bound, never reached by the numbers above
  }

  // Down, on the same two legs `demoFlight` uses. The accelerometer reads free fall under a canopy
  // — a steady descent is no net specific force beyond the drag holding it up, which is 1 g — so
  // the column continues rather than stopping, the way a real record does.
  while (altitude > 0) {
    const rate = altitude > MAIN_AT ? DROGUE : MAIN;
    velocity = -rate;
    altitude = Math.max(0, altitude - rate * DT);
    t += DT;
    samples.push({ t, altitude, velocity, accel: G0 });
  }

  // On the rail, at 1 g, ahead of everything. Prepended rather than integrated into the loop above
  // so the boost arithmetic stays readable as boost arithmetic.
  const pad: SynthSample[] = [];
  for (let i = 0; i < Math.round(PAD / DT); i++) {
    pad.push({ t: i * DT, altitude: 0, velocity: 0, accel: G0 });
  }

  return {
    demonstrates,
    samples: [...pad, ...samples.map((s) => ({ ...s, t: s.t + PAD }))].map((s) => ({
      t: round(s.t, 2),
      altitude: round(s.altitude, 2),
      velocity: round(s.velocity, 2),
      accel: round(s.accel ?? 0, 3),
    })),
  };
}

/**
 * A GPS tracker's recording of a flight, where the fix quality VARIES — the sample D10's last
 * capability needs.
 *
 * **What this exists to demonstrate, and it is a capability rather than a number.** Debrief reads
 * what a receiver said about each fix and acts on it: a position solved in three dimensions keeps
 * its height, one solved in two keeps its position and loses the height it assumed, and a row with
 * no fix at all keeps neither, because a receiver that has lost lock repeats its last position
 * rather than saying nothing. That rule is `lib/gpsFix.ts`, it is one rule across four logger
 * families, and until this file existed **nothing a visitor could open exercised it** — every
 * corpus recording carrying a position is locked throughout, and the front door's samples carry no
 * latitude or longitude at all.
 *
 * **Nothing here is modelled and the satellite profile least of all.** The count below is a
 * piecewise curve chosen to put the file through each branch of that rule in an order a flyer would
 * recognise — good on the pad, degrading through the climb, lost across apogee, recovering under
 * the canopy. Real receivers do lose satellites under high dynamics; this file is not evidence that
 * they do, and no figure read off it means anything about a real flight.
 *
 * A GPS-only recording, like the trackers this format belongs to: no barometer and no
 * accelerometer, so the receiver's own altitude is the only height there is — itself part of the
 * demonstration, because that is the case where a two-dimensional fix costs a flyer the height
 * rather than merely a cross-check.
 *
 * Deterministic, with no clock and no randomness, because `lib/samples.test.ts` regenerates the
 * committed file and compares it byte for byte.
 *
 * The legs, and the arithmetic is deliberately visible rather than tuned:
 *   integrated    at 0.05 s on `demoFlight`'s own constants, so this is the SAME flight that
 *                 sample flies — apogee 1,666 m, which is 5,466 ft
 *   sampled       at 1 Hz, which is a tracker's rate and part of what "coarse" means
 *   drift         a steady 6 m/s wind from the west for the whole flight, so the track runs
 *                 downrange and the recovery view has a bearing to state
 *   satellites    9 on the rail · 8 through the boost, the coast, APOGEE and the first minute of
 *                 the drogue · 3 for fifteen samples mid-descent, which is a TWO-dimensional fix:
 *                 position kept, height dropped · 0 for ten samples just after it, a real dropout
 *                 where neither survives · 8 again to the ground. All three grades, in one file.
 *
 * **Where the degradation sits took FOUR drafts, and the three that were thrown away are worth more
 * than the file.** Every reading a GPS-only log produces rests on its altitude channel, so a hole
 * anywhere in that channel corrupts something — the only question is what.
 *
 *  1. The first integrated at the SAMPLE rate: a one-second Euler step over a 118 m/s² boost
 *     overshot apogee to 2,604 m against the same constants' 1,666 m. A coarse RECORDING had
 *     become a different FLIGHT.
 *  2. The second keyed the lost-lock window on an ALTITUDE, so on a taller flight it covered a
 *     third of the descent — 133 samples of 388 with no fix, where the intent was "a few".
 *  3. The third degraded the fix ACROSS APOGEE, and it would have shipped a lie: the heights either
 *     side of the peak are dropped, correctly, so the highest survivor became the GPS apogee and a
 *     5,466 ft flight reported **1,312 ft** with neither `apogeeIsFloor` nor `altitudeUnproven`
 *     firing.
 *  4. The fourth moved it to the BOOST — physically the most defensible place, since that is where
 *     a receiver really does struggle — and broke the other end. With the boost's heights withheld,
 *     LIFTOFF is detected at the first surviving height: the report read **"Liftoff 11 s,
 *     2,653 ft"** on a file whose own first rows sit at 0 ft, and time-to-apogee (13 s against
 *     19.25), flight time and the main-deploy altitude all inherited it. Caught by a pre-push
 *     review, which is the second time this generator has been saved by one.
 *
 * So the receiver is locked wherever a reading is TAKEN — the pad, liftoff, the climb, apogee, the
 * main deploy and the ground — and the degradation sits in the middle of the drogue descent, where
 * it costs a stretch of a constant-rate fall and nothing a flyer quotes. **A demonstration file may
 * not lie**, however good a demonstration the lie would make.
 *
 * Both defects draft 3 and draft 4 exposed are real and FILED rather than papered over: Debrief
 * does not flag a GPS apogee resting on fewer solutions than its trace suggests, and it does not
 * flag a liftoff altitude that is not near the pad.
 */
export function coarseGpsFlight(demonstrates: string): SynthFlight {
  // **A four-second burn, not `demoFlight`'s 1.6 s, and the reason is the sample rate.** A 1 Hz
  // receiver takes two samples across a 1.6 s boost and cannot see it: Debrief read burnout at 8 s
  // against a burn that ended at 1.6, because a velocity differenced from one-second altitude steps
  // peaks well after the real one. That is an honest consequence of coarse sampling and a wrong
  // number on a demonstration file, which is a thing this file may not carry. Four seconds is four
  // samples of boost, which the trace can resolve — and it is an ordinary burn for the size of
  // motor a flyer puts a GPS tracker on.
  const BURN = 4;
  const THRUST_ACCEL = 50;
  const G = 9.80665;
  const DROGUE = 7.5;
  const MAIN = 4.2;
  const MAIN_AT = 150;
  /** The integration step — `demoFlight`'s, deliberately. */
  const DT = 0.05;
  /** What the receiver WRITES: one fix a second. */
  const SAMPLE_EVERY = 1;
  /** Metres per degree of latitude — the same figure `lib/gps.ts` projects with. */
  const M_PER_DEG_LAT = 111320;
  /** A pad on a round meridian, plainly nobody's launch site: no real club's coordinates are
   *  published by this repo. */
  const LAT0 = 40;
  const LON0 = 0;
  /** A steady westerly, m/s. Not a wind model — one number, applied for the whole flight. */
  const WIND_E = 6;

  // **Integrated at 0.05 s and SAMPLED at 1 Hz, which is the correction that matters here.** The
  // first cut integrated at the sample rate, and a one-second Euler step over a 118 m/s² boost
  // overshot apogee to 2,604 m against `demoFlight`'s 1,666 m for the identical constants — a
  // coarse RECORDING became a different FLIGHT. A tracker samples a real flight slowly; it does
  // not fly a slower one.
  const fine: { t: number; altitude: number; velocity: number; east: number }[] = [];
  let t = 0;
  let altitude = 0;
  let velocity = 0;
  let east = 0;
  fine.push({ t, altitude, velocity, east });
  for (let guard = 0; guard < 20_000; guard++) {
    const ascending = velocity >= 0 || altitude <= 0;
    if (ascending) {
      velocity += (t < BURN ? THRUST_ACCEL - G : -G) * DT;
    } else {
      velocity = altitude > MAIN_AT ? -DROGUE : -MAIN;
    }
    altitude = Math.max(0, altitude + velocity * DT);
    east += WIND_E * DT;
    t += DT;
    fine.push({ t, altitude, velocity, east });
    if (altitude <= 0 && t > BURN) break;
  }

  const apogeeIdx = fine.reduce((best, p, i) => (p.altitude > fine[best].altitude ? i : best), 0);
  const apogeeT = fine[apogeeIdx].t;

  /**
   * How many satellites the receiver had, by PHASE rather than by height.
   *
   * **The first cut keyed the lost-lock window on an altitude**, and on a flight that reached
   * higher than expected that covered a third of the descent — 133 of 388 samples with no fix,
   * where the intent was "a few across the top". Time from apogee says what was meant, and cannot
   * be widened by the flight getting taller.
   */
  const samples: SynthSample[] = [];
  const step = Math.round(SAMPLE_EVERY / DT);
  for (let i = 0; i < fine.length; i += step) {
    const p = fine[i];
    samples.push({
      t: Number(p.t.toFixed(2)),
      altitude: p.altitude,
      velocity: p.velocity,
      // A pure translation east, small enough that a flat-earth projection is exact to millimetres
      // — the same approximation `lib/gps.ts` makes, for the same reason.
      lat: LAT0,
      lon: LON0 + p.east / (M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180)),
    });
  }

  /**
   * The satellite count, assigned by SAMPLE INDEX rather than by elapsed time.
   *
   * **Float drift is why.** The integrator accumulates `t += 0.05`, so `fine[100].t` is
   * 4.99999999999999 and a rule written `t < 5` catches a row whose own written timestamp reads
   * `5.00` — the committed bytes then rest on the drift rather than on the stated rule, and the
   * count in the commit message and the count in the code disagree by one. An index is exact.
   */
  const apogeeSample = samples.reduce((best, p, i) => (p.altitude > samples[best].altitude ? i : best), 0);
  /** Where the drogue's degraded stretch sits, in samples after apogee. */
  const TWO_D_FROM = apogeeSample + 60;
  const TWO_D_TO = apogeeSample + 75;
  const NO_FIX_FROM = apogeeSample + 80;
  const NO_FIX_TO = apogeeSample + 90;
  samples.forEach((p, i) => {
    p.sats = i >= NO_FIX_FROM && i < NO_FIX_TO ? 0 : i >= TWO_D_FROM && i < TWO_D_TO ? 3 : i < 3 ? 9 : 8;
  });

  return { demonstrates, samples };
}

/** One recording of a staged launch, and everything that separates it from the other one. */
export interface SynthStage {
  /** Which part of the launch this board was bolted to. Written into the file as its own metadata
   *  row, so the two files are told apart by reading either one rather than by their names. */
  stage: 'booster' | 'sustainer';
  /** Seconds this board recorded before the launch, on its own clock.
   *
   *  **The two differ, and that difference is the whole demonstration.** `alignStages` puts N
   *  recordings on one clock by their own detected liftoffs; give both boards the same lead-in and
   *  the offsets come out equal, so a composite would look exactly like two files that needed no
   *  aligning at all. Two flyers arming two boards do not press the buttons together. */
  padS: number;
  flight: SynthFlight;
}

/**
 * A staged launch, as the two boards aboard it would have recorded it — and the only thing that
 * gives `/stitch` a demonstration.
 *
 * **Why this cannot be a mapper file, which is the constraint that shaped it.** Every other
 * generated file goes through the column mapper, which takes ONE file at a time
 * (`ingestFiles` sets a mappable file aside in a multi-file drop and never asks about it). A pair
 * is two files by definition, so both have to be in a shape a named parser claims — which is why
 * `importFlight` had to learn to carry the marker in the first place.
 *
 * **The column names are an Eggtimer Classic's, and no Eggtimer wrote these files.** Said plainly
 * here and again in the file's own metadata block, because it is the one claim in this module that
 * could be read as a provenance claim. The parsers in this repo detect on the SHAPE of a header
 * row — `T`, `Alt`, `VRaw`, `VFilt` — not on a brand string, a serial number or a firmware banner,
 * and none of those appears in what `toLoggerCsv` writes. What the app reports is that it read the
 * file with the Eggtimer reader, which is true.
 *
 * **Nothing marks the separation, and that is honest rather than unfinished.** With drag ignored
 * (as it is in `demoFlight`, and said there), a booster that has separated and a sustainer that
 * has not yet lit follow the same path — so there is nothing in either curve at the moment they
 * part, and inventing a step in one of them would be modelling. `lib/composite.ts` refuses to draw
 * a separation mark for its own measured reason; a generated pair that implied one would be
 * feeding that surface exactly what it declines to say.
 *
 * The piecewise curve. Both recordings run the SAME loop and the same constants — the second burn
 * is the only branch — so the segment the two boards shared is identical between the files by
 * construction rather than by a promise:
 *   0.00–1.60 s  first-stage burn, net 45.2 m/s² after gravity
 *   1.60–6.00 s  coast, both boards still recording the same airframe
 *   6.00–8.50 s  SUSTAINER ONLY: second burn, net 80.0 m/s². Kept subsonic on purpose, the same
 *                choice `demoFlight` makes and for the same reason
 *   then         each coasts to its own apogee. The booster comes down on one leg (a streamer, at
 *                18 m/s); the sustainer on two (drogue 20 m/s, main at 150 m AGL at 5 m/s)
 *
 * Every figure a comment or a `shows` line quotes about these two was MEASURED off the generator,
 * never predicted from the constants above — `lib/synthetic.test.ts` pins the ones that matter.
 */
export function stagedPair(): SynthStage[] {
  return [
    {
      stage: 'booster',
      // Armed first, and by the larger margin: the booster is the bottom of the stack and the last
      // thing anyone can reach once the rocket is on the rail.
      padS: 12,
      flight: {
        demonstrates: 'the booster half of a staged launch, on its own altimeter',
        samples: stageSamples('booster'),
      },
    },
    {
      stage: 'sustainer',
      padS: 3.5,
      flight: {
        demonstrates: 'the sustainer half of the same staged launch, on a second altimeter',
        samples: stageSamples('sustainer'),
      },
    },
  ];
}

function stageSamples(stage: 'booster' | 'sustainer'): SynthSample[] {
  const G = 9.80665;
  const DT = 0.05;
  const BURN1_S = 1.6;
  const BURN1_ACCEL = 55;
  const IGNITE2_S = 6;
  const BURN2_S = 2.5;
  const BURN2_ACCEL = 89.8;
  /** One leg down for the booster — a streamer, which is what most of them come home on. Its
   *  single rate against the sustainer's two is a second thing the pair demonstrates. */
  const BOOSTER_RATE = 18;
  const DROGUE = 20;
  const MAIN = 5;
  const MAIN_AT = 150;

  const samples: SynthSample[] = [];
  let t = 0;
  let altitude = 0;
  let velocity = 0;

  // Up. The branch is the ONLY difference between the two recordings, so everything before
  // `IGNITE2_S` is the same arithmetic on both — see the docblock.
  while (velocity >= 0 || altitude <= 0) {
    samples.push({ t, altitude, velocity });
    const lit =
      t < BURN1_S
        ? BURN1_ACCEL
        : stage === 'sustainer' && t >= IGNITE2_S && t < IGNITE2_S + BURN2_S
          ? BURN2_ACCEL
          : 0;
    velocity += (lit - G) * DT;
    altitude += velocity * DT;
    t += DT;
    if (t > 120) break; // a bound, never reached by the numbers above
  }

  // Down, at whatever this stage comes home under.
  while (altitude > 0) {
    const rate = stage === 'booster' ? BOOSTER_RATE : altitude > MAIN_AT ? DROGUE : MAIN;
    velocity = -rate;
    altitude = Math.max(0, altitude - rate * DT);
    t += DT;
    samples.push({ t, altitude, velocity });
  }

  return samples.map((s) => ({
    t: round(s.t, 2),
    altitude: round(s.altitude, 2),
    velocity: round(s.velocity, 2),
  }));
}

/**
 * Write one stage's recording as a CSV a NAMED PARSER claims — the opposite of `toMapperCsv`, and
 * for a reason that is a constraint rather than a preference (see `stagedPair`).
 *
 * **The clock starts at power-on, not at the launch**, which is what gives the two files different
 * liftoff times and therefore gives `alignStages` something to do. `padS` seconds of a board
 * sitting on the rail come first, at rest on its own pad datum.
 *
 * The metadata block says three things a reader opening the raw file is owed: that Debrief made it
 * up, which stage it is, and that the column names are borrowed. `AnalyzedTable.headerRow` and
 * every named parser's own header scan already skip a block this shape, so it costs the readers
 * nothing.
 */
export function toLoggerCsv(rec: SynthStage): string {
  return loggerCsv(rec.flight, rec.padS, rec.stage);
}

/**
 * The same file for a flight that is not part of a staged pair — one board, one launch.
 *
 * **Written for the design-overlay sample, and the reason it needs a PARSING file is the point.**
 * Every other synthesized sample lands in the column mapper, so `results.length === 0` and a design
 * dropped beside one has nothing to pair with: `lib/ingest.ts`'s one-of-each fallback needs exactly
 * one parsed flight and exactly one design. A mapper file cannot supply the first half.
 *
 * It shares its body with the staged writer rather than resembling it, so the two cannot drift into
 * writing the same made-up flight two ways — and so the `Stage` row, which is a fact about the pair
 * and not about a flight, is absent here instead of carrying a value that would be a small lie.
 */
export function toSingleLoggerCsv(flight: SynthFlight, padS: number): string {
  return loggerCsv(flight, padS, null);
}

function loggerCsv(flight: SynthFlight, padS: number, stage: 'booster' | 'sustainer' | null): string {
  const rec = { flight, padS, stage };
  const DT = 0.05;
  const lines: string[] = [
    `${SYNTHETIC_KEY},${JSON.stringify(SYNTHETIC_NOTE)}`,
    `Demonstrates,${JSON.stringify(rec.flight.demonstrates)}`,
    ...(rec.stage === null ? [] : [`Stage,${JSON.stringify(rec.stage)}`]),
    `Columns,${JSON.stringify(
      'The column names below are the ones an Eggtimer Classic writes, so that Debrief reads this ' +
        'file without being told about it. No Eggtimer recorded anything here and no device of any ' +
        'kind did: see the Synthetic row above.',
    )}`,
    '',
    'T,Alt,VRaw,VFilt',
  ];
  // On the rail: the board is recording and the rocket has not moved.
  for (let i = 0; i < Math.round(rec.padS / DT); i++) {
    lines.push(`${(i * DT).toFixed(2)},0.0,0.0,0.0`);
  }
  for (const s of rec.flight.samples) {
    const ft = (s.altitude * M_TO_FT).toFixed(1);
    // `VRaw` and `VFilt` are an Eggtimer's unfiltered and filtered readings of the same speed. One
    // made-up number written into both, rather than a second curve derived from the first: a
    // filtered channel that differs from its raw one is a model of a filter, which this module
    // does not do.
    const fps = (s.velocity * M_TO_FT).toFixed(1);
    lines.push(`${(s.t + rec.padS).toFixed(2)},${ft},${fps},${fps}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Write a generated flight as a GPS TRACKER log — the one format among these that states fix
 * quality, which is the whole point of the sample it exists for.
 *
 * **Why a real format's columns rather than the mapper's.** The mapper route cannot express this
 * capability at all: `lib/flight/mappingOptions.ts` offers latitude and longitude and no way to
 * declare a satellite count beside them, so a hand-mapped file arrives with a position and nothing
 * about how good it was. The demonstration has to come in through a parser that reads a fix column,
 * and the Featherweight tracker layout is the one Debrief already reads.
 *
 * **The header says whose columns these are and that nothing wrote them**, exactly as `loggerCsv`
 * does for the Eggtimer names it borrows. No Featherweight tracker recorded anything here and no
 * receiver of any kind did; the `Synthetic` row above the header is the claim, and every surface
 * downstream reads it from there.
 *
 * `FIX` is DERIVED from the satellite count rather than stored separately, so the file cannot
 * contradict itself: a receiver reporting four satellites and a two-dimensional fix would be a
 * self-inconsistent log, and this writer is not able to produce one. The mapping is u-blox's own —
 * 3 for a three-dimensional fix, 2 for two-dimensional, 0 for none — which is what `lib/gpsFix.ts`
 * reads back.
 *
 * The signal-strength columns are three DISJOINT bands summing to at most the tracked total,
 * because that is what the real ones are: measured over a corpus tracker log, `>40 + >32 + >24 ==
 * #SATS` holds on 0 of 174 rows and `<=` holds on all 174. A generator that made them sum would put
 * a false fact into a demonstration file.
 */
export function toGpsTrackerCsv(flight: SynthFlight, padS: number): string {
  const DT = 1;
  /**
   * A fixed Unix second, so the file is deterministic.
   *
   * **It does NOT "date nothing real", which an earlier version of this comment claimed.**
   * `flownAtFromText` reads the `UTCTIME` column, so Debrief publishes a launch date for this
   * flight in the report headline and the logbook row — a real instant attached to a flight that
   * never happened. Every surface that carries it also says the flight is made up, which is what
   * makes this acceptable rather than a lie; but the claim in the comment was false and is
   * corrected rather than quietly dropped. Filed as the smaller question of whether a synthesized
   * log should carry a date at all.
   */
  const T0 = 1_700_000_000;
  const lines: string[] = [
    `${SYNTHETIC_KEY},${JSON.stringify(SYNTHETIC_NOTE)}`,
    `Demonstrates,${JSON.stringify(flight.demonstrates)}`,
    `Columns,${JSON.stringify(
      'The column names below are the ones a Featherweight GPS tracker writes, so that Debrief ' +
        'reads this file without being told about it. No tracker recorded anything here and no ' +
        'receiver of any kind did: see the Synthetic row above.',
    )}`,
    '',
    'UTCTIME,UNIXTIME,ALT,LAT,LON,#SATS,FIX,HORZV,VERTV,HEAD,FLAGS,>40,>32,>24,RSSI,BATT',
  ];
  // A clock string derived ENTIRELY from the Unix second beside it, so the two columns of one row
  // cannot contradict each other. `Date` is deliberately not used — this module has no clock,
  // because the file it writes is committed and compared byte for byte — so the calendar arithmetic
  // is done here from the epoch.
  //
  // **The date used to be hardcoded** while the time was derived, which is latent nonsense: a file
  // whose pad and flight crossed a day boundary would have written `Nov 14 2023` beside a UNIXTIME
  // on the 15th. Nothing reaches that today at 266 rows; deriving both costs four lines and removes
  // the possibility.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const stamp = (unix: number) => {
    const total = Math.floor(unix);
    let days = Math.floor(total / 86_400);
    const secs = total - days * 86_400;
    // Days since 1970-01-01, walked forward a year and a month at a time. Exact, and short enough
    // to read: no library, no clock, no locale.
    let year = 1970;
    const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    for (;;) {
      const len = leap(year) ? 366 : 365;
      if (days < len) break;
      days -= len;
      year++;
    }
    const lengths = [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let month = 0;
    while (days >= lengths[month]) {
      days -= lengths[month];
      month++;
    }
    const two = (n: number) => String(n).padStart(2, '0');
    return (
      `${MONTHS[month]} ${days + 1} ${year} ` +
      `${two(Math.floor(secs / 3600))}:${two(Math.floor((secs % 3600) / 60))}:${two(secs % 60)}.000 UTC`
    );
  };
  const row = (i: number, altM: number, lat: number, lon: number, sats: number, vUp: number) => {
    const unix = T0 + i * DT;
    const fix = sats >= 4 ? 3 : sats > 0 ? 2 : 0;
    // Strongest band first; the remainder is the satellites the receiver hears below 24 dB-Hz and
    // is deliberately not written, because the format has no column for it.
    const b40 = Math.floor(sats / 4);
    const b32 = Math.floor(sats / 3);
    const b24 = Math.max(0, sats - b40 - b32 - 1);
    return [
      stamp(unix),
      `${unix}.000`,
      (altM * M_TO_FT).toFixed(0),
      lat.toFixed(7),
      lon.toFixed(7),
      String(sats),
      String(fix),
      '0',
      (vUp * M_TO_FT).toFixed(1),
      '90',
      '0x03',
      String(b40),
      String(b32),
      String(b24),
      '180',
      '4.010',
    ].join(',');
  };
  const pad = Math.round(padS / DT);
  const first = flight.samples[0];
  // On the pad: locked, stationary, and the receiver already reporting — so the record does not
  // open at liftoff, which is a caveat this file need not earn.
  for (let i = 0; i < pad; i++) lines.push(row(i, 0, first.lat ?? 0, first.lon ?? 0, 9, 0));
  flight.samples.forEach((s, i) => {
    lines.push(row(pad + i, s.altitude, s.lat ?? 0, s.lon ?? 0, s.sats ?? 0, s.velocity));
  });
  return lines.join('\n') + '\n';
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
  // A fourth column only where the flight HAS one, so the flight that had three before this
  // existed still writes exactly three and its byte-for-byte check does not move. `G force`
  // rather than a bare `G` because `lib/flight/columns.ts` suggests `Acceleration (total)` off
  // that word: the mapper is being demonstrated, not fought, and a flyer should be confirming a
  // sensible guess rather than hunting for a role.
  const hasAccel = flight.samples.some((s) => s.accel !== undefined);
  const lines: string[] = [
    `${SYNTHETIC_KEY},${JSON.stringify(SYNTHETIC_NOTE)}`,
    `Demonstrates,${JSON.stringify(flight.demonstrates)}`,
    '',
    hasAccel ? 'Elapsed,Height,Rate,G force' : 'Elapsed,Height,Rate',
  ];
  for (const s of flight.samples) {
    const row =
      `${s.t.toFixed(2)},${(s.altitude * M_TO_FT).toFixed(1)},${(s.velocity * M_TO_FT).toFixed(1)}` +
      (hasAccel ? `,${((s.accel ?? 0) / G0).toFixed(2)}` : '');
    lines.push(row);
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
