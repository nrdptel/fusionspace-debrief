'use client';

import { useRef } from 'react';
import { FLIGHT_FILE_ACCEPT } from '@/lib/fileAccept';
import { DROPPABLE_SAMPLES, type Sample } from '@/lib/samples';
import { Button, Card, Chip } from './ui';
import { SYNTHETIC_TAG } from '@/lib/synthetic';

export default function DropZone({
  onFiles,
  onSample,
  busy,
}: {
  onFiles: (files: File[]) => void;
  onSample: (sample: Sample) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    if (files && files.length > 0) onFiles(Array.from(files));
  };

  return (
    <div>
      {/* The box has no drag handlers of its own. A file dropped ANYWHERE in the window is
          read now (components/useWindowFileDrop.ts) — the browser's default for a dropped
          file is to navigate to it, which used to throw a flyer out of the app whenever they
          released one in the margin, or on a report, where this box isn't rendered at all.
          A local handler here would also have ingested the same files twice as the drop
          bubbled up to the window. This stays as the visible affordance and the picker. */}
      {/* `tone="muted"` is `DESIGN.md` §2's "sunken and dashed: a slot with nothing in it yet",
          and this box's hand-rolled string was byte-identical to it — the tone had been added for
          exactly this and written out here anyway. `p-12` rather than the default `p-4`, because a
          page-level drop target is a target before it is a container. */}
      <Card tone="muted" pad={false} aria-label="Flight log drop zone" className="p-12 text-center transition">
        <p className="text-base font-medium text-zinc-800 dark:text-zinc-200">
          Drop a flight log here
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          CSV, text, or Excel export from your altimeter — or any logger&apos;s CSV or
          spreadsheet. Drop several at once, or a whole launch day&apos;s folder, to compare
          them — anywhere on the page.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choose files
          </Button>
          {/* `DROPPABLE_SAMPLES`, not the whole registry: a staged pair is offered on `/stitch`,
              because dropping a booster beside a sustainer here builds a COMPARISON and the
              comparison reports their apogees disagreeing by 30% — which is what two stages of one
              launch are supposed to do. See `Sample.kind`. */}
          <Button onClick={() => onSample(DROPPABLE_SAMPLES[0])} disabled={busy}>
            {DROPPABLE_SAMPLES[0].label}
          </Button>
        </div>
        {/* The other samples, in a sentence rather than as a row of equal buttons.
            `DESIGN.md` §5 gives `link` to "the one weight that sits INSIDE a sentence", and
            these are exactly that: a first-time visitor wants ONE obvious way in, not three
            competing ones, and the rest are an aside for someone who has already seen a flight.
            Until 2026-08-08 there was one sample and no aside — owner note ON-2. */}
        {DROPPABLE_SAMPLES.length > 1 && (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            or see what else it reads:{' '}
            {DROPPABLE_SAMPLES.slice(1).map((s, i) => (
              <span key={s.id}>
                {i > 0 && ' · '}
                <Button variant="link" onClick={() => onSample(s)} disabled={busy} title={s.shows}>
                  {s.label}
                </Button>
                {/* A sample Debrief MADE UP says so BEFORE it is opened, not only afterwards on
                    the report. Every sink in `lib/synthetic.test.ts` answers "does the claim
                    leave the app with the figure"; this answers a different question — does a
                    flyer know what they are about to look at — and a button offering an invented
                    flight beside three real recordings is where that is decided. The tag rather
                    than the sentence: this is a line of asides, and `s.shows` carries the whole
                    of it on the control's own title. */}
                {s.synthetic && (
                  <>
                    {' '}
                    <Chip
                      tone="warn"
                      value={
                        <>
                          {SYNTHETIC_TAG}
                          <span className="sr-only"> — a flight Debrief made up, not a recording</span>
                        </>
                      }
                    />
                  </>
                )}
              </span>
            ))}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          aria-label="Choose a flight log file"
          accept={FLIGHT_FILE_ACCEPT}
          className="sr-only"
          onChange={(e) => pick(e.target.files)}
        />
      </Card>
      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Your file is read in this browser and never uploaded — parsing and analysis happen entirely
        on your device.
      </p>
    </div>
  );
}
