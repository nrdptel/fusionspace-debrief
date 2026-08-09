import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { METHOD_IDS, METHOD_GROUPS } from './methodIds';
import { METHOD_CONTENT } from './methods/content';
import { REFERENCES, REFERENCE_IDS } from './methods/references';
import { metricTiles } from './readings';
import type { FlightMetrics } from './analyze/types';

// Two lists that must agree: the definitions the methods page renders, and the readings that
// cite them. A reading pointing at a block that isn't there is a link that goes nowhere —
// the "control that fails only when pressed" in link form, and the worst version of it,
// because it fails on the page whose whole job is explaining the number.
//
// The compiler already stops a typo (`MethodId` is a union of METHOD_IDS), so what's left is
// what a type can't see: an id in the list that the page never renders, and a reading with no
// definition at all.

const PAGE = readFileSync(new URL('../app/methods/page.tsx', import.meta.url), 'utf8');

/** Every metric the grid can emit, with everything present so no reading is skipped. */
function everyReading(): ReturnType<typeof metricTiles> {
  const m = {
    apogeeAltitude: 1000,
    apogeeIsFloor: false,
    timeToApogee: 12,
    maxVelocity: 300,
    maxVelocitySource: 'device',
    maxVelocityAltitude: 500,
    mach: 0.9,
    maxAcceleration: 100,
    accelerationSource: 'device',
    avgBoostAcceleration: 80,
    liftoffTWR: 12,
    burnTime: 2.5,
    burnoutAltitude: 300,
    burnoutVelocity: 250,
    burnoutSource: 'measured',
    coastTime: 9,
    coastEfficiency: 0.8,
    coastShortfall: 120,
    maxDynamicPressure: 50_000,
    maxQAltitude: 400,
    drogueDescentRate: 20,
    mainDescentRate: 6,
    wholeDescentRate: 8,
    descentSource: 'main',
    descentTime: 60,
    flightTime: 72,
    groundTemperature: 15,
    batteryMinV: 7.4,
    batteryRestV: 8.4,
    peakRollRate: 900,
    rollRevolutions: 4,
    tiltAtBurnout: 6,
  } as unknown as FlightMetrics;
  return metricTiles(m, 'imperial');
}

describe('readings and the methods page', () => {
  it('has real text for every id in the canonical list', () => {
    // **This used to grep the PAGE for `<Method id="x"`, and the content moved on 2026-08-08.**
    // It lives in `lib/methods/content.tsx` now, because the report's "?" renders the same
    // explanation in a popover and two surfaces doing one job share a module rather than a
    // resemblance. Checking the module is also a stronger claim than the grep was: a block
    // could have been present on the page and empty, and this cannot be.
    const missing = METHOD_IDS.filter((id) => !METHOD_CONTENT[id]);
    expect(missing, `ids with no entry in METHOD_CONTENT: ${missing.join(', ')}`).toEqual([]);
    for (const id of METHOD_IDS) {
      expect(METHOD_CONTENT[id].title.trim().length, `${id} has a title`).toBeGreaterThan(0);
      expect(METHOD_CONTENT[id].body, `${id} has a body`).toBeTruthy();
    }
    // And nothing in the module that is not a block — the other direction, which the page
    // grep could never see.
    const extra = Object.keys(METHOD_CONTENT).filter((id) => !(METHOD_IDS as readonly string[]).includes(id));
    expect(extra, `entries in METHOD_CONTENT that are not blocks: ${extra.join(', ')}`).toEqual([]);
  });

  it('renders every block from the shared module, not from a copy', () => {
    // The failure this guards is the one the architecture invariant names: a second copy of an
    // explanation written beside the first, which drifts the moment either is edited and leaves
    // a flyer reading two different accounts of one number. If the page ever inlines prose again
    // it will stop going through METHOD_CONTENT, and this says so.
    expect(PAGE, 'and renders its groups from the data, not from 51 literal sections').toContain(
      'METHOD_GROUPS.map',
    );
    // The page is now short because it holds no prose. 1,348 lines before the move, 128 after —
    // a page that grows back past ~400 has had content written into it again.
    expect(PAGE.split('\n').length, 'the methods page holds layout, not text').toBeLessThan(400);

    // **The real guard, and the first version of this test did not have it.** It asserted
    // `PAGE.toContain('METHOD_CONTENT')`, which the IMPORT LINE alone satisfies — so a page that
    // kept the import and inlined prose underneath would have passed. What actually cannot be
    // true of a page holding no explanations is that it names one: no block id appears as a
    // string literal anywhere in it, because the only place ids are written now is the grouping.
    const inlined = METHOD_IDS.filter((id) => PAGE.includes(`"${id}"`) || PAGE.includes(`'${id}'`));
    expect(inlined, `block ids written into the page — content has been inlined again:\n${inlined.join('\n')}`).toEqual([]);
  });

  it('puts the id on the heading, not only in the prop', () => {
    // Declaring an id and never rendering it is the failure this pair could otherwise miss:
    // every link would still be built, and every one would scroll to the top of the page and
    // look like it had worked.
    //
    // `h3` since 2026-08-08, not `h2`, and the change is the point rather than an adjustment
    // to keep this green: the page's 51 blocks were 51 sibling `h2`s with nothing above them,
    // so a reader had no level to scan. The group `<section>`s own `h2` now and the blocks sit
    // under them — owner note ON-1.
    expect(PAGE, 'Method should render <h3 id={id}>').toMatch(/<h3\s+id=\{id\}/);
  });

  it('gives every reading a definition to point at', () => {
    const tiles = everyReading();
    // 21 is every reading `metricTiles` can emit. Pinned exactly: a fixture that quietly
    // stopped producing one would make the check below pass by covering less.
    expect(tiles.length, `the fixture must exercise every reading; got: ${tiles.map((t) => t.label).join(', ')}`).toBe(21);
    const unexplained = tiles.filter((t) => !t.method).map((t) => t.label);
    expect(unexplained, `readings with nowhere to send a flyer: ${unexplained.join(', ')}`).toEqual([]);
  });

  it('cites only definitions that exist', () => {
    const ids = new Set<string>(METHOD_IDS);
    const dangling = everyReading()
      .filter((t) => t.method && !ids.has(t.method))
      .map((t) => `${t.label} → ${t.method}`);
    expect(dangling, `readings citing a block that isn't there: ${dangling.join(', ')}`).toEqual([]);
  });
});

/**
 * The grouping is exhaustive by TEST, not by care.
 *
 * `METHOD_IDS` reached 51 entries as a flat list because nothing ever objected to one more
 * being appended — which is the mechanism behind `OWNER-NOTES.md` `ON-1`. A grouping maintained
 * by good intentions decays the same way: the next block gets written, the author forgets to
 * place it, and it renders under whichever heading happens to be last. These fail the build
 * instead.
 */
describe('the methods page has a structure, and every block is in it', () => {
  const placed = METHOD_GROUPS.flatMap((g) => g.ids);

  it('places every block in exactly one group', () => {
    const counts = new Map<string, number>();
    for (const id of placed) counts.set(id, (counts.get(id) ?? 0) + 1);

    const missing = METHOD_IDS.filter((id) => !counts.has(id));
    expect(missing, `blocks in METHOD_IDS with no group — add each to METHOD_GROUPS:\n${missing.join('\n')}`).toEqual([]);

    const twice = [...counts].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
    expect(twice, `blocks placed in more than one group:\n${twice.join('\n')}`).toEqual([]);

    // There is deliberately NO check here for an id in a group that is not in METHOD_IDS.
    // `METHOD_GROUPS` is typed `ids: readonly MethodId[]`, so a made-up id is a compile error
    // that `prebuild`'s `tsc --noEmit` catches before vitest is reached — the assertion could
    // never fire, and a dead assertion in a suite whose whole claim is "exhaustive by test,
    // not by care" is worse than none. Falsified by adding `'nope'` to a group: the type-check
    // errors and this file never runs.

    // The two totals agreeing is the claim; the checks above say WHICH when it breaks.
    expect(placed).toHaveLength(METHOD_IDS.length);
  });

  it('renders its sections from the grouping rather than from a hand-kept list', () => {
    // **This used to compare 51 literal `<section id="…">` strings against the data.** That was
    // the right check while the page listed them by hand; it is the wrong one now, because the
    // page maps over `METHOD_GROUPS` and the ordering is true by construction rather than by
    // agreement. Asserting the literal strings again would only be asserting that the map still
    // exists, which the check above already does.
    //
    // What still needs saying is that the ids the map iterates ARE the grouping — so the
    // contents list, the strip and the blocks cannot disagree about what follows what.
    expect(PAGE, 'the sections come from the grouping').toContain('g.ids.map');
    expect(PAGE, 'and their anchors from the group titles').toContain('groupId(g.title)');

    // The rendered result is walked for real by `e2e/smoke.spec.ts` → "the methods page can be
    // navigated, not just scrolled", which counts the headings on the BUILT page. That is the
    // stronger check and it is the one that would catch a map that renders nothing.
    //
    // A `toHaveLength(METHOD_IDS.length)` stood here and was deleted: it is character-identical
    // to one in the test above, over the same module-level `placed`, so it restated a passing
    // assertion rather than adding one. Two copies of a check are not two checks.
  });

  it('lets a block have more than one paragraph, which it could not before', () => {
    // `Method` wrapped each body in a single `<p>`, so no block on the page COULD have a second
    // paragraph — owner note ON-1's wall was structural, not editorial. The bodies carried 36
    // standalone `{' '}` lines sitting exactly where a break was intended, every one in front of
    // a sentence that starts a new topic, and JSX rendered each as one space.
    //
    // Checked on the SOURCE of the content module and the page together, because the failure
    // mode is a future edit putting the single `<p>` back — at which point the breaks silently
    // become spaces again and nothing else would say so.
    const content = readFileSync(new URL('./methods/content.tsx', import.meta.url), 'utf8');
    const paragraphs = (content.match(/^\s*<p>$/gm) ?? []).length;
    expect(paragraphs, 'every block body is made of paragraphs').toBeGreaterThanOrEqual(METHOD_IDS.length);
    expect(paragraphs, 'and at least a dozen blocks have more than one').toBeGreaterThan(METHOD_IDS.length + 10);

    // No standalone `{' '}` may come back: it is a paragraph break that renders as a space.
    const eaten = (content.match(/^\s*\{' '\}$/gm) ?? []).length;
    expect(eaten, "standalone {' '} lines — each is a paragraph break rendering as one space").toBe(0);

    // And the page must not re-wrap the lot in one paragraph.
    expect(PAGE, 'the block body is a container, not a single paragraph').not.toMatch(
      /<p className="mt-1 max-w-3xl">\{body\}<\/p>/,
    );
    expect(PAGE, 'it stacks paragraphs with the §4 spacing scale').toContain('space-y-3');
  });

  it('has no paragraph a reader has to climb — nothing over 400 words', () => {
    // P9 slice 4, the editorial half. Slices 2 and 3 restored the author's OWN breaks and gave
    // the page a measure; what they could not do is invent a break nobody wrote. Two blocks were
    // still a single paragraph of 724 and 640 words — the longest things on the page and the
    // only ones a reader meets as an unbroken wall at 49–66 characters a line.
    //
    // A RATCHET, not a spot check: it walks every paragraph of every block, so a future edit
    // that grows one past the bar fails here rather than being noticed by a reader. 400 words is
    // roughly two screens of this page's measure on a phone, which is the thing being prevented.
    const content = readFileSync(new URL('./methods/content.tsx', import.meta.url), 'utf8');
    const bodies = content.split(/^\s*<p>$/m).slice(1);
    const words = (t: string) =>
      t
        .replace(/\{[^{}]*\}/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .split(/\s+/)
        .filter((w) => /[a-z0-9]/i.test(w)).length;
    const long = bodies
      .map((b) => words(b.split(/^\s*<\/p>$/m)[0] ?? ''))
      .map((n, i) => ({ i, n }))
      .filter((p) => p.n > 400);
    expect(long.map((p) => p.n), `paragraphs over 400 words: ${JSON.stringify(long)}`).toEqual([]);

    // …and the bar has something to bite on. Without this the assertion above passes on an empty
    // page, a failed split, or a regex that stopped matching — the shape this file has shipped
    // before and now falsifies deliberately.
    expect(bodies.length, 'it actually read the paragraphs').toBeGreaterThan(90);
    const longest = Math.max(...bodies.map((b) => words(b.split(/^\s*<\/p>$/m)[0] ?? '')));
    expect(longest, 'and the longest is a real paragraph, not an empty match').toBeGreaterThan(150);
  });

  it('cites only sources that exist, and carries no source nobody cites', () => {
    // P9 slice 5. The direction the compiler cannot check is the one that rots: a bibliography
    // that has drifted from its text. That is not hypothetical — OpenRocket's technical
    // documentation is the field's best citation practice AND frozen at v13.05 (2013) while the
    // app is many releases past it (`COMPETITION.md` row 37).
    const cited = new Set<string>();
    for (const id of METHOD_IDS) for (const r of METHOD_CONTENT[id].cites ?? []) cited.add(r);
    expect([...cited].sort(), 'every reference is cited by at least one block').toEqual([...REFERENCE_IDS].sort());
    // …and the reverse is the compiler's job, so assert that it IS the compiler's job rather
    // than duplicating it: a `ReferenceId` that is not a key of REFERENCES would not type-check.
    for (const r of cited) expect(REFERENCES[r as keyof typeof REFERENCES]).toBeDefined();
  });

  it('cites something on every block whose method IS a published one', () => {
    // An explicit list, because "does this method rest on published work?" is a judgement and a
    // grep cannot make it. Each entry is here because the CODE names the published thing:
    //   ground-baseline-altitude / altitude-of-a-reading — the standard atmosphere's
    //     pressure-to-altitude relation (`lib/analyze/index.ts` altitudeFromPressure)
    //   apogee / velocity-max-velocity — the Hampel filter (`lib/analyze/signal.ts:hampelFilter`)
    //   mach-dynamic-pressure — speed of sound, Mach, and q = ½ρv²
    // Adding a block that rests on a published method and forgetting to cite it is exactly what
    // this catches, and the list is short enough to review.
    const MUST_CITE = [
      'ground-baseline-altitude',
      'altitude-of-a-reading',
      'apogee',
      'velocity-max-velocity',
      'mach-dynamic-pressure',
    ] as const;
    for (const id of MUST_CITE) {
      expect(METHOD_CONTENT[id].cites?.length ?? 0, `${id} rests on published work and must name it`).toBeGreaterThan(0);
    }
    // The other direction, so this cannot quietly become "everything cites something": most of
    // this page IS Debrief's own, and a block that borrowed authority it does not have would be
    // the worse failure. Nothing outside the list above may cite.
    const unexpected = METHOD_IDS.filter(
      (id) => (METHOD_CONTENT[id].cites?.length ?? 0) > 0 && !(MUST_CITE as readonly string[]).includes(id),
    );
    expect(unexpected, 'a block citing a source without being listed above as resting on one').toEqual([]);
  });

  it('gives every reference a retrievable-looking source and a checkable claim', () => {
    // Every field was fetched before it was written down (see `lib/methods/references.ts`). What
    // a test can hold is the SHAPE: a real absolute URL, a year that is a year, and the "what
    // Debrief takes from it" clause — which is the thing that makes a citation checkable rather
    // than decorative, and the first thing a hurried edit would drop.
    for (const id of REFERENCE_IDS) {
      const r = REFERENCES[id];
      expect(r.url, `${id} has an https source`).toMatch(/^https:\/\/\S+$/);
      expect(r.year, `${id} has a plausible year`).toBeGreaterThan(1900);
      expect(r.year).toBeLessThan(2100);
      expect(r.what.length, `${id} says what Debrief takes from it`).toBeGreaterThan(30);
      expect(r.short.length, `${id}'s marker is short enough to sit in prose`).toBeLessThan(24);
      expect(r.title.length, `${id} has a real title`).toBeGreaterThan(10);
    }
  });

  it('gives every group a title and a blurb that is not the title again', () => {
    // A group heading that restates its members' names teaches nothing — the craft bar's
    // "tooltips that restate the label" one level up. The blurb says what the subject IS.
    for (const g of METHOD_GROUPS) {
      expect(g.title.trim().length, `"${g.title}" has a title`).toBeGreaterThan(0);
      expect(g.blurb.trim().length, `"${g.title}" has a blurb`).toBeGreaterThan(20);
      expect(g.blurb.trim(), `"${g.title}"'s blurb is not its title`).not.toBe(g.title.trim());
      expect(g.ids.length, `"${g.title}" is not empty`).toBeGreaterThan(0);
    }
  });

  it('keeps any single group scannable', () => {
    // The whole complaint is that 51 items in one list cannot be scanned. A group holding a
    // third of them has moved the problem rather than fixed it.
    const big = METHOD_GROUPS.filter((g) => g.ids.length > 12).map((g) => `${g.title} (${g.ids.length})`);
    expect(big, `groups too large to scan:\n${big.join('\n')}`).toEqual([]);
  });
});
