'use client';

import type { RecentMeta } from '@/lib/recents';
import { fmtLength, fmtSpeed, type UnitChoice } from '@/lib/display';
import { Card } from './ui';

/**
 * Which RECORDING of this flight the readings on this page came from, and a way to open any of
 * the others.
 *
 * One level up from `FlightPicker`, which answers "which flight in this file". This answers
 * "which instrument". A flyer who flew a primary and a backup has two recordings of one flight,
 * and every headline reading on this page is one of them reading it — so the page has to say
 * which, or a cert document quoting an apogee cannot say which altimeter read it.
 *
 * It shows what each recording read, side by side, and never a number made out of both. Two
 * altimeters that measured one flight are two independent measurements that can disagree:
 * agreement is worth seeing and so is disagreement, and averaging them would hide both. On the
 * corpus's four-altimeter flight the apogees agree to 0.03% while the top speeds spread 6.7%, which is exactly the sort of thing this is here to put in front of a flyer.
 *
 * Absent entirely on a flight recorded once, which is nearly every flight.
 */
export default function RecordingPicker({
  recordings,
  currentId,
  sys,
  hidden,
  onOpen,
}: {
  /** Every recording of this flight, the one that reports it first. */
  recordings: RecentMeta[];
  /** The recording these readings are of — not necessarily the one that reports the flight,
   *  because a flyer can open any of them. */
  currentId: string;
  sys: UnitChoice;
  /** The readings this flyer has turned off, from the same stored profile the grid, every
   *  report and the shareable card read. A reading hidden everywhere else must not reappear
   *  here — this strip was the one surface that ignored the choice. */
  hidden?: string[];
  onOpen: (id: string) => void;
}) {
  const reportsIt = recordings[0]?.id;
  const showApogee = !hidden?.includes('Apogee');
  const showSpeed = !hidden?.includes('Max velocity');
  return (
    <Card as="section" tone="sunken" className="print:hidden" aria-labelledby="recordings-of-this-flight">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="recordings-of-this-flight" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {recordings.length} recordings of this flight
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Every reading below is off {currentId === reportsIt ? 'the recording this flight is reported by' : 'this recording'}.
          Independent instruments, shown as they read — never averaged together.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {recordings.map((rec) => {
          const here = rec.id === currentId;
          return (
            <li key={rec.id}>
              <button
                type="button"
                onClick={() => (here ? undefined : onOpen(rec.id))}
                {...(here ? { 'aria-current': 'true' as const, 'aria-disabled': true as const } : {})}
                className={`flex min-h-11 max-w-full flex-col items-start rounded-md border px-3 py-1.5 text-left text-xs transition aria-disabled:cursor-default ${
                  here
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-500/50 dark:bg-indigo-950/40 dark:text-indigo-100'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100'
                }`}
              >
                <span className="max-w-[16rem] truncate font-medium">
                  {rec.name}
                  {here ? ' · reading' : ''}
                </span>
                {/* No figure on the card you are reading — the whole page below IS that
                    figure, at full precision and with its caveats. Repeating it here would
                    also be repeating the LOGBOOK's copy of it, which is the reading of the
                    stretch this recording was last saved over: crop the flight and the two
                    disagree until the next save, which would paint a difference between one
                    instrument and itself on the surface built to show real ones. */}
                {/* P1 item 2. These were `text-[11px]`, which §3 reserves for axis ticks and
                    diagram annotations — and they are the numbers a flyer reads to decide WHICH
                    RECORDING of one flight to trust, which is the decision this whole surface
                    exists for. §3's floor for a value read to make a decision is `text-sm`;
                    `tabular-nums` because they are scanned down a column, instrument against
                    instrument, and that comparison is the point. */}
                <span className="font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                  {here
                    ? 'the readings below'
                    : [
                        showApogee ? (rec.apogeeM != null ? fmtLength(rec.apogeeM, sys) : '—') : null,
                        showSpeed ? (rec.maxVelocityMs != null ? fmtSpeed(rec.maxVelocityMs, sys) : '—') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                  {rec.id === reportsIt ? ' · reports this flight' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
