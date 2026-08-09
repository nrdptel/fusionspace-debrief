import { describe, it, expect } from 'vitest';
import { sortRecents, filterRecents, personalBests, logbookRowNames } from './logbook';
import { provenanceCell, PROVENANCE_COLUMN } from './synthetic';
import type { RecentMeta } from './recents';

const rec = (id: string, addedAt: number, apogeeM: number | null, maxVelocityMs: number | null): RecentMeta => ({
  id,
  name: `${id}.csv`,
  formatLabel: 'Test',
  addedAt,
  apogeeM,
  maxVelocityMs,
  note: '',
});

const flights = [
  rec('a', 300, 500, 80),
  rec('b', 100, 1200, 60),
  rec('c', 200, 800, 150),
];

describe('sortRecents', () => {
  it('orders by most recent, highest apogee, or fastest', () => {
    expect(sortRecents(flights, 'recent').map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(sortRecents(flights, 'apogee').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortRecents(flights, 'speed').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('sinks missing values to the bottom and does not mutate the input', () => {
    const withGap = [rec('x', 1, null, null), rec('y', 2, 300, 40)];
    expect(sortRecents(withGap, 'apogee').map((r) => r.id)).toEqual(['y', 'x']);
    expect(withGap[0].id).toBe('x'); // original order untouched
  });
});

describe('personalBests', () => {
  it('crowns the single highest apogee and top speed', () => {
    expect(personalBests(flights)).toEqual({ apogeeId: 'b', speedId: 'c' });
  });

  it('crowns nobody with fewer than two finite values or a tie', () => {
    expect(personalBests([rec('only', 1, 1000, 90)])).toEqual({ apogeeId: null, speedId: null });
    const tied = [rec('a', 1, 500, 70), rec('b', 2, 500, 60)];
    expect(personalBests(tied).apogeeId).toBeNull(); // tie for top apogee
    expect(personalBests(tied).speedId).toBe('a'); // speed still unique
  });

  /**
   * A best is a best of FLIGHTS. A flyer with a primary and a backup altimeter comes home with
   * two recordings of one flight, and counting them as two flights breaks the crown in both
   * directions at once — measured on the corpus, not imagined.
   */
  describe('over flights, not over files', () => {
    it('does not let one flight recorded twice beat itself', () => {
      // The four AltimeterCloud recordings of one 756 m flight: 756.675 / 756.544 / 756.659 /
      // 756.745 m, top speeds 164.83 / 167.78 / 156.91 / 159.42 m/s. Ungrouped, the two crowns
      // land on two DIFFERENT rows of the SAME flight — apogee on 1796, speed on 1785 — and a
      // flyer reads two personal bests off one launch.
      const four = [
        rec('1784', 4, 756.675, 164.83),
        rec('1785', 3, 756.544, 167.78),
        rec('1786', 2, 756.659, 156.91),
        rec('1796', 1, 756.745, 159.42),
      ];
      const other = rec('other', 5, 700, 120);
      expect(personalBests([...four, other]), 'ungrouped: two crowns on one flight').toEqual({
        apogeeId: '1796',
        speedId: '1785',
      });

      const joined = four.map((r) => ({ ...r, flightId: '1784' }));
      // One flight now, reported by 1784 — so it competes with 1784's readings and nothing else.
      expect(personalBests([...joined, other])).toEqual({ apogeeId: '1784', speedId: '1784' });
    });

    it('gives a flight back its crown when it was only recorded twice', () => {
      // Two recordings that agree EXACTLY are a tie, and a tie crowns nothing — so a flyer's
      // highest flight lost its star for having been recorded twice. The corpus has three such
      // pairs: an AltOS .eeprom beside AltosUI's export of the same bytes, an RRC3 .rff beside
      // its mDACS text export, and a Blue Raven's two rates.
      const raw = rec('eeprom', 2, 2995.674, 332.48);
      const csv = rec('csv', 1, 2995.674, 332.48);
      const lower = rec('lower', 3, 1200, 200);
      expect(personalBests([raw, csv, lower]), 'ungrouped: the tie deletes the crown outright').toEqual({
        apogeeId: null,
        speedId: null,
      });

      const joined = [{ ...raw, flightId: 'eeprom' }, { ...csv, flightId: 'eeprom' }, lower];
      expect(personalBests(joined)).toEqual({ apogeeId: 'eeprom', speedId: 'eeprom' });
    });

    it('competes on the reading the flyer nominated, never the best of the recordings', () => {
      // Handing the flight to the recording that read highest would be a best-of dressed as a
      // measurement. The flight reads what its chosen recording read, and that is what runs.
      const low = rec('low', 2, 900, 100);
      const high = rec('high', 1, 1100, 100);
      const rival = rec('rival', 3, 1000, 90);
      const reportedByLow = [{ ...low, flightId: 'low' }, { ...high, flightId: 'low' }, rival];
      expect(personalBests(reportedByLow).apogeeId, 'the rival at 1000 m beats the flight’s own 900 m').toBe('rival');

      const reportedByHigh = [{ ...low, flightId: 'high' }, { ...high, flightId: 'high' }, rival];
      expect(personalBests(reportedByHigh).apogeeId).toBe('high');
    });

    it('leaves an ordinary logbook exactly where it was', () => {
      expect(personalBests(flights)).toEqual({ apogeeId: 'b', speedId: 'c' });
    });
  });
});

describe('filterRecents', () => {
  const mk = (over: Partial<RecentMeta>): RecentMeta => ({
    id: 'x',
    name: 'x.csv',
    formatLabel: 'Test',
    addedAt: 0,
    apogeeM: null,
    maxVelocityMs: null,
    note: '',
    ...over,
  });
  const list = [
    mk({ id: 'a', name: 'Nike-Smoke-Oct.csv', formatLabel: 'Altus Metrum (AltOS)', note: 'H135 white, calm' }),
    mk({ id: 'b', name: 'raven-flight3.csv', formatLabel: 'Featherweight Raven (FIP)', note: 'L3 attempt' }),
    mk({ id: 'c', name: 'aim-xtra.csv', formatLabel: 'Entacore AIM', note: '' }),
  ];

  it('matches the name, the logger and the flyer’s own note', () => {
    expect(filterRecents(list, 'nike').map((r) => r.id)).toEqual(['a']);
    expect(filterRecents(list, 'featherweight').map((r) => r.id)).toEqual(['b']);
    expect(filterRecents(list, 'h135').map((r) => r.id)).toEqual(['a']);
  });

  it('requires every term but ignores their order', () => {
    // What a flyer actually types: an airframe and a motor, or a logger and a level.
    expect(filterRecents(list, 'h135 nike').map((r) => r.id)).toEqual(['a']);
    expect(filterRecents(list, 'raven l3').map((r) => r.id)).toEqual(['b']);
    expect(filterRecents(list, 'raven h135')).toEqual([]);
  });

  it('is case- and accent-insensitive', () => {
    expect(filterRecents(list, 'ENTACORE').map((r) => r.id)).toEqual(['c']);
    expect(filterRecents([mk({ id: 'd', name: 'Zéphyr.csv' })], 'zephyr').map((r) => r.id)).toEqual(['d']);
  });

  it('an empty query shows the whole logbook', () => {
    expect(filterRecents(list, '')).toHaveLength(3);
    expect(filterRecents(list, '   ')).toHaveLength(3);
  });
});

describe('sorting and searching by the launch day', () => {
  const at = (id: string, stamp?: string): RecentMeta => ({
    id,
    name: `${id}.csv`,
    formatLabel: 'Test',
    addedAt: 0,
    apogeeM: null,
    maxVelocityMs: null,
    note: '',
    ...(stamp ? { flownAt: { stamp, zone: 'UTC' as const } } : {}),
  });

  it('orders by the launch day, newest first, and sinks the undated', () => {
    const list = [at('old', '2021-10-30T20:07'), at('undated'), at('new', '2024-05-11T14:09')];
    expect(sortRecents(list, 'flown').map((r) => r.id)).toEqual(['new', 'old', 'undated']);
  });

  it('finds a launch by its month and year, the way the row shows it', () => {
    const list = [at('a', '2021-10-30T20:07'), at('b', '2024-05-11T14:09')];
    expect(filterRecents(list, 'oct 2021').map((r) => r.id)).toEqual(['a']);
    expect(filterRecents(list, '2024-05').map((r) => r.id)).toEqual(['b']);
  });
});

// A flight's file name stopped being unique the moment the logbook started keeping two files
// that share one. These names are what a screen reader reads off the three controls on a row,
// so "unique" is the requirement, not a nicety.
describe('logbookRowNames', () => {
  const ft = (m: number) => `${Math.round(m * 3.28084).toLocaleString()} ft`;
  const opened = () => 'just now';
  const row = (id: string, name: string, apogeeM: number | null, stamp?: string): RecentMeta => ({
    id,
    name,
    formatLabel: 'Test',
    addedAt: 0,
    apogeeM,
    maxVelocityMs: null,
    note: '',
    ...(stamp ? { flownAt: { stamp, zone: 'UTC' as const } } : {}),
  });

  it('leaves a name that is already unique alone', () => {
    const names = logbookRowNames([row('a', 'one.csv', 300), row('b', 'two.csv', 900)], ft, opened);
    expect([...names.values()]).toEqual(['one.csv', 'two.csv']);
  });

  it('describes a repeated name by what the row already shows', () => {
    const names = logbookRowNames([row('a', 'data.csv', 300), row('b', 'data.csv', 900)], ft, opened);
    expect(names.get('a')).toBe('data.csv, opened just now, apogee 984 ft');
    expect(names.get('b')).toBe('data.csv, opened just now, apogee 2,953 ft');
  });

  it('still tells apart two flights that agree on every fact the row shows', () => {
    // The case the description alone cannot reach, and the likeliest one: a batch drop of one
    // rocket's files all read "just now", carry no launch date, and can round to one figure.
    const names = logbookRowNames([row('a', 'data.csv', 300), row('b', 'data.csv', 300)], ft, opened);
    expect(names.get('a')).toBe('data.csv, opened just now, apogee 984 ft (1 of 2)');
    expect(names.get('b')).toBe('data.csv, opened just now, apogee 984 ft (2 of 2)');
  });

  it('never gives two flights the same name, whatever they have in common', () => {
    const same = ['a', 'b', 'c', 'd'].map((id) => row(id, 'data.csv', null));
    const names = logbookRowNames(same, ft, opened);
    expect(new Set(names.values()).size, `collided: ${[...names.values()].join(' / ')}`).toBe(4);
    expect(names.size).toBe(4);
  });
});

/**
 * **The column a made-up flight adds to the table a flyer pastes into a spreadsheet.**
 *
 * Here rather than left to the component, because the audit table in `lib/synthetic.test.ts` marks
 * this sink covered and a `labelled` row whose only evidence is JSX is a claim nothing can falsify
 * — which is exactly what the pre-push review caught it being. The header and the cell live in
 * `lib/logbook.ts` so this file has something to address, and that table now reads this file's
 * text to check the claim it makes.
 *
 * The rule is `COMPETITION.md` row 41's: per-record redundancy, on the NMEA / HL7 / DICOM
 * precedent. A caption above the header is a cell a sort moves away from the rows it was about;
 * a per-row value survives a sort, a filter, and a partial paste.
 */
describe('the logbook table says which of its rows Debrief made up', () => {
  const synth = (id: string): RecentMeta => ({ ...rec(id, 1, 1666, 173), synthetic: true });

  it('marks a made-up flight, and says so in words rather than a tick', () => {
    // A cell that travels alone — one row pasted into an email — still has to say what it means.
    expect(provenanceCell(synth('demo').synthetic)).toContain('SYNTHETIC');
    expect(provenanceCell(synth('demo').synthetic)).toContain('not flown');
  });

  it('never leaves a real flight blank, because blank reads as missing rather than as recorded', () => {
    expect(provenanceCell(rec('a', 1, 500, 80).synthetic)).toBe('recorded');
    expect(provenanceCell(undefined)).toBe('recorded');
  });

  it('heads the column with a fact, not a question', () => {
    // It read `Real flight?` and answered `SYNTHETIC` / `flown`: a yes/no header answered with
    // nouns, which in a spreadsheet cannot be filtered on the question as posed and leaves the
    // reader to infer the polarity.
    expect(PROVENANCE_COLUMN).toBe('Provenance');
    expect(PROVENANCE_COLUMN.endsWith('?'), 'a column header is a field name, not a question').toBe(false);
  });
});
