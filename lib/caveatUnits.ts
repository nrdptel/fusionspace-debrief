// The render half of caveat units — see `lib/caveatTokens.ts` for why the two are separate files
// and for the defect this exists to close.
//
// This one may import the unit system, because it runs where the flyer's units are known: at
// render, and again on every unit switch. The analysis never calls it.

import { fmtLength, fmtSpeed, type UnitChoice } from './display';
import { CAVEAT_TOKEN } from './caveatTokens';

/** Substitute every token in a caveat with the value in the flyer's own units.
 *
 *  Applied at EVERY surface that prints a caveat — the report's "Worth knowing" block, the .txt,
 *  .md and .html documents, the JSON export, and the "How this file was read" provenance list.
 *  That completeness is the point rather than a detail: a caveat rendered in feet on the page and
 *  in metres in the document the flyer sends to a cert board is the same defect in a new place,
 *  and `MAINTAINING.md` is explicit that a caveat in one place and a confident claim in another is
 *  worse than either alone. `lib/analyze/caveats.test.ts` holds the surfaces side by side. */
export function renderCaveats(lines: readonly string[], sys: UnitChoice): string[] {
  return lines.map((line) => renderCaveat(line, sys));
}

export function renderCaveat(line: string, sys: UnitChoice): string {
  // `CAVEAT_TOKEN` is a global regex and therefore stateful; `String.replace` resets `lastIndex`
  // itself for a global pattern, but a `test()` on the same object would not — which is why the
  // predicate in `caveatTokens.ts` uses its own non-global copy rather than sharing this one.
  return line.replace(CAVEAT_TOKEN, (_m, kind: string, raw: string) => {
    const v = Number(raw);
    return kind === 'len' ? fmtLength(v, sys) : fmtSpeed(v, sys);
  });
}
