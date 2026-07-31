import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { importFlight } from './index';
import { decodeBytes } from '../encoding';

/**
 * D6's premise, as a measurement instead of an intuition.
 *
 * D6 ("propose which files belong to one flight") was written proposing to group from *"launch day,
 * overlapping wall clocks and profile shape"*. Two of those three do not survive contact with the
 * corpus, and this file is why — it exists so the next session reads a measurement rather than
 * re-deriving one from a throwaway probe, and so the day the corpus makes grouping POSSIBLE, a test
 * goes red and says so.
 *
 * **Every assertion here is written to fail in the useful direction.** A red in this file does not
 * mean a regression in the app; it means the corpus changed under D6 in a way that changes what D6
 * can do. Each assertion says which.
 *
 * The one thing this file must never become is a threshold. `expect(spread).toBeLessThan(2.12)`
 * would pin a number that means nothing outside today's 61 fixtures. What is pinned instead is the
 * SHAPE of the two distributions — whether they overlap — which is what decides whether any
 * threshold can exist at all.
 */

const CORPUS = 'lib/parsers/__corpus__/';
const present = existsSync(CORPUS + 'manifest.csv');

/** The manifest's `same_flight_group` conflates three different relations, which `lib/parsers/
 *  corpus.test.ts` also records: independent instruments on one airframe, one recording exported
 *  into two containers, and different STAGES of one launch. Only the first two are "recordings of
 *  one flight" — a booster and a sustainer are two different flights of two different objects, and
 *  reading them as one is the exact failure D6 must not have. These are excluded by name, with the
 *  reason, rather than by a heuristic that would itself need testing. */
const STAGED_GROUPS: Record<string, string> = {
  'iss-kairos-20240323':
    'a Kairos booster at 2,974 m and its sustainer at 4,044 m — one launch, two objects, 26.47% apart',
  'iss-sg1.2-20231118':
    'a Stargazer 1.2 sustainer at 2,115 m beside two StratoLogger boosters at ~465 m',
  'reddit-meraki2-121km':
    'a two-stage NZRA flight; the readable file is the sustainer at 75,516 m',
};

/** A minimal CSV reader that honours quotes — the manifest carries commas inside fields. */
function rows(text: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n') { cur.push(field); out.push(cur); cur = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || cur.length) { cur.push(field); out.push(cur); }
  return out;
}

interface Rec {
  file: string;
  group: string;
  rocket: string;
  apogeeM: number | null;
  /** The stamp the FILE states, never the manifest's — the manifest is ground truth a flyer's
   *  machine does not have. `null` where the logger wrote no usable date. */
  stamp: string | null;
}

/** Read every manifest row Debrief can actually open, and take from each only what a flyer's own
 *  machine would have: the file's stated date, and the apogee of its altitude channel. */
function readCorpus(): Rec[] {
  const r = rows(readFileSync(CORPUS + 'manifest.csv', 'utf8'));
  const h = r[0];
  const iName = h.indexOf('file_name');
  const iGroup = h.indexOf('same_flight_group');
  const iRocket = h.indexOf('rocket');
  const out: Rec[] = [];
  for (const row of r.slice(1)) {
    if (row.length < h.length) continue;
    const name = row[iName];
    // The manifest's `local_path` is the corpus author's own absolute path (`/Users/…`) and is
    // useless here; the on-disk layout is `<vendor>/<file_name>`, vendor being the part before `__`.
    if (!name || !name.includes('__')) continue;
    const path = `${CORPUS}${name.split('__')[0]}/${name}`;
    if (!existsSync(path)) continue;
    let apogeeM: number | null = null;
    let stamp: string | null = null;
    try {
      const bytes = new Uint8Array(readFileSync(path));
      const res = importFlight({ name, text: decodeBytes(bytes), bytes });
      if (res.kind === 'flight') {
        stamp = res.flight.flownAt?.stamp ?? null;
        const alt = res.flight.channels.find((c) => c.kind === 'altitude');
        const vals = alt?.values.filter((v) => Number.isFinite(v)) ?? [];
        if (vals.length) apogeeM = Math.max(...vals);
      }
    } catch {
      // A file this repo cannot open contributes nothing to a grouping either. Not a failure here.
    }
    out.push({ file: name, group: row[iGroup] ?? '', rocket: row[iRocket] ?? '', apogeeM, stamp });
  }
  return out;
}

/** How far apart two apogees are, as a percentage of the larger. The measure a naive "these look
 *  like the same flight" rule would reach for first. */
function spreadPct(a: number, b: number): number {
  const hi = Math.max(a, b);
  return ((hi - Math.min(a, b)) / hi) * 100;
}

describe('D6 — what the corpus says an automatic grouping could rest on', () => {
  if (!present) {
    it.skip('corpus not fetched — run `npm run fetch-fixtures` (needs FIXTURES_TOKEN)', () => {});
    return;
  }

  const all = readCorpus();
  const readable = all.filter((r) => r.apogeeM != null);

  it('has a corpus to measure at all', () => {
    // A denominator. Every assertion below is over pairs, and a walk that found nothing would
    // report perfect separability over an empty set.
    expect(all.length, 'manifest rows resolved to files on disk').toBeGreaterThan(30);
    expect(readable.length, 'files yielding a readable altitude channel').toBeGreaterThan(15);
  });

  it('cannot tell one flight from two by apogee agreement, because the two distributions OVERLAP', () => {
    // The finding that reshaped D6. It is NOT "apogee agreement is noisy" — same-flight pairs agree
    // very tightly indeed. It is that DIFFERENT flights agree just as tightly, because a flyer
    // flying one airframe on one motor twice in a day gets two flights that agree to a fraction of
    // a percent *because they should*. Apogee agreement measures "similar flights". D6 needs "one
    // flight". Those are different questions and this is the proof.
    const redundant: { key: string; pct: number }[] = [];
    const cross: { key: string; pct: number }[] = [];

    for (let i = 0; i < readable.length; i++) {
      for (let j = i + 1; j < readable.length; j++) {
        const a = readable[i];
        const b = readable[j];
        const pct = spreadPct(a.apogeeM!, b.apogeeM!);
        const sameGroup = !!a.group && a.group === b.group;
        if (sameGroup) {
          // A staged pair is not two recordings of one flight, so it belongs in neither set: it is
          // not a true pair, and calling it a false one would be counting a correct refusal as an
          // error.
          if (STAGED_GROUPS[a.group]) continue;
          redundant.push({ key: `${a.group}: ${a.rocket} ↔ ${b.rocket}`, pct });
        } else {
          cross.push({ key: `${a.file} ↔ ${b.file}`, pct });
        }
      }
    }

    expect(redundant.length, 'redundant same-flight pairs with two readable apogees').toBeGreaterThan(0);
    expect(cross.length, 'pairs drawn from different flights').toBeGreaterThan(0);

    const widestTrue = Math.max(...redundant.map((p) => p.pct));
    const tightestFalse = Math.min(...cross.map((p) => p.pct));

    // The whole claim, in one line. If the tightest DIFFERENT-flight pair is tighter than the
    // widest SAME-flight pair, the two populations overlap and no threshold on apogee agreement can
    // separate them — every cut that admits all the true pairs admits at least one false one.
    //
    // **This is the assertion to watch.** Going red means the overlap is gone and apogee alone has
    // become a usable signal, which would make D6 substantially cheaper. That is a finding, not a
    // breakage: re-measure, and re-scope D6's proposal rule around it.
    expect(
      tightestFalse,
      `apogee agreement has become separable, which CHANGES D6 — re-scope it.\n` +
        `  widest same-flight pair:      ${widestTrue.toFixed(2)}%\n` +
        `  tightest different-flight pair: ${tightestFalse.toFixed(2)}%\n` +
        `  same-flight pairs (${redundant.length}):\n` +
        redundant.map((p) => `    ${p.pct.toFixed(2)}%  ${p.key}`).sort().join('\n'),
    ).toBeLessThan(widestTrue);
  });

  it('names the different-flight pairs a naive apogee rule would merge, as D6 negatives', () => {
    // The durable artifact. Any grouping rule D6 ships must be run against these and must refuse
    // every one of them — they are pairs of files from genuinely different flights whose apogees
    // agree at least as closely as a real same-flight pair does.
    const redundant: number[] = [];
    for (let i = 0; i < readable.length; i++) {
      for (let j = i + 1; j < readable.length; j++) {
        const a = readable[i], b = readable[j];
        if (a.group && a.group === b.group && !STAGED_GROUPS[a.group]) {
          redundant.push(spreadPct(a.apogeeM!, b.apogeeM!));
        }
      }
    }
    const widestTrue = Math.max(...redundant);

    const confusable: string[] = [];
    for (let i = 0; i < readable.length; i++) {
      for (let j = i + 1; j < readable.length; j++) {
        const a = readable[i], b = readable[j];
        if (a.group && a.group === b.group) continue;
        const pct = spreadPct(a.apogeeM!, b.apogeeM!);
        if (pct <= widestTrue) {
          confusable.push(
            `${pct.toFixed(2)}%  ${a.apogeeM!.toFixed(0)}m ${a.file}\n         ${b.apogeeM!.toFixed(0)}m ${b.file}`,
          );
        }
      }
    }

    // Non-empty is the point. An empty set would mean the previous assertion had nothing to stand
    // on, and the two tests would disagree about the same corpus.
    expect(
      confusable.length,
      `different-flight pairs agreeing within the widest same-flight spread (${widestTrue.toFixed(2)}%):\n` +
        confusable.sort().join('\n'),
    ).toBeGreaterThan(0);
  });

  it('cannot corroborate with a wall clock either, because the clocks are not where they would help', () => {
    // The other half of D6's original premise. A stated launch time would be the obvious
    // corroboration for a proposed grouping — two files claiming the same minute are hard to argue
    // with. The corpus says it is never available where it would do any good.
    const byGroup = new Map<string, Rec[]>();
    for (const r of all) {
      if (!r.group) continue;
      if (!byGroup.has(r.group)) byGroup.set(r.group, []);
      byGroup.get(r.group)!.push(r);
    }

    const redundantWithTwoClocks: string[] = [];
    const stagedWithTwoClocks: string[] = [];
    for (const [g, members] of byGroup) {
      const dated = members.filter((m) => m.stamp);
      if (dated.length < 2) continue;
      (STAGED_GROUPS[g] ? stagedWithTwoClocks : redundantWithTwoClocks).push(
        `${g}: ${dated.map((d) => d.stamp).join(', ')}`,
      );
    }

    // **The sharp one.** Not one group of genuinely-redundant recordings has two files that both
    // state a date, so there is no corpus evidence at all that timestamp corroboration works — while
    // the ONE group that does carry two clocks is a staged pair, whose two stamps are identical and
    // whose files must never be merged. The only timestamp agreement this corpus can demonstrate is
    // a false merge waiting to happen.
    //
    // Going red means a redundant group gained a second clock and corroboration became testable.
    // That is good news for D6: go and measure whether the stamps actually agree.
    expect(
      redundantWithTwoClocks,
      'a redundant group now carries two stated clocks — timestamp corroboration is testable, which CHANGES D6',
    ).toEqual([]);

    // And the counterpart, so the pair of assertions cannot both pass vacuously: the staged case
    // really does carry two clocks. If this empties out, the claim above lost its teeth and the
    // whole measurement wants re-taking.
    expect(
      stagedWithTwoClocks.length,
      'the staged group should still be the only one with two stated clocks',
    ).toBeGreaterThan(0);
  });

  it('reads a stated clock off only a minority of files, and one of them is a decade wrong', () => {
    // Coverage, and the reason a clock cannot simply be trusted where it IS present.
    const dated = all.filter((r) => r.stamp);
    expect(dated.length, 'files stating a launch date').toBeGreaterThan(0);
    expect(
      dated.length,
      `stated clocks now cover ${dated.length} of ${all.length} files — if this is most of them, ` +
        `re-measure D6's wall-clock premise`,
    ).toBeLessThan(all.length / 2);

    // `iss-sg1.1` flew 2023-10-01 and its logger reports 2013 — a real, well-formed date that
    // `flownAtFromParts`'s 1990–2100 window cannot reject, ten years from its own siblings. This is
    // why "the file said so" is not sufficient grounds to group or to refuse to group.
    const decadeOut = dated.filter((r) => r.group === 'iss-sg1.1-20231001' && r.stamp!.startsWith('2013'));
    expect(
      decadeOut.length,
      'the known bad-clock file (iss-sg1.1, reporting 2013 for a 2023 flight) is no longer reporting 2013 — ' +
        'if the fixture or the parser changed, re-read D6 notes 2 and 3',
    ).toBe(1);
  });
});
