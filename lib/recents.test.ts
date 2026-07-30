import { describe, it, expect } from 'vitest';
import { isSameStoredFlight, parseLogbookFlights, serializeLogbook, type RecentFlight } from './recents';

// parseLogbookFlights is the pure half of the backup/restore feature — it turns
// the bytes of an export file into valid flight records, so it can be exercised
// without IndexedDB. The IndexedDB merge itself is covered by the e2e round-trip.

const flight = (over: Partial<RecentFlight> = {}): RecentFlight => ({
  id: 'a1',
  name: 'flight.csv',
  formatLabel: 'Generic CSV',
  addedAt: 1_700_000_000_000,
  apogeeM: 1234,
  maxVelocityMs: 210,
  note: 'H128, clear day',
  text: 'T,Alt\n0,0\n',
  ...over,
});

describe('parseLogbookFlights', () => {
  it('round-trips the export envelope', () => {
    const f = flight();
    const json = JSON.stringify({ kind: 'debrief-logbook', version: 1, exportedAt: 1, flights: [f] });
    expect(parseLogbookFlights(json)).toEqual([f]);
  });

  it('accepts a bare array of flights too', () => {
    const f = flight();
    expect(parseLogbookFlights(JSON.stringify([f]))).toEqual([f]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseLogbookFlights('not json')).toEqual([]);
    expect(parseLogbookFlights('')).toEqual([]);
  });

  it('returns [] for the wrong shape', () => {
    expect(parseLogbookFlights(JSON.stringify({ kind: 'something-else' }))).toEqual([]);
    expect(parseLogbookFlights(JSON.stringify({ flights: 'nope' }))).toEqual([]);
    expect(parseLogbookFlights(JSON.stringify(42))).toEqual([]);
  });

  it('drops records missing the fields needed to reopen a flight', () => {
    const json = JSON.stringify({
      flights: [
        { id: 'ok', name: 'good.csv', text: 'T,Alt\n0,0\n' },
        { id: 'no-text', name: 'bad.csv' }, // no file text → can't reopen
        { name: 'no-id.csv', text: 'x' }, // no id → can't key it
        null,
        'garbage',
      ],
    });
    const out = parseLogbookFlights(json);
    expect(out.map((f) => f.id)).toEqual(['ok']);
  });

  // Export writes the WHOLE record; normalizeFlight rebuilt it field by field, and the two
  // fields it forgot are the two a flyer would most notice going missing. A restore is the only
  // insurance against Clear, so one that says it succeeded and quietly returns less is worse
  // than one that fails.
  it('carries the report caption and the paired device summary back in', () => {
    const f = flight({ caption: { label: 'L3 cert attempt', notes: 'Gusty, 12 kt' }, summaryText: 'DEVICE SUMMARY\nApogee,5280' });
    const [back] = parseLogbookFlights(JSON.stringify({ flights: [f] }));
    expect(back.caption).toEqual({ label: 'L3 cert attempt', notes: 'Gusty, 12 kt' });
    expect(back.summaryText).toBe('DEVICE SUMMARY\nApogee,5280');
  });

  it('rejects a malformed caption rather than blanking half of it', () => {
    const of = (caption: unknown) => parseLogbookFlights(JSON.stringify({ flights: [flight({ caption } as Partial<RecentFlight>)] }))[0];
    // A hand-edited backup must not be able to inject a shape the app then renders — and
    // "reject" has to mean reject: coercing a bad member to '' restores half of what the flyer
    // typed and still reports "Restored N flights", which is the failure this exists to end.
    // Each of these has ONE bad member and one good one, so a blanking implementation would
    // keep the good half and pass.
    expect(of({ label: 42, notes: 'Gusty, 12 kt' }).caption).toBeUndefined();
    expect(of({ label: 'Nimbus IV', notes: [] }).caption).toBeUndefined();
    expect(of('a string').caption).toBeUndefined();
    expect(of({ label: '', notes: '' }).caption, 'both blank is no caption, not an empty panel').toBeUndefined();
    // Whitespace is blank too — `saveCaption` deletes such a caption, so import must not
    // resurrect one that then rides back out through every reopen.
    expect(of({ label: '  ', notes: '\n' }).caption).toBeUndefined();
    // An ABSENT member is not a malformed one: a flyer who typed only a title typed something.
    expect(of({ label: 'Just a title' }).caption).toEqual({ label: 'Just a title', notes: '' });
  });

  it('drops a summary that is not text', () => {
    const of = (summaryText: unknown) => parseLogbookFlights(JSON.stringify({ flights: [flight({ summaryText } as Partial<RecentFlight>)] }))[0];
    expect(of(17).summaryText).toBeUndefined();
    expect(of('').summaryText, 'an empty summary is no summary').toBeUndefined();
  });

  it('fills sane defaults for optional/older fields', () => {
    const json = JSON.stringify({ flights: [{ id: 'x', name: 'f.csv', text: 'data' }] });
    const [f] = parseLogbookFlights(json);
    expect(f.formatLabel).toBe('Flight');
    expect(f.apogeeM).toBeNull();
    expect(f.maxVelocityMs).toBeNull();
    expect(f.note).toBe('');
    expect(typeof f.addedAt).toBe('number');
  });
});

// What makes two logbook entries the same flight — the predicate `saveRecent` replaces in
// place with. It is the pure half of that decision, so it can be pinned without IndexedDB;
// the store-level consequence (a same-named second flight gets its own row and its own id
// rather than deleting the first) is held by the e2e round-trip.
describe('isSameStoredFlight', () => {
  it('is the same flight when the name, the parser and the bytes all match', () => {
    expect(isSameStoredFlight(flight(), flight())).toBe(true);
  });

  it('is a DIFFERENT flight when two files share a name but not their contents', () => {
    // A logger that writes every export as `data.csv` gives a launch day six files with one
    // name. Keying identity on the name deleted five of them.
    const a = flight({ name: 'data.csv', text: 'T,Alt\n0,0\n1,120\n' });
    const b = flight({ name: 'data.csv', text: 'T,Alt\n0,0\n1,940\n' });
    expect(isSameStoredFlight(a, b)).toBe(false);
  });

  it('is a different flight when the same bytes were read by a different parser', () => {
    const a = flight({ formatLabel: 'Eggtimer' });
    const b = flight({ formatLabel: 'Generic CSV' });
    expect(isSameStoredFlight(a, b)).toBe(false);
  });

  it('is a different flight when the same contents arrive under another name', () => {
    expect(isSameStoredFlight(flight({ name: 'a.csv' }), flight({ name: 'b.csv' }))).toBe(false);
  });

  it('ignores everything a re-read can legitimately change', () => {
    // A reopen re-analyses the file, so the figures, the note, the id and the timestamp are
    // all free to differ; the flight is still the same flight, and must keep its address.
    const a = flight();
    const b = flight({ id: 'z9', addedAt: 1, apogeeM: 999, maxVelocityMs: 1, note: 'other' });
    expect(isSameStoredFlight(a, b)).toBe(true);
  });
});

describe('the stretch a flyer chose', () => {
  it('is restored from a backup, and a broken one is refused rather than half-applied', () => {
    // Same rule as the caption and the mapping: validated, not coerced. Half a window is not a
    // window — a restore that applied `from` and dropped `to` would read a different flight
    // and say "Restored N flights" while doing it.
    const base = { id: 'a', name: 'f.csv', text: 't' };
    const ok = parseLogbookFlights(JSON.stringify({ flights: [{ ...base, read: { fromS: 12.5, toS: 90 } }] }));
    expect(ok[0].read).toEqual({ fromS: 12.5, toS: 90 });

    for (const bad of [
      { fromS: 12.5 },
      { toS: 90 },
      { fromS: '12.5', toS: 90 },
      { fromS: 90, toS: 12.5 },
      { fromS: 12.5, toS: 12.5 },
      { fromS: Number.NaN, toS: 90 },
      'nonsense',
      null,
    ]) {
      const got = parseLogbookFlights(JSON.stringify({ flights: [{ ...base, read: bad }] }));
      expect(got, `read: ${JSON.stringify(bad)}`).toHaveLength(1);
      expect(got[0].read, `read: ${JSON.stringify(bad)}`).toBeUndefined();
    }
  });
});


// The backup file is how a logbook moves between machines, and it is rebuilt field by field
// on the way back in — which has now silently dropped three different members (the report
// caption, the chosen stretch, and the file's own bytes). So the round-trip is asserted.
describe('a backup carries the file itself, for the flights whose text is not the file', () => {
  const raw = (): RecentFlight =>
    flight({
      id: 'rff1',
      name: 'XPRS_Scratch.rff',
      formatLabel: 'MissileWorks RRC3 (raw .rff download)',
      // What `decodeBytes` makes of a binary file: a lossy view, which is exactly why the
      // bytes have to travel too.
      text: '\u0000\uFFFD\uFFFD\uFFFD',
      bytes: new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x80, 0x42, 0x00, 0x99, 0x7f]),
    });

  it('round-trips a raw download’s bytes through export and import', () => {
    const back = parseLogbookFlights(serializeLogbook([raw()], 1))[0];
    expect(back, 'the flight came back at all').toBeTruthy();
    expect(back.bytes, 'the file itself').toBeTruthy();
    expect([...(back.bytes as Uint8Array)]).toEqual([...(raw().bytes as Uint8Array)]);
  });

  it('does not write a bytes member for a flight that has none', () => {
    const json = serializeLogbook([flight()], 1);
    expect(json).not.toContain('bytesB64');
    expect(parseLogbookFlights(json)[0].bytes).toBeUndefined();
  });

  it('never writes the array form JSON.stringify would have made of it', () => {
    // `{"0":0,"1":1,…}` is what a Uint8Array serialises to untouched: a dozen characters per
    // byte, and unreadable on the way back. Its absence is the whole point of the base64 key.
    const json = serializeLogbook([raw()], 1);
    expect(json).not.toContain('"0":0');
    expect(json.length, 'a nine-byte file should not cost a hundred characters').toBeLessThan(json.replace(/"bytesB64":"[^"]*"/, '').length + 40);
  });

  it('refuses a hand-edited bytes member rather than handing a parser something else', () => {
    const good = JSON.parse(serializeLogbook([raw()], 1));
    for (const bad of [12, null, {}, '', '!!!not base64!!!']) {
      const doctored = { ...good, flights: [{ ...good.flights[0], bytesB64: bad }] };
      const back = parseLogbookFlights(JSON.stringify(doctored))[0];
      expect(back, `bytesB64=${JSON.stringify(bad)}: the flight still restores`).toBeTruthy();
      expect(back.bytes, `bytesB64=${JSON.stringify(bad)}: no bytes`).toBeUndefined();
    }
  });
});
