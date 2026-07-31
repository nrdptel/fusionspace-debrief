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
  /** `rounded-lg` is not in the system at all — containers are `xl`, controls are `md`. Target 0. */
  roundedLg: 22,
  /** Distinct card treatments. One of these is `<Card>`'s own string, which is the target state; the
   *  rest are hand-rolls still to convert. Two of them will not fold into `Card` and want their own
   *  named primitive — the page-level drop zone (`border-dashed … p-10`, an interactive target
   *  rather than a container) and the floating drop overlay (`border-2 border-dashed … shadow-lg`,
   *  which needs elevation) — so the honest floor here is 3 and not 1. Recorded in `ROADMAP.md`. */
  cardTreatments: 7,
  /** Spacing values off the `1 2 3 4 6 8 12` scale. Target 0. */
  offScaleSpacing: 25,
  /** Component files where caption size OUTNUMBERS the body default. Target 0. */
  invertedTypeFiles: 23,
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
  uiAdopters: 11,
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
 *  condition. */
const PRIMITIVE_ADOPTERS: Record<string, number> = {
  Card: 5,
  Button: 9,
  Chip: 2,
  Readout: 2,
  IconButton: 1,
  Extrapolated: 1,
  EmptyState: 1,
  ErrorState: 1,
  Section: 0,
  Segmented: 0,
  Disclosure: 0,
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
    const treatments = new Set<string>();
    for (const f of components) {
      for (const m of f.text.match(/rounded-xl border[a-z0-9 /-]*/g) ?? []) treatments.add(m.trim());
    }
    expect(
      treatments.size,
      `distinct card treatments:\n${[...treatments].sort().join('\n')}`,
    ).toBe(BUDGET.cardTreatments);
  });

  it(`uses exactly ${BUDGET.offScaleSpacing} off-scale spacing values, on the way to none`, () => {
    // The scale is 1 2 3 4 6 8 12. An `mt-5` between two things that are `mt-4` apart everywhere
    // else is invisible on its own page and is exactly how a layout stops lining up across surfaces.
    const { total, byFile } = countMatches(ui, /\b[pmg][xytblr]?-(?:5|7|9|10|11|14)\b/g);
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
    const counted: Record<string, number> = {};
    for (const name of Object.keys(PRIMITIVE_ADOPTERS)) {
      counted[name] = components.filter((f) => importedBy(f).has(name)).length;
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
