// Cross-check: apogee as the GPS receiver recorded it, beside Debrief's barometric read
// of the same flight. Two sensors that fail in completely different ways — a barometer
// drifts with the weather and goes useless through the transonic push, a receiver loses
// lock and quantises to the metre — so where they agree that is real corroboration, and
// where they don't the gap is the finding. Stated, never merged: the analysis stays on
// the barometric channel throughout.

import type { FlightMetrics } from '@/lib/analyze/types';
import { fmtLength, type UnitChoice } from '@/lib/display';
import { peakAgreement, peakTimeTolerance } from '@/lib/crossPeak';
import { Card, Chip, DataTable } from './ui';

/** The verdict as words, so the clipboard carries the judgement and not just two numbers a
 *  spreadsheet would leave the reader to compare. */
function agreementText(verdict: ReturnType<typeof peakAgreement>, deltaPct: number): string {
  if (verdict === 'different-peak') return 'not the same peak';
  const pct = Math.abs(deltaPct) < 0.05 ? '≈0' : deltaPct.toFixed(1);
  return `${verdict === 'agree' ? 'agree' : 'differ'} · ${deltaPct > 0 ? '+' : ''}${pct}%`;
}

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
      <p className="mb-2.5 text-sm text-zinc-500 dark:text-zinc-400">
        This file carries the receiver&apos;s own altitude as well as the barometer&apos;s — two
        independent recordings of one flight, which fail in different ways. Shown side by side as a
        cross-check, never averaged: the analysis stays on the barometric channel.
      </p>
      <DataTable
        caption="Apogee as the GPS recorded it, beside the barometric read"
        copyLabel="Copy the GPS cross-check"
        rows={[{ gps, baro, verdict, deltaPct }]}
        rowKey={() => 'apogee'}
        columns={[
          { key: 'reading', header: 'Reading', cell: () => 'Apogee', text: () => 'Apogee' },
          {
            key: 'gps',
            header: 'GPS',
            cell: (r) => <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">{fmtLength(r.gps, sys)}</span>,
            text: (r) => fmtLength(r.gps, sys),
          },
          {
            key: 'baro',
            header: 'Barometer',
            cell: (r) => <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">{fmtLength(r.baro, sys)}</span>,
            text: (r) => fmtLength(r.baro, sys),
          },
          {
            key: 'agreement',
            header: 'Agreement',
            cell: (r) => (
              // The SAME cross-check verdict as `DeviceSummary`'s, byte-identical down to the
              // `px-1.5 py-0.5` that is off §5's scale — GPS against barometer here, the board's
              // own summary against ours there. Two files independently writing one treatment is
              // the shape P1 exists to close, and these two are half the measurement that put
              // `good` and `warn` in §5's chip.
              <Chip
                tone={r.verdict === 'agree' ? 'good' : 'warn'}
                mono={false}
                title={
                  r.verdict === 'different-peak'
                    ? 'The two recordings put the peak too far apart in time to be the same instant, so how close the heights are says nothing about whether they corroborate each other.'
                    : undefined
                }
                value={agreementText(r.verdict, r.deltaPct)}
              />
            ),
            text: (r) => agreementText(r.verdict, r.deltaPct),
          },
        ]}
      />
      <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400">
        {metrics.gpsAscentFixes != null && (
          <>
            From {metrics.gpsAscentFixes.toLocaleString()} three-dimensional{' '}
            {metrics.gpsAscentFixes === 1 ? 'fix' : 'fixes'} on the way up — separate solutions,
            not rows. A receiver runs at a few hertz and a log can run at two hundred, and between
            solutions the receiver repeats its last position rather than writing nothing, so
            counting rows counts the repeats: this figure used to read {'>'}100× higher on the same
            flights. A fix needs at least four satellites, which is what it takes to solve for a
            height at all; three gives a position on an assumed altitude, and none at all is the
            held-over value. Neither counts as a HEIGHT here — though a three-satellite fix keeps
            its position, because it still walks you to the rocket.{' '}
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
