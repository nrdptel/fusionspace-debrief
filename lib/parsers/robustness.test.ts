import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeBytes } from '../encoding';
import { importFlight } from './index';
import { ParseGuidanceError, type Parser } from './types';
import type { RawFlight } from '../flight/types';
import { buildFlight } from '../flight/build';
import { analyzeFlight } from '../analyze';

// Real altimeter exports arrive with BOMs, CRLF endings and assorted delimiters.
// A generic CSV comes back as a mapping suggestion; apply it and analyze, so we're
// checking the columns were guessed and read correctly end to end — not just that
// nothing threw.
function readGeneric(name: string, text: string): { roles: string[]; apogeeM: number } {
  const r = importFlight({ name, text });
  if (r.kind === 'flight') {
    return { roles: ['(auto)'], apogeeM: analyzeFlight(r.flight).metrics.apogeeAltitude };
  }
  const roles = r.table.headers.map((_, i) => r.suggested.find((s) => s.index === i)?.role ?? 'ignore');
  const flight = buildFlight({
    source: name,
    format: 'csv',
    formatLabel: 'Generic CSV',
    headers: r.table.headers,
    dataRows: r.table.dataRows,
    mappings: r.suggested,
  });
  return { roles, apogeeM: analyzeFlight(flight).metrics.apogeeAltitude };
}

const body = [0, 0, 5, 12, 20, 14, 6, 0].map((a, i) => `${(i * 0.1).toFixed(1)},${a}`).join('\n');

describe('import robustness', () => {
  it('strips a UTF-8 BOM so the first header still guesses', () => {
    const { roles } = readGeneric('bom.csv', '﻿time,altitude\n' + body);
    expect(roles[0]).toBe('time'); // not "﻿time"
    expect(roles[1]).toBe('altitude');
  });

  it('reads CRLF and semicolon variants to the same columns and apogee as plain CSV', () => {
    const lf = readGeneric('lf.csv', 'time,altitude\n' + body);
    const crlf = readGeneric('crlf.csv', ('time,altitude\n' + body).replace(/\n/g, '\r\n'));
    const semi = readGeneric('semi.csv', ('time,altitude\n' + body).replace(/,/g, ';'));
    expect(crlf.roles).toEqual(lf.roles);
    expect(semi.roles).toEqual(lf.roles);
    expect(crlf.apogeeM).toBeCloseTo(lf.apogeeM, 6);
    expect(semi.apogeeM).toBeCloseTo(lf.apogeeM, 6);
  });

  it('never throws on malformed input — ragged rows, junk footer, header-only', () => {
    const bad = [
      'time,altitude,velocity\n0,0\n0.1,5,50,EXTRA\n0.2,12,80\n0.3', // ragged
      'time,altitude\n0,0\n0.1,5\n0.2,12\n--- end of log ---\nbattery ok', // junk footer
      'time,altitude,velocity', // header only
      'a,b,c\nx,y,z', // all non-numeric
    ];
    for (const text of bad) {
      expect(() => {
        const r = importFlight({ name: 'bad.csv', text });
        if (r.kind === 'flight') analyzeFlight(r.flight);
      }).not.toThrow();
    }
  });

  it('reads a lone-CR (classic Mac) file like any other', () => {
    const lf = readGeneric('lf.csv', 'time,altitude\n' + body);
    const cr = readGeneric('cr.csv', ('time,altitude\n' + body).replace(/\n/g, '\r'));
    expect(cr.roles).toEqual(lf.roles);
    expect(cr.apogeeM).toBeCloseTo(lf.apogeeM, 6);
  });

  it('reads a European semicolon CSV (comma decimals) to the same apogee', () => {
    const lf = readGeneric('lf.csv', 'time,altitude\n' + body);
    // The same flight, European-locale: ';' delimiter and ',' as the decimal point.
    const euText =
      'time;altitude\n' +
      [0, 0, 5, 12, 20, 14, 6, 0].map((a, i) => `${(i * 0.1).toFixed(1).replace('.', ',')};${a}`).join('\n');
    const eu = readGeneric('eu.csv', euText);
    expect(eu.apogeeM).toBeCloseTo(lf.apogeeM, 6);
  });

  it('falls back to the column mapper when a recognised parser throws', () => {
    const throwing: Parser = {
      id: 'boom',
      label: 'Boom',
      detect: () => 1, // claims the file with full confidence…
      parse: () => {
        throw new Error('corrupt body');
      }, // …then can't read it
    };
    const r = importFlight({ name: 'x.csv', text: 'time,altitude\n' + body }, [throwing]);
    expect(r.kind).toBe('mapping'); // salvageable by hand, not a dead-end error
  });

  it('falls back to the column mapper when a recognised parser returns an empty flight', () => {
    const empty: Parser = {
      id: 'empty',
      label: 'Empty',
      detect: () => 1,
      parse: (): RawFlight => ({
        source: 'x',
        format: 'x',
        formatLabel: 'X',
        time: new Float64Array(0),
        channels: [],
        meta: {},
        notes: [],
      }),
    };
    const r = importFlight({ name: 'x.csv', text: 'time,altitude\n' + body }, [empty]);
    expect(r.kind).toBe('mapping');
  });

  it('recognizes a roll-rate column and reads the spin', () => {
    const csv =
      'time,altitude,Roll Rate (deg/s)\n' + [0, 0, 5, 12, 20, 14, 6, 0].map((a, i) => `${(i * 0.1).toFixed(1)},${a},720`).join('\n');
    const r = importFlight({ name: 'roll.csv', text: csv });
    if (r.kind !== 'mapping') throw new Error('expected the generic mapper');
    const roll = r.suggested.find((s) => s.role === 'rollRate');
    expect(roll).toBeDefined();
    expect(roll!.unit).toBe('deg/s'); // unit read from the header bracket
    const flight = buildFlight({
      source: 'roll.csv',
      format: 'csv',
      formatLabel: 'Generic CSV',
      headers: r.table.headers,
      dataRows: r.table.dataRows,
      mappings: r.suggested,
    });
    expect(analyzeFlight(flight).metrics.peakRollRate).toBeCloseTo(720, 0);
  });

  it('surfaces a parser’s deliberate guidance message instead of falling back', () => {
    // A ParseGuidanceError is the parser saying "I recognise this, and here's what's
    // wrong" (e.g. wrong file of a pair) — that must reach the user, not be hidden.
    const guided: Parser = {
      id: 'guided',
      label: 'Guided',
      detect: () => 1,
      parse: () => {
        throw new ParseGuidanceError('Upload the low-rate file instead.');
      },
    };
    expect(() => importFlight({ name: 'x.csv', text: 'time,altitude\n' + body }, [guided])).toThrow(
      'Upload the low-rate file instead.',
    );
  });
});

// A raw download off a card is bytes, and bytes arrive damaged: a card pulled mid-write, a
// transfer that stopped, a file copied off a failing SD. A text parser meets that as a short
// row and moves on; a binary parser meets it as a length field claiming ninety megabytes, a
// record header halfway through the file, or a size that outruns the buffer. None of those
// may crash the tab or spin it — a refusal is a fine outcome, a hang is not.
//
// `HANG_MS` is what one trial is allowed before it counts as a spin rather than slow work. It is
// named rather than inlined because the guard at the foot of this block holds the suite's own
// timeout against it.
const HANG_MS = 8000;

describe('a damaged raw download is refused, not survived by luck', () => {
  const CORPUS = fileURLToPath(new URL('./__corpus__/', import.meta.url));
  const FILES = [
    'altusmetrum/altusmetrum__issuiuc-kairos-20240323__Kairos-Booster-March-Telemega.eeprom',
    'missileworks-rrc3/missileworks-rrc3__xprs2015__XPRS_Scratch_2015.rff',
  ].filter((f) => existsSync(CORPUS + f));

  it.skipIf(FILES.length === 0)('takes 120 truncated and corrupted files without crashing or hanging', () => {
    // Deterministic, so a failure is reproducible rather than a story about one CI run.
    let rng = 12345;
    const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    for (const f of FILES) {
      const orig = new Uint8Array(readFileSync(CORPUS + f));
      const name = f.split('/').pop() as string;
      for (let trial = 0; trial < 60; trial++) {
        const bytes = orig.slice(0, Math.max(1, Math.floor(rand() * orig.length)));
        for (let k = 0; k < 12; k++) bytes[Math.floor(rand() * bytes.length)] = Math.floor(rand() * 256);
        const started = Date.now();
        try {
          importFlight({ name, text: decodeBytes(bytes), bytes });
        } catch {
          // A ParseGuidanceError, or any refusal, is the right answer for a broken file.
        }
        const ms = Date.now() - started;
        expect(ms, `${name} trial ${trial} (${bytes.length} bytes) took ${ms} ms`).toBeLessThan(
          HANG_MS,
        );
      }
    }
  });

  // The assertion above could not fire. It gives ONE trial 8,000 ms inside a test the suite
  // default killed at 5,000 ms, so a parser that spun on a damaged file was reported as a bare
  // vitest timeout — losing the message directly above it, which names the file, the trial and
  // the byte count that caused it. An assert that cannot fail is worse than no assert, and this
  // one had been unreachable since it was written.
  //
  // So the two numbers are now held in a relationship rather than each being chosen alone: the
  // suite must give this test enough room for one trial to reach its own bound and still report
  // it. Falsified by putting `testTimeout` back to 5_000, which names both numbers.
  it('the per-trial hang bound is reachable, not pre-empted by the suite timeout', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../vitest.config.ts', import.meta.url)),
      'utf8',
    );
    const m = src.match(/testTimeout:\s*([\d_]+)/);
    // A regex that stopped matching must go red here rather than quietly pass on a `?? Infinity`.
    expect(m, 'vitest.config.ts states an explicit testTimeout').toBeTruthy();
    const suiteMs = Number(m![1].replace(/_/g, ''));

    // Room for the one slow trial AND the other 119, which measured ~1.6 s in total.
    expect(
      suiteMs,
      `suite timeout ${suiteMs} ms must exceed the ${HANG_MS} ms this test allows a single trial`,
    ).toBeGreaterThan(HANG_MS * 2);
  });
});
