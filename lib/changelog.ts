// What changed between builds — written for a flyer, not for a developer.
//
// **Why a measurement instrument needs one more than most software does.** Debrief's methods
// change most weeks, and a change to a method is a change to what the tool SAYS about a real
// flight. `lib/buildInfo.ts` stamps every document a flyer keeps so a cert package filed in March
// can be traced to the code that produced it — but a build identifier only says WHICH code ran.
// It cannot say what that code did differently, so a flyer whose saved report disagrees with
// today's read had a SHA and no account of why. This file is that account.
//
// **`readings` is the section that earns the page**, and it is deliberately first in each release
// rather than last. Added capabilities and craft improvements are the ordinary contents of a
// changelog; a number that moved is the one thing a flyer holding an old report has to know
// about, and it is the entry a generic "Added / Changed / Fixed" template has no place for. An
// empty `readings` list is a real and common answer — most releases change no reading — and it
// says so on the page rather than being silently absent.
//
// **The entries are written by hand, and that is the point rather than a shortcut not taken.**
// Commit subjects here are already written in the project's voice and would generate something
// readable, but they answer "what did the author do?" where this page answers "what is different
// for you?" — and the two differ most exactly where it matters, on a correction. `ROADMAP.md`
// and `HANDOFF.md` carry the measured facts each entry is drawn from.
//
// Newest first. Dates are the day the work reached debrief.fusionspace.co.

/** One day's worth of shipped work, as a flyer would want it summarised. */
export interface Release {
  /** ISO `YYYY-MM-DD`, the day this reached production. */
  date: string;
  /** A one-line characterisation of the release, for the page's contents list. */
  headline: string;
  /** **Readings that changed** — a number Debrief now reports differently, or a wrong one
   *  corrected. Empty on most releases, and the page says so rather than hiding the heading. */
  readings: string[];
  /** What a flyer can DO that they could not before. */
  added: string[];
  /** What is better about using the tool, without being a new capability. */
  improved: string[];
}

export const RELEASES: Release[] = [
  {
    date: '2026-08-09',
    headline: 'Designs with several simulations, a changelog, and one wrong provenance label fixed',
    readings: [
      'A burnout speed read from a barometric altitude was labelled “measured”. It is labelled “derived” now, which is what it always was — the figure itself did not move. Two recordings in the regression corpus were affected, at 121.2 and 128.4 m/s, and on both the identical number appeared three rows below correctly labelled. If a report you saved before today shows a burnout speed marked measured, the speed is unchanged and the label was overstating how it was obtained.',
    ],
    added: [
      'Drop an OpenRocket design that holds several simulations and you can now say which one flew. Debrief still will not pick one — nothing in a flight log names the motor — so the simulation you name is compared, and every surface says the choice was yours.',
      'This page. What changed between builds, and which of those changes moved a number.',
      'A flight, and everything you told Debrief about it, saves to one file and comes back from it — including a flight recorded by two altimeters, and a staged flight stitched from one log per stage.',
      'Sample flights on the comparison surface, so two recordings of one flight can be seen without bringing two of your own files.',
    ],
    improved: [
      'The page says which build you are looking at, linked to the exact code, matching the line every saved report already carried.',
      'Where the numbers come from is a document you can read: a contents list, a jump strip that tracks where you are, and no block over 400 words. It also cites its sources now, where it cited none.',
      'You can report a problem or ask for a logger from inside the app, rather than only from the privacy page.',
      'A composite of a staged flight no longer forgets which stage flew first when you arrive at it from a saved record.',
    ],
  },
  {
    date: '2026-08-08',
    headline: 'Explanations come to you, and the tool demonstrates itself',
    readings: [],
    added: [
      'Sample flights that show what Debrief does without a file of your own — a single flight, two boards that recorded one physical flight and agree to about 0.4%, and a log beside its own board’s summary.',
    ],
    improved: [
      'The question mark beside a reading opens the explanation where you are standing, instead of sending you to another page in another tab and costing you your place. All 21 readings that have a write-up work this way.',
    ],
  },
  {
    date: '2026-08-05',
    headline: 'Predicted against flown',
    readings: [],
    added: [
      'Drop an OpenRocket design beside the log of the flight it predicted, and Debrief reports the gap — the design’s ten stated figures as a third source beside your flight and your logger’s own summary, never blended into either.',
      'A design that saved its simulation curve has that curve drawn on the altitude chart, dashed and on its own clock, so nothing about a simulation is resampled onto a measured liftoff.',
    ],
    improved: [
      'A design stating several simulations is refused by name rather than silently, so it is clear Debrief read the file and declined to guess rather than finding nothing in it.',
    ],
  },
  {
    date: '2026-08-04',
    headline: 'A descent rate that read 2.4× too fast',
    readings: [
      'Descent rates were read off a triple-smoothed derivative, which on a log whose sample rate changes mid-flight smeared a fast sample across a long gap. One corpus flight published 15.59 m/s (51.2 ft/s) where its own altitude falls 2,113 m to 150 m in 307.5 s — 6.38 m/s — and its own speed column read 6.61 m/s. Debrief reads the leg between short medians at each end now. Across the eight flights recorded by two or more instruments, seven pairs of readings tightened, one was unchanged and none widened: 40.1% disagreement to 1.8% on one, 9.0% to 0.3% on another. 43 of 50 stored digests moved. This is the reading you size a parachute against — if you have a descent rate from a report saved before this date, re-read the log.',
    ],
    added: [],
    improved: [],
  },
  {
    date: '2026-08-03',
    headline: 'An apogee Debrief disowned, printed without its caveat',
    readings: [
      'Where the climb in a log is too slow to be a flight, Debrief marks the altitude unproven — but the caveat reached only the metric tile, so the same apogee appeared bare on the report, the exports and the comparison’s “highest” crown. One corpus flight is in that state: it reads 31 ft against a sibling altimeter’s 2,115 m on the same flight. Five surfaces read the caveat from one place now, so a qualified apogee is qualified everywhere or nowhere.',
    ],
    added: [
      'Orientation and high-rate data: which way is up on the airframe, read from the log itself rather than assumed, and the board’s own high-rate half read onto the flight it belongs to.',
    ],
    improved: [],
  },
  {
    date: '2026-08-01',
    headline: 'Debrief proposes which files are one flight, and can be told no',
    readings: [],
    added: [
      'Drop a launch day’s folder and Debrief proposes which files are recordings of one flight, with the reason it thinks so — and every proposal can be refused, because it is a guess about your day and you were there.',
      'Deeper readings: rail-exit speed, coast to apogee, an ideal ejection delay, and drag where the flight supports measuring it.',
    ],
    improved: [],
  },
  {
    date: '2026-07-31',
    headline: 'Stitching a staged flight, and a report you can build',
    readings: [],
    added: [
      'A staged flight logged one device per stage stitches into one composite on a common timeline, with each stage’s own recording still reporting its own readings rather than being merged into one number.',
      'A report you assemble: the tables and plots you want, in your units, exported as text, Markdown, HTML, CSV, JSON, GPX or KML — all in the browser, nothing uploaded.',
    ],
    improved: [],
  },
  {
    date: '2026-07-30',
    headline: 'A launch day in one file, a second altimeter, and a mis-split flight',
    readings: [
      'A launch-day download holding several flights was split by comparing each flight against the highest one in the file, so any day whose flights differed by more than 2× in apogee was mis-read — one such file reported a 1,671 m apogee and a 156.5 s flight time against a first flight that flew to 204 m and was down in 20.6 s, with nothing on screen saying the file held two flights. Every threshold is measured against the flight in hand now. Over the 46 corpus records that analyse, 44 came out byte-identical and 2 moved deliberately.',
    ],
    added: [
      'A download holding a whole launch day gives up every flight in it, and you say which one is yours.',
      'An Altus Metrum raw .eeprom download opens directly, without the vendor software in between.',
      'Two altimeters that flew one flight are one flight in the logbook, shown side by side as cross-checks rather than blended into a single number.',
    ],
    improved: [],
  },
];

/** The most recent release. The page's own heading reads from this rather than repeating a date. */
export function latestRelease(): Release {
  return RELEASES[0];
}

/** Every release that changed a reading — what a flyer with an older saved report has to read.
 *  Separated here rather than filtered at the call site so the page and any future surface that
 *  needs the same list cannot disagree about what counts. */
export function releasesThatMovedAReading(): Release[] {
  return RELEASES.filter((r) => r.readings.length > 0);
}

/** A stable in-page anchor for a release. Dates are unique by construction (one entry per day,
 *  which `lib/changelog.test.ts` enforces), so the date IS the id. */
export function releaseId(release: Release): string {
  return `r${release.date}`;
}
