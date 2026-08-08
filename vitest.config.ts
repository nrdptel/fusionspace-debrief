import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  // **JSX, because a unit test now imports a module that contains some.** `lib/methods/content.tsx`
  // holds the text of every methods block, and `lib/methodIds.test.ts` imports it to assert that
  // every id has one. `tsconfig.json` sets `"jsx": "preserve"` — correct, because Next does the
  // transform — so esbuild leaves the JSX alone and the module throws `React is not defined` the
  // moment it is imported rather than read as text.
  //
  // No test had ever imported JSX before: `lib/design-system.test.ts` reads components as SOURCE,
  // never as modules. So this unlocks a capability rather than changing an existing behaviour, and
  // the whole suite was re-run to confirm the blast radius is nil.
  esbuild: { jsx: 'automatic' },
  test: {
    // Unit tests only. The Playwright specs under e2e/ are run separately by
    // `npm run test:e2e` and must not be collected by vitest (their test() comes
    // from @playwright/test, not vitest).
    exclude: [...configDefaults.exclude, 'e2e/**'],

    // Vitest's stock 5,000 ms was never a decision this suite took, and it is the wrong
    // number for one whose corpus half reads 15 MB downloads off disk. The evidence that it
    // was wrong is that 15 declarations had already been given a hand-written 60–300 s
    // timeout to escape it, while 25 more were left on the default — and the tests somebody
    // thought to protect legitimately run 5.3–12.3 s, i.e. two to five times the entire
    // default budget.
    //
    // The 25 left behind measured 1.2–2.4 s alone, which reads as comfortable and is not: a
    // full 77-file run puts them under load, and on 2026-08-04 the slowest of them
    // (blueraven.test.ts's roll-angle sweep, 2,433 ms alone) crossed 5,000 ms and failed a
    // whole-suite run that passed on the very next attempt. A red gate nobody can reproduce
    // is worse than a slow one, especially where a fortnight of merges goes in unreviewed.
    //
    // 30 s is ~12x the slowest test that runs on this default, and still bounds a hang. It is
    // deliberately larger than the 8 s a single robustness trial is allowed, so that test's
    // own diagnostic can fire instead of being pre-empted — see the guard at the foot of
    // lib/parsers/robustness.test.ts.
    testTimeout: 30_000,
  },
});
