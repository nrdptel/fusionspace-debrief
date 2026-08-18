import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DERIVED_PEAK_PAIRS,
  DERIVED_PEAK_METHOD_PAIRS,
  derivedPeakMethodOnly,
} from './derivedPeak';

/**
 * **`isolatesMethod` was a remembered flag, and it was wrong for a year.**
 *
 * The stargazer pair was filed as *"an EasyMega against a second recording of the stargazer flight
 * … + a second barometer"*, so `/validation` told a flyer that the cleanest pair — one device, two
 * exports — reads **+4%**. Both stargazer recordings report `serial 5581` and `product
 * EasyMega-v2.0`: it is one board, one flight, two exports, exactly like the sg1.1 TeleMetrum pair.
 * The cost of the method alone was published as a single flattering number sixteen times smaller
 * than the other measurement of the same thing.
 *
 * The corpus suite already recomputed every PERCENTAGE from the real files and would have caught a
 * figure that drifted. It never checked the one field that says what a figure MEANS. So this reads
 * the device serial out of the recordings themselves and holds the flag against it — measured, not
 * remembered.
 */

const CORPUS = fileURLToPath(new URL('./parsers/__corpus__/', import.meta.url));
const hasCorpus = (() => {
  try {
    return statSync(CORPUS).isDirectory();
  } catch {
    return false;
  }
})();

function logFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = `${d}/${e}`;
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(csv|eeprom)$/i.test(e) && s.size < 60_000_000) out.push(p);
    }
  };
  walk(dir.replace(/\/$/, ''));
  return out.sort();
}

/**
 * The device serial a recording states, read from the FILE rather than through a parser.
 *
 * Deliberately not `flight.meta.serial`: the AltOS eeprom reader does not carry the serial out of
 * the download's JSON header, so a parser-based check found one serial per flight and every case
 * built on it was silently vacuous. The claim under test is about what the FILES say, so the files
 * are what is read. (That the eeprom reader drops a field its own header states is filed in
 * `BACKLOG.md`; it is not this check's job to work around it quietly.)
 *
 * AltOS only, which is all that is needed — both same-device pairs are AltOS. A CSV states
 * `serial` as its second column on every data row; an `.eeprom` states it once in a JSON header.
 */
function serialFromFile(path: string): string | null {
  let head: string;
  try {
    head = readFileSync(path).subarray(0, 8192).toString('latin1');
  } catch {
    return null;
  }
  const json = head.match(/"serial"\s*:\s*(\d+)/);
  if (json) return json[1];
  const lines = head.split(/\r?\n/);
  const hi = lines.findIndex((l) => l.replace(/^#/, '').toLowerCase().startsWith('version,'));
  if (hi < 0) return null;
  const cols = lines[hi].replace(/^#/, '').split(',').map((c) => c.trim().toLowerCase());
  const iS = cols.indexOf('serial');
  if (iS < 0) return null;
  for (const row of lines.slice(hi + 1)) {
    const cells = row.split(',');
    if (cells.length <= iS) continue;
    const v = cells[iS].trim();
    if (/^\d+$/.test(v)) return v;
  }
  return null;
}

/** How many recordings of each corpus flight state each device serial, keyed by the group id the
 *  pairs use. Counts rather than a set, because a group can hold several devices AND several
 *  exports of one — sg1.1 carries a TeleMetrum twice and a PerfectFlite StratoLogger once — so
 *  "how many distinct serials" cannot tell a same-device pair from a lone board. */
function serialsByGroup(): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const p of logFiles(CORPUS)) {
    const name = p.split('/').pop() as string;
    // Corpus names are `<family>__<group>__<file>`; the group is the middle part.
    const parts = name.split('__');
    if (parts.length < 3) continue;
    const group = parts[1];
    const serial = serialFromFile(p);
    if (!serial) continue;
    if (!out.has(group)) out.set(group, new Map());
    const m = out.get(group)!;
    m.set(serial, (m.get(serial) ?? 0) + 1);
  }
  return out;
}

/** `iss-stargazer1-20230507` in the pair table is `issuiuc-stargazer1-20230507` on disk. */
function matchGroup(groups: Map<string, Map<string, number>>, pairGroup: string): Map<string, number> | undefined {
  const tail = pairGroup.replace(/^[a-z]+-/, '');
  for (const [k, v] of groups) if (k === pairGroup || k.endsWith(tail)) return v;
  return undefined;
}

describe.skipIf(!hasCorpus)('a pair that claims to isolate the method', () => {
  it('is one device, and the files are what says so', () => {
    const groups = serialsByGroup();
    let confirmed = 0;
    const unverifiable: string[] = [];
    for (const pair of DERIVED_PEAK_PAIRS) {
      if (!pair.isolatesMethod) continue;
      const serials = matchGroup(groups, pair.group) ?? new Map<string, number>();
      const repeated = [...serials.entries()].filter(([, n]) => n >= 2);
      if (repeated.length >= 1) {
        confirmed++;
        continue;
      }
      // **A pair the files CONTRADICT fails; one they are merely silent about is reported.**
      // Not every download states a serial — sg1.1's `.eeprom` does not — and failing on absent
      // evidence would make this check impossible to keep. Two distinct boards each appearing
      // once IS evidence, and that is what a mislabelled pair looks like.
      const contradicted = serials.size >= 2;
      expect(
        contradicted,
        `${pair.group} is marked isolatesMethod but its recordings state ${serials.size} different boards: ${[...serials.entries()].map(([k, n]) => `${k}x${n}`).join(', ')}`,
      ).toBe(false);
      unverifiable.push(`${pair.group} (serials stated: ${serials.size})`);
    }
    // Non-vacuous: at least one pair has to be positively confirmed by the files, or this case
    // passes on a corpus that says nothing at all.
    expect(
      confirmed,
      `no method-isolating pair could be confirmed from the files; unverifiable: ${unverifiable.join('; ')}`,
    ).toBeGreaterThanOrEqual(1);
    expect(DERIVED_PEAK_METHOD_PAIRS, 'both same-device pairs are counted').toBe(2);
  });

  it('and every flight the files say was recorded twice by ONE board has such a pair', () => {
    // **The direction that actually failed.** Checking only the marked pairs stays green while a
    // same-device pair is filed as two instruments, which is exactly what happened for a year.
    // Asked per FLIGHT rather than per pair, because a flight can carry both kinds at once —
    // sg1.1 has a TeleMetrum exported twice AND a StratoLogger, so its cross-instrument pair is
    // not evidence of anything about its same-device one.
    const groups = serialsByGroup();
    for (const [group, serials] of groups) {
      const repeated = [...serials.entries()].filter(([, n]) => n >= 2);
      if (repeated.length === 0) continue;
      const pairs = DERIVED_PEAK_PAIRS.filter((p) => matchGroup(groups, p.group) === serials);
      if (pairs.length === 0) continue; // a flight with no derived/measured pair at all
      expect(
        pairs.some((p) => p.isolatesMethod),
        `${group} has ${repeated.map(([k, n]) => `${n} recordings off serial ${k}`).join(' and ')}, so one of its ${pairs.length} pair(s) isolates the method — none is marked so`,
      ).toBe(true);
    }
  });
});

describe('the published phrase', () => {
  it('names every method-isolating figure, never one of them', () => {
    const phrase = derivedPeakMethodOnly('speed');
    for (const p of DERIVED_PEAK_PAIRS.filter((x) => x.isolatesMethod)) {
      expect(phrase, `the phrase carries ${p.speedPct}%`).toContain(`${p.speedPct > 0 ? '+' : ''}${p.speedPct}%`);
    }
    // The specific regression: "+4%" alone was what the page said.
    expect(phrase).not.toBe('+4%');
  });
});
