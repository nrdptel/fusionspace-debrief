import type { FlightMetrics } from '@/lib/analyze/types';
import { visibleRows } from '@/lib/reportProfile';
import { metricTiles } from '@/lib/readings';
import ReadingChooser from './ReadingChooser';
import { Card, Extrapolated, Readout } from './ui';
import { fmtLength, fmtTime } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import type { Tile } from '@/lib/readings';

/**
 * The label, and a way to find out what it means.
 *
 * Every reading in this grid is a term of art — "Coast efficiency", "Max Q",
 * "Thrust-to-weight", "Tilt at burnout" — and none of them carried a title, a help
 * affordance or a link. The methods page defines all of them and had no anchors to point
 * at, so learning what one meant was: leave the report (which then had no address to come
 * back to), open the methods page, and read down 45 blocks of prose.
 *
 * A quiet superscript link rather than a tooltip: a tooltip is hover-only, which is nothing
 * at all on the phone this tool is built to be used on, and the answer is a paragraph rather
 * than a phrase. `target="_blank"` so the report is not traded for the definition.
 */
function ReadingLabel({ tile }: { tile: Tile }) {
  if (!tile.method) return <>{tile.label}</>;
  return (
    <>
      {/* The label keeps its own element, so the tile's text is still exactly the reading's
          name — for a reader, for a screen reader, and for the assertions that identify a
          tile by it. Folding the link into the same node made every tile read "Max Q ?". */}
      <span>{tile.label}</span>{' '}
      <a
        href={`/methods#${tile.method}`}
        target="_blank"
        rel="noopener"
        aria-label={`How ${tile.label.toLowerCase()} is worked out — opens the methods page`}
        title={`How ${tile.label.toLowerCase()} is worked out, and where it can be wrong`}
        className="touch-area font-normal text-zinc-400 no-underline transition hover:text-indigo-600 dark:text-zinc-500 dark:hover:text-indigo-400 print:hidden"
      >
        <span aria-hidden="true">?</span>
      </a>
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
                corpus can check runs high too, by 23%, 30% and 110%. An accelerometer or an inertial solution
                would settle it.
              </>
            ) : (
              <>
                a barometer can&apos;t confirm supersonic flight (the shock over the pressure port distorts the sensed
                pressure from about Mach 0.9 up, and the error runs both ways). An accelerometer or an inertial
                solution would settle it.
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
