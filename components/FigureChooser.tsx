'use client';

// Which plots a DOCUMENT carries. Shared by the two surfaces that produce documents — the
// single-flight report and the comparison — because they were doing the same job and only one
// of them offered the choice: the report filtered its figures through the flyer's stored
// selection while the comparison exported a hardcoded altitude/velocity/acceleration, so a
// flyer who turned Acceleration off still got it in the comparison bundle. `CONTRIBUTING.md`'s
// rule for the readings lists applies here too — where two surfaces do the same job they share
// a module rather than a resemblance.
//
// This is about the document, never the analysis: every figure a flight supports is still drawn
// on screen, and turning them all off leaves a report of numbers, which is a legitimate answer
// for a table-only write-up.

import { TOUCH_TARGET_SQUARE } from '@/lib/ui-tokens';
import { Chip, ChipButton, IconButton } from './ui';

export default function FigureChooser({
  titles,
  hidden,
  onToggle,
  onMove,
  colorOf,
  onColor,
  onClearColor,
  what,
}: {
  /** Every figure this surface could carry, chosen or not, ALREADY in the flyer's order — the
   *  caller applies `orderRows` so the chooser and the document cannot disagree about it. */
  titles: string[];
  /** The ones turned off, by title — the same off-list `lib/reportProfile.ts` stores, so a
   *  figure a flight gains later appears rather than being excluded by a list written before
   *  it existed. */
  hidden: string[];
  onToggle: (title: string) => void;
  /** Move one figure earlier or later in the document. Omitted where a surface has only one
   *  figure to place. */
  onMove?: (title: string, delta: -1 | 1) => void;
  /** The colour this figure is drawn in, where the surface offers a choice of it. All three
   *  arrive together or none does — a swatch that shows a colour without changing it, or
   *  changes it with no way back, is worse than no swatch. */
  colorOf?: (title: string) => string;
  onColor?: (title: string, color: string) => void;
  onClearColor?: (title: string) => void;
  /** Which artefacts the choice reaches, named so the control says what it does. */
  what: string;
}) {
  if (titles.length < 2) return null;
  const allOff = titles.every((t) => hidden.includes(t));
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Figures in the report</span>
      {titles.map((t, i) => {
        const on = !hidden.includes(t);
        return (
          <span key={`${t}-group`} className="inline-flex items-center gap-1">
            {colorOf && onColor && onClearColor && (
              // **The hit area lives on the LABEL, because it cannot live on the input.** A colour
              // input is a REPLACED element and generates no `::after`, so the `.touch-area` helper
              // every other small control here relies on is powerless on it — measured 0×0 at a
              // 390 px touch viewport. Only the stylesheet's coarse-pointer `min-height` landed,
              // which left the swatch 44 px tall and **12 px wide**. An implicit label forwards a
              // tap to the control it wraps, so the target reaches the touch floor while the ink
              // stays the small round swatch the row is built around.
              <label className={`${TOUCH_TARGET_SQUARE} inline-flex shrink-0 cursor-pointer items-center justify-center`}>
                <input
                  type="color"
                  value={colorOf(t)}
                  onChange={(e) => onColor(t, e.target.value)}
                  onDoubleClick={() => onClearColor(t)}
                  aria-label={`Colour for the ${t.toLowerCase()} figure — double-click to reset`}
                  title={`Colour for the ${t.toLowerCase()} figure — double-click to reset`}
                  className="h-3 w-3 shrink-0 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                  style={{ backgroundColor: colorOf(t) }}
                />
              </label>
            )}
          <ChipButton
            key={t}
            pressed={on}
            // `accent` keeps the indigo an included figure has always had. It is deliberately not
            // the default tone `EventChips` uses for its own on/off chips: that set answers "is
            // this mark drawn on the plot", which is a view setting, and this one answers "is this
            // plot IN THE DOCUMENT", which is what the flyer is about to hand someone. Same
            // primitive, same geometry, and the louder of the two is the one with consequences.
            tone="accent"
            onClick={() => onToggle(t)}
            // Named "<title> figure", not "<title>". The comparison surface already has a
            // channel picker whose buttons are Altitude / Velocity / Acceleration, and a second
            // set with the identical accessible name would make every existing query for one of
            // them ambiguous — for a screen-reader user as much as for a test. The visible label
            // stays the bare title; only the accessible name says which control this is.
            aria-label={`${t} figure`}
            title={`${on ? 'Leave out' : 'Include'} the ${t.toLowerCase()} plot — applies to ${what}`}
            // **`line-through` by hand, and it is kept on purpose.** `ChipButton`'s off state is a
            // dashed border and muted text, which says "not selected" — right for a filter. This
            // control says which plots go in a document, so the off state means LEFT OUT, and a
            // struck-through title says that where a dimmed one only says "not chosen". The rest
            // of the treatment — geometry, ramp, focus ring, touch area — is the primitive's; this
            // was previously a full hand-roll at `py-0.5`, off §5's `px-2 py-1` and off the touch
            // contract with it.
            className={on ? undefined : 'line-through'}
          >
            {t}
          </ChipButton>
          {/* Order is the other half of "this document is mine" — a certification package
              leads with the plot the certification asks for. Same control and same stored-order
              helpers as the readings chooser, so the two do not drift. */}
          {onMove && titles.length > 1 && (
            <>
              <IconButton
                onClick={() => onMove(t, -1)}
                disabled={i === 0}
                aria-label={`Move the ${t.toLowerCase()} figure earlier`}
                title="Move earlier"
              >
                ▲
              </IconButton>
              <IconButton
                onClick={() => onMove(t, 1)}
                disabled={i === titles.length - 1}
                aria-label={`Move the ${t.toLowerCase()} figure later`}
                title="Move later"
              >
                ▼
              </IconButton>
            </>
          )}
          </span>
        );
      })}
      {allOff ? (
        <Chip tone="accent" mono={false} value="None — the document carries its numbers and no plots." />
      ) : (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Applies to {what}.
          {/* The way back out of a colour change, said in TEXT. It was in the swatch's `title` and
              its `aria-label` and nowhere else, so on a phone — no hover — a flyer who recoloured a
              figure had no way to learn there was a default to return to. `e2e/hoverOnly.ts` is what
              found it, and it is the same shape as the defect a competitive probe caught in D9: a
              fact that exists only in a tooltip does not exist at the range. */}
          {colorOf && onClearColor && ' Tap a swatch to recolour a figure, or double-tap it for the default.'}
        </span>
      )}
    </div>
  );
}
