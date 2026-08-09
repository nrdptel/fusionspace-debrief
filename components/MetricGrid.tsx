import type { FlightMetrics } from '@/lib/analyze/types';
import { visibleRows } from '@/lib/reportProfile';
import { metricTiles } from '@/lib/readings';
import ReadingChooser from './ReadingChooser';
import { derivedPeakList } from '@/lib/derivedPeak';
import { Button, Card, Extrapolated, Popover, Readout, Sources } from './ui';
import { METHOD_CONTENT } from '@/lib/methods/content';
import { sourcesFor } from '@/lib/methods/references';
import { fmtLength, fmtTime } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import type { Tile } from '@/lib/readings';

/**
 * The label, and the explanation — where the reading is, not on another page.
 *
 * Every reading in this grid is a term of art — "Coast efficiency", "Max Q",
 * "Thrust-to-weight", "Tilt at burnout" — and none of them carried a title, a help
 * affordance or a link. That was fixed once by pointing each at an anchor on the methods
 * page; owner note `ON-3` is about what that cost: *"it would be nice if clicking on any of
 * the question marks would just open up a pop up not to a seperate page."*
 *
 * Measured before this change: **21 of the grid's tiles carried a `?`, and all 21 opened a
 * second tab** on a 12,700-word document, landing on an anchor among 51 blocks. A flyer
 * looking up one word lost their place in the report to get it.
 *
 * **The original comment here rejected a TOOLTIP, and was right to** — hover is nothing at all
 * on the phone this tool is built for, and the answer is a paragraph rather than a phrase. A
 * popover is not a tooltip: it is click- and tap-activated, keyboard-reachable and dismissible,
 * so the objection that ruled out the alternative never applied to this one. `DESIGN.md` §5
 * gained `Popover` for it.
 *
 * **The text is `lib/methods/content.tsx`, the same module the methods page renders.** Not a
 * summary written beside it — that is the "resemblance" the architecture invariant forbids, and
 * it would leave a flyer reading two different accounts of one number the first time either was
 * edited. The full page is still one click away for anyone who wants the neighbouring blocks.
 */
function ReadingLabel({ tile }: { tile: Tile }) {
  if (!tile.method) return <>{tile.label}</>;
  const entry = METHOD_CONTENT[tile.method];
  return (
    <>
      {/* The label keeps its own element, so the tile's text is still exactly the reading's
          name — for a reader, for a screen reader, and for the assertions that identify a
          tile by it. Folding the control into the same node made every tile read "Max Q ?". */}
      <span>{tile.label}</span>{' '}
      <Popover
        // A glyph trigger, so `label` is the accessible name rather than a replacement for
        // visible words — see the primitive's own note on WCAG 2.5.3.
        label={`How ${tile.label.toLowerCase()} is worked out`}
        description={`How ${tile.label.toLowerCase()} is worked out, and where it can be wrong`}
        title={entry.title}
        trigger={<span aria-hidden="true">?</span>}
        // §5's weight for a control that sits inside a sentence: no control padding, so the
        // tile's heading still reads as one line rather than a label with a button after it.
        triggerVariant="link"
        triggerClassName="touch-area font-normal text-zinc-400 no-underline hover:text-indigo-600 dark:text-zinc-500 dark:hover:text-indigo-400"
        align="start"
        width="w-96"
      >
        {entry.body}
        {/* The same sources line the page shows. A citation that appeared on `/methods` and not
            here would be the caveat-on-one-surface failure, on the sentence that says where the
            number came from — and this popover is where a flyer meets the reading. */}
        <div className="mt-3">
          <Sources items={sourcesFor(entry.cites)} />
        </div>
        <p className="mt-3">
          <Button variant="link" href={`/methods#${tile.method}`} className="underline">
            Read this on the methods page
          </Button>
        </p>
      </Popover>
    </>
  );
}

export default function MetricGrid({
  metrics,
  sys,
  hidden,
  onToggle,
}: {
  metrics: FlightMetrics;
  sys: UnitChoice;
  /** Readings the flyer has turned off; undefined means the chooser isn't offered. */
  hidden?: string[];
  onToggle?: (label: string) => void;
}) {
  const everything = metricTiles(metrics, sys);
  const all = visibleRows(everything, (t) => t.label, hidden);
  const primary = all.filter((t) => t.primary);
  const rest = all.filter((t) => !t.primary);

  return (
    <div className="space-y-4">
      {/* Both grids are the same tile at two weights — one `Card`, one `Readout`, `hero` on the
          readings the page exists to show. They used to be two hand-rolled treatments ten lines
          apart, the second on the middle radius that is not in the system at all, and both values
          `font-mono` with no `tabular-nums` — so the digits of two readings in one grid did not
          line up. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {primary.map((t) => (
          <Card key={t.label} data-reading={t.label}>
            <Readout size="hero" label={<ReadingLabel tile={t} />} value={t.value} sub={t.sub} />
          </Card>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {rest.map((t) => (
            <Card key={t.label} data-reading={t.label}>
              <Readout label={<ReadingLabel tile={t} />} value={t.value} sub={t.sub} />
            </Card>
          ))}
        </div>
      )}
      {/* A report is written for a purpose — a cert package, a drag study, a club post —
          so which readings it carries is the flyer's call, made once and followed by every
          report export and by the comparison. */}
      {onToggle && (
        <ReadingChooser
          labels={everything.map((t) => t.label)}
          hidden={hidden ?? []}
          onToggle={onToggle}
          where="Applies here and to the .txt, .md and .html reports and the bundle."
          noun="report"
        />
      )}

      {metrics.transonicTime != null &&
        (metrics.transonicUnconfirmed ? (
          <Extrapolated>
            Reads transonic — the {metrics.derivedVelocityFrom === 'gps' ? 'GPS-derived' : 'barometric'} speed crosses
            Mach 1
            {metrics.transonicAltitude != null ? ` around ${fmtLength(metrics.transonicAltitude, sys)}` : ''}, but{' '}
            {metrics.derivedVelocityFrom === 'gps' ? (
              <>
                a speed worked out from a GPS altitude can&apos;t confirm supersonic flight. Nothing distorts a GPS
                through the transonic region, but differentiating a coarse, lagging altitude runs the peak high — on
                the corpus GPS flight a second instrument also recorded, this read came out about 5% above the
                measured speed, and 9% above the tracker&apos;s own stated figure. Every other derived peak the
                corpus can check usually runs high too — the pairs span {derivedPeakList('speed')}. An
                accelerometer or an inertial solution would settle it.
              </>
            ) : (
              <>
                a barometer can&apos;t confirm supersonic flight: the shock over the pressure port distorts the
                sensed pressure from about Mach 0.9 up, and the error runs both ways — the corpus pairs span
                {' '}{derivedPeakList('speed')}, usually high but not always, so this figure bounds the speed
                in neither direction. An accelerometer or an inertial solution would settle it.
              </>
            )}
          </Extrapolated>
        ) : (
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Went supersonic — crossed Mach 1
            {metrics.transonicAltitude != null ? ` at ${fmtLength(metrics.transonicAltitude, sys)}` : ''},{' '}
            {fmtTime(metrics.transonicTime)} after liftoff.
          </p>
        ))}
    </div>
  );
}
