'use client';

import type { FlightSegment, ReadExtent } from '@/lib/analyze/types';
import { fmtLength, fmtTime, type UnitChoice } from '@/lib/display';
import { Card } from './ui';

/**
 * Which flight in the download the flyer is reading, and a way to open any of the others.
 *
 * The vendor apps all show this list — at download time, on the device — and then write one
 * file per flight. A flyer who exported the whole session instead was told to go back and
 * split the file by hand. This is that list, over the file they already have.
 *
 * Every apogee is on the file's own pad datum (see `FlightSegment`), so the rows are
 * comparable with each other and the row for the flight on screen carries the analysis's own
 * figure. The one being read is marked with `aria-current` rather than only by colour.
 */
export default function FlightPicker({
  segments,
  extent,
  sys,
  onRead,
  busy,
}: {
  segments: FlightSegment[];
  extent: ReadExtent;
  sys: UnitChoice;
  /** Read this stretch instead. */
  onRead: (from: number, to: number) => void;
  /** True while a flight is being re-read, so a second click can't race the first. */
  busy?: boolean;
}) {
  // Which row is on screen. After a crop this is nobody, and the strip says so rather than
  // marking a row the readings no longer belong to.
  const current = segments.find((s) => s.from === extent.from && s.to === extent.to);
  return (
    <Card as="section" tone="sunken" className="print:hidden" aria-labelledby="flights-in-this-file">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3
          id="flights-in-this-file"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {segments.length} flights in this file
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {current
            ? `Reading flight ${current.index} — ${fmtTime(current.startTime)} to ${fmtTime(current.endTime)} of a ${fmtTime(extent.fileEndTime)} file.`
            : `Reading ${fmtTime(extent.startTime)} to ${fmtTime(extent.endTime)} of a ${fmtTime(extent.fileEndTime)} file — a stretch you chose.`}
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {segments.map((s) => {
          const here = current?.index === s.index;
          return (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => onRead(s.from, s.to)}
                disabled={busy || here}
                {...(here ? { 'aria-current': 'true' as const } : {})}
                className={`flex min-h-11 flex-col items-start rounded-md border px-3 py-1.5 text-left text-xs transition disabled:cursor-default ${
                  here
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-500/50 dark:bg-indigo-950/40 dark:text-indigo-100'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100'
                }`}
              >
                <span className="font-medium">
                  Flight {s.index}
                  {here ? ' · reading' : ''}
                </span>
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  {Number.isFinite(s.apogeeM) ? fmtLength(s.apogeeM, sys) : '—'} · {fmtTime(s.startTime)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
