// Which build of Debrief wrote this document.
//
// Debrief's methods change most weeks — a descent rate moved this month, a burnout window last
// month, an apogee caveat the month before — and every one of those changes is a change to what
// the tool SAYS about a real flight. A cert package filed in March and questioned in June has, up
// to now, had no way to answer "which version of the methods produced these numbers?".
//
// `COMPETITION.md` row 36 tracks the gap: AltosUI's CSV writer stamps its own version, so a file
// it wrote can be traced back to the code that wrote it. Debrief wrote nothing of the kind into
// any of the six documents a flyer keeps, while `scripts/stamp-version.mjs` had been writing
// `public/version.json` at every build and NOTHING in `app/`, `components/` or `lib/` read it.
//
// **It is an identifier, not a claim about correctness.** A stamp says which code ran; it does not
// say the numbers were right, and the methods page and the limitations remain where that is
// argued. It exists so a disagreement can be located in time instead of guessed at.

/** The short commit the running build was made from, or `dev` outside a production build. */
export const BUILD_SHA: string = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

/** When that build was made (ISO 8601), or empty outside a production build. */
export const BUILT_AT: string = process.env.NEXT_PUBLIC_BUILT_AT || '';

/**
 * One line naming the build, for the foot of a document a flyer keeps.
 *
 * Formatted in exactly one place so the six documents cannot drift into six phrasings — the same
 * rule the rest of this repo follows for anything two surfaces both say. `lib/buildInfo.test.ts`
 * holds the list of documents that must carry it, and fails when a new export forgets.
 */
export function buildLine(): string {
  const when = BUILT_AT ? `, built ${BUILT_AT.slice(0, 10)}` : '';
  return `Debrief ${BUILD_SHA}${when}`;
}

/** The same fact as data, for the machine-readable documents. */
export function buildFields(): { build: string; builtAt?: string } {
  return { build: BUILD_SHA, ...(BUILT_AT ? { builtAt: BUILT_AT } : {}) };
}
