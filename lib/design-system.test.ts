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
   *  hand-roll. */
  cardTreatments: 10,
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
  invertedTypeFiles: 16,
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
  /** Components importing the shared primitives. Target: most of the 44. This one only goes UP. */
  uiAdopters: 29,
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
  Card: 23,
  Button: 16,
  Chip: 3,
  Readout: 2,
  IconButton: 2,
  Extrapolated: 1,
  EmptyState: 1,
  ErrorState: 1,
  Section: 2,
  Segmented: 3,
  Disclosure: 3,
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
