import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { launchStampFromName, proposeGroups } from './proposeGroups';
import type { RecentMeta } from './recents';

/**
 * D6's proposal rule, and the measurement it rests on.
 *
 * `d6Grouping.test.ts` pins why the OBVIOUS signals cannot work. This file pins the one that can:
 * the launch second Featherweight's downloader writes into the file name. The corpus case below is
 * the whole argument for the rule existing, so it is asserted over the real manifest rather than
 * over anything synthetic — and like its sibling, a red here is the corpus changing under D6, not
 * the app regressing.
 */

const CORPUS = 'lib/parsers/__corpus__/';
const present = existsSync(CORPUS + 'manifest.csv');

let seq = 0;
function row(over: Partial<RecentMeta> & { name: string }): RecentMeta {
  seq += 1;
  return {
    id: over.id ?? `id-${seq}`,
    formatLabel: 'Test',
    addedAt: 1_700_000_000_000,
    apogeeM: 1000,
    maxVelocityMs: 200,
    note: '',
    ...over,
  } as RecentMeta;
}

describe('the launch instant a file name states', () => {
  it('reads the second a Featherweight download names', () => {
    expect(launchStampFromName('BlRv_SN1537_HR_04-12-2025_12_45_49.csv')).toBe('2025-04-12T12:45:49');
    // The summary file carries a trailing underscore, and the GPS tracker uses the same shape.
    expect(launchStampFromName('BlRv_SN1537_summary_04-12-2025_12_45_49_.csv')).toBe('2025-04-12T12:45:49');
    expect(launchStampFromName('GPSTrk05305_04-12-2025_12_45_50.csv')).toBe('2025-04-12T12:45:50');
    // A space before the rate marker, as two of the corpus files actually have.
    expect(launchStampFromName('BLRVN87-bckup HR_01-10-2026_14_55_30.csv')).toBe('2026-01-10T14:55:30');
  });

  it('says nothing about a name that does not carry one, which is most files', () => {
    expect(launchStampFromName('telemetrum_data.csv')).toBeNull();
    expect(launchStampFromName('SG1.1-Booster-October-TeleMetrum.eeprom')).toBeNull();
    expect(launchStampFromName('log.csv')).toBeNull();
  });

  it('refuses six numbers that are not a date, so a serial cannot be read as a launch', () => {
    expect(launchStampFromName('board_13-40-2025_99_99_99.csv')).toBeNull();
    expect(launchStampFromName('board_02-30-2025_12_00_00.csv')).toBeNull(); // 30 February
    expect(launchStampFromName('board_04-12-2025_25_00_00.csv')).toBeNull(); // hour 25
    // The three above are all caught by the calendar round-trip, because each rolls the date
    // over. These two do NOT roll it over — 75 minutes past noon is still 12 April — so only the
    // explicit range check refuses them, and without it the function would return the malformed
    // `2025-04-12T12:75:00` and two files could "agree" on a time that does not exist. Found by
    // mutating the range check away and watching the three above still pass.
    expect(launchStampFromName('board_04-12-2025_12_75_00.csv')).toBeNull();
    expect(launchStampFromName('board_04-12-2025_12_30_75.csv')).toBeNull();
  });
});

describe('proposing which files are one flight', () => {
  const A = '_HR_04-12-2025_12_45_49.csv';
  const B = '_LR_04-12-2025_12_45_49.csv';

  it('offers two files that arrived together and name the same launch second', () => {
    const p = proposeGroups([row({ name: `BlRv${A}` }), row({ name: `BlRv${B}` })]);
    expect(p).toHaveLength(1);
    expect(p[0].ids).toHaveLength(2);
    expect(p[0].statedLaunch).toBe('2025-04-12T12:45:49');
    // The evidence is the feature: a grouping a flyer cannot audit is one they cannot correct.
    expect(p[0].reason).toMatch(/12:45:49/);
    expect(p[0].reason).toMatch(/arrived together/);
  });

  it('will not reach across separate drops, however well the names agree', () => {
    // The same two files, opened a day apart. Arrival is a fact about the flyer's own action, and
    // without it a proposal is about the whole logbook rather than about what they just did.
    const p = proposeGroups([
      row({ name: `BlRv${A}`, addedAt: 1_700_000_000_000 }),
      row({ name: `BlRv${B}`, addedAt: 1_700_000_000_000 + 86_400_000 }),
    ]);
    expect(p).toEqual([]);
  });

  it('refuses the ground-station file, 956 s from its siblings, rather than widening to reach it', () => {
    // The real jan18 case: three files at 10:48:41 and the ground station at 10:32:45. It IS the
    // same flight, and it is still a miss — reaching it needs a 16-minute window, which would
    // swallow unrelated flights from the same launch day.
    const p = proposeGroups([
      row({ name: 'BlRv_159F1cm HR_01-18-2026_10_48_41.csv' }),
      row({ name: 'BlRv_159F1cm LR_01-18-2026_10_48_41.csv' }),
      row({ name: 'GPS_GS03748_01-18-2026_10_32_45.csv' }),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0].ids).toHaveLength(2);
  });

  it('leaves a row the flyer has already decided about entirely alone', () => {
    const p = proposeGroups([
      row({ name: `BlRv${A}`, id: 'a', flightId: 'a' }),
      row({ name: `BlRv${B}`, id: 'b', flightId: 'a' }),
    ]);
    expect(p).toEqual([]);
  });

  it('does not turn a restored backup into one enormous flight', () => {
    // `importLogbook` writes every row in one transaction, so a whole restored logbook shares an
    // arrival. Only the stamp stops that becoming a single flight — which is why arrival is a
    // necessary condition and never a sufficient one.
    const sameArrival = 1_700_000_000_000;
    const p = proposeGroups([
      row({ name: 'BlRv_a_HR_04-12-2025_12_45_49.csv', addedAt: sameArrival }),
      row({ name: 'BlRv_b_HR_05-20-2025_09_10_11.csv', addedAt: sameArrival }),
      row({ name: 'BlRv_c_HR_06-01-2025_16_30_00.csv', addedAt: sameArrival }),
    ]);
    expect(p).toEqual([]);
  });

  it('proposes nothing at all over files no vendor stamped', () => {
    // Altus Metrum, Eggtimer and the rest carry no stamp, so nothing opens a proposal over them.
    // Refusing where the evidence is absent is the posture, not a shortfall.
    const p = proposeGroups([
      row({ name: 'telemetrum_data.csv' }),
      row({ name: 'easymega_data.csv' }),
    ]);
    expect(p).toEqual([]);
  });
});

describe('the corpus decides whether this rule can exist at all', () => {
  if (!present) {
    it.skip('corpus not fetched — attach nrdptel/debrief-fixtures or run `npm run fetch-fixtures`', () => {});
    return;
  }

  /** The manifest's original download names and the group each belongs to. Quoted fields carry
   *  commas, so this honours quotes. */
  function manifest(): { name: string; group: string }[] {
    const text = readFileSync(CORPUS + 'manifest.csv', 'utf8');
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
    const head = out[0];
    const iName = head.indexOf('original_download_name');
    const iGroup = head.indexOf('same_flight_group');
    return out
      .slice(1)
      .filter((r) => r.length > Math.max(iName, iGroup))
      .map((r) => ({ name: r[iName], group: r[iGroup] }));
  }

  it('separates true pairs from false ones, which apogee agreement could not', () => {
    const stamped = manifest()
      .map((r) => ({ ...r, stamp: launchStampFromName(r.name) }))
      .filter((r): r is { name: string; group: string; stamp: string } => r.stamp != null);

    // If this moves, the corpus gained or lost stamped files and every number below is restated.
    expect(stamped.length, 'files whose original download name states a launch second').toBe(12);

    let truePairs = 0;
    let falsePairs = 0;
    let widestTrue = 0;
    let nearestFalse = Infinity;
    for (let i = 0; i < stamped.length; i++) {
      for (let j = i + 1; j < stamped.length; j++) {
        const apart = Math.abs(Date.parse(`${stamped[i].stamp}Z`) - Date.parse(`${stamped[j].stamp}Z`)) / 1000;
        const same = stamped[i].group === stamped[j].group;
        if (apart <= 120) {
          if (same) { truePairs++; widestTrue = Math.max(widestTrue, apart); }
          else falsePairs++;
        } else if (!same) nearestFalse = Math.min(nearestFalse, apart);
      }
    }

    // THE measurement. `d6Grouping.test.ts` shows apogee agreement admits more false pairs than
    // true ones; this shows the stamp admits none. A red on the false-pair count is the signal
    // that this rule can no longer be shipped as it stands.
    expect(falsePairs, 'files from different flights proposed as one').toBe(0);
    expect(truePairs, 'true pairs the rule reaches').toBe(16);

    // And the margin, which is what makes 120 s a choice rather than a guess.
    expect(widestTrue, 'widest spread inside a true group (s)').toBeLessThanOrEqual(5);
    expect(nearestFalse, 'nearest pair the rule must refuse (s)').toBeGreaterThan(900);
  });

  it('opens no proposal over any staged pair, because no staged file carries a stamp', () => {
    // The roadmap names `iss-kairos` and `iss-sg1.2` as standing negatives, and `d6Grouping.test.ts`
    // names a third, `reddit-meraki2-121km`. A booster and a sustainer are two objects on one
    // launch, and merging them is the exact failure D6 must not have. They are refused here for a
    // REASON rather than by a special case: none of their files is stamped.
    const staged = ['iss-kairos-20240323', 'iss-sg1.2-20231118', 'reddit-meraki2-121km'];
    const offenders = manifest()
      .filter((r) => staged.includes(r.group))
      .filter((r) => launchStampFromName(r.name) != null)
      .map((r) => r.name);
    expect(offenders, 'staged files carrying a launch stamp would need an explicit refusal').toEqual([]);
  });
});
