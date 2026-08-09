// Which recording the flyer said flew as the first stage, per set of recordings they assembled.
//
// A composite is the flyer's STATEMENT, not a measurement (`lib/composite.ts` says so at length):
// nothing in the records establishes that these recordings are stages of one launch, and nothing
// establishes their order. So the statement is the whole of what has to be remembered, and
// remembering it is the only thing this module does.
//
// **The key is the SORTED set of logbook ids, and that is the fix rather than a detail.** It was
// `ids.join(',')` in the order they happened to arrive, and the same two recordings arrive in
// different orders by different routes: `components/Analyzer.tsx:824` builds it from the order a
// launch day's folder was DROPPED, and `components/CompareSurface.tsx:397` from the order the
// flyer TICKED the rows. Assemble a composite from a drop, say which stage flew first, come back
// to it later by ticking the same two flights the other way round, and the statement was gone —
// a control that forgets, which is a named tell in `MAINTAINING.md`'s craft bar and is exactly
// what a "which one flew first" choice must never be, because re-answering it is the one piece of
// knowledge a flyer brings that the files do not carry.
//
// The value is the recording's NAME rather than its id, because that is what `buildComposite`
// matches on (`m.recording === firstStage`) and what a `CompositeMark` carries.

/** The one localStorage key this module owns. Listed in `lib/deviceData.ts`, held to it by test. */
export const FIRST_STAGE_KEY = 'debrief.firstStage';

/** The set of recordings, as a key that does not depend on the order they arrived in. */
export function stageKey(ids: readonly string[]): string {
  return [...ids].sort().join(',');
}

type Store = Record<string, string>;

function readStore(): Store {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FIRST_STAGE_KEY) || '{}') as unknown;
    return typeof raw === 'object' && raw !== null ? (raw as Store) : {};
  } catch {
    return {};
  }
}

/**
 * Every key in the store that names this same SET of recordings, whatever order it was written
 * in — the sorted one this module writes, and any arrival-order one an older build left.
 *
 * A read-side fallback to `ids.join(',')` alone is the version that looks like a migration and is
 * not: it only finds a legacy entry when the flyer happens to arrive in the same order it was
 * written in, which is the very thing that was broken. Scanning is affordable because the store
 * holds one entry per composite a flyer has ever assembled — tens, not thousands.
 */
function matchingKeys(all: Store, ids: readonly string[]): string[] {
  const want = stageKey(ids);
  return Object.keys(all).filter((k) => k === want || stageKey(k.split(',')) === want);
}

/**
 * The statement for this set, or undefined where none was made.
 *
 * The sorted key wins; a legacy key is answered only when there is no current one, so a flyer who
 * has said something since is never told what they used to think.
 */
export function readFirstStage(ids: readonly string[]): string | undefined {
  const all = readStore();
  const want = stageKey(ids);
  if (all[want] != null) return all[want];
  for (const k of matchingKeys(all, ids)) if (all[k] != null) return all[k];
  return undefined;
}

/** Say which recording flew first for this set, or `undefined` to withdraw the statement. */
export function writeFirstStage(ids: readonly string[], name: string | undefined): void {
  try {
    const all = readStore();
    // Every form of this set goes, so withdrawing a statement written under an old key actually
    // withdraws it rather than leaving the scan above to answer with it for ever.
    for (const k of matchingKeys(all, ids)) delete all[k];
    if (name != null) all[stageKey(ids)] = name;
    window.localStorage.setItem(FIRST_STAGE_KEY, JSON.stringify(all));
  } catch {
    /* a device that refuses storage still gets a composite; it just forgets the statement */
  }
}
