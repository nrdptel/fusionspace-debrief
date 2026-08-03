// The flight card: a compact, shareable image of a flight — the headline numbers
// and the altitude curve, branded, for posting to a club chat or forum. This module
// holds the pure part: which measured numbers make the card and how they read. The
// drawing itself (canvas) lives in the component, since it needs the DOM.

import type { FlightMetrics } from './analyze/types';
import { apogeeCaveat } from './readings';
import { fmtAccel, fmtLength, fmtMach, fmtSpeed, fmtTime } from './display';
import type { UnitChoice } from './display';
import { visibleRows } from './reportProfile';
import { velocityProvenance } from './readings';

export interface CardStat {
  /** What the card prints. Short on purpose — four of these share the card's width, so
   *  "Max accel" where the grid has room for "Max acceleration". */
  label: string;
  /** The canonical reading label, as the grid and every report name it. The flyer's
   *  show/hide choice is stored against THIS, so the card has to carry it separately from
   *  the label it draws — otherwise hiding "Max acceleration" would silently miss the card's
   *  "Max accel" and the one artifact that leaves the device would keep printing it. */
  reading: string;
  value: string;
  sub?: string;
}

/** The headline numbers for the card — apogee always, then whichever of max velocity, max
 *  acceleration and flight time the log actually yielded (acceleration is absent on a
 *  GPS-only flight, flight time on a log that ends at apogee). Nothing here needs a
 *  user-supplied parameter.
 *
 *  Each carries its provenance, in the grid's words. This is the one surface that LEAVES
 *  the flyer's device — it exists to be posted to a club chat or a forum — so it is the
 *  worst place to print a number more confidently than the log supports. It used to do
 *  exactly that: a bare Mach figure with nothing beside it. Nine corpus flights put a
 *  SUPERSONIC claim on a card that way, every one of them differentiated out of an altitude
 *  rather than measured, and the loudest read Mach 2.64 on a flight whose own device summary,
 *  a second altimeter, a GPS and an L3 cert PDF all say Mach 1.3. The grid tile beside it
 *  said "derived" the whole time. The altitude the peak occurred at is dropped — the grid
 *  has room for it, a card does not, and the provenance is the part that changes the claim. */
export function flightCardStats(metrics: FlightMetrics, sys: UnitChoice, hidden?: string[]): CardStat[] {
  const stats: CardStat[] = [
    {
      label: 'Apogee',
      reading: 'Apogee',
      value: fmtLength(metrics.apogeeAltitude, sys),
      // The card already qualifies a derived speed and a clipped acceleration; the apogee
      // was the one headline that went out bare. Same argument as the docstring above —
      // this is the artefact that gets posted to a club chat, so it is the worst place to
      // print a lower bound as though it were the number.
      // Both caveats, not just the floor. An unproven altitude is the one a club chat most needs
      // to see beside the number, because the card is the artifact that travels furthest from the
      // report that explains it.
      //
      // From `apogeeCaveat` rather than hand-rolled: a first version wrote its own two strings and
      // review pointed at the explanation six lines below, where the max-velocity line was moved
      // off hand-rolled words for exactly this reason. `CARD_MAX` keeps the card readable — it is
      // a shareable image, not a document — and truncating a shared string is still one string.
      ...(apogeeCaveat(metrics) ? { sub: shortCaveat(apogeeCaveat(metrics)!) } : {}),
    },
  ];
  if (Number.isFinite(metrics.maxVelocity)) {
    // The same words the tile and the saved report use, from the same function — this line used to
    // hand-roll them, so the moment the other two started naming the DIRECTION of a derived peak's
    // error the print card would have been the one surface still saying just "derived".
    const src = velocityProvenance(metrics, 'short');
    stats.push({
      label: 'Max velocity',
      reading: 'Max velocity',
      value: fmtSpeed(metrics.maxVelocity, sys),
      sub: metrics.mach ? `${fmtMach(metrics.mach)} · ${src}` : src,
    });
  }
  if (Number.isFinite(metrics.maxAcceleration)) {
    stats.push({
      label: 'Max accel',
      reading: 'Max acceleration',
      value: fmtAccel(metrics.maxAcceleration, sys),
      sub:
        metrics.accelerationSource === 'device'
          ? metrics.accelClipped
            ? 'measured · may be clipped'
            : 'measured'
          : 'derived',
    });
  }
  if (metrics.flightTime != null) {
    stats.push({ label: 'Flight time', reading: 'Flight time', value: fmtTime(metrics.flightTime) });
  }
  // The flyer's show/hide choice drives the grid and every report; the card honoured none
  // of it, so a reading hidden everywhere else still went out on the shareable image.
  return visibleRows(stats, (s) => s.reading, hidden);
}


/** How much of a caveat a share card can carry. The card is an image posted to a club chat, not a
 *  document — the full sentence would set five lines under a two-word label. The clause before the
 *  em dash is the claim; what follows it is the explanation, and the report is where that lives. */
const CARD_MAX = 44;
function shortCaveat(full: string): string {
  const lead = full.split(' — ')[0];
  return lead.length <= CARD_MAX ? lead : `${lead.slice(0, CARD_MAX - 1).trimEnd()}…`;
}
