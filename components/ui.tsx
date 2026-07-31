'use client';

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
 * **Two things these primitives deliberately do NOT carry, because `app/globals.css` already
 * does them for every control and doing them twice is how the two copies drift apart:**
 * - the focus ring. `globals.css`'s `:focus-visible` rule is UNLAYERED, and an unlayered rule beats
 *   anything in `@layer utilities` whatever its specificity — so a `focus-visible:outline-*`
 *   utility on a button here is not a second belt, it is inert. Measured 2026-07-31, after adding
 *   some and finding they changed nothing.
 * - the 44 px touch floor on `<button>`. `globals.css`'s `@media (pointer: coarse)` block already
 *   sets `min-height` and `min-width` on `button`, `select`, `[role="button"]` and `input`. The
 *   sibling's `Button` DOES carry the token, and that is not a divergence to fix in either
 *   direction: the sibling has no coarse-pointer block. `TOUCH_TARGET` is still the right thing on
 *   the elements that block does not reach — `<label>`, `<summary>`, a non-download `<a>`.
 *
 * `lib/design-system.test.ts` is the executable copy of `DESIGN.md` §9 and holds the counts to an
 * exact ratchet, so a conversion has to record itself and a new hand-rolled treatment fails.
 */

/** Join class strings, dropping the empty ones so a caller can pass `undefined` without a stray space. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
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
 *  **with one exception, and it is a trap: `title` here is the card's HEADING, not the native
 *  tooltip attribute.** A call site that had `title="…"` meaning a tooltip gets an `<h3>` instead
 *  and loses the tooltip silently. The name is the sibling's and is kept for that reason; when a
 *  card genuinely needs a tooltip, put it on the element inside. */
export function Card({
  as: Tag = 'div',
  tone = 'default',
  pad = true,
  title,
  actions,
  className,
  children,
  ...rest
}: {
  as?: 'div' | 'section' | 'aside' | 'details';
  tone?: CardTone;
  /** `p-4` — the card padding from `DESIGN.md` §4. Off only where the card's own content owns its
   *  edges: a table that bleeds to the border, a chart that fills it. */
  pad?: boolean;
  title?: React.ReactNode;
  /** Controls that belong to the title row rather than to the body. */
  actions?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx('rounded-xl border', CARD_TONES[tone], pad && 'p-4', className)} {...rest}>
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100">{title}</h3>}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** A titled region within a route — `DESIGN.md` §5. What a route is built from. */
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
} & React.HTMLAttributes<HTMLElement>) {
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

/** The three button weights, and only three — plus `danger`, which is `secondary`'s geometry in the
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
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
  /** Declared explicitly because `ButtonHTMLAttributes` does not carry it. React 19 passes `ref`
   *  to a function component as an ordinary prop, so no forwarding wrapper is needed — but the
   *  type has to say so, and the surfaces that return focus to a control hand it a ref. */
  ref?: React.Ref<HTMLButtonElement>;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
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
  className,
  ...rest
}: {
  label: React.ReactNode;
  /** Already formatted, unit included — see above. */
  value: React.ReactNode;
  /** Provenance, a caveat, or where the reading came from. */
  sub?: React.ReactNode;
  /** `hero` for the readings a surface exists to show; `md` for the rest. */
  size?: 'hero' | 'md';
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...rest}>
      <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</div>
      <div
        className={cx(
          'mt-1 font-mono font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100',
          size === 'hero' ? 'text-xl' : 'text-base',
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</div>}
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
