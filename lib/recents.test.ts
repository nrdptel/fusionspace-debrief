import { describe, it, expect } from 'vitest';
import { isSameStoredFlight, parseLogbookFlights, planPrune, replaceInPlace, toMeta, serializeLogbook, UNNOTED_MAX, type RecentFlight, type RecentMeta } from './recents';

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

/**
 * The guard that stops a FOURTH member going missing.
 *
 * `normalizeFlight` rebuilds a restored record field by field — deliberately, because a
 * hand-edited backup must not be able to inject a shape the app then trusts. The cost of that
 * choice is that every member has to be listed twice, and three times now the second listing
 * has been forgotten: the report caption a flyer typed, the stretch of the file they chose, and
 * the file's own bytes. Each was found after shipping, and the second two by review rather than
 * by the suite.
 *
 * So the fixture below is typed `Required<RecentFlight>`. Add a member to that interface —
 * optional or not — and this file stops COMPILING until the fixture populates it, and then the
 * round-trip fails until `normalizeFlight` carries it. Neither half can be satisfied by
 * accident, and neither depends on anyone remembering.
 */
describe('a backup carries every member of a flight, not the ones anyone remembered', () => {
  const everything: Required<RecentFlight> = {
    id: 'every1',
    name: 'Kairos-Booster-March-Telemega.eeprom',
    formatLabel: 'Altus Metrum (raw .eeprom download)',
    addedAt: 1_700_000_000_000,
    apogeeM: 2995.7,
    maxVelocityMs: 332.5,
    apogeeCaveats: { floor: true, unproven: true },
    flownAt: { stamp: '2024-03-23T18:54', zone: 'UTC' },
    note: 'K1103X, 12 mph crosswind',
    text: '{\n\t"log_format": 22\n}\n46 53 96 f6\n',
    bytes: new Uint8Array([0x46, 0x53, 0x96, 0xf6, 0x01, 0x00, 0xdf, 0xff]),
    summaryText: 'Rocket,Kairos\nApogee,9756 ft\n',
    highRateText: 'Flight_Time_(s),Gyro_X,Accel_X,Quat_1\n-0.10,1.2,0.01,1.00000\n-0.098,1.4,0.02,1.00000\n',
    caption: { label: 'Kairos booster, March', notes: 'Sustainer did not light.' },
    read: { fromS: 12.5, toS: 320.25 },
    mapping: [{ index: 0, role: 'time', unit: 's' }],
    flightId: 'every0',
  };

  it('round-trips every one of them through export and import', () => {
    const back = parseLogbookFlights(serializeLogbook([everything], 1))[0];
    expect(back, 'the flight came back at all').toBeTruthy();
    // Member by member, so a failure names the one that went missing rather than printing two
    // large objects side by side.
    for (const key of Object.keys(everything) as (keyof RecentFlight)[]) {
      if (key === 'bytes') {
        expect([...(back.bytes as Uint8Array)], 'bytes').toEqual([...(everything.bytes as Uint8Array)]);
        continue;
      }
      expect(back[key], `${key} did not survive the backup`).toEqual(everything[key]);
    }
    // …and nothing extra rode along, which would mean the file carries something the type
    // does not describe.
    expect(new Set(Object.keys(back))).toEqual(new Set(Object.keys(everything)));
  });
});

/**
 * Reopening a flight is a SAVE — the same replace-in-place a re-drop of the file is — so
 * everything the flyer decided ABOUT the file has to come through it. What the file itself
 * says is re-read, because a parser that has learned something since should be allowed to
 * give a better answer.
 *
 * This is the rule that lost the chosen stretch. `saveRecent` carried three named members
 * forward and `read` was not one of them, so a cropped flight survived ONE reload (the crop
 * was read from storage on the way in, and wiped on the way back out) and reverted to the
 * whole file on the second — a launch-day record silently reporting a flight time spanning
 * two flights, with nothing on screen to say the flyer's own answer had been discarded.
 *
 * `saveRecent` itself only runs in a browser, which is exactly how that shipped with a green
 * suite. The rule is pure and tested here instead.
 */
describe('reopening a flight keeps what the flyer decided and re-reads what the file says', () => {
  const stored = (over: Partial<RecentFlight> = {}): RecentFlight =>
    flight({
      id: 'kept',
      note: 'H128, clear day',
      caption: { label: 'L2 attempt', notes: 'Chute tangled.' },
      read: { fromS: 40, toS: 180 },
      summaryText: 'Rocket,Nike\nApogee,2487 ft\n',
      flightId: 'kept',
      ...over,
    });

  /** What a reopen hands `saveRecent`: the fresh read of the file, and nothing the flyer typed. */
  const reread = { name: 'flight.csv', formatLabel: 'Generic CSV', apogeeM: 1240, maxVelocityMs: 215, text: 'T,Alt\n0,0\n' };

  it('keeps every member the flyer owns', () => {
    const out = replaceInPlace(reread, [stored()]);
    expect(out.note, 'the logbook note').toBe('H128, clear day');
    expect(out.caption, 'the report label and notes').toEqual({ label: 'L2 attempt', notes: 'Chute tangled.' });
    expect(out.read, 'the stretch they said was their flight').toEqual({ fromS: 40, toS: 180 });
    expect(out.summaryText, 'the device summary it was paired with').toBe('Rocket,Nike\nApogee,2487 ft\n');
    expect(out.flightId, 'which flight this is a recording of').toBe('kept');
  });

  it('takes the file’s own figures from the fresh read, not from the stored copy', () => {
    const out = replaceInPlace(reread, [stored()]);
    expect(out.apogeeM, 'a re-read apogee wins — a parser fix should reach an old flight').toBe(1240);
    expect(out.maxVelocityMs).toBe(215);
  });

  it('reads the flyer’s members off the NEWEST stored copy, as a set', () => {
    // A save deletes the extra copies, but a restored backup can put an older row for the same
    // file back beside a newer one. Taking each member from whichever copy happens to have it
    // mixes two moments into a state that never existed — so the newest copy answers for all of
    // them, including by NOT having one.
    const newer = stored({ id: 'newer', addedAt: 2_000, read: undefined, caption: undefined });
    const older = stored({ id: 'older', addedAt: 1_000 });
    const out = replaceInPlace(reread, [older, newer]);
    expect(out.read, 'the newer copy has no crop, so neither does the result').toBeUndefined();
    expect(out.caption).toBeUndefined();
    expect(out.note, 'the members the newer copy DOES carry still come through').toBe('H128, clear day');
  });

  it('lets an incoming value win where the caller supplies one', () => {
    // The batch drop path re-pairs a device summary as it reads the folder; that reading is
    // newer than whatever was stored.
    const out = replaceInPlace({ ...reread, summaryText: 'Rocket,Nike\nApogee,2490 ft\n' }, [stored()]);
    expect(out.summaryText).toBe('Rocket,Nike\nApogee,2490 ft\n');
  });

  it('writes no member for a first save of a file the logbook has never seen', () => {
    const out = replaceInPlace(reread, []);
    expect(out.note, 'a flight with no note has an empty one, not a missing one').toBe('');
    expect('caption' in out).toBe(false);
    expect('read' in out).toBe(false);
    expect('summaryText' in out).toBe(false);
    expect('flightId' in out).toBe(false);
  });
});

/**
 * The prune keeps the last `UNNOTED_MAX` FLIGHTS a flyer hasn't noted, plus every noted one.
 * Counting rows instead took a two-altimeter flight apart one recording at a time.
 */
describe('the prune keeps flights, not files', () => {
  const at = (n: number) => 1_700_000_000_000 + n * 1000;
  const rec = (id: string, n: number, over: Partial<RecentFlight> = {}): RecentFlight =>
    flight({ id, name: `${id}.csv`, addedAt: at(n), note: '', text: `t${id}`, ...over });

  it('keeps the whole window when every flight is one recording', () => {
    const rows = Array.from({ length: UNNOTED_MAX + 3 }, (_, i) => rec(`u${i}`, i));
    // The incoming flight fills one slot, so UNNOTED_MAX - 1 of these survive.
    const dropped = planPrune(rows).map((r) => r.id);
    expect(dropped).toHaveLength(rows.length - (UNNOTED_MAX - 1));
    expect(dropped, 'the oldest go, newest of them first').toEqual(['u3', 'u2', 'u1', 'u0']);
  });

  it('never takes one recording of a flight and leaves the rest', () => {
    // The two recordings of one flight are the two OLDEST rows, so a row-counting prune reaches
    // them one at a time — and takes exactly one, because the window closes in between.
    const pair = [rec('p', 0, { flightId: 'p' }), rec('q', 1, { flightId: 'p' })];
    const rest = Array.from({ length: UNNOTED_MAX }, (_, i) => rec(`u${i}`, 10 + i));
    const dropped = planPrune([...pair, ...rest]).map((r) => r.id);
    const kept = [...pair, ...rest].filter((r) => !dropped.includes(r.id)).map((r) => r.id);
    for (const halves of [['p', 'q']]) {
      const inKept = halves.filter((id) => kept.includes(id)).length;
      expect(inKept === 0 || inKept === halves.length, `the flight went whole, not by halves (kept ${inKept} of 2)`).toBe(true);
    }
  });

  it('keeps a noted flight’s OTHER recordings, which can never carry a note themselves', () => {
    // The note is written on the row the logbook shows — the recording that reports the flight.
    // Counting rows, the backup recording read as un-noted and was deleted for good while the
    // flight it belongs to was kept: a cert flight that cannot be protected.
    const cert = [rec('cert-p', 0, { flightId: 'cert-p', note: 'L2 cert' }), rec('cert-s', 1, { flightId: 'cert-p' })];
    const rest = Array.from({ length: UNNOTED_MAX + 2 }, (_, i) => rec(`u${i}`, 10 + i));
    const dropped = planPrune([...cert, ...rest]).map((r) => r.id);
    expect(dropped, 'neither half of the noted flight goes').not.toContain('cert-p');
    expect(dropped).not.toContain('cert-s');
    expect(dropped.length, 'the un-noted flights still make room').toBeGreaterThan(0);
  });

  it('counts a flight as recent as its most recent recording', () => {
    // A backup file dropped today keeps the flight in the window even though the primary was
    // opened weeks ago — they are one flight and it was just looked at.
    const old = [rec('old-p', 0, { flightId: 'old-p' }), rec('old-s', 999, { flightId: 'old-p' })];
    const rest = Array.from({ length: UNNOTED_MAX }, (_, i) => rec(`u${i}`, 10 + i));
    const dropped = planPrune([...old, ...rest]).map((r) => r.id);
    expect(dropped).not.toContain('old-p');
    expect(dropped).not.toContain('old-s');
  });
});

describe('a reopen does not resurrect what the flyer cleared', () => {
  it('reads the flyer’s members from the most recently stored copy of the file', () => {
    // The inverse of the loss `replaceInPlace` exists to prevent, and reachable: crop a flight,
    // export a backup, Clear, re-drop the file (a fresh row, no crop), restore the backup (the
    // old row, with the crop). Two rows for one file. Taking each member from "the first copy
    // that has it" reads whichever the store happened to return first — which can be the answer
    // the flyer already threw away.
    const cleared: RecentFlight = flight({ id: 'new', addedAt: 2_000, note: '' });
    const stale: RecentFlight = flight({
      id: 'old',
      addedAt: 1_000,
      note: 'from before',
      caption: { label: 'old title', notes: '' },
      read: { fromS: 5, toS: 9 },
      flightId: 'somewhere-else',
    });
    const reread = { name: 'flight.csv', formatLabel: 'Generic CSV', apogeeM: 1, maxVelocityMs: 1, text: 'T,Alt\n0,0\n' };

    const out = replaceInPlace(reread, [stale, cleared]);
    expect(out.read, 'a cancelled crop stays cancelled').toBeUndefined();
    expect(out.caption, 'a deleted caption stays deleted').toBeUndefined();
    expect(out.flightId, 'a separated flight stays separated').toBeUndefined();
    expect(out.note, 'and a cleared note stays cleared').toBe('');

    // …and the newest copy's own values still come through when it HAS them.
    const kept = replaceInPlace(reread, [stale, { ...cleared, read: { fromS: 1, toS: 2 } }]);
    expect(kept.read).toEqual({ fromS: 1, toS: 2 });
  });
});

/**
 * The list projection, held to the same rule as the backup round-trip. `Required<RecentMeta>`
 * means adding a member to that interface stops this file COMPILING until the fixture populates
 * it, and then fails until `toMeta` carries it.
 *
 * This is the third place a row's members have to be named, and the quietest one to get wrong:
 * a member the projection drops is still stored, still survives a backup, and is simply
 * invisible on every surface — nothing throws, and nothing fails, because `listRecents` itself
 * only ever runs against a browser's IndexedDB.
 */
describe('the list projection carries every member the list can show', () => {
  const everything: Required<RecentMeta> = {
    id: 'm1',
    name: 'BlRv_SN1537_LR.csv',
    formatLabel: 'Featherweight Blue Raven',
    addedAt: 1_700_000_000_000,
    apogeeM: 3586.1,
    maxVelocityMs: 427.0,
    apogeeCaveats: { floor: true },
    flownAt: { stamp: '2025-04-12T12:45', zone: 'UTC' },
    note: 'L3 cert, M1297',
    read: { fromS: 12.5, toS: 320.25 },
    flightId: 'm0',
  };

  it('round-trips every one of them', () => {
    const out = toMeta({ ...everything, text: 'T,Alt\n0,0\n' });
    for (const key of Object.keys(everything) as (keyof RecentMeta)[]) {
      expect(out[key], `${key} did not survive the projection`).toEqual(everything[key]);
    }
    expect(new Set(Object.keys(out)), 'and nothing extra came along').toEqual(new Set(Object.keys(everything)));
  });

  it('fills the defaults an older record predates, and omits what it never had', () => {
    const bare = toMeta({ id: 'x', name: 'f.csv', formatLabel: 'Generic CSV', addedAt: 1, apogeeM: null, maxVelocityMs: null, note: '', text: 't' });
    expect(bare.maxVelocityMs).toBeNull();
    expect(bare.note).toBe('');
    expect('flownAt' in bare, 'absent, not null — a surface branches on presence').toBe(false);
    expect('flightId' in bare).toBe(false);
  });
});
