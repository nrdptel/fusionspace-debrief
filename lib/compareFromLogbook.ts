// Build a comparison out of flights the logbook already holds.
//
// This is what makes a comparison a place rather than a moment: the flights live in this
// browser's logbook, so a set of them can be named by id in a URL, reloaded, and bookmarked
// — where a comparison assembled from a drop exists only until the page goes away.
//
// Each file is independent. One that can no longer be read is reported by name and skipped
// rather than allowed to sink the whole comparison — a launch day shouldn't lose five good
// flights to one bad file. A file that needed a hand-made column mapping comes back with
// that mapping, which the logbook now stores beside the text.

import { getRecent } from './recents';
import { importRecent } from './reopen';
import { analyzeAsync } from './analyze/runner';
import { buildComparison, MAX_COMPARE, type Comparison, type CompareInput } from './compare';

export interface LogbookComparison {
  comparison: Comparison | null;
  /** Names of the ids that couldn't join, with why — for the surface to say out loud. */
  skipped: { name: string; why: string }[];
  /** How many of the requested ids made it in. */
  used: number;
}

/**
 * Load, analyse and assemble the given logbook ids. Returns a null comparison when fewer
 * than two flights survive — a comparison of one is a report, and the caller says so.
 */
export async function compareFromLogbook(ids: string[]): Promise<LogbookComparison> {
  const inputs: CompareInput[] = [];
  const skipped: { name: string; why: string }[] = [];

  for (const id of ids.slice(0, MAX_COMPARE)) {
    let name = id;
    try {
      const rec = await getRecent(id);
      if (!rec) {
        skipped.push({ name, why: 'no longer in this logbook' });
        continue;
      }
      name = rec.name;
      // A hand-mapped flight re-reads through its stored mapping; anything else through
      // its own format. What is left is a custom file saved before the mapping was kept —
      // open it once on the analyze page and it rejoins.
      const result = importRecent(rec);
      if (result.kind !== 'flight') {
        skipped.push({ name, why: 'needs its columns mapped — open it on its own once, and it can join' });
        continue;
      }
      inputs.push({
        id,
        name: rec.name,
        formatLabel: result.flight.formatLabel,
        analysis: await analyzeAsync(result.flight),
        ...(result.flight.flownAt ? { flownAt: result.flight.flownAt } : {}),
      });
    } catch {
      skipped.push({ name, why: 'couldn’t be read as a flight' });
    }
  }

  return {
    comparison: inputs.length >= 2 ? buildComparison(inputs) : null,
    skipped,
    used: inputs.length,
  };
}

/**
 * Write the `?ids=` list into a URL, keeping the separators as real commas.
 * `URLSearchParams` percent-encodes them, and an address a flyer bookmarks or pastes into
 * a club thread shouldn't read as `%2C%2C`. A comma is a legal sub-delimiter in a query
 * (RFC 3986 §3.4), and `idsFromParam` reads either spelling back.
 */
export function withIds(url: URL, ids: string[]): string {
  url.searchParams.set('ids', ids.join(','));
  return url.toString().replace(/([?&]ids=)([^&#]*)/, (_, k, v) => k + v.replace(/%2C/g, ','));
}

/** The `?ids=` list a comparison URL carries, parsed defensively. */
export function idsFromParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id) seen.add(id);
  }
  return [...seen].slice(0, MAX_COMPARE);
}
