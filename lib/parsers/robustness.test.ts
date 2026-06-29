import { describe, it, expect } from 'vitest';
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
