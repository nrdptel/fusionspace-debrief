import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `DESIGN.md` §9, as an assertion instead of a block of shell a session may or may not run.
 *
 *  The design system is binding, and before this file existed the only thing enforcing it was that
 *  block. That is why the counts below started at 26, 6, 25 and 20 rather than 0, 1, 0 and 0: every
 *  one is a treatment somebody hand-rolled just this once, on a day when nobody ran it. `DESIGN.md`
 *  §9 says outright that the target is for these to be asserted by a test, and P1 ("one design
 *  system, adopted") is that milestone.
 *
 *  **The budgets are EXACT, not upper bounds, and that is deliberate.** An upper bound goes slack: a
 *  conversion that removes eleven treatments leaves a budget with eleven units of room in it, and
 *  the next hand-rolled card lands inside that room without failing anything. An exact count fails
 *  on an improvement too, which forces the new number into the same commit as the work — so the
 *  diff itself records the progress, which is what `DESIGN.md` §9 asks for when it says to put the
 *  counts in the commit message. When one of these fails after a deliberate conversion, lower the
 *  budget; when it fails after anything else, you hand-rolled a treatment that has a primitive.
 *
 *  The greps are `DESIGN.md` §9's own, kept in step with it deliberately — this file is the
 *  executable copy of that block and neither is allowed to drift from the other. The sibling repo
 *  carries the same file over its own numbers.
 */

const ROOT = process.cwd();

function sourcesUnder(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
    }
  })(join(ROOT, dir));
  return out;
}

/** Everything that can carry a class name. `app` holds the routes, `components` the surfaces — and
 *  `app/globals.css` holds the rules applied to bare elements, which is why `.css` is in here: §9's
 *  own greps have no extension filter, and a `rounded-lg` in the stylesheet is the same drift as one
 *  in a component. Reading only `.tsx` would under-count and call it progress. */
function uiSources(dirs: string[], exts: string[] = ['.tsx', '.css']): { path: string; text: string }[] {
  return dirs
    .flatMap((d) => sourcesUnder(d, exts))
    .map((p) => ({ path: p.slice(ROOT.length + 1), text: readFileSync(p, 'utf8') }));
}

function countMatches(
  files: { path: string; text: string }[],
  re: RegExp,
): { total: number; byFile: string[] } {
  const byFile: string[] = [];
  let total = 0;
  for (const f of files) {
    const n = f.text.match(re)?.length ?? 0;
    if (n > 0) {
      total += n;
      byFile.push(`${f.path}: ${n}`);
    }
  }
  return { total, byFile: byFile.sort() };
}

/** The counts as they stand. Each is a ratchet toward the target named beside it; lower it in the
 *  same commit as the conversion that earns it, and never raise one. */
const BUDGET = {
  /** `rounded-lg` is not in the system at all — containers are `xl`, controls are `md`. **At the
   *  target, so this is a guard rather than a ratchet** — it may never go up again.
   *
   *  All 22 were classified one at a time by what the element IS rather than swept to a single
   *  value, because a sweep picks whichever radius the majority happened to want and re-blurs the
   *  distinction the scale exists to make. Containers took `xl` — the mapper's preview table, the
   *  flight picker's list, the ground track's map frame, the report's three figure frames; controls
   *  took `md` — the two error-page links, the mapper's buttons, the `<label>` acting as a button
   *  on the comparison, the drop zone's own control.
   *
   *  The split fell **15 container / 7 control**, and that is the useful measurement: this value was
   *  landing mostly on real containers, one radius step short of the one the system gives them. It
   *  was not a control radius leaking upward — it was containers quietly shipping at two different
   *  radii, which is exactly the difference a reader notices and cannot name. */
  roundedLg: 0,
  /** Distinct card treatments. One of these is `<Card>`'s own string, which is the target state; the
   *  rest are hand-rolls still to convert. Two of them will not fold into `Card` and want their own
   *  named primitive — the page-level drop zone (`border-dashed … p-10`, an interactive target
   *  rather than a container) and the floating drop overlay (`border-2 border-dashed … shadow-lg`,
   *  which needs elevation) — so the honest floor here is 3 and not 1. Recorded in `ROADMAP.md`.
   *
   *  **Make that 4. A third non-card treatment was identified 2026-07-31 by trying to convert it and
   *  finding it would regress.** Five sites share `rounded-xl border border-zinc-200` with NO
   *  background: `FlightCard`'s canvas, `ColumnMapper`'s and `SampleTable`'s scrolling tables,
   *  `GroundTrack`'s divided `<dl>`, and its `Stat` tile. They are a FRAME — a bordered clip around
   *  content that owns its own surface — and the missing background is the point of them, not an
   *  omission.
   *
   *  The proof is `SampleTable`. Its sticky `<thead>` is `dark:bg-zinc-900`, and `Card`'s default
   *  tone is `dark:bg-zinc-900` — the same value. Today the frame is transparent, so on the page's
   *  `dark:bg-zinc-950` body that header reads as a distinct lighter band; put it on a `Card` and the
   *  band and the card become one flat colour and the header stops being a header. `ColumnMapper`'s
   *  is `dark:bg-zinc-900/40` over the same fill and flattens the same way, and `FlightCard`'s site
   *  is a `<canvas>` that paints its own background, so a fill behind it is meaningless.
   *
   *  Left as they are, deliberately. Converting them would have moved this count from 10 to 8 and
   *  quietly darkened two tables — which is the kind of trade this ratchet exists to prevent, not to
   *  encourage. If the frame ever earns a primitive it is `Frame`, not a `Card` tone.
   *
   *  **This number went UP, from 7 to 18, and then down to 13. Read this before assuming a
   *  regression, and before ever raising it again.** The rule above says never raise one, and that
   *  rule is intact: no hand-rolled card was added. This grep anchors on `rounded-xl border`, so it
   *  could only ever see a hand-roll that had already picked the RIGHT radius — and eleven of them
   *  were sitting one step away at `rounded-lg`, invisible to the check written to catch them. The
   *  `rounded-lg` conversion in this same commit did not create those eleven; it revealed them.
   *
   *  The proof is a measurement, not an argument. Run radius-agnostically over the tree as it stood
   *  BEFORE the conversion — normalising `lg` and `xl` to one token — and the count is **19**. After
   *  the conversion it is 18, because two treatments that differed only by radius collapsed into
   *  one. The conversion's net effect on hand-rolled cards was −1.
   *
   *  This is the card grep's version of the `offScaleSpacing` bug two entries down, and the same
   *  lesson: a compliance grep anchored on the compliant value can only see drift that is already
   *  half-fixed. **The anchor is safe now and was not before** — `roundedLg` above is a guard at 0,
   *  so a hand-roll can no longer hide at the middle radius.
   *
   *  18 → 13 is the seven `bg-zinc-50 px-4 py-3` panels moving onto `<Card tone="sunken">`, which
   *  is the tone that was added FOR them and had four adopters while seven more wrote it out by
   *  hand. They were five distinct strings for one thing: two differing only in where `print:hidden`
   *  sat relative to the `dark:` variants, the rest by a `text-sm` or a text colour.
   *
   *  13 → 12 is the four CHART containers — the report's and the comparison's `ChartBlock`, the
   *  channel explorer's chart host and the ground track's canvas host. One identical string at all
   *  four, and the four files `HANDOFF.md` named as still hand-rolling a card. Two of them measure
   *  their own box to size what they draw, so `Card` takes a `ref` now; without it they would have
   *  kept a hand-rolled `<div>` wrapped around the primitive, which is not a conversion. Their dark
   *  fill moves `zinc-900/40` → `zinc-900`, the sanctioned value: a fourth surface level is exactly
   *  what §2's "three levels, no more" forbids.
   *
   *  12 → 10 is the three alert callouts — the analyzer's read failure, the mapper's what-Debrief-
   *  reads note, the report's "Worth knowing" — onto `Card`'s `warn` and `danger` tones. Each keeps
   *  the live-region role it had (`role="alert"`, `role="status" aria-live="polite"`), which passes
   *  through untouched: a screen reader following "Reading…" is the whole reason the analyzer's one
   *  announces itself, and a silent conversion would have removed the announcement rather than the
   *  hand-roll.
   *
   *  **10 → 7 is the FRAME, which this comment has described for two runs as the thing to build and
   *  then left unbuilt.** Four distinct strings over six sites — `SampleTable`'s and `ColumnMapper`'s
   *  scroll shells, `DataTable`'s, `FlightCard`'s `<canvas>`, `GroundTrack`'s divided `<dl>` and its
   *  `Stat` tile, and `FlightReport`'s event rows — became one `<Frame>` in `components/ui.tsx`. The
   *  argument above for NOT folding them into `Card` is unchanged and is exactly why the primitive is
   *  its own: a frame has no background, and every one of these holds something that paints its own.
   *
   *  Two details worth keeping. `DataTable` takes the class string rather than the component, because
   *  its border is conditional on `maxHeight` — a short table sits directly in whatever contains it
   *  and a second border would double up — and a `bordered` prop existing for one caller is how a
   *  shared layer acquires the config surface that stops anyone using it. And `Frame`'s `ref` is
   *  GENERIC where `Card`'s is fixed to the div, because the two frames that need one are a scroll
   *  shell and a `<canvas>`; fixing it would have forced a cast at each call site instead of one
   *  inside the primitive.
   *
   *  **7 → 4 on 2026-08-02, and the honest floor turns out to be 3 rather than 4.** This comment
   *  said the page-level drop zone "wants its own named primitive". It does not: its hand-rolled
   *  string was **byte-identical to `CARD_TONES.muted`** — "sunken and dashed: a slot with nothing
   *  in it yet" — which had been added for exactly this case and then written out by hand anyway.
   *  `CompareSurface`'s dashed box folded into the same tone; it was the one dashed box in the app
   *  with no fill, so two drop targets on two surfaces read as two different kinds of thing while
   *  being the same kind of thing. `RecognizedFormats` was a plain raised card, off-scale `py-3.5`
   *  and all.
   *
   *  **So the floor is `Card` + `Frame` + the drop OVERLAY, which is 3.** The overlay is the one
   *  that genuinely will not fold in: `border-2 border-dashed … shadow-lg`, a floating element that
   *  needs elevation, and `Card` has no shadow by design.
   *
   *  **4 → 3 on 2026-08-02 — AT THE FLOOR.** The last string was `RecentFlights`'s logbook row, and
   *  `Card`'s `as` union gained `'li'` for it. That widening is the right shape rather than a
   *  concession: the row is a card AND a list item — a flight in a list of flights — and rendering
   *  it as a `<div>` to fit the primitive would have taken it out of the list semantics a screen
   *  reader announces, which is the exact trade `as` exists to refuse. `Card`'s default tone IS
   *  that row's treatment, written out by hand; what stayed in `className` is only the hover and
   *  the indigo left edge marking an annotated flight.
   *
   *  **This is now a guard, like `roundedLg` and `offScaleSpacing`, and it may never rise.** The
   *  three are `Card`, `Frame` and the floating drop overlay, and each is a distinct kind of
   *  container rather than a hand-roll waiting to be converted. Any fourth string is a new
   *  just-this-once. */
  cardTreatments: 3,
  /** Spacing values off the `1 2 3 4 6 8 12` scale. **At the target, so this is a guard rather than
   *  a ratchet** — it may never go up again. Each of the 25 was mapped to its nearest scale value in
   *  the direction that keeps the rhythm: `5 → 4` between related things, `10 → 12` for a section
   *  break or page gutter — except a list indent, where rounding DOWN puts the marker on the edge,
   *  so `pl-5 → pl-6`.
   *
   *  **This read 0 for a run while 8 occurrences were sitting in the tree**, because the pattern
   *  enumerated the values somebody had in front of them and never matched `gap-` or `space-y-` at
   *  all. The six sites were converted on the same commit that widened it — `mt-16` to `mt-12`, the
   *  two `mt-20 md:mt-28` page breaks to `mt-8 md:mt-12` (which keeps the responsive step the first
   *  attempt flattened away), and `space-y-5`/`gap-5`/`gap-y-5` to `4`, the "between related
   *  things" mapping the rest of the conversion already used. */
  offScaleSpacing: 0,
  /** Component files where caption size OUTNUMBERS the body default.
   *
   *  **The target is NOT 0, and this is measured rather than conceded.** The ratio is a proxy: it
   *  counts every `text-xs` as drift, but `DESIGN.md` sanctions several — §5 makes `Chip` `text-xs`
   *  by definition, §3 allows units, footnotes and dense table metadata. A component built OUT of
   *  chips is therefore permanently "inverted" while being fully compliant, and driving it to 0
   *  would mean breaking §5 to satisfy a count.
   *
   *  Four files are already at their correct state and are the floor: `EventChips` (3/0 — a group
   *  label, the chips themselves, and a "kept on this device" footnote), `RecognizedFormats` (3/0 —
   *  an uppercase micro-heading, format chips, a footnote), `SiteFooter` (1/0 — the footer IS a
   *  footnote) and `FusionSpaceBadge` (1/0 — a hover annotation). `KofiButton` (1/0) is a compact
   *  badge link and is arguable either way. **So the floor is at least 4, and this number is only
   *  meaningful alongside a reading of what each remaining file's captions actually are.**
   *
   *  `ChannelExplorer` is the worked example. It went 17/4 to 11/10 — six genuine violations fixed
   *  (the X-axis label, the "Views" group label, the view-name input, the axis legend that says which
   *  unit is on which axis, the disclosure toggle, and the "no samples in range" empty cell) — and it
   *  is STILL counted inverted at 11/10. The remaining eleven are channel and preset chips, the stats
   *  table's column headers, and provenance footnotes: every one sanctioned. It was left there rather
   *  than pushed over the line, because the six that moved were the ones that were wrong. Worth
   *  knowing before reading this count as a defect total: the stats table's numbers were never at
   *  caption size — `TD_NUM` carries no size and inherits the table's `text-sm`.
   *
   *  The two cross-check tables, `GpsApogee` and `DeviceSummary`, came out the same way. Their
   *  figures were never at caption size either — both are `<table className="… text-sm">` — and what
   *  remains after promoting the panel description is column headers, agreement chips and a footnote.
   *  4/3 and 6/3, both counted inverted, both correct. The description moved because it is the same
   *  structural element as the seven panels' description and sizing it differently on the grounds
   *  that its sentence happens to be provenance rather than instruction is how the drift started.
   *
   *  23 → 16 is the seven derived-reading panels — `DragCoefficient`, `RailExit`, `ParachuteCd`,
   *  `LandingEnergy`, `DrogueCd`, `EjectionDelay`, `DeployAltitude` — which shared one shape and one
   *  mistake: every one of them rendered its input LABEL, its input, its description and all of its
   *  state messages at `text-xs`, leaving only the heading at body size.
   *
   *  §3 draws the line and it is not a matter of taste: `text-sm` is "every label, value, control and
   *  table cell", while `text-xs` is for the text AROUND a value — "its unit, its provenance, its
   *  caveat — never the value". So the conversion was by role, not by sweep. Promoted: the labels,
   *  the number inputs, the description that tells the flyer what to enter, and every state message —
   *  the empty state, the blocked state, the result sentence, and the warning. Kept at caption size:
   *  the three formula notes (`Cd = 2·m·g / ρ·v²·A` and friends) and the condition beside each
   *  reading, which are exactly the "how it was computed" text §3 names.
   *
   *  **The one worth naming: `RailExit` was rendering a flight-safety caution at caption size** — a
   *  rail-exit speed on the low side, "less airflow over its fins to hold it straight", which is the
   *  panel's whole reason to exist on a marginal flight. That is a decision-grade sentence and it was
   *  the smallest text on the surface.
   *
   *  Note the ratio is a proxy and can be satisfied by a tie, since the filter is a strict `>`. Four
   *  of these seven would have flipped on labels and inputs alone, landing at exactly 4/4. That was
   *  not taken as done — the state messages were converted because they are body text, and the seven
   *  now sit at 1–2 captions against 6–8 body rather than on the boundary. */
  /** 16 → 15 on 2026-08-01, and it is the ADOPTION EFFECT rather than an improvement — say so,
   *  because a number that moves the right way for the wrong reason is how a ratchet stops meaning
   *  anything. `KofiButton` and `ThemeToggle` moved onto `Button size="sm"`, whose own class string
   *  is `text-xs`; the class left the two files and went into `ui.tsx`. Not one glyph changed size.
   *  §9 documents exactly this effect for the suite-wide ratio, and it reaches the per-file count
   *  too whenever a converted file was small enough that its buttons were most of its type. */
  /** 15 → 16 on 2026-08-02, and it is the SAME adoption effect running the other way — recorded
   *  in the same detail, because a ratchet that explains its improvements and waves through its
   *  regressions is not a ratchet. `Analyzer` adopted `ErrorState` for the app's most-hit error
   *  surface; the hand-rolled `<Card tone="danger" className="text-sm">` it replaced carried that
   *  `text-sm` in the FILE, and the primitive carries it in `ui.tsx` instead. Not one glyph changed
   *  size, and the file went 3/2.
   *
   *  All three of its captions are sanctioned by §3's own wording — a file name inside "Reading …",
   *  the help line under it, and the amber note about a mapping in progress are the "text AROUND
   *  such a value — its unit, its provenance, its caveat" that `text-xs` is FOR. `Analyzer` joins
   *  `EventChips`, `RecognizedFormats`, `SiteFooter`, `FusionSpaceBadge` and `ChannelExplorer` as a
   *  file that is inverted while fully compliant, which is why item 2's target of 0 is not
   *  reachable and `ROADMAP.md` says so. */
  /** 16 → 13 on 2026-08-02, and this one IS an improvement rather than an adoption effect — the
   *  distinction matters and the two entries above it are the reason to state it. Glyphs actually
   *  changed size: `RecordingPicker`, `FlightPicker` and `GroundTrack` each rendered a
   *  decision-grade number at `text-[11px]` or `text-xs`, and all three left this list by taking
   *  §3's `text-sm` floor. Nothing moved into `ui.tsx`.
   *
   *  What each of them was: the apogee and peak speed a flyer reads to decide WHICH RECORDING of
   *  one flight to trust — the decision `RecordingPicker` exists for; the apogee that tells one
   *  flight in a multi-flight download from another; and the walkback distance and bearing, read
   *  standing in a field deciding where to walk. §3 reserves `text-[11px]` for axis ticks and
   *  diagram annotations, which none of these is. */
  /** 13 → 14 on 2026-08-02, and this is a THIRD way this count moves that the two entries above do
   *  not cover. It is not the adoption effect and it is not a regression: **every glyph involved
   *  got BIGGER.**
   *
   *  `GroundTrack` went 4/4 to 7/4 because three strings were converted UP from `text-[11px]` into
   *  the caption size — the recovery tile's label, the "measured from the descent drift" note, and
   *  the wind-aloft explanation. §3 reserves the smallest size for axis ticks and diagram
   *  annotations, and none of those three is either, so each conversion is the rule being obeyed.
   *  The count cannot see it, because it compares caption against body and says nothing about what
   *  sits BELOW caption.
   *
   *  **Not "fixed" by pushing the three to `text-sm`.** They are a stat label, a provenance note
   *  and an explanatory paragraph — precisely the "text AROUND such a value" that §3 says
   *  `text-xs` is FOR. Raising them to clear a metric would breach the section the metric exists
   *  to enforce, which is the trade `ROADMAP.md` item 2 already warns against. Recorded instead.
   *
   *  So this metric has now moved FOUR ways: adoption (a `text-sm` migrating into a primitive),
   *  real improvement (a decision-grade number leaving caption size), real regression, and this —
   *  a sub-caption string being brought ONTO the scale. Anyone reading a single delta here without
   *  the entry beside it will draw the wrong conclusion. The map legend at `GroundTrack.tsx:587`
   *  keeps `text-[11px]` and is the one that genuinely is a diagram annotation.
   *
   *  **14 → 12 on 2026-08-03, and it is the FIRST of those four ways — adoption.** `DeviceSummary`
   *  (four hand-rolled verdict chips) and `GpsApogee` (two) took §5's `Chip`, so six `text-xs`
   *  moved INTO the primitive rather than off the screen. Both files sat just over the line — 4/2
   *  and 3/2 — and both are now 1/2. **Nothing a flyer reads changed size.**
   *
   *  This entry first said `LogDetails`, and both halves of that were wrong: `LogDetails` was
   *  1/1 on `main`, which is not inverted, so it was never on the list to fall off — and the
   *  number was 13. Recomputing the two lists and diffing them named the real files in one step.
   *  A ratchet comment asserting WHICH file moved is a claim like any other; check it. */
  invertedTypeFiles: 12,
  /* Scoped to `components` — and unlike the per-primitive count below, it should STAY there until
   * someone decides what it means on a route. Measured 2026-07-31, after the docs conversion:
   * `app/validation/page.tsx` carries one `text-xs` (the back link) against zero `text-sm`, because
   * its prose is `text-base`. A strict `xs > sm` filter calls that INVERTED while the page is
   * exactly what §3 asks for. The metric's premise — that `text-sm` is the body default a caption
   * should not outnumber — is a COMPONENT premise; §3 gives docs prose `text-base`, so on a docs
   * route the comparison has no meaning. Widening this one the way the per-primitive count was
   * widened would manufacture two false positives on the day it happened. */
  /** Sizes that are not on `DESIGN.md` §3's six-size scale at all.
   *
   *  §9's grep used to name only `text-lg`, because that is the one the sibling app had. This repo
   *  had twenty across three named sizes — `text-lg` (5), `text-2xl` (14, including five of seven
   *  page titles where §3 says `text-3xl`) and `text-4xl` (1) — plus one arbitrary `text-[10px]`.
   *  Counting only the named one reported 5 of 20 and called the rest compliant. §9 is generalised
   *  to match, in both repos.
   *
   *  **The floor here is 1, not 0, and saying so is the point.** The one that remains is the brand
   *  wordmark in `components/SiteHeader.tsx`. It is `text-2xl md:text-3xl` in the sibling app too,
   *  and §10 makes the brand mark and wordmark shared and non-negotiable across the suite — so it
   *  is the BRAND's size rather than a content size, and changing it here alone would fork the
   *  suite's wordmark to satisfy a count. Every other off-scale size is a content size and is
   *  gone. If this ever needs to reach 0, it is a §3 change in both repos, not an edit here. */
  offScaleType: 1,
  /** Components importing the shared primitives. Target: most of the 44. This one only goes UP.
   *  29 → 31 on 2026-08-01: the two cross-check tables moved onto `DataTable`. 31 → 36 on
   *  31 → 34 on 2026-08-02: `SampleTable` onto `Frame`, then `RecognizedFormats`, `DropZone` and
   *  `CompareSurface` onto `Card` (`DropZone` already imported `Button`, so it moved this by zero). **The six panels
   *  that moved onto `NumberField` in the same commit moved this by ZERO** — every one already
   *  imported `Card`, so a per-FILE count cannot see six controls being adopted. That is the
   *  argument for the per-primitive map below, and it is the third time a §9 metric has turned out
   *  to measure something other than what it was reached for.
   *
   *  **34 → 35 on 2026-08-03: `LogDetails` imports `./ui` for the first time**, taking `Chip` for
   *  its channel tokens. The pre-push review had to find this, because the assertion below is
   *  `toBeGreaterThanOrEqual` — a stale number here goes green and stays invisible, which is the
   *  opposite of how the exact ratchets behave. The `>=` is right (this one only goes up), so the
   *  discipline has to be: when a commit adds an import of `./ui` to a file that had none, this
   *  number moves in that commit. */
  uiAdopters: 35,
} as const;

/** How many components import EACH primitive by name.
 *
 *  The file-level adopter count above is necessary and nowhere near sufficient: a ratchet that only
 *  counts FILES is satisfied for the rest of the milestone by adding one more `Card` import, while
 *  all 90 hand-rolled `<button>` elements stay exactly where they are — which is P1's actual gap.
 *  Depth, not breadth.
 *
 *  A zero here is not a failure; it is a primitive that exists and is not yet adopted, which is the
 *  state this milestone is closing. What must not happen is a zero silently BECOMING the finished
 *  condition.
 *
 *  **This counts `app` as well as `components`, and it did not until 2026-07-31.** Reading only
 *  `components` made the metric blind to the one primitive §5 defines by its ROUTE: "`Section` — a
 *  titled region within a route … this is what a route is built from." Every `Section` there will
 *  ever be lives in `app`, so converting a route left this line reading 0 and the next session would
 *  have read that as "still unadopted" and done the work again. Measured the same day: all nine
 *  route files imported ZERO primitives, so widening the denominator moved no other count — the
 *  numbers below are the same ones, over a set that can now see the work.
 *
 *  This is the fourth §9 metric to turn out to measure something other than what it was reached for,
 *  after the two blind greps and the suite-wide type ratio. The pattern is the same every time: a
 *  measurement scoped to where the drift was FIRST noticed, then read as covering the class. */
const PRIMITIVE_ADOPTERS: Record<string, number> = {
  /** 23 → 26 on 2026-08-02: `RecognizedFormats`, `DropZone` and `CompareSurface`, the last three
   *  hand-rolled cards outside the logbook row. Two of them took `tone="muted"`, which existed
   *  already and which both had written out by hand. 26 → 27 is the logbook row itself, which took
   *  `as="li"`. */
  /** 27 → 26 on 2026-08-02, and it is a MOVE rather than a loss: `Analyzer`'s only `Card` was the
   *  hand-rolled `tone="danger"` error box, which is now `ErrorState` — the §5 primitive whose job
   *  that is. A generic container giving way to the specific one is the direction this milestone
   *  exists to push, so the two numbers have to be read together: `ErrorState` 1 → 2. */
  Card: 26,
  /** 18 → 19 on 2026-08-03 with §5's fifth weight. `Analyzer` is the new adopter: its "← Analyze
   *  another flight" was one of eight hand-rolled indigo-text controls across four files, which is
   *  the vocabulary having been short a word rather than four files having been careless. The
   *  other three already imported `Button` for something else, so the count moves by one while
   *  eight sites converted — read the two numbers together. */
  Button: 19,
  /** 3 → 7 on 2026-08-03 with §5's semantic chip tones. `DeviceSummary`, `GpsApogee`,
   *  `FlightReport` and `LogDetails` were hand-rolling a chip, and **the grep below counted 12
   *  hand-rolled chip-shaped elements on `main` over THREE padding combinations** —
   *  `px-1.5 py-0.5` ×7, `px-2 py-0.5` ×3, `px-3 py-2` ×2 — **not one of which is §5's
   *  `px-2 py-1`**. They had independently converged on the primitive's own `500/30` + `500/10`
   *  colour ramp, which is the tell that the gap was the vocabulary (no `good`/`warn`/`danger`
   *  tone) rather than four files being careless.
   *
   *  **Seven elements convert; FOUR of them are why the enum grew** — `DeviceSummary`'s three
   *  verdicts and `GpsApogee`'s one. Those four hold five tone STRINGS, because `GpsApogee` picks
   *  between emerald and amber in one ternary `className`. Four elements, five strings: a count
   *  has to name its unit and keep it.
   *
   *  **Every number in this entry is the second one written.** The first said "four padding
   *  combinations", "ten spans" and "five sites reaching for a tone" — three claims, none of them
   *  what the repo held, all from eyeballing rather than from the scanner sitting in the same
   *  commit. `GpsApogee` was missed entirely until that scanner ran. It is one entry below the
   *  paragraph telling the next session that a ratchet comment is a claim like any other; the
   *  lesson is cheaper to take from here than to re-learn. */
  Chip: 7,
  /** 2 → 9 on 2026-08-02. The seven derived-reading panels — deploy altitude, drag coefficient,
   *  drogue Cd, ejection delay, landing energy, parachute Cd and rail exit — each hand-rolled a
   *  BYTE-IDENTICAL hero value (`font-mono text-xl font-semibold tracking-tight tabular-nums
   *  text-zinc-900 dark:text-zinc-100`), which is the `ACTION_BTN`-in-six-files shape P1's opening
   *  audit removed once already and which had quietly restarted for readings.
   *
   *  The primitive gained exactly two things to fit them, and each is a real case rather than
   *  config for one caller: `label` is optional, because all seven carry their own `<h3>`
   *  immediately above the value and a label here would say it twice; and `layout="inline"` puts
   *  the qualifier on the value's baseline, which is what all seven were doing — the number and
   *  its qualifier read as one sentence in a card wide enough to hold it. Restacking them would
   *  have been a product decision, and this change is about where the treatment LIVES.
   *
   *  `GroundTrack`'s `Stat` is an eighth site with the same treatment and is deliberately NOT
   *  counted here: it renders `<dt>`/`<dd>` inside a `<dl>` and `Readout` renders `<div>`s, so
   *  adopting it would strip the list semantics a screen reader announces — the trade `Card`'s
   *  `as` exists to refuse, and `Readout` cannot take an `as` because it renders three elements.
   *  Its two genuine §3 breaches were fixed in place instead. */
  Readout: 9,
  /** §5's chart-with-its-own-states, built 2026-08-02. Two adopters, and half of it already
   *  existed TWICE: `ChartBlock` was declared separately in `FlightReport` and `CompareView`,
   *  differing only in an optional `id` and `note` — the `ACTION_BTN`-in-six-files shape P1's
   *  opening audit removed once already, restarting for charts. It owns the unit in the title too,
   *  which both call sites were interpolating by hand. */
  Figure: 2,
  /** §5's "every numeric input in either app is this", built 2026-08-02 after nine runs of
   *  counting adopters never noticed it did not exist — a primitive with no implementation has no
   *  adopters to be short of, so every count it should have moved was silent. Six of the seven
   *  hand-rolled numeric inputs are on it. The seventh, `CropControl`, is two inputs of a
   *  different shape (a stacked label, `h-11 w-28`, `font-mono`, and a pair that bound each
   *  other), and folding it in would add layout config for one caller — the same call
   *  `ColumnMapper`'s table and `CompareView`'s transposed one already got. */
  NumberField: 6,
  IconButton: 2,
  Extrapolated: 1,
  EmptyState: 1,
  ErrorState: 2,
  Section: 2,
  /** 3 → 4 on 2026-08-01: the sample table's channel scope, which is 2 mutually exclusive
   *  options with both visible — §5's own definition of when to reach for this. */
  Segmented: 4,
  Disclosure: 3,
  /** §5's "every table is this one", started 2026-08-01 on the two cross-check tables — the two
   *  surfaces §6 exists for and the ones a cert document most wants to lift. `SampleTable` and
   *  `CompareView` are deliberately NOT counted here and are not meant to be: one is transposed
   *  and the other is a virtualised view over `Float64Array` series. See the primitive's own
   *  comment for why folding either in would produce a union rather than a primitive. */
  DataTable: 2,
  /** The bordered-no-background container, lifted 2026-08-01 from the five sites that had written
   *  it out by hand. Counted here as well as in `cardTreatments` because the two checks catch
   *  different things: the treatment count is a `sort -u`, so a SIXTH file writing the identical
   *  string out again would collapse into the same bucket and move nothing. See the frame test
   *  below, which is the one that would fail.
   *
   *  5 → 6 is `StitchSurface`, whose per-stage panels are frames for the same reason the rest are:
   *  each holds a grid of `Readout`s that carry their own tone, inside a `Card` that is already
   *  raised — and §2 forbids nesting raised inside raised. */
  Frame: 6,
};

/** `DESIGN.md` §3's six sizes, and nothing else. `text-[11px]` is the sixth and is matched by the
 *  bracket form rather than by name. */
const ON_SCALE = new Set(['text-3xl', 'text-xl', 'text-base', 'text-sm', 'text-xs', 'text-[11px]']);

describe('DESIGN.md §9 — the design system is binding, and this is what checks it', () => {
  const ui = uiSources(['components', 'app']);
  const components = uiSources(['components'], ['.tsx']);

  it('has sources to read at all', () => {
    // A denominator. Every assertion below counts occurrences, so a walk that found nothing would
    // report a perfectly compliant app that does not exist.
    expect(ui.length).toBeGreaterThan(40);
    expect(components.length).toBeGreaterThan(40);
  });

  it(`uses rounded-lg exactly ${BUDGET.roundedLg} times, on the way to none`, () => {
    // `rounded-lg` is the middle radius, and it is the single value that caused most of the measured
    // drift: it reads as "a bit rounder", so it lands on containers and controls alike and blurs the
    // one distinction the radius scale exists to make.
    const { total, byFile } = countMatches(ui, /rounded-lg/g);
    expect(total, `rounded-lg, by file:\n${byFile.join('\n')}`).toBe(BUDGET.roundedLg);
  });

  it(`hand-rolls exactly ${BUDGET.cardTreatments} distinct card treatments, on the way to one`, () => {
    // The measurement that made P1 a milestone. Each distinct string is one card somebody wrote out
    // by hand rather than importing, and every one of them was a just-this-once.
    //
    // The class carries `:` deliberately. Without it every treatment truncated at its first `dark:`
    // variant, so a sanctioned `dark:bg-zinc-900` and the unsanctioned fourth surface
    // `dark:bg-zinc-900/40` landed in one bucket, and a newly hand-rolled card differing from an
    // existing one only after the colon could not fail this.
    //
    // **The count does not move: 7 before, 7 after.** Say that plainly rather than banking a
    // correction that did not happen — today's seven strings happen to differ before their first
    // `dark:` as well. What changed is what the metric is CAPABLE of telling apart, which is the
    // whole point of a ratchet that has to survive the rest of the milestone.
    //
    // This counts distinct TREATMENTS, which is what §9 asks for and is not the same as how many
    // call sites hand-roll a card: 18 occurrences in `components/`, of which one is `<Card>`'s own
    // string, so **17 are hand-rolled**. That 17 is the number measuring adoption debt, and it
    // lives in `ROADMAP.md`'s P1 list rather than here, because adding a metric to `DESIGN.md` §9
    // is a change owed to the sibling repo in the same run and this run cannot push there.
    const treatments = new Set<string>();
    for (const f of components) {
      for (const m of f.text.match(/rounded-xl border[a-z0-9:/ -]*/g) ?? []) treatments.add(m.trim());
    }
    expect(
      treatments.size,
      `distinct card treatments:\n${[...treatments].sort().join('\n')}`,
    ).toBe(BUDGET.cardTreatments);
  });

  it(`uses exactly ${BUDGET.offScaleSpacing} off-scale spacing values, on the way to none`, () => {
    // The scale is 1 2 3 4 6 8 12. An `mt-5` between two things that are `mt-4` apart everywhere
    // else is invisible on its own page and is exactly how a layout stops lining up across surfaces.
    //
    // Matched by SUBTRACTING the scale rather than by naming the values off it. The previous form
    // enumerated `5|7|9|10|11|14` over the prefixes `p m g`, which missed two whole prefixes —
    // `gap-` and `space-{x,y}-` are the same scale on a different property — and stopped at 14. It
    // reported 0 while `mt-20 md:mt-28` (twice), `mt-16`, `space-y-5` and `gap-5` were all still
    // there. An enumeration of what is forbidden goes stale; an enumeration of what is allowed
    // cannot.
    //
    // Half-steps are out of scope on purpose: §4's own table sanctions `px-3 py-1.5`, so forbidding
    // every `-1.5` would contradict the section this asserts. The unsanctioned ones are counted in
    // `BACKLOG.md` instead of being quietly swept in here.
    // `gap` and `space` take their axis as a SEPARATE segment (`gap-y-5`), where padding and
    // margin fold it into one (`py-5`) — so they cannot share a prefix pattern. Writing them
    // as one was this fix's own first draft, and it was blind to `gap-y-5` in
    // `app/methods/page.tsx` while claiming to have closed exactly that class of hole.
    const offScale =
      /\b(?:(?:p|m)[xytblr]?|(?:gap|space)(?:-[xy])?)-(?!(?:0|1|2|3|4|6|8|12)\b)[0-9]+\b/g;
    const { total, byFile } = countMatches(ui, offScale);
    expect(total, `off-scale spacing, by file:\n${byFile.join('\n')}`).toBe(BUDGET.offScaleSpacing);
  });

  // The SUITE-WIDE `text-sm` vs `text-xs` ratio is deliberately NOT asserted, and the reason is a
  // measurement rather than an opinion — see `DESIGN.md` §9. A primitive collapses many occurrences
  // into one, so adoption drives the suite ratio the wrong way for the right reason, which makes it
  // useless exactly during the milestone that raises adoption. The per-file count below is the one
  // that means something.

  it(`has exactly ${BUDGET.invertedTypeFiles} files where caption size outnumbers the body default`, () => {
    // A flyer does not read the suite total; they read one surface, and on 23 of them the numbers
    // and labels are at caption size. `DESIGN.md` §3: `text-sm` is the floor for anything a flyer
    // reads to make a decision.
    const inverted = components
      .map((f) => ({
        path: f.path,
        xs: f.text.match(/text-xs/g)?.length ?? 0,
        sm: f.text.match(/text-sm/g)?.length ?? 0,
      }))
      .filter((f) => f.xs > f.sm);
    expect(
      inverted.length,
      `inverted files:\n${inverted.map((f) => `${f.path} ${f.xs}/${f.sm}`).join('\n')}`,
    ).toBe(BUDGET.invertedTypeFiles);
  });

  it(`has at least ${BUDGET.uiAdopters} components importing the shared primitives`, () => {
    // The direction that matters: this number only ever goes up, and it is what "adopted" means.
    //
    // **This one stays scoped to `components` while the per-primitive count below reads `app` too,
    // and the difference is deliberate rather than an oversight.** This assertion IS `DESIGN.md`
    // §9's shared grep, character for character, and §9 is carried identically by the sibling repo;
    // widening it here would fork the shared file to fit one app. The per-primitive count is
    // test-only — §9 has no such grep — so it could widen without that cost, and it had to, because
    // `Section` lives in `app` by definition. Whether §9's own grep should read `components app` in
    // BOTH repos is a real question and it is recorded as owed to the sibling in `HANDOFF.md`; it is
    // not settled by editing one copy.
    //
    // The grep is quote-agnostic on purpose. `DESIGN.md` §9 carried a double-quoted literal, written
    // for the sibling repo, and every import in THIS repo is single-quoted — so run here it answered
    // 0 whether adoption was 0% or 100%. A compliance command that cannot fail is worse than none,
    // because a session runs it, sees the target, and moves on.
    const adopters = components.filter((f) => /from ['"](?:\.\/ui|@\/components\/ui)['"]/.test(f.text));
    expect(
      adopters.length,
      `importing components/ui.tsx:\n${adopters.map((f) => f.path).join('\n')}`,
    ).toBeGreaterThanOrEqual(BUDGET.uiAdopters);
  });

  it('counts adoption per PRIMITIVE, not just per file', () => {
    // Without this, the milestone's remaining increments can go green while every button in the app
    // is still a hand-rolled class string.
    // Every import of `./ui` in the file, not the first — a file may import values in one
    // statement and types in another, and `String.match` without `/g` returns only match 1, which
    // would have silently under-counted whichever list came second. `import type` counts too, and
    // a `type X` entry inside a mixed list has its keyword stripped before the name is compared.
    const IMPORTS = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](?:\.\/ui|@\/components\/ui)['"]/g;
    const importedBy = (f: { text: string }): Set<string> => {
      const names = new Set<string>();
      for (const m of f.text.matchAll(IMPORTS)) {
        for (const raw of m[1].split(',')) {
          const n = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
          if (n) names.add(n);
        }
      }
      return names;
    };
    // `ui`, not `components` — see PRIMITIVE_ADOPTERS. A route is where `Section` lives, so a
    // count that reads only `components` can never see it adopted.
    const counted: Record<string, number> = {};
    for (const name of Object.keys(PRIMITIVE_ADOPTERS)) {
      counted[name] = ui.filter((f) => importedBy(f).has(name)).length;
    }
    expect(counted, 'adoption per primitive (see PRIMITIVE_ADOPTERS)').toEqual(PRIMITIVE_ADOPTERS);
  });

  it(`uses exactly ${BUDGET.offScaleType} type sizes that are off the six-size scale`, () => {
    // `DESIGN.md` §3 names exactly six sizes, each with one job. Everything else is a seventh size
    // invented once and then copied — which is how a heading rhythm stops being a rhythm.
    // Named sizes AND arbitrary bracket sizes. §3's sixth size is the literal `text-[11px]`, so any
    // other pixel value is a size somebody invented inline — and the named-only version of this
    // check was blind to them: this repo's one `text-[10px]` was deleted by an unrelated conversion
    // and the count did not move, which is a ratchet reading clean while the drift walks past it.
    const found: string[] = [];
    for (const f of ui) {
      for (const m of f.text.match(/\btext-(?:xs|sm|base|lg|xl|\dxl|\[\d+px\])\b/g) ?? []) {
        if (!ON_SCALE.has(m)) found.push(`${f.path}: ${m}`);
      }
    }
    expect(found.length, `off-scale type sizes:\n${found.sort().join('\n')}`).toBe(BUDGET.offScaleType);
  });

  it('writes the frame treatment out in exactly one place', () => {
    // The card-treatment count above is a `sort -u`, which makes it blind in one direction that
    // matters here: a sixth file hand-rolling the frame's EXACT string would collapse into the
    // bucket `components/ui.tsx` already fills and the count would not move at all. So the
    // conversion that just took five sites onto `<Frame>` would be unguarded by the only check that
    // looks like it covers it.
    //
    // **Matched by its PARTS, not as a contiguous string, and that correction is the whole value
    // of this assertion.** Written as one literal it saw only the strings whose four tokens happen
    // to sit next to each other — and three of the six sites this primitive replaced did not:
    // `FlightReport`'s event tile put `gap-3` before the radius and `px-3 py-2 text-sm` before the
    // dark variant, and `GroundTrack`'s `<dl>` and `Stat` tile interleaved the same way. So the
    // guard covered exactly the half that a falsification against `SampleTable` happened to
    // exercise, and a hand-roll in the OTHER form — the more common one, because a real call site
    // has layout utilities mixed in — would have gone straight past it.
    //
    // A frame is: the container radius, the hairline border, and NO fill. The last clause is what
    // separates it from a hand-rolled `Card`, which carries all three tokens plus a `bg-`, and
    // which the treatment count above already catches as its own distinct string.
    const isFrame = (s: string) =>
      s.includes('rounded-xl') &&
      s.includes('border-zinc-200') &&
      s.includes('dark:border-zinc-800') &&
      !/\bbg-/.test(s);
    const sites: string[] = [];
    for (const f of ui) {
      // Per class-string rather than per file, so two hand-rolls in one file are two findings —
      // and per LINE, because a class string is written on one.
      for (const line of f.text.split('\n')) if (isFrame(line)) sites.push(`${f.path}: ${line.trim().slice(0, 90)}`);
    }
    expect(
      sites.map((s) => s.split(':')[0]),
      `the frame treatment, by site (only components/ui.tsx may carry it):\n${sites.join('\n')}`,
    ).toEqual(['components/ui.tsx']);
  });

  it('manages focus from exactly one place', () => {
    // `DESIGN.md` §5 names `useReturnFocus` and, until 2026-08-02, nothing implemented it. Two
    // surfaces hand-rolled all three of its parts — focus the safe control on open, Escape to
    // dismiss, focus back to the trigger — and they are the same control written twice: the
    // logbook's Clear confirm and the privacy page's Forget-these-settings confirm. Measured
    // before the lift: **6 focus calls across 2 files**; after it, **2, both in the primitive**.
    //
    // This is a guard of the same shape as the frame assertion above, and for the same reason the
    // adopter counts cannot serve: a THIRD confirm hand-rolling its own focus return would import
    // nothing from `./ui`, so every count in this file would stay exactly where it is while the
    // behaviour forked. Focus management is where that matters most — both call sites carried a
    // comment describing a bug they had already shipped once, in which a trigger that unmounts
    // itself nulls its own ref, focus silently drops to the body, and the next Tab lands on the
    // destructive button.
    //
    // Matched on the CALL, not on a ref name, so renaming a ref cannot slip past it — and on
    // `.focus(` rather than `.focus()`, because `el.focus({ preventScroll: true })` is the
    // commonest real variant and the zero-arg form would have let a third hand-rolled confirm
    // through by adding one argument.
    //
    // Comments are stripped first, and this is the one place in this file where that is right:
    // the suite-wide counts above are `DESIGN.md` §9's own greps and must stay literally that,
    // but this assertion is not one of them, and a component that DESCRIBES focus handling in a
    // doc comment is not moving focus. Without the strip it fails naming a comment, which is
    // failing for a reason other than the one it gives.
    const sites: string[] = [];
    for (const f of ui) {
      const code = f.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      for (const line of code.split('\n')) {
        if (/\.focus\s*\(/.test(line)) sites.push(`${f.path}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(
      [...new Set(sites.map((s) => s.split(':')[0]))],
      `imperative focus moves, by site (only components/ui.tsx may carry them):\n${sites.join('\n')}`,
    ).toEqual(['components/ui.tsx']);
  });

  it('never carries a superlative in a semantic colour', () => {
    // `DESIGN.md` §2 reserves its four semantic hues for meanings — amber is "an estimate outside
    // its envelope, an extrapolation, a caveat", indigo is "interactive, selected" — and then says
    // outright: **"Never colour a number by whether it is large. Colour carries a claim; a claim
    // needs a basis."** Marking the best of a set is exactly colouring by magnitude, and both
    // surfaces built for comparing flights were doing it in a hue that meant something else.
    //
    // The logbook's ★ was `text-amber-500`, so on a column scanned down for an apogee the mark for
    // "your highest" wore the hue that elsewhere warns a reading is soft — and the legend under the
    // list wore it too, which is why the window below is symmetric rather than forward-only: there
    // the class is written BEFORE the word it explains, and a forward scan reported that site clean.
    // The comparison table's best cell was `text-indigo-600`, which reads as "selected" on a surface
    // whose columns a flyer really does select.
    //
    // **What was wrong was the hue, not the mark.** The basis §2 asks for is present at every site
    // and stays: each carries a title and screen-reader text naming what the mark means, and
    // `CompareView`'s `rankBlocked` already withholds it on a clipped peak, a floor apogee or a
    // mixed source. So the emphasis survives as weight and §2's own primary/secondary text step.
    //
    // Matched as a WINDOW rather than per line, because the two live shapes differ: one is a
    // condition and a class on the same line (`i === row.best ? 'text-indigo-600 …'`), the other a
    // guard whose class sits two lines below it. Comments are stripped first — the same call the
    // focus assertion makes and for the same reason, since the conversions this guards both explain
    // themselves by quoting the class they removed, and an unstripped scan fails naming a comment.
    // Falsified against the pre-conversion source: 6 sites over both files, 0 after.
    // **This one is NOT one of §9's greps**, and says so for the same reason the frame and focus
    // assertions above do: §9's block is carried identically by the sibling repo, so adding a
    // command to it is a change owed to both, while an assertion about §2's binding meaning is not.
    // §2 is the rule; this is a check on it.
    //
    // **The colour pattern subtracts the allowed set rather than naming the forbidden one**, which
    // is the correction this file has now had to make five times (both blind greps, off-scale type,
    // spacing, and the card class). Written as `(amber|indigo|emerald|red)` it passed
    // `ring-indigo-500`, `fill-amber-500`, `text-violet-600` and `text-[#f59e0b]` — every one of
    // which is the same defect in a shape nobody had in front of them. Anything that is not the
    // neutral ramp is a claim.
    //
    // **The superlative pattern deliberately has no leading word boundary**, because `\bbest\b`
    // cannot match `isSpeedBest` — the actual variable guarding one of these marks. So the check
    // hung entirely on a prose `title=` string, and rewording the title would have turned it green
    // with the defect still on screen.
    //
    // **Comments are stripped line-preservingly** — blanked in place rather than deleted — because
    // deleting them collapses the line count and every reported line number is then wrong by however
    // much prose sits above it. Measured: the first version reported `RecentFlights.tsx:574` for a
    // site truly at `:646`, a 72-line error, in a commit whose own ledger entry is about one defect
    // filed three times at three wrong line numbers. The line reported is where the SUPERLATIVE
    // sits; the hue is within three lines either side.
    //
    // **What this still cannot see**, stated rather than claimed away: a class string held in a
    // const declared far from its use is only caught by the name check below, so a hue reached
    // through a helper function or a lookup table would pass. Falsified against the pre-conversion
    // source, where it names all four true sites.
    const SUPERLATIVE = /(best|fastest|highest|largest|greatest|quickest)/i;
    const NEUTRAL = /^(?:zinc|white|black|transparent|current|inherit|none)$/;
    const COLOURED =
      /\b(?:text|bg|border|ring|fill|stroke|decoration|outline|from|via|to|accent|caret|divide|placeholder|shadow)-([a-z]+)-\d{2,3}\b/g;
    const ARBITRARY = /\b(?:text|bg|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/;
    const claims = (window: string): string[] => {
      const found: string[] = [];
      COLOURED.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = COLOURED.exec(window))) if (!NEUTRAL.test(m[1])) found.push(m[0]);
      const arb = window.match(ARBITRARY);
      if (arb) found.push(arb[0]);
      return [...new Set(found)];
    };
    const sites: string[] = [];
    for (const f of ui) {
      const lines = f.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
      for (let i = 0; i < lines.length; i++) {
        // A const whose NAME is a superlative and whose VALUE is a hue — the indirection that
        // would otherwise defeat the window, since `className={BEST_MARK}` carries no colour.
        const named = /(?:const|let)\s+\w*(?:best|fastest|highest)\w*\s*=/i.test(lines[i]);
        if (!SUPERLATIVE.test(lines[i])) continue;
        const window = named ? lines[i] : lines.slice(Math.max(0, i - 3), i + 4).join(' ');
        const hues = claims(window);
        if (hues.length) sites.push(`${f.path}:${i + 1} — ${hues.join(',')} beside ${lines[i].trim().slice(0, 60)}`);
      }
    }
    expect(sites, `a superlative wearing a colour that makes a claim:\n${sites.join('\n')}`).toEqual([]);
  });

  it('composites a plot to an image from exactly one place', () => {
    // Not a `DESIGN.md` §9 grep — §9 is carried identically by the sibling repo, so adding a command
    // to it is a change owed to both. This is the same shape as the frame and focus assertions
    // above: one implementation, one place, guarded because no adopter COUNT can see the failure.
    //
    // `savePlotPng` collapsed three byte-identical copies — `FlightReport`, `CompareView` and
    // `ChannelExplorer` each carried the same twelve lines, differing only in which ref they read
    // and what they named the file. That is the `ACTION_BTN`-in-six-files shape P1's opening audit
    // removed once already, restarted for chart export, and three copies of a canvas composite is
    // three places for a transparent-background or device-pixel-ratio bug to be fixed in two of.
    //
    // Matched on `drawImage`, which is the specific job: compositing a LIVE plot canvas onto an
    // opaque one. `FlightCard` also calls `toBlob`, and correctly — it draws its own canvas and
    // encodes it, which is a different thing — so a `toBlob` match would fail naming a file that is
    // not doing this at all, i.e. fail for a reason other than the one it gives.
    //
    // **Its own source list is widened here, and that correction is most of the value.** The `ui`
    // list above is `['components', 'app']` with extensions `['.tsx', '.css']` — right for §9's
    // greps, wrong for this: it would not have scanned `lib/`, which is the one directory whose
    // name appears in the failure message, and it cannot see a `.ts` under `components/` either. So
    // a second composite in `lib/`, or in the `components/usePlotExport.ts` hook that is the most
    // natural React home for this code, would both have kept it green while the message insisted
    // only `lib/plotPng.ts` may carry one. A guard whose message names a file it never reads is
    // worse than none.
    //
    // Bracket access is matched too. `ctx['drawImage'](canvas, 0, 0)` is legal, not contrived, and
    // a member-only pattern is the same "enumerate the form in front of you" mistake this file has
    // now corrected six times.
    const scanned = uiSources(['components', 'app', 'lib'], ['.tsx', '.ts']);
    const ALLOWED = 'lib/plotPng.ts';
    const sites: string[] = [];
    for (const f of scanned) {
      if (f.path === ALLOWED) continue;
      const code = f.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, (m) => m.replace(/[^\n]/g, ' '));
      code.split('\n').forEach((line, i) => {
        if (/\.drawImage\s*\(|\[['"`]drawImage['"`]\]\s*\(/.test(line)) sites.push(`${f.path}:${i + 1}`);
      });
    }
    expect(
      sites,
      `plot-to-image composites outside ${ALLOWED}, by site:\n${sites.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps the primitives themselves inside the system', () => {
    // The file everything else is converted ONTO cannot itself be off-system. A primitive that
    // breaks the rule teaches that the rule is optional.
    //
    // Comments are stripped first, and only here. This file's job is to say what the drift IS, so
    // `components/ui.tsx` names the off-system classes in prose to record what it replaced — and a
    // check that cannot tell a citation from a use would force the primitive to be vague about the
    // thing it exists to end. The suite-wide counts above deliberately do NOT strip comments: they
    // are `DESIGN.md` §9's own greps, and they must stay literally that.
    const uiFile = readFileSync(join(ROOT, 'components/ui.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    expect(uiFile.match(/rounded-lg/g) ?? [], 'components/ui.tsx must not use rounded-lg').toHaveLength(0);
    expect(
      uiFile.match(/\b[pmg][xytblr]?-(?:5|7|9|10|11|14)\b/g) ?? [],
      'components/ui.tsx must not use off-scale spacing',
    ).toHaveLength(0);
    const offScale = (uiFile.match(/\btext-(?:xs|sm|base|lg|xl|\dxl)\b/g) ?? []).filter((m) => !ON_SCALE.has(m));
    expect(offScale, 'components/ui.tsx must not use an off-scale type size').toHaveLength(0);
  });
});

describe('DESIGN.md §5 — the fifth button weight', () => {
  /**
   * Eight `<button>` elements across four files hand-rolled the same treatment — indigo text, no
   * border, no fill — before `Button variant="link"` existed. Eight sites independently reaching
   * for one missing word is the VOCABULARY being wrong rather than eight surfaces being
   * undisciplined, which is why §5 gained the weight instead of the sites being converted into
   * something they are not.
   *
   * **Three uses of indigo on a button are NOT this**, and the pattern has to let them through or
   * it fails naming files that are doing the right thing:
   *   - a SELECTED state (`sort === row.label ? 'text-indigo-600' : ''`) — §2's `accent` meaning
   *     "interactive, selected", which is exactly what a sorted column header is;
   *   - a HOVER affordance (`hover:text-indigo-600` on a filename) — a hint, not a weight;
   *   - a bordered indigo chip, which is a `Chip` question rather than a `Button` one.
   *
   * A first pass at this count conflated all four and reported 13; the honest figure is 8, and
   * the roadmap entry it corrects had said 7. Measure before spending a count.
   */
  it('is not re-invented by hand', () => {
    const offenders: string[] = [];
    for (const f of uiSources(['components', 'app'], ['.tsx'])) {
      if (f.path.endsWith('components/ui.tsx')) continue;
      for (const m of f.text.matchAll(/<button\b/g)) {
        // The opening tag ends at the first `>` at brace depth 0 that is not part of an arrow.
        let i = (m.index ?? 0) + m[0].length;
        let depth = 0;
        while (i < f.text.length) {
          const c = f.text[i];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '>' && depth === 0 && f.text[i - 1] !== '=') break;
          i++;
        }
        const tag = f.text.slice(m.index ?? 0, i);
        if (!tag.includes('text-indigo-')) continue;
        if (/border-indigo|bg-indigo/.test(tag)) continue; // a chip, not a link

        // **Strip the CONDITIONAL parts, then look at what is left.** A first version skipped any
        // tag containing `${` outright, and the pre-push review showed that clause was carrying
        // the whole test: every legitimate survivor in the repo has an interpolation somewhere in
        // its tag, so a hand-rolled link written as
        // `` className={`font-medium text-indigo-600 hover:text-indigo-500 ${TOUCH_TARGET}`} ``
        // — the exact form already used elsewhere for this treatment — passed silently. Removing
        // the interpolations and the ternary branches leaves the RESTING classes, which is what
        // the weight actually is.
        let rest = tag;
        for (;;) {
          const open = rest.indexOf('${');
          if (open < 0) break;
          let j = open + 2;
          let depth = 1;
          while (j < rest.length && depth > 0) {
            if (rest[j] === '{') depth++;
            else if (rest[j] === '}') depth--;
            j++;
          }
          rest = rest.slice(0, open) + rest.slice(j);
        }
        rest = rest
          .replace(/\?[^:]*:\s*'[^']*'/g, '') // a ternary picking between two class strings
          .replace(/(hover|focus|focus-visible|group-hover|active|dark):text-indigo-\d+/g, '');
        if (!rest.includes('text-indigo-')) continue;
        offenders.push(`${f.path}:${f.text.slice(0, m.index ?? 0).split('\n').length}`);
      }
    }
    expect(
      offenders,
      `hand-rolled link-weight buttons — use <Button variant="link">, DESIGN.md §5:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  /** The variant has to stay geometry-free, because that is the only thing separating it from
   *  `ghost`. A `link` that grew `px-3 py-1.5` would be a ghost button with the wrong colour, and
   *  §5's distinction — prose versus toolbar — would stop being readable off the file. */
  it('carries no button geometry, which is what makes it not a ghost', () => {
    const ui = readFileSync(join(ROOT, 'components/ui.tsx'), 'utf8');
    const variant = ui.match(/\blink:\s*'([^']*)'/)?.[1] ?? '';
    expect(variant, 'Button variant="link" must exist').not.toBe('');
    expect(variant, 'no control padding').not.toMatch(/\bp[xy]?-\d/);
    expect(variant, 'no fill').not.toMatch(/\bbg-(?!transparent)/);
    expect(variant, 'underline is the hover affordance').toMatch(/hover:underline/);
  });
});

describe("DESIGN.md §5 — the chip's semantic tones", () => {
  /** Every hand-rolled chip in the repo, so the ones left are left ON PURPOSE and say why.
   *  A chip-shaped element is bordered, rounded, horizontally padded, at caption size.
   *
   *  **`span|li|div`, and the first version of this scanned only `<span>`.** That blind spot was
   *  not hypothetical — it hid `RecognizedFormats.tsx:28`, a real hand-rolled chip written as an
   *  `<li>` because it lives in a `<ul>`, which is the natural form for a token list and so the
   *  form a future one is most likely to take. Enumerating the tag in front of you is the mistake
   *  this file has now corrected seven times. */
  const handRolledChips = (): string[] => {
    const out: string[] = [];
    for (const f of uiSources(['components', 'app'], ['.tsx'])) {
      if (f.path.endsWith('components/ui.tsx')) continue;
      for (const m of f.text.matchAll(/<(?:span|li|div)\b/g)) {
        // Same brace-depth scan the button grep above uses, and for the same reason: `[^>]*?>`
        // stops at the `>` of an arrow function inside a `{…}` prop and truncates the tag.
        let i = (m.index ?? 0) + m[0].length;
        let depth = 0;
        while (i < f.text.length) {
          const c = f.text[i];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '>' && depth === 0 && f.text[i - 1] !== '=') break;
          i++;
        }
        const tag = f.text.slice(m.index ?? 0, i);
        const chipish =
          /rounded-(md|lg|full)/.test(tag) &&
          /\bborder\b/.test(tag) &&
          /\bpx-[\d.]+/.test(tag) &&
          /text-xs|text-\[11px\]/.test(tag);
        if (chipish) out.push(`${f.path}:${f.text.slice(0, m.index ?? 0).split('\n').length}`);
      }
    }
    return out;
  };

  /**
   * **Twelve on `main`, seven converted, five left — and every one of the five says why here.**
   * An unexplained allowance is how a ratchet quietly stops ratcheting, so each gets a reason a
   * later session can disagree with rather than a silence it has to reverse-engineer.
   *
   * Three reasons, and only the last is a maybe-later:
   *
   * - **Two are not chips.** `CompareView:614` and `RecentFlights:452` are inline notices at
   *   `px-3 py-2`, full width, holding a `<p>` — one of them `role="status"`. They match on
   *   border-plus-radius-plus-padding because that is what a bordered box looks like. §5 asks a
   *   different question about a notice than about a token, and answering it here would be
   *   converting a paragraph into a chip.
   * - **Two are dense-list tokens.** `RecentFlights:754` (the format label) and `:954` ("reports
   *   this flight") sit at `text-[11px]` in the densest list in the app, in rows that are scanned
   *   rather than read. `Chip` would move them to `text-xs` at `px-2 py-1` — larger type and
   *   double the padding, on every logbook row. That is a decision about LIST DENSITY, which is a
   *   product change and not this increment's adoption.
   * - **One wants a primitive that does not exist yet.** `RecognizedFormats:28` is a genuine chip
   *   and the only one of the five that should convert — but it is an `<li>` inside a `<ul>`, and
   *   `Chip` renders a `<span>`. Adopting it would strip the list semantics a screen reader
   *   announces, which is exactly the trade `Readout`'s comment above records refusing for
   *   `GroundTrack`'s `Stat`. It converts the day `Chip` takes an `as`, the way `Card` did.
   *   Filed in `BACKLOG.md`.
   */
  const DELIBERATE = [
    'components/CompareView.tsx:614',
    'components/RecentFlights.tsx:452',
    'components/RecentFlights.tsx:754',
    'components/RecentFlights.tsx:954',
    'components/RecognizedFormats.tsx:28',
  ];

  it('is not re-invented by hand outside the five named above', () => {
    expect(
      handRolledChips(),
      'hand-rolled chips — use <Chip tone=…>, DESIGN.md §5:',
    ).toEqual(DELIBERATE);
  });

  /** The hued tones exist so a verdict can be SAID rather than drawn, and they only read as one
   *  family while they share a ramp. A tone added later on `bg-emerald-100` would look like a
   *  different component beside the two it sits next to in `DeviceSummary`. */
  it('keeps every hued tone on the one border/fill ramp', () => {
    const block = chipTones();
    expect(Object.keys(block)).toEqual(['default', 'accent', 'good', 'warn', 'danger']);
    for (const tone of ['accent', 'good', 'warn', 'danger']) {
      expect(block[tone], `${tone} borders at 500/30`).toMatch(/border-\w+-500\/30/);
      expect(block[tone], `${tone} fills at 500/10`).toMatch(/bg-\w+-500\/10/);
    }
  });

  /**
   * **A chip has to be visible against the container it sits in, and for one revision `default`
   * was not.** It was `bg-zinc-50 dark:bg-zinc-900` — byte-identical to §2's sunken card in light
   * (`bg-zinc-50`) and to §2's default card in dark (`dark:bg-zinc-900`) — so a `default` chip
   * rendered as a bare hairline with the same fill as whatever was behind it. `StitchSurface`'s
   * "from · accelerometer" had been doing that in dark mode unnoticed, and converting
   * `DeviceSummary` and `LogDetails` would have taken it to two more surfaces.
   *
   * The assertion is deliberately "differs from every card fill", not a hardcoded value: the
   * failure mode is a RELATIONSHIP between two tokens, and pinning the string would go green
   * again the moment someone restyled `Card` instead.
   */
  it('keeps the neutral chip distinguishable from every card it can sit on', () => {
    const ui = readFileSync(join(ROOT, 'components/ui.tsx'), 'utf8');
    const cards = ui.match(/const CARD_TONES = \{([\s\S]*?)\n\} as const;/)?.[1] ?? '';
    expect(cards, 'CARD_TONES must exist').not.toBe('');
    // `\b` matches straight after the `:` of a variant, so a naive `\bbg-` counts
    // `dark:bg-zinc-800` as a LIGHT fill. The light pattern has to reject any variant prefix
    // explicitly. Opacity suffixes are stripped: `zinc-900/50` over the page and `zinc-900` flat
    // are the same colour family, and a chip is not distinguishable by being the same hue at a
    // different alpha.
    const fills = (s: string, prefix: string) =>
      new Set(
        (s.match(new RegExp(prefix ? `${prefix}bg-[\\w/-]+` : `(?<![\\w:-])bg-[\\w/-]+`, 'g')) ?? []).map((c) =>
          c.replace(/^dark:/, '').replace(/\/\d+$/, ''),
        ),
      );
    const chip = chipTones().default;
    for (const prefix of ['', 'dark:']) {
      const mine = [...fills(chip, prefix)];
      expect(mine, `the neutral chip declares a ${prefix || 'light'} fill`).toHaveLength(1);
      expect(
        [...fills(cards, prefix)],
        `the neutral chip's ${prefix || 'light'} fill ${mine[0]} is also a CARD fill — it would vanish into its own container`,
      ).not.toContain(mine[0]);
    }
  });
});

/** `CHIP_TONES` read off the source, as a map. Two tests want it and neither should re-parse it. */
function chipTones(): Record<string, string> {
  const ui = readFileSync(join(ROOT, 'components/ui.tsx'), 'utf8');
  const block = ui.match(/const CHIP_TONES = \{([\s\S]*?)\n\} as const;/)?.[1] ?? '';
  expect(block, 'CHIP_TONES must exist').not.toBe('');
  return Object.fromEntries(
    [...block.matchAll(/^\s{2}(\w+): '([^']*)'/gm)].map((m) => [m[1], m[2]]),
  );
}
