import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
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
});
