# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — 3 increments so far, each verified and pushed on its own

Branch `claude/maintaining-md-review-6mggr1`, which started level with `origin/main` at `0b48c3b`.

| SHA | What | How it was verified |
|---|---|---|
| `f48bc17` | Measure the coast from the burnout height the flight reports | Coast efficiency and drag cost read the raw baro sample at burnout while the burnout altitude beside them uses the corrected one. Two mach-busters read **−93 m** (below the pad) and **774 m** at burnouts whose corrected heights are 482 m and 172 m: **14.9% → 12.2%** and **15.6% → 23.9%**. A TeleMega reading 286 m below the pad at a 596 m/s burnout printed "47%" beside a burnout altitude of "—"; now withheld with it. **26 of 28** flights that report an efficiency unchanged. 4 regressions, all 4 fail against the old rule. Driven in the browser: 12% beside 1,583 ft, 24% beside 564 ft. |
| `c42aeac` | Fail loudly when the pre-installed Chromium is the wrong build | See *Environment* below — this one cost a wrong diagnosis. Verified three ways: 1194 throws, explicit 1228 runs, unset runs. |
| `32b2e6c` | Count what the corpus suite proved, not what it visited | The runner now refuses a fixture carrying golden values it never analyses, and states its split: **61 fixtures = 37 analysed + 7 mapped-but-unanalysable + 9 parse-only + 8 rejected**, analysed held to a floor. Verified by planting a golden value on the `.rff` and watching the guard name it. |

Local gate green before every push: **639 unit tests** (51 files, incl. **91 corpus** tests against
the real corpus — confirmed running by name, not skipped), `npm run build`, **170 e2e**.

## Environment notes

- **The image's Chromium is the WRONG BUILD for this Playwright, and it fails silently.**
  `/opt/pw-browsers/chromium` is `chromium-1194`; `@playwright/test` 1.61.1 wants **1228**. On 1194,
  `context.setOffline(true)` stops applying to service-worker fetches, so the PWA offline test gets
  the server's 404 where it asserts 503 — which reads exactly like a routing regression in `sw.js`.
  It is not. Run `npx playwright install chromium` (~2 min, installs 1228 alongside) and do **not**
  set `PLAYWRIGHT_CHROMIUM_PATH`. `playwright.config.ts` now throws on a revision mismatch, so trust
  that error. Check what it wants with:
  `node -e "console.log(require('playwright-core').chromium.executablePath())"`
- **A piped gate hides its exit code.** `npm run test:e2e 2>&1 | tail -20` reports the exit status of
  `tail`, not the suite — a red run looked green here. Echo `${PIPESTATUS[0]}`.
- **CI does not run on this branch.** `.github/workflows/test.yml` fires on push to `main` and on
  `pull_request` only. The full local gate is the only gate until a PR is open.
- **`npm run fetch-fixtures` returns 401 here.** The companion repo is checked out at
  `/home/user/debrief-fixtures`, so: `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
  Confirm the corpus suite reports ~91 tests — one that skips itself prints much like one that passed.
- **The clone is shallow** (`git rev-parse --is-shallow-repository` → true), so any commit count or
  file history is a window, not the record.
- `npm install` is needed on a fresh container. Kill any hand-started `npx serve` before Playwright.
- **Git identity defaults wrong on a fresh container** — it came up as `Claude <noreply@anthropic.com>`.
  Set it before the first commit, per the zero-trace invariant:
  `git config user.name "Neer Patel"; git config user.email "135655563+nrdptel@users.noreply.github.com"`

## Pick up first, and why

1. **Finish the independent-recompute sweep.** The technique that found the coast bug — recompute a
   reported metric from `analysis.series` and diff it corpus-wide — was applied this run to apogee,
   max velocity, Mach, max/min acceleration, coast efficiency, burnout velocity, max-Q, the transonic
   crossing and time-to-apogee. **46 fixtures, and after the coast fix the only remaining flags are
   explained** (an ascent-gap withhold; a descent noise spike). Not yet swept: rail-exit velocity,
   landing energy, the drag Cd, `peakRollRate`/`rollRevolutions`, `liftoffTWR`, `avgBoostAcceleration`
   and the descent-rate legs. Same shape, and it has paid twice now.
2. **`altClean` vs `altAt` elsewhere.** The coast bug was one consumer reading the raw sample where
   the reported figure uses the corrected one. Lines 1082 (`coastGain` → `coastFloor`) and 1119
   (`climbFromPeak`) still read `altClean` — deliberately, since both are *guards* that detect the
   barometer contradicting itself and would be circular on a repaired trace. Worth a written
   decision either way; right now the distinction lives only in this note.
3. **CSV export: column selection, a field separator, and a comments block.** Benchmarked against
   OpenRocket's *Export data* tab; the separator is the sharp one — the corpus holds semicolon-
   delimited European exports Debrief reads correctly and cannot write, so a comma-decimal-locale
   flyer opens our CSV in Excel and gets one column. Every CSV writer (report data, compare
   chart-data, copy-table) has to move together.
4. **The report's file-export strip on a phone** — 861 px of nine controls in a 380 px viewport
   behind a 32 px fade, so `Save bundle` is undiscoverable. Needs a sheet, which the app lacks.
5. **A clock column as a time base in the generic mapper.** `clockSeconds`/`dayNumber` and the
   midnight-rollover rule exist in `lib/parsers/featherweightGps.ts`; lifting them into
   `lib/flight/build` unlocks any file whose only clock is a wall clock.

BACKLOG.md carries the rest, newest first.
