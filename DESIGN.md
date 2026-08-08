# Fusion Space — Design System

**This file is the authority on how the suite looks and behaves.** Where the code disagrees with it,
the code is wrong and fixing it is in scope. Where this file is genuinely wrong, change it here first
and say why — never fork a second convention in a component.

It exists because the alternative failed measurably. With no written system, every session re-derived
"consistent" by reading whichever neighbouring file it happened to open, and the result drifted apart
one component at a time. Measured on 2026-07-30, before this file existed:

- **12+ distinct card treatments** across the suite for what is visually one thing — `rounded-md` /
  `rounded-lg` / `rounded-xl`, `border-zinc-200` / `border-zinc-300`, `bg-white` / `bg-zinc-50`, and
  six padding combinations.
- **The two sibling apps disagreed on base body size.** Loft: 98 `text-sm` to 88 `text-xs`. Debrief:
  212 `text-xs` to 82 `text-sm`. The ECOSYSTEM CONSISTENCY invariant requires they read as one
  author's work; they did not.
- **Debrief had 50 components and no shared primitive layer at all** — zero cross-component imports.
  Every card, chip and button was hand-rolled per file.
- **Loft had a shared `components/ui.tsx` that 5 of 23 components used**, with `Chip` and `Disclosure`
  exported and imported nowhere.

That is precisely the first tell on `MAINTAINING.md`'s own list — "a component that exists once and
matches nothing else; inconsistent spacing, type scale, or button hierarchy across surfaces" — and it
is the mechanism behind an app reading as assembled rather than designed. A checklist cannot fix it,
because a checklist has nothing to check against. This file is the thing to check against.

**Both repos carry an identical copy of this file.** A change to one is a change to both, in the same
run. The suite is one product to a flyer who uses both.

---

## 1. The rule that makes the rest work

**Never write a raw treatment where a primitive exists.** If you find yourself typing
`rounded-xl border border-zinc-200 bg-white p-4`, you want `<Card>`. If the primitive does not exist
yet, create it in `components/ui.tsx` and use it — do not hand-roll "just this once", because every
one of the 12 card treatments above was a just-this-once.

**A new visual treatment is a change to this file.** Inventing a fourth button weight or a third
surface level in a component is how the system erodes. Add it here with its role, or use what exists.

---

## 2. Tokens

Tailwind v4 with the `zinc` neutral ramp and `indigo` as the single accent. No other neutral, no
second accent. Semantic colours are reserved for meaning and never for decoration.

### Surfaces — three levels, no more

| Role | Light | Dark | Use for |
|---|---|---|---|
| `page` | `bg-white` | `dark:bg-zinc-950` | the document background |
| `raised` | `bg-white` | `dark:bg-zinc-900` | cards, panels, dialogs — the default container |
| `sunken` | `bg-zinc-50` | `dark:bg-zinc-900/50` | insets, table headers, code and readout blocks |

A raised surface on a page needs a border to separate it. A sunken surface inside a raised one does
not — the tone change is the separation. Never nest raised inside raised; promote the inner one to
sunken or drop the outer border.

### Borders

| Role | Value | Use for |
|---|---|---|
| `hairline` | `border-zinc-200 dark:border-zinc-800` | container edges, dividers, table rules |
| `control` | `border-zinc-300 dark:border-zinc-700` | inputs, selects, secondary buttons — anything the flyer acts on |

Two, deliberately. The control border is one step darker so an interactive edge is distinguishable
from a decorative one without reading the element. Do not mix them: a card is `hairline`, an input
inside it is `control`.

### Text

| Role | Value | Use for |
|---|---|---|
| `primary` | `text-zinc-900 dark:text-zinc-100` | values, headings, anything being read |
| `secondary` | `text-zinc-600 dark:text-zinc-400` | labels, units, captions, help |
| `tertiary` | `text-zinc-500 dark:text-zinc-500` | disabled, placeholder, timestamps |

### Accent and meaning

| Role | Value | Means |
|---|---|---|
| `accent` | `indigo-500` (focus, `600` fill) | interactive, selected, the focus ring |
| `warn` | `amber-600` / `amber-50` bg | an estimate outside its envelope, an extrapolation, a caveat |
| `danger` | `red-600` / `red-50` bg | a refusal, a value that cannot be computed, destructive |
| `good` | `emerald-600` | agreement between independent sources, a passing check |

**Never colour a number by whether it is large.** Colour carries a claim; a claim needs a basis. Green
on a number a flyer would act on reads as endorsement, and the SAFETY invariant forbids a verdict.

**These meanings are about VALUES AND STATES, and NO chrome takes a semantic ramp — not one control,
not the Tip jar, not as an exception.** The rule is checked rather than intended
(`lib/design-system.test.ts`, *"lets no chrome wear a semantic ramp"*), because it has already been
broken once in this family and reverted for a reason worth keeping: Debrief's Ko-fi link used to be
amber *"so it reads as a tip jar, distinct from the neutral theme control"*, and
`components/KofiButton.tsx` there now records why that was wrong — every other amber in either tree is
a real caveat, so **a flyer learns amber means "this number is qualified", and spending it on a tip
jar in the persistent header devalues the one signal the safety posture leans on.** What distinguishes
the control is its GLYPH, and a glyph costs the colour system nothing.

### Radius

`rounded-md` for controls (buttons, inputs, chips). `rounded-xl` for containers (cards, panels,
dialogs). `rounded-full` only for pills and spinners. **`rounded-lg` is not in the system** — it is
the middle value that caused most of the measured drift; convert on sight.

---

## 3. Type scale

Six sizes, each with one job. Geist Sans throughout; Geist Mono for numerals that are compared.

| Size | Role |
|---|---|
| `text-3xl` | page title, once per route |
| `text-xl` | section heading |
| `text-base` | subsection heading, and prose in docs |
| `text-sm` | **the body default — every label, value, control and table cell** |
| `text-xs` | captions, units, footnotes, dense table metadata |
| `text-[11px]` | axis ticks and diagram annotations only |

**Six means six**, and the sizes that break it are the ones that read as "a bit bigger" rather than as
a decision — `text-lg` between `text-base` and `text-xl`, `text-2xl` between `text-xl` and `text-3xl`.
Measured 2026-07-31: Loft had reached **fourteen** `text-lg` (eleven panel headings and three prominent
values), and Debrief **twenty** across `text-lg`, `text-2xl` and `text-4xl`, five of them page titles
where this table says `text-3xl`. That is a heading rhythm that is not a rhythm. Both apps count and
ratchet it toward zero; neither may let it grow.

**An analyzer's big readout is `text-xl`, not a seventh size.** The number a metric tile exists to show
wants weight, and `font-semibold` plus `font-mono` at `text-xl` gives it that against `text-base`
siblings. Reaching for `text-2xl` because it looks better in isolation is how the scale acquired its
seventh entry in the first place.

**`text-sm` is the floor for anything a flyer reads to make a decision.** `text-xs` is for the text
*around* such a value — its unit, its provenance, its caveat — never the value. Debrief's 212-to-82
inversion is the bug this rule fixes: a whole app of decision-grade numbers rendered at caption size.

**Weight:** `font-medium` for labels and headings, `font-normal` for values and prose,
`font-semibold` for the one number a surface exists to show. No `font-bold`.

**Numerals:** any number a flyer compares against another number — a table column, a cross-check row,
a readout — is `font-mono tabular-nums`. Digits must line up vertically. Prose numbers stay sans.

---

## 4. Spacing

The scale is `1 2 3 4 6 8 12` (Tailwind units). Nothing else — no `5`, `7`, `9`, `10`, no arbitrary
values.

| Context | Value |
|---|---|
| inside a control | `px-3 py-1.5` (`px-2 py-1` for `text-xs` chips) |
| inside a card | `p-4` |
| between related rows | `gap-2` |
| between fields in a group | `gap-3` |
| between cards | `gap-4` |
| between sections | `gap-8` or `mt-8` |
| page gutter | `px-4 md:px-6` |

**Density is the point.** This audience reads dense, precise instruments — OpenRocket, RASAero, a
logger's own software. Generous whitespace reads as a marketing page, which is the exact charge
`MAINTAINING.md` says the tool must never invite. When in doubt, tighten.

---

## 5. Component vocabulary

Everything below lives in `components/ui.tsx` and is imported. A surface that needs one of these and
hand-rolls it instead is not done.

### Containers
- **`Card`** — the raised container. `rounded-xl border-hairline bg-raised p-4`. Optional `title` and
  `actions` slot. This replaces all 12 measured variants.
- **`Panel`** — a `Card` with a header row and a close affordance, for anything dismissible. Owns
  focus return (see `useReturnFocus`).
- **`Section`** — a titled region within a route: heading, optional description, children. This is
  what a route is built from.
- **`Disclosure`** — progressive detail. The label says what is inside, never "More".
- **`SectionNav`** — a pinned strip of in-page links with a **you-are-here** marker, for a surface
  longer than a couple of screens. A map with no "you are here" is a list of place names.

  **Lifted out of `components/FlightReport.tsx` on 2026-08-08, where it was hand-rolled — because
  the surface that needed it most did not have it.** The report grew this when it reached nine
  screens on a phone; `app/methods/page.tsx` is ~12,700 words in 51 blocks and had no in-page
  navigation of any kind. One surface solving a problem privately while the worse instance of it
  goes unserved is the case a primitive layer exists for, and it is the same shape as `Popover`
  one entry down: the vocabulary was short a word, so the first site to need it wrote its own.

  `sticky`, not `fixed`: until the reader has scrolled past where it already sat it costs nothing.
  It scrolls sideways rather than wrapping, because a jump bar that takes a screen of its own to
  read is not a fix for a long page. Targets carry a `scroll-margin-top` so a heading lands below
  it rather than under it.

  **The marker must be able to reach the LAST section, and for two surfaces it could not.** A short
  final section cannot be scrolled up to the reading line — there is no page left — so it never lit
  up and clicking its own chip left the mark on the section above. `useCurrentSection` treats the
  bottom of the document as the last section. Measured on `/methods`, whose last group holds one
  short block: its heading sits 288 px down at maximum scroll on a desktop. The report had the same
  bug and hid it behind a tall final section.

- **`Popover`** — an explanation or a small set of controls, opened from a trigger and shown **over**
  the surface rather than in it. Use it where `Disclosure` would push the thing the reader is looking
  at off the screen, and where navigating away would cost them their place.

  **It is not a tooltip and the distinction is the reason it exists.** A tooltip is hover-only, which
  is nothing at all on a phone, and it carries a phrase. This is click- and tap-activated, keyboard
  reachable, dismissible, and carries a paragraph. **Never add a hover-only affordance to either
  app** — §8's form-factor contract rules it out before this section does.

  The contract, all of it owned by the primitive rather than by call sites:
  - the trigger is a `Button` — any weight, and **`link` is the right one for a `?` inside a label**,
    since §5 already defines `link` as the weight that sits inside a sentence;
  - **the trigger's visible words ARE its accessible name.** An `aria-label` is for a trigger whose
    content is a glyph — a `?`, an icon — and never for one that shows words, because it *replaces*
    the visible text: a button reading "per quantity" named "Choose the unit for each quantity…"
    fails WCAG 2.5.3 *Label in Name* and stops answering to voice control. The long sentence is a
    `title`. The `<details>` this replaced had exactly this right, natively, and the first version
    of the primitive undid it at the only call site there was;
  - **`Escape` closes it from anywhere on the page, not only while focus is inside it.** Bound to
    the primitive's own wrapper, the key silently stops working two Tabs later — which is the
    state-with-no-way-out this entry exists to prevent, for the one user `<details>` served
    correctly;
  - **both exits leave focus somewhere real.** The primitive moves focus INTO the panel on open, so
    it owes focus a home when the panel goes: `Escape` returns it to the trigger, and a click
    outside returns it too *when focus would otherwise be lost* — but not when the click landed on
    something focusable, because that is where the reader meant to go. A drop to `<body>` is what
    `useReturnFocus` exists to prevent and the first version of this primitive did it;
  - it carries a visible close control, because a surface a flyer can open and not obviously shut is
    the "state with no way back out" the craft bar names — and on touch there is no `Escape` key to
    fall back on;
  - **the BODY scrolls and the heading does not.** A panel that can grow taller than the window is
    one a flyer cannot get out of on a phone, because the close control ends up off-screen above
    them. Capping the body rather than the whole card is what keeps the way out pinned in view. The
    longest content this carries is a methods block, and those run to 764 words;
  - the panel is a `Card`, **including its title row**: the heading and the close control are
    `Card`'s own `title` and `actions`. A popover is not a licence for a thirteenth card treatment,
    and writing that row out by hand inside the primitive — which the first version did, at
    `text-sm` against every other card heading's `text-base` — is the same failure one level down;
  - the trigger says `aria-haspopup="dialog"`. `aria-expanded` alone is the *disclosure* pattern's
    attribute, and a screen reader announcing "collapsed" for a dialog names the wrong widget;
  - **on a narrow viewport it is anchored to the VIEWPORT, not to its trigger.** Measured 2026-08-04:
    the units panel, right-anchored to a control near the right edge, ran from −39 px to 201 at 375 px
    and cut off the entire left column of its own labels. The page never scrolled sideways, so nothing
    watching document width could see it. That belongs in the primitive; it was a per-call-site fix at
    the one site that had been measured.

  **Added 2026-08-08 from owner note `ON-3`, and the census is the story again.** The vocabulary had
  `Disclosure` and no overlay word at all, so two surfaces reached past it in opposite directions:
  `components/UnitsControl.tsx` hand-rolled one out of `<details>` plus an absolutely-positioned
  `Card` with bespoke viewport anchoring, and `components/MetricGrid.tsx` gave up on showing anything
  in place and sent the flyer to another route in another tab — 21 readings, all 21 navigating away.
  Sites reaching for the same missing word is the vocabulary being short, not surfaces being
  undisciplined; it is the third time §5 has recorded that shape, after `link` and `ChipButton`.

  **Loft has this primitive too as of 2026-08-08, and it meets this CONTRACT without matching this
  API.** Its version has no `description`, `align` or `width`, builds its close control from
  `ClosePanel` rather than an `IconButton` it does not have, and calls a two-value `useReturnFocus()`
  rather than this repo's `useReturnFocus(open, close)`. Those are the shared-file drift, not a
  disagreement about the pattern — filed in Loft's `BACKLOG.md` as part of reconciling the two copies
  of this document. **What it does meet is every clause above that is a defect rather than an API
  choice**, and it arrived at the document-level `Escape` independently, the same week, from the same
  symptom. That is the entry earning its place: the app that wrote it second did not have to
  rediscover the other six.

### Controls — five button weights, and only five
- **`Button variant="primary"`** — indigo fill. **At most one per surface**, and only for the action
  the surface exists to perform. Two primaries on one screen means neither is.
- **`Button variant="secondary"`** — `control` border, transparent fill. The default for everything
  else.
- **`Button variant="ghost"`** — no border, but button GEOMETRY: padding, a hover fill, a hit target.
  Toolbar and in-table actions only.
- **`Button variant="danger"`** — secondary geometry, `danger` text and border. Removal only.
- **`Button variant="link"`** — `accent` text, no border, no fill, **no control padding**. The one
  weight that sits INSIDE a sentence: *"Got a backup? **Restore it**."*, *"← Analyze another
  flight"*, a **clear sort** beside a column header. Underline on hover, never at rest in prose, so
  it does not compete with a real link in the same paragraph.

  **This heading read "three button weights, and only three" while listing four, and one app had
  independently hand-rolled a fifth at eight call sites across four components** — measured
  2026-08-03. Sites reaching for the same missing word are the vocabulary being wrong, not surfaces
  being undisciplined, so it is named here rather than converted away.

  **`link` is not `ghost`, and the distinction is the whole reason it exists.** `ghost` is a button
  that happens to have no border: it keeps `px-3 py-1.5` and a hover fill, because it sits in a
  toolbar or a table row where those are what make it findable. `link` sits in running text at the
  surrounding size, where control padding would break the line and a hover fill would look like a
  selection. A control in prose that takes `ghost` reads as a stray button.

  **What `link` does NOT drop is the touch floor, and a first version of this paragraph said it
  did.** `globals.css` floors every bare `button` at 44×44 under `@media (pointer: coarse)` with no
  exemption for one inside a `<p>`, and the touch e2e suite measures exactly that — so a `link` in a
  table row is still a 44 px target and the variant's own class list omitting the floor is a no-op.
  **The exception is `link` with `href`**, which renders an `<a>` that the coarse-pointer rule does
  not cover. Two claims that look alike and are not: "the variant carries no floor" (true, and
  harmless) and "a link is unhittable on a phone" (false for a button, true for an anchor).

  **Where the resting underline belongs.** In prose, hover-only — the sentence supplies the context.
  In a table row, on a small control, restore it at the call site: 11 px of accent text on a device
  with no hover, beside other chips, needs a second signal that it is a control.

  **`accent` here is §2's "interactive", not a claim about the value.** Indigo on a *number* still
  means selected — see §2's standing rule that a reading is never coloured by its magnitude.

  **Implementation caution, learned by shipping it wrong once.** The size opt-out is the absence of
  a class, not `text-inherit` — that is Tailwind's COLOUR utility, and emitted beside the variant's
  own `text-indigo-600` at equal specificity it wins, so every `link` renders in the surrounding
  prose colour in light mode while dark mode looks correct. No test can see it: the roles and
  accessible names are unchanged.
- **`Segmented`** — 2–5 mutually exclusive options, all visible. Preferred over a select at that size.
- **`Tabs`** — switching views over one subject *within* a route. Not for navigation between jobs;
  that is a route (§7).
- **`NumberField`** — a numeric input with its unit, min/max, and step. **Every numeric input in
  either app is this.** It owns the refusal behaviour the SAFETY invariant requires: a value that
  cannot mean anything physically is bounded or refused at the field, not flown into a confident
  number downstream.
- **`Chip`** — a compact key/value or filter token. `text-xs`, `rounded-md`, `px-2 py-1`. Tones are
  §2's: `default` · `accent` · `good` · `warn` · `danger`. **The four HUED tones share one `500/30`
  border + `500/10` fill ramp and all carry `font-medium`**, because a chip wearing a §2 hue is
  making a claim. `default` is the neutral and does neither: it is a raised zinc tile
  (`zinc-100`/`zinc-800`, deliberately not on the ramp — a zinc at `500/10` is a wash, not a tile)
  and it carries no weight. **A `default` chip's fill must differ from every `Card` fill**, or it
  renders as a bare outline against its own container; `lib/design-system.test.ts` asserts the
  relationship rather than the value.

  **The three semantic tones were added 2026-08-03.** Twelve chip-shaped elements were hand-rolled
  across THREE padding combinations — `px-1.5 py-0.5` ×7, `px-2 py-0.5` ×3, `px-3 py-2` ×2 — and
  **not one of them was the `px-2 py-1` above**. Seven converted; four of those seven were reaching
  for a tone this primitive could not say (they hold five tone strings — one site picks between
  emerald and amber in a ternary). Sites converging on the right colour and the wrong geometry is
  the vocabulary being short a word, which is the same shape as the `link` button weight two
  entries up. `danger` ships with no adopter, on §2's symmetry rather than on measurement.

- **`ChipButton`** — a chip that DOES something: a filter you toggle, an action on a row, an
  "apply this view" affordance. Same geometry as `Chip` (`text-xs`, `rounded-md`, `px-2 py-1`), a
  `focus-visible` ring, and `touch-area` so a token-sized control still meets §8's hit minimum.
  `pressed` renders `aria-pressed` and mutes the unpressed state to dashed-and-faded; omit it for a
  plain action, because announcing `aria-pressed="false"` on a button that does not toggle is worse
  than silence.

  **Added 2026-08-04, from a census of four, and the census is the story.** `Chip`'s hand-rolled
  count had been driven to three — and the scan that measured it read `<span|li|div>` only, so
  every chip-shaped BUTTON was invisible to it. It reported green while four sat on the page. Widen
  it to `button|a` and six appear at once; all four that converted had written
  `rounded-md border px-2 py-0.5 text-xs font-medium` with `min-h-[1.75rem]`, varying in exactly
  three things — dashed border, pressed state, hover tint — which is why those are the three props
  and there are no others. **The geometry moves to `py-1`**: §4 has no `-0.5`, and a static chip
  beside an actionable one must not be two heights.

  Two of the six are **not** chips and stay hand-rolled with a reason recorded: `FlightPicker` and
  `RecordingPicker` are two-line selectable options at `min-h-11`, a card in a picker rather than a
  token in a row. A third, `FlightReport`'s range picker, wants `Segmented` — its unselected state
  is "not chosen yet", not "muted out", and one-of-N already has a primitive.

  **The lesson is the one §9 keeps recording about its own greps**: a check that enumerates the tag
  in front of it will read green over the whole class it forgot to name.

  **2026-08-04, later the same day: a fifth converted, and the census had a second blind spot of a
  different kind.** Widening the tag list was necessary and not sufficient. The scan finds the end
  of an opening tag by walking to the first `>` at brace depth zero — and it was walking through
  `//` comments and string literals as if they were code. `FigureChooser` explains, in a comment
  between two attributes, why its control is named `"<title> figure"`; that `>` ended the scan five
  lines above the `className`, so a hand-rolled chip-shaped toggle at `py-0.5` was invisible to a
  census that had just been widened specifically to catch chip-shaped toggles. It is now one shared
  `openingTag` — the three copies of the walk were identical, so the blind spot was in all three —
  and it skips comments and strings and treats a template's `${…}` as the nesting it is.

  The proof is the falsification, and it is worth stating because "the check now finds one more
  thing" is not evidence on its own: with the hand-roll present, the OLD scan passes green and the
  NEW one names the file.

  So the class error §9 records has two members, not one. **Enumerating the tag in front of you**
  is the first. **Reading a comment as code** is the second, and it is the more dangerous, because
  the widening that fixes the first is visible in a diff and this one is only visible if you go
  looking for what the tool cannot see.

### Data
- **`DataTable`** — sortable by any column, keyboard-navigable, copyable, with a sticky header. Every
  table is this one. "Tables you cannot sort, filter, or copy out of" is a named tell, and it is only
  fixable once rather than per table.
- **`Readout`** — a labelled value with its unit, provenance and optional caveat. The unit is never
  baked into the label string; it comes from the units context so a unit switch reaches every value.
- **`Figure`** — a chart with its title, legend, axis units, and its own empty and extrapolated
  states.

### States — every data surface implements all five
`empty` · `loading` · `error` · `offline` · `extrapolated / out-of-envelope`

**`offline` is required of a surface that CAN FAIL when the network does — and in Debrief today that
is none of them. Measured 2026-08-04, and written down because the blanket reading of this heading
was manufacturing a debt that does not exist.**

A census kept reporting *"0 of 21 data surfaces implement offline, in a PWA"*, which sounds damning
and is the wrong reading. `grep -rn 'fetch(' components app lib` returns **one** runtime network call
in the whole app: the sample flight, in `Analyzer.tsx`. And that one does not need the network
either — the service worker **precaches it at install**, so it opens with the radio off. That is not
an inference; `e2e/pwa.spec.ts` pins all three halves of it: the app comes up offline after a single
online visit, a dropped flight analyses with the network cut, and *the sample flight works on a first
offline visit*. Everything else — parsing, analysis, every chart, table and export — runs on bytes
already on the device, which is the product's headline promise.

So Debrief is **offline-complete**, and a surface that cannot fail when the network does must not be
given an offline state: it would be decoration that has to be maintained and can never fire. The
count to keep is not "0 of 21 implement it" but "0 of 21 **need** it", and those are opposite
findings. What earns this state is a surface that reaches the network *at the moment a flyer uses
it* — a tile fetching a weather record, a map pulling tiles, a version check. If one ever exists, the
rule for it is *say so before the flyer presses anything*, because a control that is enabled and
fails only when pressed is a named tell in `MAINTAINING.md`.

**Re-run the grep before re-measuring this, and check the precache too.** This clause is a statement
about the code as it stands, not a permanent exemption — the moment a second `fetch` appears, or the
sample stops being precached, the denominator changes. *A first attempt at this section got exactly
that wrong: it read the single `fetch` and concluded the sample button was the one place the state
was real, and shipped a change disabling that button offline. The suite refused it, because the
button works offline and a test written by an earlier session said so.*

- **`EmptyState`** — says what would fill it *and* the one action that does. Never "No data".
- **`ErrorState`** — names the file or field that failed, what was expected, and the way forward.
  An error that names something not on the page is a named tell.
- **`Extrapolated`** — the warn treatment plus the reason and the range it left. Required wherever a
  number leaves the envelope its method was validated over.
- **`Notice`** — **not one of the five, and listed here because this is where a reader looks for
  it.** A sentence about the content, **above** the content, never instead of it. The five states
  above each REPLACE a surface or qualify a value; a notice leaves the surface working.
  `rounded-md border px-3 py-2 text-sm`, tones `warn` (default) and `accent`, on a `-300/70` border
  + `-50` fill ramp that is deliberately its own — a notice needs more presence than a `Chip`'s
  `500/10` wash and a flatter, lighter field than a `Card`'s tinted one. (`CARD_TONES`' hued
  entries are `500/x` washes too, not flat fills; an earlier wording of this line said flat and was
  wrong about its own neighbour.) Takes `as` (`div` · `p` · `section` — only the tags with a call site)
  and **passes `role` through rather than owning one**: `role="status"` implies `aria-atomic`, so a
  notice that contains a control must put the live region on the message, not the box, or every
  press re-announces the whole panel. **That rule has cost two surfaces already** —
  `GroupProposalBanner` found it and fixed it; `RecentFlights`'s forgotten-flights banner carried
  the same shape and the conversion moved it verbatim until a review caught it. The pin can only
  assert that the primitive owns no role; the call-site half is a review question.

  **This is the answer to "§5 has no name for a DEGRADED capability"**, which had been carried as an
  open question. A degraded surface — reads fine, writes refused — is none of the five states: it is
  the surface *working* with one thing qualified. That is a `Notice tone="warn"` above real content,
  not an `ErrorState` replacing it. **Built 2026-08-03 on a census of six** across five files,
  spanning three element types, two hues, two paddings and two type sizes while being one
  treatment. Five of the six were `text-xs` on text a flyer acts on; the primitive is `text-sm`.
  **That is a judgement, not a reading §3 forces.** §3 lists "its caveat" under `text-xs` — but
  inside "text AROUND such a VALUE", meaning annotation attached to a number. These notices are
  attached to no number; they are messages about what happened to a flyer's files or logbook, and
  §3's body default covers messages. `lib/design-system.test.ts` carries the full argument beside
  the ratchet it moved.

**A surface with no empty state is not finished.** It is the state a flyer sees first.

---

## 6. Presenting numbers

This is the part of the design system that is also a safety rule, and it outranks aesthetics.

- **A value never appears without its unit**, and the unit comes from the units context.
- **Precision reflects the method, not the float.** Three significant figures unless the method
  justifies more. `1247.8823 m` is a tell — it claims precision the model does not have.
- **Every reference value names its source** — the tool that produced it, and any caveat that tool
  attached. A stored simulation the source tool marked outdated is labelled as such.
- **Independent estimates are shown side by side and never averaged.** Agreement is confidence;
  disagreement is a flag. A consensus dressed as one number is forbidden.
- **A withheld value says why, and what would restore it.** A blank cell is a bug.

---

## 7. Product shape

**Distinct jobs are distinct routes.** Import, build/edit, simulate, sweep, validate/cross-check, docs
— each its own static route over the one internal model. Tabs switch views *within* a job; routes
separate jobs. One endless scrolling page is the "landing page with a chart bolted on" charge, and it
is what both apps must grow out of.

Every route is a static export. Multi-view is multi-route, never multi-server.

**Navigation is one spine**, present on every route, showing where the flyer is. A feature reachable
only by knowing it is there is a named tell.

---

## 8. Form factors

Desktop and touch are separate designs over one model, not one layout stretched.

**Desktop** — dense, keyboard-complete, direct-manipulation. Every action has a keyboard path. Tables
sort and copy. Drag has an arrow-key equivalent and an undo.

**Touch** — 44 px minimum hit target on `pointer: coarse`, everywhere, not just where it was last
measured. No hover-only state. No horizontal scroll on the page body; wide content scrolls inside its
own container. A phone journey is at most two screens deep to its answer.

**The check is a measurement, not a look:** at a 390 px viewport, count controls under 44 px and
states unreachable without hover. Both counts are zero or the surface is not done.

---

## 9. Compliance — how a session verifies

Run these before calling a surface done, and put the counts in the commit message. Numbers, not
adjectives.

Three of these read a class ATTRIBUTE's contents rather than the raw file, so a `cls()` helper
comes first. Matching raw text made the radius check count the English words "rounded" and
"Grounded" in prose, which is a false positive that reads exactly like drift.

```bash
cls() { grep -rohE 'class(Name)?="[^"]*"' "$@" \
  | sed -E 's/^class(Name)?="//; s/"$//' | tr ' ' '\n' | grep -v '^$'; }

# radius drift — SUBTRACT the sanctioned set (md for controls, xl for containers, full for
# pills). Never name one drifted value: an arbitrary radius is drift too.
cls components app | grep -xE 'rounded(-(sm|md|lg|xl|2xl|3xl|full|none|\[[^]]+\]))?' \
  | grep -vxE 'rounded-(md|xl|full)' | wc -l                        # target: 0

# card treatments hand-rolled instead of <Card>
grep -roh 'rounded-xl border[a-z0-9:/ -]*' components \
  | sed 's/[[:space:]]*$//' | sort -u | wc -l                       # target: 1 (+ any named
                                                                    # non-card primitive, see below)

# off-scale spacing — every spacing utility, minus the scale, INCLUDING arbitrary values,
# which §4 forbids outright and which a named-step pattern cannot see.
cls components app | grep -xE '((p|m)[xytblr]?|(gap|space)(-[xy])?)-([0-9]+|\[[^]]+\])' \
  | grep -vxE '.*-(0|1|2|3|4|6|8|12)' | wc -l                       # target: 0

# a size that is not on the scale at all — every text- size INCLUDING an arbitrary one,
# minus the six in §3 and the one annotation size it sanctions.
cls components app | grep -xE 'text-([a-z0-9]+|\[[^]]+\])' \
  | grep -E '^text-(xs|sm|base|lg|xl|[0-9]xl|\[)' \
  | grep -vxE 'text-(xs|sm|base|xl|3xl|\[11px\])' | wc -l           # target: 0

# decision-grade text at caption size — count the INVERTED FILES, not the suite total
for f in components/*.tsx; do xs=$(grep -oh 'text-xs' "$f" | wc -l); \
  sm=$(grep -oh 'text-sm' "$f" | wc -l); [ "$xs" -gt "$sm" ] && echo "$f $xs/$sm"; done | wc -l
                                                                   # target: 0 inverted files

# primitives actually adopted
grep -rlE "from ['\"](\./ui|@/components/ui)['\"]" components | wc -l   # target: most components
```

**The radius, spacing and type greps were rewritten on 2026-08-04 because they were provably
blind, and the proof is a fixture rather than an argument.** Written into a scratch directory
holding `rounded-2xl`, `rounded-sm`, `rounded-[10px]`, `p-[13px]`, `gap-[18px]`, `mt-[37px]` and
`text-[13px]`, the OLD block reported **radius 0, spacing 0, type 0** against seven live
violations. The corrected block reports **3, 3 and 1** — every one. Each failure was the same one
this section already documents about itself and had never applied to its own commands: the radius
grep named `rounded-lg` and so passed every other off-system radius, while the spacing and type
greps matched named steps only and left `p-[13px]` and `text-[13px]` entirely unenforced.

**Re-run against the real tree the three corrected greps move no count** — radius 0, spacing 0,
type 1, unchanged. That is the honest result and worth stating plainly: the instrument was broken
and nothing happened to be hiding behind it. It is a guard against the next drift, not a discovery.

**Two of the six are still known-blind, measured but deliberately NOT changed here, because the
obvious correction makes each WORSE and both need the ratchet in `lib/design-system.test.ts` to
move in the same commit.** Recorded so the next session starts from the measurement:

- **The card grep anchors on the literal string `rounded-xl border`**, which Tailwind class order
  makes arbitrary, and it scans `components` only while the others scan `components app`. But
  rewriting it to read class attributes the way `cls()` does reports **0 where the truth is 3** —
  these treatments are not single-line `className` literals, so an attribute-based reader cannot
  see them at all. The correct fix reads the same sources `lib/design-system.test.ts:633` reads and
  normalises class ORDER before de-duplicating; it is not a one-line grep change.
- **The inverted-file loop iterates `components/*.tsx`, so no route is ever measured.** Adding
  `app/**/*.tsx` takes the count **10 → 12**, and the two it finds are real: `app/validation/page.tsx`
  (1/0) and `app/privacy/page.tsx` (4/3). Moving it means moving `invertedTypeFiles` in the ratchet
  in the same commit, and deciding first whether a docs route full of prose should be held to a
  metric written for data surfaces.

- **The inverted-file loop and the adoption grep both READ COMMENTS AS CODE, which is the second
  member of the class §5 already records** — the chip census was taught to skip comments and these
  two were not. Measured on a three-`text-xs` file with no `text-sm` at all: appending the single
  line `// Sizes considered: text-sm, text-sm, text-sm, text-sm.` takes it off the inverted list,
  **1 → 0, with no glyph changing size**. The adoption grep has the same hole in the other
  direction: a file whose only reference to the primitive layer is `// TODO: import { Card } from
  './ui'` counts as an adopter while it hand-rolls a card underneath, and "36 of 48" is the number
  sessions quote as evidence the primitive layer landed. One line in the tree today carries a
  size token inside a comment, so the effect is live but small — the hole is the point, not the
  current count. The fix is the `openingTag`-style scan that already exists for the chip census in
  `lib/design-system.test.ts`; a shell grep cannot do it, which is an argument for these two counts
  moving into the ratchet rather than being repaired in place here.

**The suite-wide ratio was removed on 2026-07-31, and the reason is worth keeping.** It hid what it
was for and then actively misled. It hid: 88 `text-xs` against 91 `text-sm` passed `sm > xs` by three
while **9 of 23 component files were individually inverted**, `GeometryInspector` at 9:2 and
`MonteCarlo` at 9:4 — a global ratio passing by a hair while the surfaces a flyer reads numbers on sit
at caption size is exactly the inversion §3 exists to prevent. Then it misled: converting nine
hand-rolled buttons onto `Button` moved the totals to **84/89**, an inversion by the metric, while not
one glyph on screen changed size — the `text-sm` had moved INTO the primitive. **Adoption drives the
suite ratio the wrong way for the right reason**, which makes it useless during exactly the milestone
that raises adoption. Count the inverted FILES.

**The adoption grep used to carry a hard-coded quote character**, and it could only ever be right in
one of the two repos: Loft's imports are double-quoted and Debrief's are single-quoted, so whichever
form this shared file picked, the other app got a command that answered **0** whether adoption was 0%
or 100%. It was written `from './ui'` while Loft was double-quoted (corrected 2026-07-31), then
`from "./ui"` while Debrief was single-quoted, which is the same bug pointing the other way. It is
quote-agnostic now, and any grep added here must be. A compliance command that cannot fail is worse
than none, because a session runs it, sees the target, and moves on.

**The off-scale-type grep was widened for the same reason.** It named `text-lg` because that is the
one Loft had. Run against Debrief on 2026-07-31 it reported **5** where the true count was **19** —
`text-2xl` used 13 times, including five of six page titles where §3 says `text-3xl`, and one
`text-4xl` — and called the other 14 compliant. A grep that names one instance of a class of drift
will always be read as covering the class. It matches every `text-` size and subtracts the six.

**Two more greps were generalised on 2026-07-31, and both had the same shape as the two above: a
pattern that named the drift somebody had in front of them rather than the class it belongs to.**

- **The card grep's character class had no `:`,** so every treatment truncated at the first
  `dark:` variant and two cards differing only in their dark surface counted as one. **The count
  does not move — 7 before, 7 after** — because today's seven strings happen to differ before their
  first `dark:` as well; what the fix buys is what the metric is able to *distinguish* for the rest
  of the milestone, not a correction banked now. Say that rather than claim a number that did not
  change. **The `sed` is part of the rule, not tidiness:** one call site ends its class string with
  a space before an interpolation, so untrimmed the shell answers 8 where the test answers 7, and
  the two copies of this block have to agree or neither is the authority.
- **The spacing grep enumerated forbidden values, and the enumeration stopped at 14.** Two whole
  prefixes were never matched at all — `gap-` and `space-{x,y}-` are the same scale applied to a
  different property — and nothing above 14 was named. It reported **0** while 8 occurrences over 6
  sites remained: `mt-20 md:mt-28` twice, `mt-16`, `space-y-5`, `gap-5`, `gap-y-5`. Enumerating what
  is allowed and subtracting it cannot go stale the way enumerating what is forbidden does, which is
  the same correction the off-scale-type grep already took.

  **`gap`/`space` need their own prefix branch, and the first draft of this very fix got that
  wrong.** They take the axis as a separate segment (`gap-y-5`) where padding and margin fold it in
  (`py-5`), so a shared `[xytblr]?` cannot match both. Written as one pattern it reported 0 again,
  with `gap-y-5` sitting live in `app/methods/page.tsx` — a second false green inside the commit
  that existed to remove the first. Caught by review, not by the grep.

**Half-steps are deliberately out of this grep's scope, and that is a decision rather than an
oversight.** §4's own table sanctions `px-3 py-1.5` and `px-2 py-1`, so `-1.5` is *in* the system and
a grep that forbade every half-step would contradict the section it enforces. The unsanctioned ones
(`-0.5` ×48, `-2.5` ×21, `-3.5` ×1; `-1.5` ×78 is sanctioned) are recorded in `BACKLOG.md` rather than
silently swept in or silently ignored; settling them means saying in §4 which half-steps are on the
scale, and that is a change to this file in both repos.

**The two copies of this block had DRIFTED, and the weaker side hid real drift in its app.**
Reconciled 2026-08-02 — the first session in which both repos could be attached at once and the
copies actually compared, which is why it stood for six runs. Three of Loft's greps were the weaker
side: the spacing one listed a handful of off-scale values to hunt for instead of enumerating the
scale and subtracting it, so it could not see a `gap-*`, a half-step, or anything past its largest
alternative — and Loft's footer had sat two steps outside the scale on both top margins, reading as
compliant, for as long as the check existed. The type one matched a single size name, so a seventh
or eighth size under any other name passed. The card one could not survive a trailing space or a
`dark:` variant. **The lesson is not "Loft was behind"** — Debrief's adoption grep was the weaker
side of the same coin a run earlier. It is that a file shared verbatim between two repos cannot be
verified from inside one of them, so whichever session next has both attached should diff them
first, before trusting either copy.

**Pin what you fix.** A drift you correct without a check comes back. The suite-level target is that
these counts are asserted by a test, not re-measured by hand each run — and in both apps they now
are: `lib/design-system.test.ts` is the executable copy of this block, with each count an EXACT
ratchet so that an improvement and a regression both fail until the number is updated in the same
commit as the work. Neither file may drift from the other, and neither may drift from its sibling.

**Where the card target is not 1, say so rather than quietly missing it.** A treatment that matches the
grep but is genuinely not a card — a floating toast that needs elevation, an interactive drop zone —
gets its own named primitive rather than a `shadow` prop on `Card`. Record the honest floor and what
each remaining string is, on the milestone that owns the conversion.

### Contrast — the one thing every grep above is blind to

**Every count above matches a class NAME, and readability is a rendered COLOUR.** So all of them can
read zero while text on a live route is unreadable — and on 2026-08-08 that is exactly what had
happened in the sibling app. The owner reported its docs as "grey in dark mode, incredibly hard to
read", and every §9 number there was at target. Measured on the built export: body prose at
**1.91:1**, `h2` and `strong` at **1.12:1**, links at 3.16:1, against WCAG AA's 4.5:1. It had shipped
on all six docs routes for as long as those routes existed.

**The mechanism is worth stating, because it is a trap this system sets for itself.** The `dark`
variant has TWO clauses — the `.dark` class an explicit choice sets, and `prefers-color-scheme` for a
visitor who has chosen neither — and every `dark:` UTILITY gets both. A rule written by hand in a
stylesheet gets only the one it asks for, and "System" is the DEFAULT theme, setting no class at all.
So a hand-written `:where(.dark)` rule is correct for everyone who has visited the theme toggle and
wrong for everyone who has not.

Two rules follow, and they are binding in both apps:

- **A hand-written rule states its colour with `light-dark()`, never with `.dark` alone.** It
  resolves against the element's used `color-scheme`, which is already set per clause on the root, so
  one function covers both with no media query to forget. Keep the bare light value as a preceding
  declaration — that is the fallback for a browser without `light-dark()`, and it costs nothing.
- **Contrast is measured on the RENDERED page, in every theme a visitor can be in** — light, Dark
  chosen, and a dark OS with nothing chosen. That third state is the default and is the one that was
  broken.

**This app is currently clean, and that is a measurement rather than an assumption.** Checked
2026-08-08: `app/globals.css` here carries **zero** `:where(.dark)` rules and **zero** hand-written
`color`/`background` declarations — every colour comes through a `dark:` utility, which gets both
clauses for free. So there is nothing to convert today. The rule is recorded here anyway, because
this file is shared and because the first hand-written rule anyone adds is the one that reintroduces
it.

```bash
# the rendered check, once this app has any hand-written colour to protect
npx playwright test e2e/contrast.spec.ts        # target: 0 nodes below WCAG AA

# the source check — no hand-written rule may answer the class clause alone
npx vitest run lib/design-system.test.ts -t "class half of the dark variant"   # target: green
```

Colours are **rasterised onto a 1×1 canvas, never parsed**: Chromium reports computed colours as
`lab()`/`oklab()`, and a digit match over `lab(2.51 0.24 -0.89)` yields confident nonsense. And each
case asserts its own sample count first — a walk that examined nothing reports zero unreadable nodes
and prints exactly like a pass.

---

## 10. Suite consistency

Loft and Debrief are one product family. A flyer who designs in Loft and analyses in Debrief must not
feel they changed tools. Shared and non-negotiable: this file, the neutral and accent ramps, the type
scale, the spacing scale, the component vocabulary and its names, the header/footer/nav pattern, the
theme toggle and its tri-state behaviour, the units control, the brand mark and wordmark, the PWA and
offline posture, the MIT licence.

**Divergence is a bug in whichever app diverged**, and the fix lands in both repos in the same run.
Where the apps genuinely need different components — a rocket diagram, a flight chart — they still
share tokens, scale, states and vocabulary.

### The suite is THREE tools, and the reference is whichever one meets this file

**Named here because until 2026-08-08 this section named none, and "shared and non-negotiable" with no
reference resolves to whichever app a session happens to be sitting in.** The third tool is the Hobby
Rocket Motor Finder (`motor.fusionspace.co`, `nrdptel/Hobby-Rocket-Motor-Finder`) — live, polished, and
the one a flyer has most likely just come from. It is a reference, **not the authority**: where a
shared control differs, the app that matches this file wins and the others move. Establish which that
is by MEASURING all three, not by assuming the oldest is right.

**The theme control — already identical, do not "align" it.** Verified from the motor finder's rendered
markup: same tri-state cycle, same `System / Light / Dark` labels, the same `◐ ☀ ☾` icons, and the
identical accessible name `Color theme: X. Click to change.` Only the storage key differs, correctly.
A session reading `ON-B1` as a rewrite instruction would be undoing a match.

**The Tip control — one Ko-fi link, and the colour question is SETTLED against the motor finder.**
It renders an amber pill; Debrief and Loft render a neutral `secondary`. Amber is `warn` (§2), and
Debrief's `components/KofiButton.tsx` carries the reasoning in full because it *used* to be amber and
was deliberately changed: spending the caveat colour on a tip jar in the persistent header devalues
the one signal the safety posture leans on. **Two of the three agree, and they are the two that meet
§2** — so the motor finder is the app that should move on colour.

What DOES converge is the **glyph and the wording**: a coffee cup on the same path, and the sentence
*"Tip the project — buy me a coffee on Ko-fi"*. Loft carried a `♥` and a shorter accessible name until
2026-08-08 and was the odd one out; it is not now.

**The MECHANISM that sentence rides on does not converge, and that is a measurement rather than a
preference.** Both siblings put it on a `title`. Loft puts it on `aria-label` alone, because
`e2e/touch.spec.ts` counts any `title` whose text is not already on screen beside it as a state a
flyer at the pad cannot reach, and holds that total at zero. Adding the `title` here took it to 1 and
failed the suite — correctly: the visible label is "Tip", the tooltip is a sentence, and a phone gets
no tooltip at all. So the rule for the family is **the accessible name carries the destination, and a
`title` may only repeat what is already rendered.**

**Geometry stays each app's own, and Loft's is the one to copy**: the motor finder renders
`px-2.5 py-1 text-xs` with no `focus-visible` ring and no touch minimum — about 26 px against §8's
44 px floor on `pointer: coarse`. Debrief's is `size="sm"`. Loft's is `buttonClass()`'s `md` with the
ring and the floor. A check holds that line (`lib/design-system.test.ts`, *"keeps Loft's touch floor
and focus ring on the suite's Tip control"*).

**Still open and the owner's:** the header's SHAPE — two right-aligned rows on the motor finder with
Tip last, a single row in Loft with Tip first. Parked in Loft's `OWNER-NOTES.md` under *Awaiting the
owner*.

**And the method, which is the transferable half.** The motor finder's repo is not attachable to these
sessions, so its behaviour is verifiable from the live site and its implementation is not — say which
of the two you did. **Debrief's is attachable, in one tool call, and this whole entry is what that
bought:** a run that had only Loft and the live motor finder measured two tools, concluded amber, and
was about to ship a semantic colour into the persistent header. Attach the sibling before deciding
anything this section governs.

---

## 11. What this file does not cover

Copy and tone (`MAINTAINING.md`), physics and method presentation (the methods and limitations
pages), and the roadmap. If a design decision has a product consequence — a route split, a new
workspace — it belongs in `ROADMAP.md` as a milestone, not decided inline here.
