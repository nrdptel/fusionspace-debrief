'use client';

import * as React from 'react';
import Link from 'next/link';

import { copyTable } from '@/lib/copyTable';
import { TOUCH_TARGET, TOUCH_TARGET_SQUARE } from '@/lib/ui-tokens';

/**
 * The shared primitive layer — `DESIGN.md` §5.
 *
 * Before this file existed Debrief had **44 components and zero cross-component imports**: every
 * card, chip and button was hand-rolled per file, which is why the measured counts were 26 middle
 * radii, 6 distinct card treatments, 25 off-scale spacing values, 90 hand-rolled `<button>`
 * elements, and 26 of 44 component files where caption size outnumbered the body default. That is
 * the mechanism behind an app reading as assembled rather than designed.
 *
 * **The names and the implementations are the sibling app's**, deliberately. `DESIGN.md` §10 makes
 * the suite one product to a flyer who uses both, and two apps that each invent a `Card` have a
 * design system each, not one. Where a primitive here differs from the sibling's it is because
 * Debrief's surfaces need something the sibling's do not — say which, in the primitive's own
 * comment, so the divergence is a decision rather than a drift.
 *
 * **One thing these primitives deliberately do NOT carry, and one they must.**
 * - **No focus ring.** `globals.css`'s `:focus-visible` rule is UNLAYERED, and an unlayered rule
 *   beats anything in `@layer utilities` whatever its specificity — so a `focus-visible:outline-*`
 *   utility on a button here is not a second belt, it is inert. Measured 2026-07-31, after adding
 *   some and finding they changed nothing.
 * - **The 44 px touch floor, on the primitive as well as in the stylesheet.** Not because the
 *   stylesheet misses it — an earlier version of this comment claimed `e2e/touch.spec.ts` could not
 *   see the media query, and that was simply false: `touch.spec.ts:11` sets `hasTouch: true`, which
 *   arms `pointer: coarse` exactly as a phone does. The honest reason is narrower. `globals.css`
 *   covers bare `button`, `select`, `[role="button"]` and `input`; it does not cover `<label>`,
 *   `<summary>` or a plain `<a>`, which `Button href=` renders and which several surfaces use as
 *   controls. Carrying the token on the primitive puts the contract where a component author will
 *   see it, and the two mechanisms agree by construction — both are `pointer: coarse`, both 44 px.
 *
 * `lib/design-system.test.ts` is the executable copy of `DESIGN.md` §9 and holds the counts to an
 * exact ratchet, so a conversion has to record itself and a new hand-rolled treatment fails.
 */

/** Join class strings, dropping the empty ones so a caller can pass `undefined` without a stray space. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Focus return for a dismissible surface — `DESIGN.md` §5, which names this hook and nothing else
 *  implemented it. Two surfaces hand-rolled all three of its parts: the logbook's Clear confirm
 *  (`RecentFlights`) and the privacy page's Forget-these-settings confirm (`ForgetDeviceData`).
 *  They are the same control written twice — an armed destructive confirm — and `ForgetDeviceData`'s
 *  own comment says so ("the same shape the logbook's Clear confirm settled on, down to the Escape
 *  handler living on the panel"). A resemblance recorded in a comment is what §1 calls a
 *  just-this-once.
 *
 *  **§5 attaches this hook to `Panel`, and `Panel` is deliberately still not built.** §5 describes
 *  it as "a `Card` with a header row and a close affordance", and `ROADMAP.md` named `UnitsControl`
 *  and `FigureChooser` as the two surfaces hand-rolling it. Measured 2026-08-02, both are wrong:
 *  `UnitsControl` is a native `<details>`/`<summary>`, where the browser owns dismissal and focus
 *  never leaves the summary, and `FigureChooser` is an inline row of toggle chips with no dismiss
 *  at all. Nothing in the app has the shape §5 draws, so a `Panel` built today would be a primitive
 *  with no call site — which `Figure`'s own comment already settled: a guard that fires on nothing
 *  is worse than none. What DOES exist twice is the focus behaviour, so that is what is lifted.
 *
 *  The three parts, and why each is here rather than at the call site:
 *  - **`safeRef` is focused when the surface opens**, so a keyboard or screen-reader flyer lands
 *    inside the thing that just appeared — and lands on the SAFE control, never on the destructive
 *    one.
 *  - **`dismiss()` closes and puts focus back on `triggerRef`.** The trigger must stay MOUNTED
 *    behind the surface: a control that unmounts itself has already nulled its own ref, so
 *    restoring focus to it silently does nothing and drops the flyer to the body, from where the
 *    next Tab can land on the destructive button. Both call sites carry that comment; neither
 *    could enforce it.
 *  - **`onKeyDown` is Escape.** It works only because focus is genuinely inside the surface, which
 *    is the first bullet — the two are one mechanism and separating them is how one of them gets
 *    left out.
 *
 *  `close` is read through a ref so `dismiss` keeps one identity across renders and a call site can
 *  pass an inline arrow without re-arming anything that depends on it.
 *
 *  **Two limits, stated because a primitive that hides them is worse than a hand-roll.**
 *  - **The mounted-trigger contract is not ENFORCED, only documented.** `dismiss()` on an
 *    unmounted trigger no-ops silently and focus lands on the body — the exact bug this exists to
 *    prevent, now wearing a primitive's name. There is no cheap runtime check that is not itself
 *    noise, so the guarantee is the review, and `lib/design-system.test.ts` holds the narrower one:
 *    focus is moved from this file and nowhere else.
 *  - **The open effect fires on any false→true transition**, so a future call site whose surface
 *    starts open would steal focus on first paint. Both of today's start closed. */
export function useReturnFocus(
  open: boolean,
  close: () => void,
): {
  /** The control that opens the surface. Must stay mounted while the surface is open. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** The safe way out INSIDE the surface — "Keep them", never "Delete". */
  safeRef: React.RefObject<HTMLButtonElement | null>;
  dismiss: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
} {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const safeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) safeRef.current?.focus();
  }, [open]);

  const closeRef = React.useRef(close);
  React.useEffect(() => {
    closeRef.current = close;
  });

  const dismiss = React.useCallback(() => {
    closeRef.current();
    triggerRef.current?.focus();
  }, []);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    },
    [dismiss],
  );

  return { triggerRef, safeRef, dismiss, onKeyDown };
}

/** The tones a container is allowed to take — `DESIGN.md` §2. Each says something; none is decoration. */
const CARD_TONES = {
  /** The default raised container. */
  default: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
  /** The one thing this surface is pointing at — the reading being nominated, the flight in hand. */
  accent: 'border-indigo-500/30 bg-indigo-500/5 dark:border-indigo-500/40 dark:bg-indigo-500/10',
  /** An estimate outside its envelope, an extrapolation, a caveat. */
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  /** A refusal, or a value that could not be computed. */
  danger: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200',
  /** `DESIGN.md` §2's third surface level, as a container: an inset note or readout block inside a
   *  page. Debrief needs this and the sibling does not — an analysis page is mostly secondary
   *  explanation around a primary reading, and that explanation was being written out by hand as
   *  `border-zinc-200 bg-zinc-50 px-4 py-3` at four sites. */
  sunken:
    'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400',
  /** Sunken and dashed: a slot with nothing in it yet. The empty state's container. */
  muted:
    'border-dashed border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400',
} as const;

export type CardTone = keyof typeof CARD_TONES;

/** The raised container — `DESIGN.md` §5. Every card in the app is this one.
 *
 *  `as` exists because a container's ELEMENT is not a style choice: several of these are landmarks
 *  the e2e suite reaches by `getByRole('region', …)`, and silently turning a `<section>` into a
 *  `<div>` would take them out of the accessibility tree. `id`, `role`, `aria-label` and the rest
 *  pass straight through, so adopting the primitive costs a call site nothing it already had —
 *  **with one exception: `title` here is the card's HEADING, not the native tooltip attribute.**
 *  The name is the sibling's and is kept for that reason, but the native one is `Omit`ted from the
 *  passthrough rather than left to collide: intersected, the two types produce `ReactNode & string`,
 *  which quietly rejects a heading element and would have let a call site's tooltip vanish without
 *  a word. When a card needs a tooltip, put it on the element inside. */
export function Card({
  as: Tag = 'div',
  tone = 'default',
  pad = true,
  title,
  actions,
  className,
  children,
  ref,
  ...rest
}: {
  /** `'li'` is here for the logbook row, which is a card AND a list item: a flight in a list of
   *  flights. Rendering it as a `<div>` to fit the primitive would take the row out of the list
   *  semantics a screen reader announces ("3 of 12"), which is the exact trade `as` exists to
   *  refuse — a container's element is not a style choice. */
  as?: 'div' | 'section' | 'aside' | 'details' | 'li';
  tone?: CardTone;
  /** Forwarded to the element. React 19 passes `ref` as an ordinary prop, so this needs no
   *  `forwardRef` — but it does need declaring, because `HTMLAttributes` does not carry it and
   *  two call sites (the channel explorer's chart host, the ground track's canvas host) measure
   *  their own box to size what they draw inside it. Without this they would have had to keep a
   *  hand-rolled `<div>` around the primitive, which is the hand-roll this milestone removes.
   *
   *  Typed to the DIV rather than to `HTMLElement`, which is exact rather than lax: both call sites
   *  hold a `useRef<HTMLDivElement>`, and widening it to `HTMLElement` would need a cast at the
   *  render below without buying anything — `as` only ever changes which element renders, and a
   *  caller wanting a `<details>` ref can widen this the day one exists. */
  ref?: React.Ref<HTMLDivElement>;
  /** `p-4` — the card padding from `DESIGN.md` §4. Off only where the card's own content owns its
   *  edges: a table that bleeds to the border, a chart that fills it. */
  pad?: boolean;
  title?: React.ReactNode;
  /** Controls that belong to the title row rather than to the body. */
  actions?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  // `Tag` is a union of four intrinsics, and JSX takes the INTERSECTION of their prop types — so a
  // `ref` typed for any one arm is rejected as incompatible with the other three. Narrowing to one
  // arm for the JSX call is the whole of the workaround; `rest` is already `HTMLAttributes<HTMLElement>`,
  // which every arm accepts, and the runtime element is whatever `as` asked for.
  const El = Tag as 'div';
  return (
    <El
      ref={ref}
      className={cx('rounded-xl border', CARD_TONES[tone], pad && 'p-4', className)}
      {...rest}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100">{title}</h3>}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </El>
  );
}

/** A bordered clip around content that owns its own surface, and the ONE thing that separates it
 *  from `Card` is that it has no background.
 *
 *  That sounds like a missing prop and is not. `lib/design-system.test.ts` records the measurement:
 *  five sites shared this treatment and every one of them holds something that paints its own fill —
 *  a `<canvas>`, a scrolling table with a `bg-zinc-50` sticky header, a divided `<dl>`. `SampleTable`
 *  is the proof. Its sticky `<thead>` is `dark:bg-zinc-900`, which is exactly `Card`'s default dark
 *  tone: on the page's `dark:bg-zinc-950` body the transparent frame lets that header read as a
 *  distinct lighter band, and putting it on a `Card` flattens band and container into one colour so
 *  the header stops being a header. So a `tone="none"` on `Card` would not be the same component with
 *  a value switched off — it would be a container whose defining property is absent.
 *
 *  `DESIGN.md` §9 sanctions exactly this: "a treatment that matches the grep but is genuinely not a
 *  card … gets its own named primitive rather than a `shadow` prop on `Card`."
 *
 *  Padding is off by default, because most of these are scroll shells whose content bleeds to the
 *  border. Pass it in `className` where a frame does own its edges. */
/** The elements a frame is allowed to be, and the DOM type each one hands to a `ref`.
 *
 *  A frame's element is not a style choice, for the same reason `Card`'s is not: two of these are a
 *  `<canvas>` and a `<dl>`, and rendering either as a `<div>` would change what the markup MEANS
 *  rather than how it looks. Only the tags that have a call site are here — a union member with no
 *  caller is config surface nobody asked for. */
type FrameElements = { div: HTMLDivElement; dl: HTMLDListElement; canvas: HTMLCanvasElement };

export function Frame<T extends keyof FrameElements = 'div'>({
  as: Tag = 'div' as T,
  className,
  children,
  ref,
  ...rest
}: {
  as?: T;
  /** Keyed off `as` rather than off itself.
   *
   *  `Card`'s is fixed to the div, which the frames cannot use: `SampleTable` measures its scroll
   *  shell and `FlightCard` draws into a `<canvas>`. The obvious loosening — a bare
   *  `ref?: React.Ref<T>` with `T` free — was written here first and is worse than the fixed
   *  version rather than better, because `T` then occurs in exactly one place and is INFERRED FROM
   *  THE REF: `<Frame as="dl" ref={aCanvasRef}>` type-checks and hands a `<dl>` to a canvas ref. A
   *  type that defines itself can never be wrong. Indexing the map makes `as` decide it, so that
   *  call is the error it should be. */
  ref?: React.Ref<FrameElements[T]>;
} & React.HTMLAttributes<HTMLElement>) {
  // The same narrowing `Card` does for its own `Tag`: JSX intersects the prop types of a union of
  // intrinsics, so a `ref` typed for one arm is rejected by the others. The cast is confined to
  // this line; the contract above it is exact.
  const El = Tag as 'div';
  return (
    <El ref={ref as React.Ref<HTMLDivElement>} className={cx(FRAME, className)} {...rest}>
      {children}
    </El>
  );
}

/** The frame's own class string, shared with `DataTable` — which needs it CONDITIONALLY (only a
 *  table given a `maxHeight` gets a scroll shell; a short one sits directly in whatever contains it
 *  and a second border would double up), so it cannot render `<Frame>` unconditionally without
 *  either two branches or a `bordered` prop that exists for one caller. Inside the primitive layer,
 *  sharing the token is the right answer; outside it, use `<Frame>`. */
const FRAME = 'rounded-xl border border-zinc-200 dark:border-zinc-800';

/** A titled region within a route — `DESIGN.md` §5. What a route is built from.
 *
 *  `title` is the section's HEADING, not the native tooltip attribute, so the native one is
 *  `Omit`ted from the passthrough for the same reason `Card` omits it. **This was missed here and
 *  caught only when the primitive gained its first adopter**: intersected rather than omitted, the
 *  two produce `ReactNode & string`, so `title` silently accepts a plain string and rejects every
 *  heading carrying markup — an `<em>`, or an `&apos;`. Fourteen sections on the two docs routes
 *  failed `tsc` at once. A primitive with zero adopters is a primitive whose contract has never
 *  been executed, which is the argument for adopting one rather than merely shipping it. */
export function Section({
  title,
  description,
  actions,
  className,
  children,
  ...rest
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={cx('mt-8 first:mt-0', className)} {...rest}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium text-zinc-900 dark:text-zinc-100">{title}</h2>
          {description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The five button weights §5 names — three plain weights, plus `danger`, which is `secondary`'s geometry in the
 *  refusal colour. `DESIGN.md` §5.
 *
 *  **At most one `primary` per surface.** Two primaries on one screen means neither is. */
const BUTTON_VARIANTS = {
  primary:
    'border border-transparent bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
  secondary:
    'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
  ghost:
    'border border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
  danger:
    'border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10',
  // `DESIGN.md` §5's fifth weight: a control that sits INSIDE a sentence. No border, no fill and —
  // uniquely — no control padding, because `px-3 py-1.5` in running text breaks the line and a
  // hover fill on a word reads as a selection. The underline is the whole hover affordance.
  //
  // **A caution, since a first comment here had it backwards:** `Button`'s
  // `disabled:hover:bg-white` is a positive paint, not a switch-off, so a DISABLED `link` would
  // paint a white rectangle behind the word on hover. No call site passes `disabled` today; if one
  // ever does, that rule needs a `link` exemption rather than this comment needing a rewrite.
  link: 'border border-transparent text-indigo-600 hover:underline dark:text-indigo-400',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

/** The spacing inside a control, from `DESIGN.md` §4 — `px-3 py-1.5`, and `px-2 py-1` at caption size. */
const BUTTON_SIZES = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
} as const;

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  href,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
  /** Render an `<a>` instead, with the same treatment. A control that navigates is still a button
   *  to a flyer, but it is a LINK to a browser and to a screen reader — and wrapping this in a
   *  `<Link>` instead nests an `<a>` around a `<button>`, which is invalid, gives the row two
   *  focus stops, and leaves the anchor short of the touch floor because only the inner element
   *  carries it. */
  href?: string;
  /** Only meaningful beside `href`, and declared because `ButtonHTMLAttributes` does not carry
   *  them: the `href` branch already spreads them onto the anchor at runtime, so without these
   *  the type was the only thing stopping an external link from using this primitive — and the
   *  one that tried hand-rolled an `<a>` instead. `rel` is the caller's to get right; this does
   *  not default it, because a same-origin link does not want `noopener noreferrer`. */
  target?: string;
  rel?: string;
  /** Declared explicitly because `ButtonHTMLAttributes` does not carry it. React 19 passes `ref`
   *  to a function component as an ordinary prop, so no forwarding wrapper is needed — but the
   *  type has to say so, and the surfaces that return focus to a control hand it a ref. */
  ref?: React.Ref<HTMLButtonElement>;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cx(
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition',
    // `disabled:hover:*` has to be here rather than at a call site: `hover:bg-*` comes from the
    // variant, so without this a disabled button still lights up under the pointer as though it
    // were pressable. `IconButton` already carried it; `Button` did not, and the one call site
    // with a `disabled` prop had been spelling half of it out by hand.
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-zinc-900',
    BUTTON_VARIANTS[variant],
    // **`link` takes neither, and that is the variant's definition rather than an exception.**
    // `BUTTON_SIZES` is control padding; it is right for a control a thumb aims at and wrong for a
    // word inside a paragraph, which is sized by the text around it. `TOUCH_TARGET` goes with it
    // for tidiness only — see below, it is not what makes these hittable.
    //
    // **The opt-out is an empty string, and the first version wrote `text-inherit`.** That is
    // Tailwind's COLOUR utility (`color: inherit`), not a size opt-out, and `cx` is a plain join —
    // so the element shipped `text-indigo-600 text-inherit`, adjacent in one `@layer utilities`
    // run at equal specificity, and the later one won. Every `link` rendered in the surrounding
    // prose colour in LIGHT mode while dark mode looked right, because `dark:text-indigo-400` is
    // emitted later still. Caught by the pre-push review reading the built stylesheet; nothing in
    // the gate can see it, because the roles and names the e2e suite asserts on never changed.
    //
    // **`link` does NOT lose the 44 px floor, whatever §5 used to say.** `app/globals.css` floors
    // every bare `button` at 44×44 under `@media (pointer: coarse)`, with no exemption for one
    // inside a `<p>`, and `e2e/touch.spec.ts` measures exactly that. Dropping `TOUCH_TARGET` here
    // is a no-op for the button branch. It is NOT a no-op for the `href` branch below, which
    // renders an `<a>` that `globals.css` does not cover — so `variant="link"` with `href` is the
    // one shape that would genuinely be under-sized. Nothing uses it; `BACKLOG.md` carries it.
    variant === 'link' ? '' : cx(BUTTON_SIZES[size], TOUCH_TARGET),
    className,
  );
  if (href != null) {
    return (
      <Link href={href} className={classes} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A one-glyph button — a reorder arrow, a dismiss ✕, a zoom step.
 *
 *  Its own primitive rather than a `Button` size, because the thing that makes it different is the
 *  touch contract and not the padding: a control whose label is a single character clears the
 *  height minimum and still lands around 24 px wide, so it needs the minimum in BOTH directions
 *  (`DESIGN.md` §8). Debrief has these and the sibling does not. */
export function IconButton({
  variant = 'ghost',
  className,
  type = 'button',
  children,
  ...rest
}: {
  variant?: ButtonVariant;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition',
        // A disabled control must not light up under the pointer as though it were pressable —
        // `hover:bg-*` comes from the variant and has to be switched off here, not by the caller.
        'disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent',
        BUTTON_VARIANTS[variant],
        'px-2 py-1',
        TOUCH_TARGET_SQUARE,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** 2–5 mutually exclusive options, all visible — `DESIGN.md` §5. Preferred over a select at that size. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-zinc-300 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center justify-center rounded-md font-medium transition',
              TOUCH_TARGET,
              pad,
              active
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A chart with its title, its axis units and its own empty state — `DESIGN.md` §5.
 *
 *  Half of this already existed TWICE. `ChartBlock` was declared separately in `FlightReport` and
 *  `CompareView`, differing only in an optional `id` and `note` — the same
 *  `ACTION_BTN`-in-six-files shape P1's opening audit removed once already, restarting for charts.
 *
 *  **The unit belongs in the title and the title is built here, not passed in.** Both call sites
 *  were interpolating it by hand — `` `Altitude (${unitsOf(sys).length} AGL)` `` in one and
 *  `` `${active.label} (${active.unit})` `` in the other — which is two places that can disagree
 *  about how a charted quantity is named, on two surfaces a flyer reads against each other. §5 asks
 *  a figure to carry "axis units"; carrying them means owning the string.
 *
 *  **§5's "its own empty and extrapolated states" are NOT here, and that is measured rather than
 *  skipped.** An `empty` prop was written, wired to the comparison, and removed: `CompareView`
 *  already filters its channel list to metrics at least one compared flight recorded
 *  (`allMetrics.filter(...)`), so a chart with nothing to draw cannot be reached there at all. A
 *  guard that fires on nothing is worse than none.
 *
 *  Two other `return null`s looked like the reachable case and were checked rather than assumed:
 *  neither is. `ChannelExplorer` hides its remove control on the last channel and re-seeds its
 *  selection from each flight's own channels, and `GroundTrack` is only rendered when the flight
 *  has GPS at all. `BACKLOG.md` carries both corrections. **Add `empty` to this primitive when a
 *  call site needs it, with the case that needs it** — not before. */
export function Figure({
  id,
  title,
  unit,
  note,
  children,
}: {
  id?: string;
  /** The quantity, WITHOUT its unit — see above. */
  title: string;
  /** From the units context, so a unit switch reaches the chart's own heading. */
  unit?: string;
  /** A short qualifier for the title row — what the trace is, or where it stops. */
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
          {unit ? `${title} (${unit})` : title}
        </h3>
        {note && <span className="text-xs text-zinc-500 dark:text-zinc-400">{note}</span>}
      </div>
      {children}
    </Card>
  );
}

/** A compact key/value or filter token — `DESIGN.md` §5. `text-xs`, `rounded-md`, `px-2 py-1`.
 *
 *  Two props the sibling's `Chip` does not have, both because a chip in Debrief is not always a
 *  measurement:
 *  - `tone="accent"` for a chip that reports a STATE the flyer put the surface in — "3 off" on the
 *    reading chooser. `DESIGN.md` §2 gives indigo the meaning "selected"; rendering that one in the
 *    neutral tone drops the only signal that anything is hidden.
 *  - `mono={false}` for a value that is not a figure being compared with another figure. §3 asks for
 *    `font-mono tabular-nums` on numbers a flyer lines up column to column, which a count of hidden
 *    rows is not. */
/** A numeric input with its unit, its bounds and its step — `DESIGN.md` §5, which says "**every**
 *  numeric input in either app is this" and gives it a duty no other primitive here has: "it owns
 *  the refusal behaviour the SAFETY invariant requires: a value that cannot mean anything
 *  physically is bounded or refused at the field, not flown into a confident number downstream."
 *
 *  It did not exist. Nine inputs hand-rolled it, seven of them with a byte-identical class string,
 *  and each panel re-derived its own bound — `DeployAltitude` clamping to `MAX_REASONABLE_DEPLOY_M`,
 *  `DragCoefficient` setting only `min={0}`. That is §1's failure mode applied to the one control
 *  whose output a flyer sizes a parachute against.
 *
 *  **What it does NOT do, and the distinction is the safety-relevant one.** It does not clamp, and
 *  it does not change what any panel computes. The panels already clamp — `Math.min(x, MAX_…)` —
 *  and they are the right place for it, because the cap is in SI and only the panel knows the
 *  conversion. What was missing is that the clamp was **silent**: type 50,000 ft into a deploy
 *  altitude and the field snapped to 29,527 with nothing saying why, which is exactly the "control
 *  that fails only when pressed, or whose failure names something that isn't on the page" tell.
 *  `DESIGN.md` §6 is explicit — "a withheld value says why, and what would restore it".
 *
 *  So the bound is stated where the flyer is typing, and announced when they cross it. The
 *  announcement is a live region because a flyer who is looking at the keypad is not looking at
 *  the hint. */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  ariaLabel,
  placeholder,
  width = 'w-20',
  className,
}: {
  label: React.ReactNode;
  /** Shown beside the input, never baked into `label` — a unit switch has to reach it. */
  unit: React.ReactNode;
  value: string;
  onChange: (raw: string) => void;
  /** In the FIELD's units, not SI. The panel owns the conversion because the panel owns the cap. */
  min?: number;
  max?: number;
  step?: number | string;
  /** The input's accessible name, which carries the unit spelled out — "(inches)" beats "(in)" to
   *  a screen reader.
   *
   *  **Required, with no fallback to `label`, and that is deliberate.** The live region below sits
   *  INSIDE the `<label>` so the whole row is one click target; a call site that left the input to
   *  take its name from the label would therefore get an accessible name that GROWS the refusal
   *  sentence into it — "Delay flown s Above 30 s — 30 s is used." Requiring it makes that
   *  impossible rather than merely unlikely. */
  ariaLabel: string;
  placeholder?: string;
  /** The one thing that genuinely varies between call sites: a deploy altitude needs four digits
   *  where a motor delay needs two. */
  width?: string;
  className?: string;
}) {
  // **What the flyer TYPED, which is not what the input shows.** Every one of these fields is
  // controlled by a value the panel has already clamped — `onSet` does
  // `Math.min(x, MAX_REASONABLE_DEPLOY_M)` and the field re-renders from the clamped number — so by
  // the time the value comes back the refused figure is gone and there is nothing left to explain.
  // That is precisely why the clamp was silent, and reading the bound off `value` cannot see it:
  // the value is always in range by the time it arrives.
  const [typed, setTyped] = React.useState<string | null>(null);

  // **Reset during render, not in an effect** — React's own answer for state derived from props.
  //
  // The reason is that an effect runs AFTER paint, so the first render under a new unit would
  // evaluate the OLD typed string against the NEW bound and paint a false "Above 9,000 m" into a
  // live region before clearing it a frame later. **That flash was NOT reproducible here, and
  // saying so is more useful than claiming it was fixed:** every unit switch that changes the bound
  // also reformats the value, so the `value !== seenValue` branch below already clears during
  // render. The two branches overlap on the only transition the app can currently produce, and an
  // e2e that watches the live region with a MutationObserver across the switch records nothing in
  // either form. Kept because it is the correct pattern and costs nothing, not because a bug was
  // measured behind it.
  const key = `${min}|${max}|${String(unit)}`;
  const [seenKey, setSeenKey] = React.useState(key);

  // Whether the parent's last change to `value` was OURS. A refusal has to survive the panel
  // clamping what we just emitted — that clamp is the whole thing being explained — and must not
  // survive anything else.
  //
  // **Also not currently reachable, and recorded as such.** The path this guards is a panel
  // resetting its own value with no keystroke in the field, on a panel whose bound never changes
  // (`EjectionDelay` is 0/30/"s"), which would leave an empty field carrying a red border,
  // `aria-invalid` and a sentence about a value that is nowhere — a state with no way back out.
  // Every route into it that exists today remounts the component, so `typed` is fresh anyway.
  // Kept so that adding such a control later cannot resurrect the state; not counted as a fix.
  const ours = React.useRef(false);
  const [seenValue, setSeenValue] = React.useState(value);

  if (key !== seenKey) {
    setSeenKey(key);
    setSeenValue(value);
    setTyped(null);
    ours.current = false;
  } else if (value !== seenValue) {
    setSeenValue(value);
    if (!ours.current) setTyped(null);
    ours.current = false;
  }

  const n = typed == null || typed.trim() === '' ? NaN : Number(typed);
  const over = Number.isFinite(n) && max != null && n > max;
  const under = Number.isFinite(n) && min != null && n < min;
  // **Compared exactly, displayed rounded, and the two must not be the same number.** A caller's
  // cap is a unit conversion of an SI constant, so it is rarely round: `MAX_REASONABLE_DIAMETER_M`
  // is 1 m, which is 39.370… in. Rounding the cap before comparing — which the first version did —
  // makes the message fire on a value the panel never clamped: at a cap of 39, typing 39.2 in is
  // refused on screen while `Math.min(n * 0.0254, 1)` passes it through untouched. That is a
  // refusal a flyer can see is false, on a panel whose output is a drag coefficient. So `over` and
  // `under` test the exact figure and only the SENTENCE rounds.
  //
  // Grouped, and to one decimal below 100, because §6 wants precision that reflects the method: a
  // deploy cap reads "29,528 ft", a canopy cap "39.4 in", and neither prints a float.
  const bound = (v: number) =>
    v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) < 100 ? 1 : 0 });
  const suffix = typeof unit === 'string' ? ` ${unit}` : '';
  return (
    <label className={cx('flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400', className)}>
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            setTyped(e.target.value);
            ours.current = true;
            onChange(e.target.value);
          }}
          aria-label={ariaLabel}
          aria-invalid={over || under ? true : undefined}
          placeholder={placeholder}
          className={cx(
            width,
            'rounded-md border bg-white px-2 py-1 text-right text-sm font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
            // The refusal is visible on the control itself, not only in the sentence under it: §2's
            // `danger` is "a refusal, a value that cannot be computed".
            // Full-strength `danger`, not a tint: a state indicator is a non-text element and wants
            // 3:1 against its background. `red-400` on white and `red-500/60` over `zinc-900` both
            // measured under it, so the border read as barely-there on the one control that had
            // just refused a number.
            over || under ? 'border-red-600 dark:border-red-400' : 'border-zinc-300 dark:border-zinc-700',
          )}
        />
        <span className="font-mono">{unit}</span>
      </span>
      {/* Always mounted, so a screen reader following this panel hears the bound the moment it is
          crossed rather than on the next thing that happens to re-render the region. */}
      <span role="status" aria-live="polite" className="text-xs text-red-600 dark:text-red-400">
        {over ? `Above ${bound(max!)}${suffix} — ${bound(max!)}${suffix} is used.` : ''}
        {under ? `Below ${bound(min!)}${suffix} — this reading needs a value above it.` : ''}
      </span>
    </label>
  );
}

export function Chip({
  label,
  value,
  tone = 'default',
  mono = true,
  title,
  className,
}: {
  label?: React.ReactNode;
  value: React.ReactNode;
  tone?: 'default' | 'accent';
  mono?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
        tone === 'accent'
          ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:border-indigo-500/40 dark:text-indigo-300'
          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
    >
      {label != null && <span className="text-zinc-500 dark:text-zinc-500">{label}</span>}
      <span
        className={cx(
          mono && 'font-mono tabular-nums',
          tone === 'default' && 'text-zinc-700 dark:text-zinc-300',
        )}
      >
        {value}
      </span>
    </span>
  );
}

/** Progressive detail — `DESIGN.md` §5. The label says what is inside, never "More". */
export function Disclosure({
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  summary: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={cx(
        'group mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm',
        'dark:border-zinc-800 dark:bg-zinc-900/50',
        className,
      )}
    >
      <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-300">
        {summary}
      </summary>
      <div className="mt-3 space-y-4 text-zinc-600 dark:text-zinc-400">{children}</div>
    </details>
  );
}

/** A labelled value with its unit, provenance and optional caveat — `DESIGN.md` §5.
 *
 *  **The value is `font-mono tabular-nums`, and that is the point of the primitive.** §3 requires
 *  both on any number a flyer compares against another number; measured 2026-07-31 this repo used
 *  `font-mono` 81 times and `tabular-nums` 5, so 76 monospaced readings had proportional digits and
 *  did not line up column to column — which is precisely the misread the rule exists to prevent.
 *  Reading a value out of a `Readout` cannot get that wrong.
 *
 *  The unit is not a separate prop because Debrief's readings arrive already formatted by
 *  `lib/display` from the units context (`fmtLength(m, sys)` → `"1,247 ft"`), which is the same
 *  guarantee §5 asks for by a different route: a unit switch reaches every value because no call
 *  site owns the unit string. */
export function Readout({
  label,
  value,
  sub,
  size = 'md',
  layout = 'stacked',
  className,
  ...rest
}: {
  /** Optional, and the omission is a real case rather than laxness: the seven derived-reading
   *  panels each carry their own `<h3>` immediately above the value, so a label here would say it
   *  twice. Where a readout sits in a grid of readouts — the metric tiles, the per-stage panels —
   *  it names itself and this is required in practice. */
  label?: React.ReactNode;
  /** Already formatted, unit included — see above. */
  value: React.ReactNode;
  /** Provenance, a caveat, or where the reading came from. */
  sub?: React.ReactNode;
  /** `hero` for the readings a surface exists to show; `md` for the rest. */
  size?: 'hero' | 'md';
  /** Where `sub` sits. `stacked` puts it under the value, which is right in a grid of tiles
   *  where the columns have to line up. `inline` puts it on the value's baseline, which is what
   *  the seven derived-reading panels were hand-rolling: there the number and its qualifier read
   *  as one sentence — "1,247 ft · main fired · 800 ft of drogue descent first" — inside a card
   *  wide enough to hold it. Kept as a prop rather than converted to one layout because changing
   *  seven panels' appearance is a product decision, and this change is about where the
   *  treatment LIVES. */
  layout?: 'stacked' | 'inline';
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(layout === 'inline' && 'flex items-baseline gap-3', className)} {...rest}>
      {label != null && (
        <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</div>
      )}
      <div
        className={cx(
          'font-mono font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100',
          size === 'hero' ? 'text-xl' : 'text-base',
          layout === 'stacked' && label != null && 'mt-1',
        )}
      >
        {value}
      </div>
      {sub && (
        <div className={cx('text-xs text-zinc-500 dark:text-zinc-400', layout === 'stacked' && 'mt-0.5')}>{sub}</div>
      )}
    </div>
  );
}

/** The warn treatment plus the reason and the range it left — `DESIGN.md` §5. Required wherever a
 *  number leaves the envelope its method was validated over.
 *
 *  A `role` is deliberately NOT set: this is standing context about a reading, not an alert that
 *  just happened, and announcing it as one interrupts a screen reader mid-report every render. */
export function Extrapolated({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cx('text-sm font-medium text-amber-700 dark:text-amber-400', className)}>{children}</p>
  );
}

/** Says what would fill this surface *and* the one action that does — `DESIGN.md` §5. Never "No data".
 *
 *  **A surface with no empty state is not finished**, because it is the state a flyer sees first. */
export function EmptyState({
  title,
  what,
  action,
  className,
}: {
  title: React.ReactNode;
  /** What would fill it, in the flyer's terms — a file to drop, a flight to tick. */
  what: React.ReactNode;
  /** The one control that gets them there. Omitted only where the surface genuinely has none. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card tone="muted" className={cx('text-center', className)}>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">{what}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </Card>
  );
}

/**
 * A table's way out to a spreadsheet — the control and the announcement, together, so every
 * table says the same thing when it worked and the same thing when the browser refused.
 *
 * Separate from `DataTable` because not every table can BE one and that is not a failure. The
 * window-stats table puts the channel in a `th scope="row"` and collapses a whole row to one
 * `colSpan` cell when a channel has no samples in the zoom; modelling either in the primitive
 * would add config surface for one caller, which is how a shared layer stops being used. What
 * those tables actually owe a flyer is the copy, not the machinery — so the copy is the thing
 * that got lifted.
 */
export function CopyTableButton({
  header,
  rows,
  label = 'Copy table',
  title,
  className,
}: {
  header: string[];
  /** Built at press time, so what lands on the clipboard is what is on screen right now — a
   *  zoomed window, a chosen sort — rather than whatever the table held when it mounted. */
  rows: () => string[][];
  label?: string;
  title?: string;
  className?: string;
}) {
  const [said, setSaid] = React.useState('');
  const copy = async () => {
    const body = rows();
    const ok = await copyTable(header, body);
    setSaid(
      ok
        ? `Copied — ${body.length} ${body.length === 1 ? 'row' : 'rows'}, in the order on screen`
        : 'This browser wouldn’t let Debrief write to the clipboard.',
    );
    window.setTimeout(() => setSaid(''), 4000);
  };
  return (
    <span className={cx('flex items-center justify-end gap-2', className)}>
      {/* Always mounted and empty when there is nothing to say: a live region that appears and
          disappears announces unreliably. */}
      <span role="status" aria-live="polite" className="min-h-4 grow text-xs font-medium text-indigo-600 dark:text-indigo-400">
        {said}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void copy()}
        title={title ?? 'Copy this table — as a table for a spreadsheet or document, and as tab-separated text everywhere else'}
      >
        {label}
      </Button>
    </span>
  );
}

/** One column of a `DataTable`. `cell` is what a flyer reads; `text` is what the clipboard gets,
 *  and the two are separate on purpose — an agreement badge reads as a coloured chip on screen and
 *  has to arrive in a spreadsheet as "agree · 0.6%", not as markup or as an empty cell. */
export type DataColumn<R> = {
  key: string;
  header: string;
  align?: 'left' | 'right';
  /** Omit to make the column unsortable — which is the right answer for a label column whose
   *  order is the reading order somebody chose. */
  compare?: (a: R, b: R) => number;
  cell: (row: R) => React.ReactNode;
  text: (row: R) => string;
};

/**
 * The one table — `DESIGN.md` §5. Sortable where a column says how, copyable as a whole, with a
 * sticky header and a real empty state.
 *
 * **"Tables you cannot sort, filter, or copy out of" is a named tell in `MAINTAINING.md`, and it
 * is only fixable once rather than per table.** Measured 2026-08-01: seven tables in this repo, two
 * sortable, two copyable, none keyboard-navigable, and five with no sort and no copy at all —
 * including both cross-check tables, which are the two surfaces §6 exists for and exactly what a
 * flyer writing a cert document needs to lift.
 *
 * **What this deliberately does NOT try to absorb**, measured before building it: `SampleTable` and
 * `CompareView`. `CompareView`'s table is TRANSPOSED — metrics are rows, flights are columns, and
 * sorting a row reorders the COLUMNS — so it puts `aria-sort` on `th[scope=row]` where this puts it
 * on `th[scope=col]`. `SampleTable`'s entire prop surface is the explorer's column model:
 * `Float64Array` series, a phantom x column addressed by a `col < 0` sentinel, and `ROW_H`
 * virtualisation over hundreds of thousands of samples. Folding either in produces the union of two
 * components rather than one primitive, which is how a shared layer acquires the config surface
 * that stops anyone using it. They keep their own tables and this serves the other five.
 *
 * Keyboard access here is every affordance on the Tab path — each sortable header and the copy
 * control are real buttons. Arrow-key cell-to-cell navigation is NOT implemented; on a four-row
 * cross-check it would be ceremony, and claiming it would be worse than not having it.
 */
export function DataTable<R>({
  columns,
  rows,
  rowKey,
  empty,
  copyLabel = 'Copy table',
  caption,
  maxHeight,
  className,
}: {
  columns: DataColumn<R>[];
  rows: R[];
  rowKey: (row: R, i: number) => string;
  /** Shown in place of the body when there is nothing — never "No data" (§5). */
  empty?: React.ReactNode;
  copyLabel?: string;
  /** Screen-reader name for the table, so two cross-checks on one page are told apart. */
  caption?: string;
  /** Sets a scroll shell and a sticky header. Omit for a short table that needs neither. */
  maxHeight?: string;
  className?: string;
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const ordered = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.compare) return rows;
    const sign = sort.dir === 'desc' ? -1 : 1;
    // Index order rather than a copy, so a stable tie keeps the order the caller chose.
    return rows
      .map((r, i) => [r, i] as const)
      .sort((a, b) => {
        const d = col.compare!(a[0], b[0]);
        return d === 0 ? a[1] - b[1] : sign * d;
      })
      .map(([r]) => r);
  }, [rows, sort, columns]);

  /** Third click restores the order the rows arrived in — the same cycle `SampleTable` uses. */
  const cycle = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 'desc' } : s.dir === 'desc' ? { key, dir: 'asc' } : null));

  return (
    <div className={className}>
      {rows.length > 0 && (
        <CopyTableButton
          label={copyLabel}
          header={columns.map((c) => c.header)}
          rows={() => ordered.map((r) => columns.map((c) => c.text(r)))}
        />
      )}
      <div className={cx('mt-1 overflow-auto', maxHeight && FRAME)} style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className={cx('text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400', maxHeight && 'sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900')}>
            <tr>
              {columns.map((c) => {
                const state = sort?.key !== c.key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending';
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={c.compare ? state : undefined}
                    className={cx('py-1 font-medium', c.align === 'right' ? 'text-right' : 'text-left', 'pr-4 last:pr-0')}
                  >
                    {c.compare ? (
                      <button
                        type="button"
                        onClick={() => cycle(c.key)}
                        title={`Sort by ${c.header}`}
                        className={cx(
                          'inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-zinc-800 dark:hover:text-zinc-200',
                          state !== 'none' && 'text-indigo-600 dark:text-indigo-400',
                        )}
                      >
                        {c.header}
                        <span aria-hidden="true" className={state === 'none' ? 'opacity-0' : ''}>
                          {state === 'ascending' ? '▲' : '▼'}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, i) => (
              <tr key={rowKey(r, i)} className="border-t border-zinc-200 dark:border-zinc-800">
                {columns.map((c) => (
                  <td key={c.key} className={cx('py-1.5 pr-4 last:pr-0', c.align === 'right' && 'text-right')}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
            {ordered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  {empty ?? 'Nothing to show yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Names the file or field that failed, what was expected, and the way forward — `DESIGN.md` §5.
 *  An error that names something not on the page is a named tell in `MAINTAINING.md`. */
export function ErrorState({
  what,
  expected,
  action,
  className,
}: {
  /** The thing that failed, named: the file, the column, the reading. */
  what: React.ReactNode;
  /** What was expected of it, so the message teaches rather than reports. */
  expected?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card tone="danger" role="alert" className={className}>
      <p className="text-sm font-medium">{what}</p>
      {expected && <p className="mt-1 text-sm">{expected}</p>}
      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}
