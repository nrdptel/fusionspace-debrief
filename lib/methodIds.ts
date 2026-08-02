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
