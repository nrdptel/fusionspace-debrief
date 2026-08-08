import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight, PARSERS } from './parsers/index';
import { canonicalParser } from './parsers/canonical';
import { ParseGuidanceError } from './parsers/types';
import { buildFlight } from './flight/build';
import { analyzeFlight } from './analyze';
import { decodeBytes } from './encoding';
import { CANONICAL_SCHEMA, CanonicalFormatError, fromCanonical, looksCanonical, toCanonical } from './canonical';
import { FLIGHT_FILE_EXTENSIONS } from './fileAccept';
import type { RawFlight } from './flight/types';

/**
 * D11's *done when*, as an assertion golden values cannot produce: a canonical export of the
 * internal flight model round-trips losslessly, and the re-imported flight carries the same
 * readings, the same provenance and the same structure.
 *
 * A golden value pins the numbers somebody thought to assert. This pins EVERY number, and it
 * does it without anyone choosing which: the flight that comes back either analyses to the same
 * digest as the flight that went out, or it does not.
 */

const FIXTURES = fileURLToPath(new URL('./parsers/__fixtures__/', import.meta.url));
const CORPUS = fileURLToPath(new URL('./parsers/__corpus__/', import.meta.url));

/** Same shape as the corpus suite's own digest, over the whole analysis. */
function digestOf(analysis: ReturnType<typeof analyzeFlight>): string {
  let h = 0x811c9dc5;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const num = (v: unknown): string => {
    if (typeof v !== 'number') return String(v);
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
    return v.toPrecision(12);
  };
  const { metrics, events, series, warnings } = analysis;
  for (const k of Object.keys(metrics).sort()) feed(`m:${k}=${num((metrics as unknown as Record<string, unknown>)[k])};`);
  for (const e of events) feed(`e:${e.type}|${e.label}@${num(e.time)}#${e.index}^${num(e.altitude)}~${e.provenance}!${num(e.peakAccel)};`);
  for (const w of warnings) feed(`w:${w};`);
  for (const k of Object.keys(series).sort()) {
    const v = (series as unknown as Record<string, unknown>)[k];
    if (v instanceof Float64Array) {
      feed(`s:${k}[${v.length}]`);
      for (let i = 0; i < v.length; i++) feed(num(v[i]));
      feed(';');
    }
  }
  return (h >>> 0).toString(16);
}

/** Read a file the way the app does, including the generic-mapper path. */
function flightFrom(file: string): RawFlight | null {
  const bytes = readFileSync(file);
  const name = file.split('/').pop() as string;
  let res;
  try {
    res = importFlight({ name, text: decodeBytes(bytes), bytes });
  } catch {
    return null;
  }
  if (res.kind === 'flight') return res.flight;
  if (res.kind !== 'mapping') return null;
  const roles = res.table.columns.map((c) => c.role);
  if (!(roles.includes('time') && (roles.includes('altitude') || roles.includes('pressure')))) return null;
  const mappings = res.table.columns
    .filter((c) => c.role !== 'ignore')
    .map((c) => ({ index: c.index, role: c.role, unit: c.unit }));
  return buildFlight({
    source: name,
    format: 'generic',
    formatLabel: 'Generic CSV',
    headers: res.table.headers,
    dataRows: res.table.dataRows,
    mappings,
    reported: res.table.reported,
  });
}

function logFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e.startsWith('.') || e === 'scripts' || e === '_ground-truth-docs') continue;
      const p = `${d}/${e}`;
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      // `.json` is deliberately excluded: the corpus carries `expected.json`, which is a
      // contract rather than a flight.
      else if (/\.(csv|txt|tsv|dat|pf2|eeprom|rff|log)$/i.test(e) && s.size < 60_000_000) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Field-by-field, because a values-only comparison cannot see a dropped flag. */
function expectSameFlight(back: RawFlight, orig: RawFlight, where: string) {
  expect(back.format, `${where}: format`).toBe(orig.format);
  expect(back.formatLabel, `${where}: formatLabel`).toBe(orig.formatLabel);
  expect(back.meta, `${where}: meta steers the analysis and must survive verbatim`).toEqual(orig.meta);
  expect(back.notes, `${where}: notes carry the claims that make a reduced trace honest`).toEqual(orig.notes);

  // Presence is a signal in this model — `predicted` sits outside `channels` precisely so the
  // analyzer never sees it — so absent must come back absent, not as an empty array.
  expect('flownAt' in back, `${where}: flownAt presence`).toBe('flownAt' in orig);
  expect('reported' in back, `${where}: reported presence`).toBe('reported' in orig);
  expect('repeatedSpans' in back, `${where}: repeatedSpans presence`).toBe('repeatedSpans' in orig);
  expect('predicted' in back, `${where}: predicted presence`).toBe('predicted' in orig);
  expect(back.flownAt, `${where}: flownAt`).toEqual(orig.flownAt);
  expect(back.reported, `${where}: reported`).toEqual(orig.reported);
  expect(back.repeatedSpans, `${where}: repeatedSpans`).toEqual(orig.repeatedSpans);

  expect(back.time.length, `${where}: sample count`).toBe(orig.time.length);
  expect(back.channels.length, `${where}: channel count`).toBe(orig.channels.length);

  const sameSeries = (a: Float64Array, b: Float64Array, what: string) => {
    expect(a.length, `${where}: ${what} length`).toBe(b.length);
    for (let i = 0; i < b.length; i++) {
      // Object.is, so a NaN gap compares equal to a NaN gap and 0 does NOT stand in for one.
      // This is the assertion that catches JSON's `NaN -> null -> 0`, which would turn a GPS
      // dropout into a real 0 m reading.
      if (!Object.is(a[i], b[i])) {
        throw new Error(`${where}: ${what}[${i}] is ${String(a[i])}, was ${String(b[i])}`);
      }
    }
  };
  sameSeries(back.time, orig.time, 'time');
  orig.channels.forEach((c, i) => {
    const b = back.channels[i];
    expect(b.kind, `${where}: channel ${i} kind`).toBe(c.kind);
    expect(b.label, `${where}: channel ${i} label`).toBe(c.label);
    expect(b.unit, `${where}: channel ${i} unit`).toBe(c.unit);
    // `gravityRemoved` is knowledge only a parser has, and it is optional — so presence, not
    // truthiness. Dropped, the same flight reads at two different peak accelerations.
    expect('gravityRemoved' in b, `${where}: channel ${i} gravityRemoved presence`).toBe('gravityRemoved' in c);
    expect(b.gravityRemoved, `${where}: channel ${i} gravityRemoved`).toBe(c.gravityRemoved);
    sameSeries(b.values, c.values, `channel ${i} (${c.label})`);
  });
}

describe('a canonical flight record round-trips the model it was written from', () => {
  const fixtures = logFiles(FIXTURES);

  it('reads every committed fixture back as the same flight, and to the same analysis', () => {
    expect(fixtures.length, 'fixtures to round-trip').toBeGreaterThan(5);
    let checked = 0;
    for (const file of fixtures) {
      const orig = flightFrom(file);
      if (!orig) continue;
      const back = fromCanonical(toCanonical(orig));
      expectSameFlight(back, orig, file.slice(FIXTURES.length));

      // …and the whole way through the analyzer, which is the claim that matters: same
      // readings, same events, same provenance, same warnings, same derived series.
      expect(digestOf(analyzeFlight(back)), `${file.slice(FIXTURES.length)}: analysis digest`).toBe(
        digestOf(analyzeFlight(orig)),
      );
      checked++;
    }
    expect(checked, 'fixtures that produced a flight').toBeGreaterThan(5);
    console.log(`canonical round-trip: ${checked} committed fixtures`);
  });

  it('reads every corpus recording back as the same flight, and to the same analysis', () => {
    if (!existsSync(CORPUS)) {
      console.log('canonical round-trip: NO CORPUS — this assertion did not run');
      return;
    }
    const files = logFiles(CORPUS);
    let checked = 0;
    for (const file of files) {
      const orig = flightFrom(file);
      if (!orig) continue;
      const back = fromCanonical(toCanonical(orig));
      expectSameFlight(back, orig, file.slice(CORPUS.length));
      expect(digestOf(analyzeFlight(back)), `${file.slice(CORPUS.length)}: analysis digest`).toBe(
        digestOf(analyzeFlight(orig)),
      );
      checked++;
    }
    // A sweep that examined nothing prints almost exactly like one that passed, so name the
    // count and fail if the corpus is present but yielded nothing.
    expect(checked, 'corpus recordings that produced a flight').toBeGreaterThan(20);
    console.log(`canonical round-trip: ${checked} corpus recordings`);
  });

  it('carries a NaN gap across as a gap, not as a zero', () => {
    // The single most damaging thing a naive JSON does to this model. `altitudeGps` is NaN
    // wherever the receiver had no fix, and `JSON.stringify(NaN)` is `null` while
    // `Float64Array.from([null])[0]` is 0 — so the gap would come back as a real 0 m reading.
    const flight: RawFlight = {
      source: 'gap.csv',
      format: 'test',
      formatLabel: 'Test',
      time: Float64Array.from([0, 1, 2]),
      channels: [
        { kind: 'altitudeGps', label: 'GPS alt', unit: 'm', values: Float64Array.from([10, NaN, 30]) },
        { kind: 'accelAxial', label: 'Ax', unit: 'm/s^2', values: Float64Array.from([1, 2, 3]), gravityRemoved: true },
      ],
      meta: {},
      notes: [],
    };
    const back = fromCanonical(toCanonical(flight));
    expect(Number.isNaN(back.channels[0].values[1]), 'the gap is still a gap').toBe(true);
    expect(back.channels[0].values[1], 'and specifically is not 0').not.toBe(0);
    expect(back.channels[1].gravityRemoved, 'gravityRemoved survives').toBe(true);
  });

  it('is registered first, so a tie cannot hand the file to another parser', () => {
    // `importFlight` keeps a match only on a strict `score > best.score`, so ties go to the
    // earliest entry. Appended last, this parser would lose every tie it drew.
    expect(PARSERS[0]).toBe(canonicalParser);
  });

  it('is what actually opens the file the app writes', () => {
    const flight: RawFlight = {
      source: 'written.csv',
      format: 'test',
      formatLabel: 'Test',
      time: Float64Array.from([0, 1]),
      channels: [{ kind: 'altitude', label: 'Alt', unit: 'm', values: Float64Array.from([0, 5]) }],
      meta: { device: 'x' },
      notes: ['a note'],
    };
    const text = toCanonical(flight);
    expect(looksCanonical(text)).toBe(true);
    const res = importFlight({ name: 'flight.json', text, bytes: new TextEncoder().encode(text) });
    // Not the column mapper. Before the parser existed this returned kind:'mapping' and the
    // flight that came back was a different flight.
    expect(res.kind, 'a canonical record is a flight, not a table to be mapped').toBe('flight');
    if (res.kind === 'flight') {
      expect(res.flight.meta).toEqual({ device: 'x' });
      expect(res.flight.notes).toEqual(['a note']);
    }
  });

  it('refuses a record it cannot read fully, rather than reading part of it', () => {
    expect(() => fromCanonical('not json')).toThrow(CanonicalFormatError);
    expect(() => fromCanonical(JSON.stringify({ schema: 'debrief.flight/1' }))).toThrow(/debrief\.record\/1/);
    // A channel kind a newer Debrief wrote. Widening it to 'other' would let a sensor-frame
    // trace be read as something the analyzer computes readings from.
    const withUnknown = JSON.stringify({
      schema: CANONICAL_SCHEMA,
      source: 'x',
      format: 'test',
      formatLabel: 'Test',
      time: [0, 1],
      channels: [{ kind: 'somethingNew', label: 'X', unit: 'm', values: [0, 1] }],
      meta: {},
      notes: [],
    });
    expect(() => fromCanonical(withUnknown)).toThrow(/does not know how to read/);
    // A channel whose length disagrees with the time base is not a flight with a short channel;
    // it is a corrupt record.
    const ragged = JSON.stringify({
      schema: CANONICAL_SCHEMA,
      source: 'x',
      format: 'test',
      formatLabel: 'Test',
      time: [0, 1, 2],
      channels: [{ kind: 'altitude', label: 'Alt', unit: 'm', values: [0, 1] }],
      meta: {},
      notes: [],
    });
    expect(() => fromCanonical(ragged)).toThrow(/2 values against 3 times/);
  });

  it('is offered by the file picker, which must never be narrower than what the app reads', () => {
    expect(FLIGHT_FILE_EXTENSIONS).toContain('.json');
  });
});

describe('a logbook backup is explained, not handed to the column mapper', () => {
  // `.json` became a flight extension when the flight record shipped, so the whole-logbook
  // backup is now a file a flyer can PICK on the analyze page — where before it could only
  // arrive by a drop that bypassed the accept list. Both routes end in the same place, and the
  // right answer is a sentence naming the surface that restores it.
  it('names the logbook rather than offering to map its columns', () => {
    const backup = JSON.stringify({ kind: 'debrief-logbook', version: 1, exportedAt: 0, flights: [] });
    const open = () =>
      importFlight({ name: 'debrief-logbook.json', text: backup, bytes: new TextEncoder().encode(backup) });
    // A `ParseGuidanceError` is what `importFlight` surfaces to the flyer directly, instead of
    // falling back to the mapper — the same route `deviceSummaryParser` takes.
    expect(open).toThrow(ParseGuidanceError);
    expect(open).toThrow(/Recent flights/);
  });
});
