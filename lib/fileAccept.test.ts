import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FLIGHT_FILE_ACCEPT, FLIGHT_FILE_EXTENSIONS } from './fileAccept';

const PARSER_DIR = fileURLToPath(new URL('./parsers/', import.meta.url));

describe('the file pickers offer everything the parsers can read', () => {
  it('lists every extension a parser recognises by name', () => {
    // The list a picker filters on is hand-maintained and the parsers are not, so the two
    // drift — and they had: `.pf2` is PerfectFlite's own export, `perfectflite.ts` detects it
    // on the extension alone with 0.95 confidence, and the picker greyed it out. Read the
    // parsers rather than trusting a second hand-typed list, so ADDING a name-anchored parser
    // fails this test until its extension is offered.
    //
    // TWO ways of keying on an extension, because naming one of them is how this check went
    // blind. It matched `endsWith('.pf2')` only, so `openrocket.ts` — which anchors a regex,
    // `/\.ork$/i.test(name)` — was invisible to it, and `.ork` reached the picker's greylist
    // by the same route `.pf2` had. That is the failure DESIGN.md §9 keeps recording in its
    // own greps: a pattern that names the drift in front of you rather than the class it
    // belongs to. Both forms are matched now, and a third would slip past again — so the
    // assertion below pins one example of EACH form rather than one overall.
    const claimed = new Set<string>();
    for (const f of readdirSync(PARSER_DIR)) {
      if (!f.endsWith('.ts') || f.includes('.test.')) continue;
      const src = readFileSync(PARSER_DIR + f, 'utf8');
      for (const m of src.matchAll(/endsWith\(\s*['"](\.[a-z0-9]+)['"]\s*\)/gi)) claimed.add(m[1].toLowerCase());
      // An extension anchored inside a regex literal: /\.ork$/i, /\.(bin|xtra)$/i.
      for (const lit of src.matchAll(/\/\\\.\(?([a-z0-9|]+)\)?\$\//gi)) {
        for (const ext of lit[1].split('|')) claimed.add(`.${ext.toLowerCase()}`);
      }
    }
    expect(claimed.size, 'the sweep found the parsers, rather than silently reading nothing').toBeGreaterThan(0);
    expect(claimed, 'the case this exists for — the endsWith form').toContain('.pf2');
    expect(claimed, 'the case that went past it — the anchored-regex form').toContain('.ork');

    const offered = new Set<string>(FLIGHT_FILE_EXTENSIONS);
    const missing = [...claimed].filter((e) => !offered.has(e));
    expect(missing, `a parser keys on ${missing.join(', ')} but no picker offers it`).toEqual([]);
  });

  it('keeps the shapes the generic mapper reads, not just the named formats', () => {
    // Most loggers export a plain delimited dump under some extension of their own choosing,
    // and the column mapper takes any of them. Narrowing this list to the named parsers would
    // hide every custom file the mapper exists for.
    for (const ext of ['.csv', '.txt', '.xlsx']) expect(FLIGHT_FILE_ACCEPT).toContain(ext);
    expect(FLIGHT_FILE_ACCEPT).toContain('text/csv');
  });
});
