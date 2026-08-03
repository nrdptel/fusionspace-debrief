// Cross-check: the logger's OWN headline figures (read from a summary the file
// carries) beside Debrief's independent read of the same flight. Two independent
// measurements — close agreement builds confidence; a gap is a flag worth a look,
// never averaged away or hidden. Debrief states both and judges neither.

import type { FlightEvent, FlightMetrics } from '@/lib/analyze/types';
import type { ReportedValue } from '@/lib/flight/types';
import { fmtAccel, fmtLength, fmtSpeed } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { compareReported, REPORTED_QUANTITY } from '@/lib/flight/reported';
import { Card, Chip, DataTable } from './ui';

function fmt(metric: ReportedValue['metric'], si: number, sys: UnitChoice): string {
  const q = REPORTED_QUANTITY[metric];
  return q === 'length' ? fmtLength(si, sys) : q === 'speed' ? fmtSpeed(si, sys) : fmtAccel(si, sys);
}

type Row = {
  r: ReportedValue;
  computed: number;
  has: boolean;
  deltaPct: number | null;
  status: ReturnType<typeof compareReported>[number]['status'];
  gravityConvention?: boolean;
};

/** The verdict as words. Written once and used for both the badge and the clipboard, so what a
 *  flyer pastes into a cert document carries the judgement rather than two bare numbers — and so
 *  the two can never drift into saying different things about the same row. */
function agreementText(x: Row): string {
  if (x.status == null) return 'not computed';
  if (x.gravityConvention) return 'agree · exactly 1 g apart*';
  if (x.status === 'agree') return `agree · ${x.deltaPct! < 0.05 ? '≈0' : x.deltaPct!.toFixed(1)}%`;
  if (x.status === 'consistent') return `consistent · ${x.deltaPct!.toFixed(0)}%`;
  return `differ · ${x.deltaPct!.toFixed(0)}%`;
}

export default function DeviceSummary({
  reported,
  metrics,
  events,
  sys,
}: {
  reported: ReportedValue[];
  metrics: FlightMetrics;
  /** The deployment shocks live on the apogee and main EVENTS rather than on `FlightMetrics`,
   *  so the cross-check needs them to resolve a device-stated shock. */
  events?: FlightEvent[];
  sys: UnitChoice;
}) {
  const rows = compareReported(reported, metrics, events).map(
    ({ reported: r, computed, hasComputed: has, deltaPct, status, gravityConvention }) => ({
      r,
      computed,
      has,
      deltaPct,
      status,
      gravityConvention,
    }),
  );
  const anyGravity = rows.some((x) => x.gravityConvention);

  return (
    <Card as="section" tone="sunken" aria-labelledby="devsum-heading">
      <p id="devsum-heading" className="mb-0.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        The logger&apos;s own summary
      </p>
      <p className="mb-2.5 text-sm text-zinc-500 dark:text-zinc-400">
        The device wrote these figures into the file. Shown beside Debrief&apos;s independent read as a cross-check —
        agreement builds confidence, a gap is worth a look.
      </p>
      <DataTable
        caption="The logger's own reported figures beside Debrief's independent read"
        copyLabel="Copy the logger’s summary"
        rows={rows}
        rowKey={(x) => x.r.metric}
        columns={[
          { key: 'reading', header: 'Reading', cell: (x) => x.r.label, text: (x) => x.r.label },
          {
            key: 'logger',
            header: 'Logger',
            cell: (x) => <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">{fmt(x.r.metric, x.r.value, sys)}</span>,
            text: (x) => fmt(x.r.metric, x.r.value, sys),
          },
          {
            key: 'debrief',
            header: 'Debrief',
            cell: (x) => (
              <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                {x.has ? fmt(x.r.metric, x.computed, sys) : '—'}
              </span>
            ),
            text: (x) => (x.has ? fmt(x.r.metric, x.computed, sys) : '—'),
          },
          {
            key: 'agreement',
            header: 'Agreement',
            cell: (x) =>
              x.status == null ? (
                <span className="text-zinc-500 dark:text-zinc-400">not computed</span>
              ) : x.gravityConvention ? (
                // Four verdicts, three §5 `Chip` tones — `agree` and the gravity-convention case
                // are both `good`. These were hand-rolled at `px-1.5 py-0.5`
                // — off §5's `px-2 py-1` — on exactly the `500/30` + `500/10` ramp the primitive
                // already used for `accent`, which is the tell that the vocabulary was short a
                // word rather than this file being careless: these three ARE the measurement that
                // put `good` and `warn` in the enum. `mono={false}`: prose verdicts, not figures.
                <Chip
                  tone="good"
                  mono={false}
                  title="The same reading under two conventions, not a disagreement: an accelerometer at rest reads 1 g, which Debrief reports (the force the airframe felt) and this device subtracts (what the rocket was accelerated by). The two figures are exactly one gravity apart."
                  value={agreementText(x)}
                />
              ) : x.status === 'agree' ? (
                <Chip tone="good" mono={false} value={agreementText(x)} />
              ) : x.status === 'consistent' ? (
                <Chip
                  tone="default"
                  mono={false}
                  // **`font-medium` by hand, and it is not a hand-roll creeping back.** §5 gives
                  // the weight to the four HUED tones, because a hue is a claim; `default` is the
                  // neutral and stays unweighted. "Consistent" is a verdict like the other three
                  // in this column — neutral, not quiet — so without this it would be the one
                  // unbolded cell in a column of four, reading as a weaker finding rather than a
                  // different one. The tone is right and the weight is the exception; a `neutral`
                  // tone that differed from `default` in nothing but weight would be a word in the
                  // vocabulary earning its place on one call site.
                  className="font-medium"
                  title="A descent rate is a windowed average of an unsteady descent, not a single instant, so two independent reads are expected to differ by more than a peak would — this is consistent, not a discrepancy."
                  value={agreementText(x)}
                />
              ) : (
                <Chip tone="warn" mono={false} value={agreementText(x)} />
              ),
            text: agreementText,
          },
        ]}
      />
      {anyGravity && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          *An accelerometer at rest on the pad reads 1&nbsp;g. Debrief reports that specific force —
          the g the airframe felt — and this device reports acceleration net of gravity, what the
          rocket was accelerated <em>by</em>. Neither is wrong, and the gap is the convention rather
          than measurement spread: the two land exactly one gravity apart, which is not what noise
          does. Both are shown as each instrument states them; neither is adjusted into the other.
        </p>
      )}
    </Card>
  );
}
