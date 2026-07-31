// Cross-check: apogee as the GPS receiver recorded it, beside Debrief's barometric read
// of the same flight. Two sensors that fail in completely different ways — a barometer
// drifts with the weather and goes useless through the transonic push, a receiver loses
// lock and quantises to the metre — so where they agree that is real corroboration, and
// where they don't the gap is the finding. Stated, never merged: the analysis stays on
// the barometric channel throughout.

import type { FlightMetrics } from '@/lib/analyze/types';
import { fmtLength, type UnitChoice } from '@/lib/display';
import { peakAgreement, peakTimeTolerance } from '@/lib/crossPeak';
import { Card } from './ui';

export default function GpsApogee({ metrics, sys }: { metrics: FlightMetrics; sys: UnitChoice }) {
  const gps = metrics.gpsApogeeAltitude;
  const baro = metrics.apogeeAltitude;
  if (gps == null || !Number.isFinite(baro) || baro <= 0) return null;

  const deltaPct = ((gps - baro) / baro) * 100;
  const gpsT = metrics.gpsApogeeTime;
  const baroT = metrics.timeToApogee;
  // Judged on both axes. Two recordings that put apogee seconds apart did not see the same
  // instant, and then a close pair of heights is a coincidence rather than corroboration —
  // so the badge must not say "agree" on the strength of the numbers alone.
  const verdict = peakAgreement({ value: gps, time: gpsT }, { value: baro, time: baroT });
  const timeApart =
    verdict === 'different-peak' && gpsT != null && Number.isFinite(baroT)
      ? Math.abs(gpsT - baroT)
      : null;

  return (
    <Card as="section" tone="sunken" aria-labelledby="gpsapo-heading">
      <p id="gpsapo-heading" className="mb-0.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        The GPS recording
      </p>
      <p className="mb-2.5 text-xs text-zinc-500 dark:text-zinc-400">
        This file carries the receiver&apos;s own altitude as well as the barometer&apos;s — two
        independent recordings of one flight, which fail in different ways. Shown side by side as a
        cross-check, never averaged: the analysis stays on the barometric channel.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="py-1 pr-4 font-medium">Reading</th>
              <th className="py-1 pr-4 font-medium">GPS</th>
              <th className="py-1 pr-4 font-medium">Barometer</th>
              <th className="py-1 font-medium">Agreement</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-1.5 pr-4 text-zinc-700 dark:text-zinc-300">Apogee</td>
              <td className="py-1.5 pr-4 font-mono text-zinc-800 dark:text-zinc-200">
                {fmtLength(gps, sys)}
              </td>
              <td className="py-1.5 pr-4 font-mono text-zinc-800 dark:text-zinc-200">
                {fmtLength(baro, sys)}
              </td>
              <td className="py-1.5">
                <span
                  className={
                    verdict === 'agree'
                      ? 'inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                      : 'inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400'
                  }
                  title={
                    verdict === 'different-peak'
                      ? 'The two recordings put the peak too far apart in time to be the same instant, so how close the heights are says nothing about whether they corroborate each other.'
                      : undefined
                  }
                >
                  {verdict === 'different-peak' ? (
                    'not the same peak'
                  ) : (
                    <>
                      {verdict === 'agree' ? 'agree' : 'differ'} · {deltaPct > 0 ? '+' : ''}
                      {Math.abs(deltaPct) < 0.05 ? '≈0' : deltaPct.toFixed(1)}%
                    </>
                  )}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400">
        {metrics.gpsAscentFixes != null && (
          <>
            From {metrics.gpsAscentFixes.toLocaleString()} three-dimensional{' '}
            {metrics.gpsAscentFixes === 1 ? 'fix' : 'fixes'} on the way up — samples with at least
            four satellites, which is what it takes to solve for a height at all. Three gives a
            position on an assumed altitude, and none at all makes the receiver repeat its last
            one; both are left out rather than read as measurements.{' '}
          </>
        )}
        A GPS altitude is coarse (metres, and worse vertically than horizontally) but owes nothing
        to the weather or to the air around the airframe.
        {timeApart != null && (
          <>
            {' '}
            <strong className="font-medium text-amber-700 dark:text-amber-400">
              These are not readings of the same instant: the two put the peak{' '}
              {timeApart.toFixed(1)}&nbsp;s apart
            </strong>{' '}
            — more than the {peakTimeTolerance(metrics.timeToApogee).toFixed(1)}&nbsp;s this flight
            allows for one apogee. However close the heights look, that closeness is a coincidence
            rather than corroboration; plot the GPS altitude against the barometric line before
            quoting either.
          </>
        )}
      </p>
    </Card>
  );
}
