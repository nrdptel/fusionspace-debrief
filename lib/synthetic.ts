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
