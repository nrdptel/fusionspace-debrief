/**
 * Every block on the methods page, by id.
 *
 * The page had NO ids at all — 45 blocks of prose in 790 lines and not one anchor — so a
 * definition could not be linked to, and a reading on the report had nowhere to point. A
 * flyer meeting "Coast efficiency" or "Max Q" for the first time had to leave the report,
 * open the methods page and read down it.
 *
 * The list is a const so both sides are checked by the compiler rather than by hope: the
 * page can only render a block whose id is here, and a reading in `lib/readings.ts` can only
 * cite one that exists. A renamed block breaks the build, not a flyer's link.
 */
export const METHOD_IDS = [
  'gps-recording',
  'ground-baseline-altitude',
  'several-recordings-one-flight',
  'several-flights-in-a-file',
  'same-flight-written-twice',
  'apogee',
  'not-a-flight',
  'velocity-max-velocity',
  'gps-speed-supersonic',
  'accelerometer-settles-mach',
  'altitude-of-a-reading',
  'acceleration',
  'thrust-to-weight',
  'accelerometer-channel-meaning',
  'liftoff-burnout',
  'rail-exit-velocity',
  'coast-efficiency',
  'ejection-delay',
  'drag-coefficient',
  'parachute-cd',
  'landing-energy',
  'deployment-shock',
  'main-deploy-altitude',
  'deployments-descent-rates',
  'barometric-speed-refuted',
  'record-stops-in-the-air',
  'descent-faster-than-vacuum',
  'main-descent-rate',
  'recovery-ground-track',
  'roll-spin',
  'roll-angle',
  'long-axis',
  'battery',
  'mach-dynamic-pressure',
  'device-summary',
  'predicted-versus-flown',
  'when-the-flight-flew',
  'what-the-charts-show',
  'what-goes-in-the-report',
  'the-samples',
  'named-views',
  'events-called-out',
  'built-in-views',
  'unrecognized-file',
  'logbook-backup',
  'one-flight-several-recordings',
  'units',
  'offline',
  'formats-privacy',
  'raw-downloads',
  'what-debrief-isnt',
] as const;

export type MethodId = (typeof METHOD_IDS)[number];

/**
 * The 51 blocks, grouped into subjects a flyer would recognise.
 *
 * The page had one `<h1>`, 51 sibling `<h2>`s and **no third level at all** — so nothing on
 * 12,700 words of reference said that "Apogee" and "The altitude a reading happened at" are one
 * subject and "Battery" is another. That is `OWNER-NOTES.md` `ON-1` ("its just a large block of
 * text at this point"), and the flat structure is most of why: a reader looking up one rule had
 * no level to scan above the block level, and 51 items is too many to scan.
 *
 * The order is the flight's own — what the file is, then several recordings of it, then up, then
 * fast, then the burn, then down — rather than the order the blocks were written in over the
 * months they accreted. Two blocks moved subject in the process and neither is a content change:
 * `mach-dynamic-pressure` sat between `battery` and `device-summary` and belongs with the speeds,
 * and `predicted-versus-flown` sat in the middle of recovery and belongs with the other
 * cross-checks against something outside the log.
 *
 * **Exhaustive by test, not by care.** `lib/methodIds.test.ts` fails when an id is in no group,
 * in two groups, or in a group and not in `METHOD_IDS` — so adding a block and forgetting to
 * place it breaks the build rather than quietly appending it to the end of the last group, which
 * is exactly how the flat list got to 51 in the first place.
 */
export const METHOD_GROUPS: { title: string; blurb: string; ids: readonly MethodId[] }[] = [
  {
    title: 'What the file is, before any number',
    blurb: 'What Debrief works out about a download before it reports anything from it.',
    ids: [
      'not-a-flight',
      'several-flights-in-a-file',
      'same-flight-written-twice',
      'unrecognized-file',
      'raw-downloads',
      'ground-baseline-altitude',
    ],
  },
  {
    title: 'Several recordings of one flight',
    blurb:
      'Where a flight was recorded more than once — a second altimeter, the board’s own summary, a design that predicted it — the readings are set beside each other and never averaged.',
    ids: [
      'gps-recording',
      'several-recordings-one-flight',
      'one-flight-several-recordings',
      'device-summary',
      'predicted-versus-flown',
    ],
  },
  {
    title: 'How high',
    blurb: 'Apogee, and what altitude any other reading happened at.',
    ids: ['apogee', 'altitude-of-a-reading'],
  },
  {
    title: 'How fast',
    blurb:
      'Speed is the reading most often derived rather than measured, so this is also where most of the refusals are.',
    ids: [
      'velocity-max-velocity',
      'gps-speed-supersonic',
      'accelerometer-settles-mach',
      'mach-dynamic-pressure',
      'barometric-speed-refuted',
    ],
  },
  {
    title: 'Off the pad, and the burn',
    blurb: 'What the motor did, read off the acceleration the board recorded.',
    ids: [
      'acceleration',
      'accelerometer-channel-meaning',
      'thrust-to-weight',
      'liftoff-burnout',
      'rail-exit-velocity',
      'coast-efficiency',
    ],
  },
  {
    title: 'Coming down',
    blurb: 'The deployments, the rates they produced, and what the airframe felt when they fired.',
    ids: [
      'deployments-descent-rates',
      'ejection-delay',
      'deployment-shock',
      'main-deploy-altitude',
      'main-descent-rate',
      'parachute-cd',
      'drag-coefficient',
      'landing-energy',
      'descent-faster-than-vacuum',
      'record-stops-in-the-air',
      'recovery-ground-track',
    ],
  },
  {
    title: 'How the airframe moved',
    blurb: 'Roll, spin and which way was up — only where the board recorded the channels for it.',
    ids: ['roll-spin', 'roll-angle', 'long-axis'],
  },
  {
    title: 'What else the board wrote down',
    blurb: 'Readings that are not about the trajectory.',
    ids: ['battery', 'when-the-flight-flew', 'the-samples'],
  },
  {
    title: 'What you get out',
    blurb: 'The charts, the report, the exports and the logbook — and what each one carries.',
    ids: [
      'what-the-charts-show',
      'what-goes-in-the-report',
      'events-called-out',
      'built-in-views',
      'named-views',
      'logbook-backup',
      'units',
    ],
  },
  {
    title: 'Where it runs, and what leaves your device',
    blurb: 'Nothing is uploaded. This says exactly what that means.',
    ids: ['offline', 'formats-privacy'],
  },
  {
    title: 'What Debrief isn’t',
    blurb: 'The line between a measurement instrument and a simulator.',
    ids: ['what-debrief-isnt'],
  },
];
