// Everything Debrief keeps on this device, in one place — because the privacy page makes a
// promise about it.
//
// The page said local storage held "your theme and units", and that clearing browser data "or
// using the 'clear' control on the recents list removes all of it". Neither was true. The app
// writes NINETEEN `debrief.*` keys, and the logbook's Clear took the flights, their captions and
// nothing else — so a flyer who lent a laptop, read the page and pressed Clear left behind their
// rocket's descending mass, its body and canopy diameters, the drogue, the rail length, the
// main-deploy altitude, the motor delay, every saved plot preset, and a fingerprint of the column
// headers of every unrecognized log they had ever mapped. None of that was named anywhere.
//
// PRIVACY IS SACRED is the invariant, and the privacy page is the artifact that states it — so
// the page is generated from this list rather than hand-written beside it, and `deviceData.test.ts`
// greps the source for `debrief.*` literals and fails if one is not registered here. A new stored
// preference cannot reach production without appearing on the privacy page and being taken by the
// control that promises to take everything.
//
// The FLIGHTS themselves are not here: they live in IndexedDB (`lib/recents.ts`), which the
// logbook's own Clear has always handled and which the page has always named.

/** What a stored value IS, from the flyer's point of view rather than the code's. The privacy
 *  page groups by this, because "19 keys" is not something a person can act on. */
export type DeviceDataKind =
  /** How the app looks and what units it speaks — the only thing the page used to mention. */
  | 'preference'
  /** What the flyer chose to look at: which readings, which figures, which channel, saved views. */
  | 'view'
  /** Numbers ABOUT THEIR ROCKET that they typed in — mass, diameters, rail, deployment. */
  | 'rocket'
  /** Free text they wrote, or a signature of their own file's contents. */
  | 'their-own-words';

export interface DeviceDatum {
  key: string;
  /** What it holds, in a sentence a flyer can check against their own expectations. */
  what: string;
  kind: DeviceDataKind;
}

/** Every localStorage key this app writes. Held to the source by `deviceData.test.ts`. */
export const DEVICE_DATA: readonly DeviceDatum[] = [
  { key: 'debrief.theme', what: 'light or dark', kind: 'preference' },
  { key: 'debrief.units', what: 'feet or metres — and, if you set them one at a time, your speed, acceleration, temperature and pressure units', kind: 'preference' },

  { key: 'debrief.plotView', what: 'which channels the chart was plotting, and against what', kind: 'view' },
  { key: 'debrief.compareChannel', what: 'which channel a comparison opens on', kind: 'view' },
  {
    key: 'debrief.firstStage',
    what: 'which recording you said flew as the first stage, per set of recordings you assembled',
    kind: 'view',
  },
  { key: 'debrief.hiddenEvents', what: 'event markers you turned off', kind: 'view' },
  { key: 'debrief.report.hidden', what: 'readings you chose not to show', kind: 'view' },
  { key: 'debrief.report.hiddenFigures', what: 'figures you chose not to show', kind: 'view' },
  { key: 'debrief.report.order', what: 'the order you put the readings in', kind: 'view' },

  { key: 'debrief.mass.kg', what: 'your rocket’s descending mass', kind: 'rocket' },
  { key: 'debrief.dragmass.kg', what: 'the mass you gave for the drag estimate', kind: 'rocket' },
  { key: 'debrief.diameter.m', what: 'its body diameter', kind: 'rocket' },
  { key: 'debrief.chute.m', what: 'its main canopy diameter', kind: 'rocket' },
  { key: 'debrief.drogue.m', what: 'its drogue diameter', kind: 'rocket' },
  { key: 'debrief.rail', what: 'the rail you fly off', kind: 'rocket' },
  { key: 'debrief.maindeploy.m', what: 'the altitude you deploy the main at', kind: 'rocket' },
  { key: 'debrief.delay.s', what: 'your motor’s ejection delay', kind: 'rocket' },

  {
    key: 'debrief.compare.captions',
    what: 'the label and notes you typed onto a comparison, and the order you put its columns in',
    kind: 'their-own-words',
  },
  {
    key: 'debrief.mappings.v1',
    what:
      'the column layouts you mapped by hand, filed under your file’s own column headings — or, ' +
      'for an export with no header row, under how many columns it had',
    kind: 'their-own-words',
  },
  {
    // Filed here rather than under "how you like to read a flight" because the NAME is text the
    // flyer typed, and the page's own heading for that is "Things you typed".
    key: 'debrief.plotPresets',
    what: 'plot views you saved, under the names you gave them',
    kind: 'their-own-words',
  },
];

/** The kinds, in the order the privacy page lists them: the ones a person is most likely to be
 *  surprised by, first. */
export const DEVICE_DATA_KINDS: readonly { kind: DeviceDataKind; heading: string; lede: string }[] = [
  {
    kind: 'their-own-words',
    heading: 'Things you typed',
    lede: 'Text you wrote, and the shape of files you mapped by hand.',
  },
  {
    kind: 'rocket',
    heading: 'Your rocket’s numbers',
    lede: 'What you entered so the analysis could use it, remembered so you don’t retype it every flight.',
  },
  {
    kind: 'view',
    heading: 'How you like to read a flight',
    lede: 'What you chose to look at, so the tool doesn’t forget what it was just told.',
  },
  { kind: 'preference', heading: 'How the app looks', lede: 'Nothing about you or your flights.' },
];

export function deviceDataOfKind(kind: DeviceDataKind): DeviceDatum[] {
  return DEVICE_DATA.filter((d) => d.kind === kind);
}

/** Which of these this browser is ACTUALLY holding right now. The privacy page can then say what
 *  is on this device rather than what an app of this kind might store — and "Forget everything"
 *  can report a real count instead of a promise. */
export function deviceDataPresent(): DeviceDatum[] {
  if (typeof window === 'undefined') return [];
  try {
    return DEVICE_DATA.filter((d) => window.localStorage.getItem(d.key) !== null);
  } catch {
    return [];
  }
}

/** Remove every one of them, and report how many were actually there.
 *
 *  This is the control the privacy page's promise needs to be true. It does NOT touch the
 *  logbook: the flights live in IndexedDB and have their own Clear, which names them and counts
 *  them. Two controls, each honest about its own scope, beats one that claims both and does one. */
export function forgetDeviceData(): number {
  if (typeof window === 'undefined') return 0;
  let gone = 0;
  for (const d of DEVICE_DATA) {
    try {
      if (window.localStorage.getItem(d.key) === null) continue;
      window.localStorage.removeItem(d.key);
      gone++;
    } catch {
      /* storage unavailable — nothing was stored either */
    }
  }
  return gone;
}
