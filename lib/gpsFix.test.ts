import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './parsers';
import { getChannel } from './flight/types';
import { fixAllows, fixQualitySentence, gradeFromFixColumn, gradeFromSatellites, gradeFromValue, trackFixQuality } from './gpsFix';

/**
 * One rule for a degraded fix, held against every parser that has to apply it.
 *
 * Before `lib/gpsFix.ts` existed, Debrief answered the same question two ways: the AltOS families
 * kept a three-satellite position and dropped the height beside it, and the Featherweight families
 * dropped the row whole. Nothing downstream could tell which had happened, and the recovery view
 * captioned whatever survived identically. This file is the check that stops the two rules
 * re-emerging — it asserts the shared judgement AND that every parser routes through it, because a
 * test of the module alone would stay green through a parser that quietly went back to its own.
 *
 * **Three of these cases exist because the first version of this file could not fail, and each
 * gap is worth more than the case that closed it.**
 *
 *  1. It graded the AltOS families over the corpus and left the Featherweight families to a
 *     channel-kind check, so reverting their fix rule to `fix >= 3` left the whole suite green —
 *     the very mutant the work claimed to kill. No corpus or committed file anywhere carries a
 *     `FIX == 2` row, so the only way to exercise that branch end to end is to hand the parser
 *     one, which `a two-dimensional Featherweight fix keeps its position` does.
 *  2. It counted ROWS. A receiver runs at a few hertz and a log can run at two hundred, so a CSV
 *     repeats each position until the next solution — and the same flight read 371 two-dimensional
 *     "fixes" from the CSV its board exported and 13 from the raw download that CSV was made from.
 *     Counted as solutions the two agree exactly, which is what `both exports of one download
 *     agree` now pins.
 *  3. Its threshold cases stopped at 4, so neither the u-blox `fixType 5` (time only, no position)
 *     nor a one-satellite row was covered — and both were graded as kept positions.
 */

const FIXTURES = fileURLToPath(new URL('./parsers/__fixtures__/', import.meta.url));
const CORPUS = fileURLToPath(new URL('./parsers/__corpus__/', import.meta.url));

function logFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e.startsWith('.') || e === 'scripts' || e === '_ground-truth-docs') continue;
      const p = `${d}/${e}`;
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(csv|txt|tsv|dat|pf2|eeprom|rff|log)$/i.test(e) && s.size < 60_000_000) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Every recording in a directory that carries a GPS position, read through the real parsers. */
function gpsRecordings(dir: string) {
  const out: {
    file: string;
    format: string;
    /** Rows the parser kept a position on. */
    fixRows: number;
    /** DISTINCT positions among those rows — the count of SOLUTIONS. */
    solutions: number;
    /** Distinct positions whose fix grade says two-dimensional. */
    twoDSolutions: number;
    /** TRUE where the file's fix quality is reachable as a channel at all. */
    gradeChannel: boolean;
  }[] = [];
  for (const p of logFiles(dir)) {
    let res;
    try {
      res = importFlight({ name: p.split('/').pop()!, bytes: new Uint8Array(readFileSync(p)) });
    } catch {
      continue;
    }
    if (!res || res.kind !== 'flight') continue;
    const flight = res.flight;
    const lat = getChannel(flight, 'latitude');
    const lon = getChannel(flight, 'longitude');
    if (!lat || !lon) continue;
    const grade = getChannel(flight, 'gpsFixGrade');
    const seen = new Set<string>();
    const twoD = new Set<string>();
    let fixRows = 0;
    for (let i = 0; i < lat.values.length; i++) {
      if (!Number.isFinite(lat.values[i]) || !Number.isFinite(lon.values[i])) continue;
      fixRows++;
      const key = `${lat.values[i]},${lon.values[i]}`;
      seen.add(key);
      if (grade && gradeFromValue(grade.values[i]) === '2d') twoD.add(key);
    }
    out.push({
      file: p.slice(dir.length),
      format: String(flight.format),
      fixRows,
      solutions: seen.size,
      twoDSolutions: twoD.size,
      gradeChannel: !!grade,
    });
  }
  return out;
}

/** A Featherweight tracker log written here, because no real file in reach carries a 2D fix. */
function featherweightCsv(fixColumn: number[]): Uint8Array {
  const head = 'UTCTIME,UNIXTIME,ALT,LAT,LON,#SATS,FIX,HORZV,VERTV,HEAD,FLAGS,>40,>32,>24,RSSI,BATT';
  const rows = fixColumn.map((fix, i) => {
    const t = 1618711600 + i;
    // A position that MOVES, so a parser dropping rows shortens the track visibly rather than
    // leaving an identical one behind.
    const lat = (34.494978 + i * 0.0001).toFixed(8);
    const lon = (-116.95774 + i * 0.0001).toFixed(8);
    return `Apr 17 2021 19:06:${String(40 + i).padStart(2, '0')}.000 UTC,${t}.000,${2871 + i * 10},${lat},${lon},21,${fix},0,0,1,0x03,1,12,19,187,4.025`;
  });
  return new TextEncoder().encode([head, ...rows].join('\n') + '\n');
}

describe('one rule for a degraded GPS fix', () => {
  it('grades a fix by what the receiver could solve, from either kind of column', () => {
    // Four satellites solve x, y, z and the clock bias. Three solve x, y and the bias on an
    // assumed z. Fewer than three solve nothing — one satellite is not a degraded fix, it is no
    // fix, and grading it `2d` (a KEPT position) is what the first draft of this module did.
    expect(gradeFromSatellites(0)).toBe('none');
    expect(gradeFromSatellites(1)).toBe('none');
    expect(gradeFromSatellites(2)).toBe('none');
    expect(gradeFromSatellites(3)).toBe('2d');
    expect(gradeFromSatellites(4)).toBe('3d');
    expect(gradeFromSatellites(29)).toBe('3d');

    // u-blox `fixType`: 0 no fix, 1 dead reckoning, 2 2D-fix, 3 3D-fix, 4 GNSS+DR, 5 time only.
    // `5` is the one this module's own docstring enumerates and the first draft then accepted:
    // a receiver that has solved its clock and NO position, graded as a full 3D fix.
    expect(gradeFromFixColumn(0)).toBe('none');
    expect(gradeFromFixColumn(1)).toBe('none');
    expect(gradeFromFixColumn(2)).toBe('2d');
    expect(gradeFromFixColumn(3)).toBe('3d');
    expect(gradeFromFixColumn(4)).toBe('3d');
    expect(gradeFromFixColumn(5)).toBe('none');

    // A file that states nothing about its fix is not a file full of bad fixes. Both readers
    // grade silence `3d` rather than blanking a track whose receiver may have been fully locked.
    for (const v of [null, undefined, NaN]) {
      expect(gradeFromSatellites(v), `satellites ${String(v)}`).toBe('3d');
      expect(gradeFromFixColumn(v), `fix column ${String(v)}`).toBe('3d');
    }

    // …and the channel form round-trips, with everything else reading "not stated".
    expect(gradeFromValue(3)).toBe('3d');
    expect(gradeFromValue(2)).toBe('2d');
    expect(gradeFromValue(0)).toBe('none');
    expect(gradeFromValue(NaN)).toBeNull();
    expect(gradeFromValue(1)).toBeNull();
  });

  it('lets a two-dimensional fix keep its position and not its height', () => {
    // The whole rule, in the three lines it takes to state. A 2D fix is a real latitude and
    // longitude resting on a height the receiver assumed — a worse bearing, not an absent one.
    expect(fixAllows('none')).toEqual({ position: false, altitude: false });
    expect(fixAllows('2d')).toEqual({ position: true, altitude: false });
    expect(fixAllows('3d')).toEqual({ position: true, altitude: true });
  });

  it('a two-dimensional Featherweight fix keeps its position, and states that it is one', () => {
    // The end-to-end case nothing in reach can supply. Before this, reverting the Featherweight
    // parser to its old `fix >= 3` rule left the entire suite green.
    const res = importFlight({ name: 'fw-2d.csv', bytes: featherweightCsv([3, 3, 2, 2, 0, 3, 3, 3]) });
    expect(res.kind, 'the written file parses as a Featherweight tracker log').toBe('flight');
    if (res.kind !== 'flight') return;

    const lat = getChannel(res.flight, 'latitude')!;
    const alt = getChannel(res.flight, 'altitude')!;
    const grade = getChannel(res.flight, 'gpsFixGrade');
    expect(grade, 'the fix column reaches the model as a grade').toBeTruthy();

    const kept = [...lat.values].map((v) => Number.isFinite(v));
    const heights = [...alt.values].map((v) => Number.isFinite(v));
    const grades = [...grade!.values].map(gradeFromValue);

    // Five 3D rows and two 2D rows keep a position; the no-fix row does not.
    expect(kept.filter(Boolean).length, 'positions kept from 5 three-dimensional and 2 two-dimensional fixes').toBe(7);
    // Only the 3D rows keep a height.
    expect(heights.filter(Boolean).length, 'heights kept from the three-dimensional fixes alone').toBe(5);
    expect(grades.filter((g) => g === '2d').length, 'rows graded two-dimensional').toBe(2);
    expect(grades.filter((g) => g === 'none').length, 'rows graded no-fix').toBe(1);

    // And every 2D row is one that kept a position and lost its height — the rule, end to end.
    grades.forEach((g, i) => {
      if (g !== '2d') return;
      expect(kept[i], `row ${i} is a 2D fix and keeps its position`).toBe(true);
      expect(heights[i], `row ${i} is a 2D fix and drops its height`).toBe(false);
    });
  });

  it('reaches every parser: a file that states its fix quality carries it as a grade', () => {
    const committed = gpsRecordings(FIXTURES);
    expect(committed.length, 'committed fixtures carrying a GPS position').toBeGreaterThan(2);
    for (const r of committed) {
      expect(r.gradeChannel, `${r.file} (${r.format}): fix quality reaches the model`).toBe(true);
    }
    const families = new Set(committed.map((r) => r.format));
    expect(families.size, 'GPS-bearing logger families among the committed fixtures').toBeGreaterThan(1);
    console.log(
      `degraded-fix rule: ${committed.length} committed GPS fixtures across ${families.size} families ` +
        `(${[...families].sort().join(', ')})`,
    );
  });

  it('counts two-dimensional SOLUTIONS, and both exports of one download agree', () => {
    if (!existsSync(CORPUS)) {
      console.log('degraded-fix rule: NO CORPUS — the 2D-solution count did not run');
      return;
    }
    const recs = gpsRecordings(CORPUS);
    expect(recs.length, 'corpus recordings carrying a GPS position').toBeGreaterThan(8);
    for (const r of recs) {
      expect(r.gradeChannel, `${r.file} (${r.format}): fix quality reaches the model`).toBe(true);
    }

    // Pinned so a parser that goes back to dropping 2D rows reddens here rather than silently
    // shortening somebody's ground track. `SG1.1-Booster` is the one corpus flight that spends
    // real time on three satellites, and the corpus holds it twice: the CSV AltosUI exported and
    // the raw download that CSV was made from.
    const twoD = recs.filter((r) => r.twoDSolutions > 0);
    expect(twoD.length, 'corpus recordings holding a two-dimensional solution').toBeGreaterThan(1);

    // **The assertion that makes this a count of SOLUTIONS rather than of rows**, and the only one
    // a row count cannot pass: two exports of ONE download saw the same sky, so they must report
    // the same number of two-dimensional solutions however differently they were written down.
    // Counted as rows they read 371 and 13 for the same 13 — a 28x disagreement about one flight.
    const perFlight = new Map<string, { file: string; twoD: number; rows: number }[]>();
    for (const r of twoD) {
      const stem = (r.file.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
      const list = perFlight.get(stem) ?? [];
      list.push({ file: r.file.split('/').pop()!, twoD: r.twoDSolutions, rows: r.fixRows });
      perFlight.set(stem, list);
    }
    let pairs = 0;
    for (const [stem, list] of perFlight) {
      if (list.length < 2) continue;
      pairs++;
      const counts = new Set(list.map((x) => x.twoD));
      expect(
        counts.size,
        `${stem}: its ${list.length} exports report one count of two-dimensional solutions ` +
          `(${list.map((x) => `${x.file} ${x.twoD} over ${x.rows} rows`).join(' vs ')})`,
      ).toBe(1);
    }
    expect(pairs, 'flights present in the corpus as more than one export AND holding a 2D solution').toBeGreaterThan(0);

    console.log(
      `degraded-fix rule: ${recs.length} corpus GPS recordings; two-dimensional SOLUTIONS — ` +
        twoD.map((r) => `${r.file.split('/').pop()}: ${r.twoDSolutions} (over ${r.fixRows} rows)`).join(' · '),
    );
  }, 300_000);
});

describe('what the recovery view says about a fix, in place of a constant', () => {
  const f = (...v: number[]) => Float64Array.from(v);

  it('says nothing at all when the file states nothing', () => {
    // Most formats carry no fix column. The panel must be QUIET rather than reassuring: the
    // sentence this replaces — "Positions are GPS, good to a few metres" — was printed on every
    // flight, in both branches, derived from nothing, and it is the app's only statement about
    // horizontal accuracy.
    const q = trackFixQuality(f(1, 2, 3), f(1, 2, 3), undefined);
    expect(q.unstated, 'a file with no grade channel states nothing').toBe(true);
    expect(fixQualitySentence(q), 'and the panel says nothing').toBeNull();
    // …and a grade channel of nothing but NaN is the same case, not a track of bad fixes.
    expect(fixQualitySentence(trackFixQuality(f(1, 2), f(1, 2), f(NaN, NaN)))).toBeNull();
  });

  it('counts what the receiver solved, over the fixes that were KEPT', () => {
    // NaN lat/lon are the fixes the parser dropped — they are not on the map, so they are not what
    // the reader is looking at and are not counted.
    const q = trackFixQuality(f(1, NaN, 2, 3), f(1, NaN, 2, 3), f(3, 0, 2, 3));
    expect(q.kept, 'three positions survived').toBe(3);
    expect(q.threeD).toBe(2);
    expect(q.twoD).toBe(1);
    expect(q.last, 'the coordinate a flyer walks to is the LAST kept fix').toBe('3d');
  });

  it('states the count and never a distance in metres', () => {
    const good = fixQualitySentence(trackFixQuality(f(1, 2), f(1, 2), f(3, 3)))!;
    expect(good).toContain('three dimensions');
    const mixed = fixQualitySentence(trackFixQuality(f(1, 2, 3, 4), f(1, 2, 3, 4), f(3, 2, 3, 3)))!;
    expect(mixed, 'the count is stated, not implied').toContain('1 of 4');
    expect(mixed).toContain('TWO dimensions');

    // **No metres, and this is the assertion that keeps it that way.** What a fix is good to in
    // metres depends on geometry and signal strength, and neither vendor publishes a function from
    // what these files carry — `COMPETITION.md` row 47. A grade a flyer can act on beats a number
    // nobody can ground, and the sentence this replaced was exactly such a number.
    for (const sentence of [good, mixed]) {
      expect(sentence, 'no distance is claimed').not.toMatch(/\bmetres?\b|\bmeters?\b|\bfeet\b|\bft\b/i);
      expect(sentence, 'and no accuracy figure').not.toMatch(/\d+\s*(m|ft|km)\b/);
    }
  });

  it('warns when the coordinate a flyer walks to is itself two-dimensional', () => {
    // The last kept fix is the one that goes into a phone. A track that was mostly good and ended
    // badly is the case the count alone would understate.
    const endsBadly = fixQualitySentence(trackFixQuality(f(1, 2, 3), f(1, 2, 3), f(3, 3, 2)))!;
    expect(endsBadly).toContain('The last fix here is one of them');
    const endsWell = fixQualitySentence(trackFixQuality(f(1, 2, 3), f(1, 2, 3), f(2, 3, 3)))!;
    expect(endsWell, 'and says so only when it is true').not.toContain('The last fix here');
  });
});
