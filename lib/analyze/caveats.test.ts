import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { importFlight } from '../parsers';
import { analyzeFlight } from './index';
import { hasCaveatToken } from '../caveatTokens';
import { renderCaveats } from '../caveatUnits';
import { summaryText, summaryMarkdown, summaryHtml, analysisJson } from '../report';
import type { RawFlight } from '../flight/types';
import type { FlightAnalysis } from './types';

/** A caveat that names a length or a speed must do it with a TOKEN, never with a baked SI unit.
 *
 *  The defect this closes, found by a cold walk on 2026-08-02: a report set to feet showed an
 *  apogee of 9,322 ft and then three sentences saying the altitudes read "about 93 m too high" and
 *  to check "before taking 93 m off it". A flyer who subtracts 93 from 9,322 is about 200 ft out,
 *  and nothing on the page says the two figures are in different units. The caveat whose job is to
 *  prevent a wrong altitude was the one asking for the wrong arithmetic.
 *
 *  `lib/analyze` cannot format for the flyer — it is unit-agnostic by contract — so it emits
 *  `{{len:93}}` and the render layer substitutes. These tests hold both ends. */

const CORPUS = join(process.cwd(), 'lib/parsers/__corpus__');
const present = existsSync(CORPUS);

/** A number immediately followed by a bare SI length or speed unit — `93 m`, `1200m`, `54 m/s`.
 *
 *  Deliberately narrow. It must not fire on `9,322 ft`, on `3.3×`, on a percentage, or on the
 *  word "metres" spelled out in prose; what it catches is exactly the shape a template literal
 *  produces when someone writes `${Math.round(x)} m`. */
const BAKED_SI = /\d\s?m(?:\/s)?(?![a-zA-Z0-9])/;

function corpusFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(csv|txt|eeprom|rff|tsv)$/i.test(e.name)) out.push(p);
    }
  };
  walk(CORPUS);
  return out;
}

interface Read {
  file: string;
  flight: RawFlight;
  analysis: FlightAnalysis;
}

function corpusReads(): Read[] {
  const out: Read[] = [];
  for (const p of corpusFiles()) {
    let text: string;
    try {
      text = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    // Only the files that reach an analysis matter here; a refusal has no caveats.
    let r;
    try {
      r = importFlight({ name: p.split('/').pop() as string, text });
    } catch {
      continue;
    }
    if (r.kind !== 'flight') continue;
    try {
      out.push({ file: p.split('/').pop() as string, flight: r.flight, analysis: analyzeFlight(r.flight) });
    } catch {
      /* an analysis that throws is another suite's problem */
    }
  }
  return out;
}

describe('a caveat states its lengths in the flyer’s units, on every surface', () => {
  it.skipIf(!present)('no caveat any corpus flight produces carries a baked SI unit', { timeout: 300_000 }, () => {
    const reads = corpusReads();
    const offenders: string[] = [];
    for (const { file, flight, analysis } of reads) {
      for (const w of [...analysis.warnings, ...flight.notes]) {
        if (BAKED_SI.test(w)) offenders.push(`${file}: ${w.slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      `caveats with a baked SI unit — use lenTok()/spdTok() so the render layer can convert:\n${offenders.join('\n')}`,
    ).toEqual([]);
    // The sweep has to have examined something. A run over zero flights would pass this silently,
    // which is the false all-clear the corpus discipline exists to prevent.
    expect(reads.length, 'flights examined').toBeGreaterThan(20);
  });

  it.skipIf(!present)('every surface renders every token, and none leaks one', { timeout: 300_000 }, () => {
    const reads = corpusReads();
    let withTokens = 0;
    const leaks: string[] = [];
    for (const { file, flight, analysis } of reads) {
      const raw = [...analysis.warnings, ...flight.notes];
      if (raw.some(hasCaveatToken)) withTokens++;
      for (const sys of ['imperial', 'metric'] as const) {
        // Every surface a caveat reaches: the screen's own render, and the four documents.
        const surfaces: [string, string][] = [
          ['screen', renderCaveats(raw, sys).join('\n')],
          ['txt', summaryText(flight, analysis, sys)],
          ['md', summaryMarkdown(flight, analysis, sys)],
          ['html', summaryHtml(flight, analysis, sys)],
          ['json', JSON.stringify(analysisJson(flight, analysis, sys))],
        ];
        for (const [name, body] of surfaces) {
          if (hasCaveatToken(body)) leaks.push(`${file} [${sys}/${name}]`);
        }
      }
    }
    expect(leaks, `surfaces that printed a raw token:\n${leaks.join('\n')}`).toEqual([]);
    // …and the sweep must actually have had tokens to render, or it proves nothing.
    expect(withTokens, 'corpus flights whose caveats carry a token').toBeGreaterThan(0);
  });

  it.skipIf(!present)('the same caveat reads in feet or in metres, and they differ', { timeout: 300_000 }, () => {
    const reads = corpusReads();
    const pairs: [string, string, string][] = [];
    for (const { file, flight, analysis } of reads) {
      const raw = [...analysis.warnings, ...flight.notes];
      for (const line of raw) {
        if (!hasCaveatToken(line)) continue;
        pairs.push([file, renderCaveat1(line, 'imperial'), renderCaveat1(line, 'metric')]);
      }
    }
    expect(pairs.length, 'token-bearing caveats across the corpus').toBeGreaterThan(0);
    for (const [file, imp, met] of pairs) {
      expect(imp, `${file}: imperial render still holds a token`).not.toMatch(/\{\{/);
      expect(met, `${file}: metric render still holds a token`).not.toMatch(/\{\{/);
      // The whole point: the two are not the same sentence. If they were, the substitution would
      // be running but converting nothing, which is the failure that looks exactly like success.
      expect(imp, `${file}: feet and metres produced identical text`).not.toBe(met);
      expect(met, `${file}: the metric render should name metres`).toMatch(/\bm\b|\bkm\b/);
    }
  });
});

function renderCaveat1(line: string, sys: 'imperial' | 'metric'): string {
  return renderCaveats([line], sys)[0];
}
