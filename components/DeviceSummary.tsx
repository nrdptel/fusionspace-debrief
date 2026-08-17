// Cross-check: what something OTHER than Debrief's own analysis says about this flight,
// beside Debrief's read of it. Two kinds of "other", and the difference is the point:
//
//   a LOGGER's own headline figures, read from a summary the file carries — a second
//   MEASUREMENT of the same flight, so close agreement builds confidence and a gap is a flag
//   worth a look, never averaged away or hidden;
//
//   a PREDICTION, read from an OpenRocket design dropped beside the log — a statement about a
//   flight that had not happened yet. It is not a second measurement and must never be judged
//   as one: a flight that missed its prediction is not a discrepancy to chase, it is the
//   answer. So it gets its own column, its own verdict wording and its own tone.
//
// Debrief states all of them and judges none.

import type { FlightEvent, FlightMetrics } from '@/lib/analyze/types';
import { syntheticHeader } from '@/lib/synthetic';
import type { ReportedValue } from '@/lib/flight/types';
import { fmtAccel, fmtLength, fmtMach, fmtSpeed, fmtTime } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { compareReported, predictionVerdict, renderReported, reportedByMetric, type ReportedComparison } from '@/lib/flight/reported';
import { Card, Chip, DataTable } from './ui';

function fmt(metric: ReportedValue['metric'], si: number, sys: UnitChoice): string {
  return renderReported(metric, {
    length: () => fmtLength(si, sys),
    speed: () => fmtSpeed(si, sys),
    accel: () => fmtAccel(si, sys),
    // Seconds and Mach are the same in both unit systems, so neither is converted —
    // but both already have a formatter, and every other figure on this surface goes
    // through one.
    time: () => fmtTime(si),
    mach: () => fmtMach(si),
  });
}

type Row = {
  r: ReportedValue;
  computed: number;
  has: boolean;
  deltaPct: number | null;
  status: ReturnType<typeof compareReported>[number]['status'];
  gravityConvention?: boolean;
};

/** The verdict on a PREDICTED figure, which is a different sentence from the one two
 *  measurements get. `lib/flight/types.ts` states why: a flight that did not do what was
 *  predicted is not a discrepancy to chase, it is the answer — so the chip says which way it
 *  went and never calls either side wrong. Tone is `accent`, never `warn`: nothing here is a
 *  problem, and an amber chip on the row where a flyer's rocket beat its simulation would teach
 *  exactly the wrong lesson. */
function predictionChip(c: ReportedComparison): React.ReactNode {
  const words = predictionVerdict(c);
  if (c.signedPct == null) return <span className="text-zinc-500 dark:text-zinc-400">{words}</span>;
  return (
    <Chip
      tone="accent"
      mono={false}
      title="How the flight compared with what the design's simulator expected. The flight is the measurement; the prediction is what it is being read against — a gap is the answer, not an error."
      value={words}
    />
  );
}

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
  synthetic,
}: {
  reported: ReportedValue[];
  metrics: FlightMetrics;
  /**
   * Whether this is a flight Debrief MADE UP — required with no default, for the reason
   * `MetricGrid`'s and `GroundTrack`'s are: the safe-looking default is the defect value on a
   * panel whose whole output is a clipboard block somebody pastes into a document.
   *
   * **This was the sink D10's audit had never enumerated, found by the pre-push review of the
   * design sample.** Every other table-bearing child of `FlightReport` was passed `synthetic`;
   * this one was not, because until the design sample existed no synthetic flight ever populated
   * it — `reported` is non-empty only where a file carries a logger's own summary or a design
   * pairs with it, and every made-up sample before this one did neither. The sample created the
   * state and the state had no label, which is exactly the shape this milestone's own notes warn
   * about: `todo: 0` means nothing KNOWN is open, never that nothing is.
   *
   * The claim rides on the column HEADERS rather than on a row, because a column is the unit that
   * travels — `lib/synthetic.ts`'s `syntheticHeader` records the measurement behind that, and
   * `DataTable` copies exactly `columns.map(c => c.header)`.
   */
  synthetic: boolean;
  /** The deployment shocks live on the apogee and main EVENTS rather than on `FlightMetrics`,
   *  so the cross-check needs them to resolve a device-stated shock. */
  events?: FlightEvent[];
  sys: UnitChoice;
}) {
  // ONE ROW PER READING, whatever states it. A flight carrying both a device summary and an
  // OpenRocket design states apogee twice, and the 1:1 map this used to do emitted two rows both
  // labelled "Apogee" — each showing Debrief's identical read beside a different figure, under a
  // duplicate React key.
  const grouped = reportedByMetric(reported, metrics, events);
  const anyPredicted = grouped.some((g) => g.predicted);
  const anyDevice = grouped.some((g) => g.device);
  const rows = grouped.map((g) => {
    // The row still carries ONE `ReportedComparison` for the device columns, so everything below
    // that already worked keeps working; `predicted` rides alongside it.
    const d = g.device;
    return {
      metric: g.metric,
      label: g.label,
      predicted: g.predicted,
      r: (d?.reported ?? { metric: g.metric, label: g.label, value: NaN, source: 'device' }) as ReportedValue,
      computed: g.computed,
      has: g.hasComputed,
      deltaPct: d?.deltaPct ?? null,
      status: d?.status ?? null,
      gravityConvention: d?.gravityConvention,
      hasDevice: !!d,
    };
  });
  const anyGravity = rows.some((x) => x.gravityConvention);

  // The panel is named for what it actually holds. A design dropped beside a log makes this a
  // three-source table and "The logger's own summary" would be describing one of its columns.
  const heading = anyDevice && anyPredicted ? 'Predicted, logged, and read' : anyPredicted ? 'The design’s prediction' : 'The logger’s own summary';

  return (
    <Card as="section" tone="sunken" aria-labelledby="devsum-heading">
      <p id="devsum-heading" className="mb-0.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {heading}
      </p>
      <p className="mb-2.5 text-sm text-zinc-500 dark:text-zinc-400">
        {anyDevice && (
          <>
            The device wrote {anyPredicted ? 'its' : 'these'} figures into the file.{' '}
          </>
        )}
        {anyPredicted && (
          <>
            The prediction is what an OpenRocket design&apos;s simulator expected before the flight —
            not a measurement of it.{' '}
          </>
        )}
        Shown beside Debrief&apos;s independent read{anyDevice ? ' as a cross-check — agreement builds confidence, a gap is worth a look' : ''}
        {anyPredicted ? `${anyDevice ? '. ' : ' — '}where the flight and the prediction differ, the flight is the measurement` : ''}.
      </p>
      <DataTable
        // The caption names the columns that are actually there. Written as one string for the
        // prediction case first, which promised "what the logger stated" on a flight whose only
        // other source was a design — a caption describing a column the table does not have.
        caption={
          anyPredicted && anyDevice
            ? 'What was predicted and what the logger stated, beside Debrief’s independent read'
            : anyPredicted
              ? 'What the design’s simulator predicted, beside Debrief’s read of what flew'
              : "The logger's own reported figures beside Debrief's independent read"
        }
        copyLabel={anyPredicted ? 'Copy this cross-check' : 'Copy the logger’s summary'}
        rows={rows}
        rowKey={(x) => x.metric}
        columns={[
          { key: 'reading', header: 'Reading', cell: (x) => x.label, text: (x) => x.label },
          ...(anyPredicted
            ? [
                {
                  key: 'predicted',
                  header: syntheticHeader('Predicted', synthetic),
                  cell: (x: (typeof rows)[number]) => (
                    <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                      {x.predicted ? fmt(x.metric, x.predicted.reported.value, sys) : '—'}
                    </span>
                  ),
                  text: (x: (typeof rows)[number]) => (x.predicted ? fmt(x.metric, x.predicted.reported.value, sys) : '—'),
                },
              ]
            : []),
          ...(anyDevice
            ? [
                {
                  key: 'logger',
                  header: syntheticHeader('Logger', synthetic),
                  cell: (x: (typeof rows)[number]) => (
                    <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                      {x.hasDevice ? fmt(x.metric, x.r.value, sys) : '—'}
                    </span>
                  ),
                  text: (x: (typeof rows)[number]) => (x.hasDevice ? fmt(x.metric, x.r.value, sys) : '—'),
                },
              ]
            : []),
          {
            key: 'debrief',
            header: syntheticHeader('Debrief', synthetic),
            cell: (x) => (
              <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                {x.has ? fmt(x.r.metric, x.computed, sys) : '—'}
              </span>
            ),
            text: (x) => (x.has ? fmt(x.r.metric, x.computed, sys) : '—'),
          },
          // **`Agreement` is the DEVICE's column and appears only when a device stated something.**
          // It used to be unconditional, falling back to the prediction verdict on a row the
          // logger did not state — which put a prediction under a header reading "Agreement", the
          // one word this file's header says a prediction must never be judged in, and on a flight
          // carrying both sources rendered the identical accent chip twice in one row, once here
          // and once under `vs prediction`. One column per question now: the logger against
          // Debrief, and the design against Debrief, each present exactly when its source is.
          ...(anyDevice
            ? [
                {
                  key: 'agreement',
                  header: syntheticHeader('Agreement', synthetic),
                  cell: (x: (typeof rows)[number]) =>
                    !x.hasDevice ? (
                      // The logger stated nothing on this row. Not "not computed" — Debrief may well
                      // have computed it, and the design may state it; this cell is only about the
                      // logger, and the logger is silent.
                      <span className="text-zinc-500 dark:text-zinc-400">—</span>
                    ) : x.status == null ? (
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
                  text: (x: (typeof rows)[number]) => (x.hasDevice ? agreementText(x) : '—'),
                },
              ]
            : []),
          ...(anyPredicted
            ? [
                {
                  key: 'vs-prediction',
                  header: syntheticHeader('vs prediction', synthetic),
                  cell: (x: (typeof rows)[number]) =>
                    x.predicted ? predictionChip(x.predicted) : <span className="text-zinc-500 dark:text-zinc-400">—</span>,
                  text: (x: (typeof rows)[number]) => (x.predicted ? predictionVerdict(x.predicted) : '—'),
                },
              ]
            : []),
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
