# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — 1 increment, and it was the biggest correctness find yet

Shipped on the session's working branch, which started level with `origin/main` at `0499a29`, and
landed onto `main` by pull request.

| SHA | What | How it was verified |
|---|---|---|
| `a0ad11d` | Read burnout off the motor, not the apogee charge | The thrust-end search ran to **apogee**, so on a flight whose biggest signed-axial reading is the apogee ejection charge rather than the motor, burnout landed a few tenths of a second before apogee. **Four corpus flights.** One reported a **39.85 s burn**, a **1.9 m/s burnout velocity** and an 8,292 m burnout altitude (7 m under its own apogee) for a motor that burned **5.8 s to 581 m/s**; the others reported "burns" occupying **95–99% of their climbs**. Bounded the search at the velocity peak (net accel is zero there, negative after — thrust cannot act past it). The four now read 5.80 / 5.06 / 2.60 / 3.72 s with boost averages of 100.5 / 72.1 / 45.0 / 31.8 m/s² in place of 0.2–2.6. **The other 34 are unchanged.** 5 regressions, all 5 fail against the old bound. Driven in the browser: 5.8 s, 1,906 ft/s, 10.2 g, 34.6 s coast. |

Two honesty consequences came with it: `burnoutSource` said `measured` whenever a signed axial
*channel* existed even where the velocity-peak proxy actually stood in, and the "this is the max
velocity under a second label" note was gated on that label — so a real accelerometer crossing that
lands on the peak printed **580.86 m/s twice** with nothing to say the rows are one sample. The
analysis now carries `burnoutAtVelocityPeak` and the tile, the saved report and the JSON export all
read it. It means one *sample*, not two close values.

Local gate green before the push: **645 unit tests** (51 files, incl. **91 corpus** tests against the
real corpus — confirmed running by name, not skipped), `npm run build`, **170 e2e**. CI ran on the
pull request and was green; it does not run on a push to a working branch.

### Done-check, as run

- **Recompute sweep wave 2, 46 fixtures.** The exact-identity checks — `timeToApogee == burnTime +
  coastTime`, `flightTime == toApogee + descentTime`, drogue+main legs vs `descentTime` — are
  **clean across all 46** after the fix. The two remaining flag classes were triaged as not-bugs and
  recorded in BACKLOG: a Δv check that needs a drag term before it can accuse anything, and a TWR
  check whose window did not match the code's (replicating the real 0.2 s window reproduces the
  reported figure exactly).
- **Cold walk** of the built export: the four flights' readings are physically sensible on screen,
  and the methods page carries the corrected account.
- **Production**: `debrief.fusionspace.co` served `0499a29` before this landed.

## Environment notes

- **The image's Chromium is the WRONG BUILD for this Playwright, and it fails silently.**
  `/opt/pw-browsers/chromium` is `chromium-1194`; `@playwright/test` 1.61.1 wants **1228**. On 1194,
  `context.setOffline(true)` stops applying to service-worker fetches, so the PWA offline test gets
  the server's 404 where it asserts 503 — which reads exactly like a routing regression in `sw.js`.
  It is not. Run `npx playwright install chromium` (~2 min) and do **not** set
  `PLAYWRIGHT_CHROMIUM_PATH`. `playwright.config.ts` throws on a revision mismatch; trust that error.
- **A piped gate hides its exit code.** `npm run test:e2e 2>&1 | tail -20` reports the exit status of
  `tail`, not the suite — a red run looked green here. Echo `${PIPESTATUS[0]}`.
- **CI does not run on a working branch.** `.github/workflows/test.yml` fires on push to `main` and
  on `pull_request` only, so the PR is what makes CI run at all.
- **`npm run fetch-fixtures` returns 401 here.** The companion repo is checked out at
  `/home/user/debrief-fixtures`: `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
  Confirm the corpus suite reports ~91 tests — one that skips itself prints much like one that passed.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **Git identity defaults wrong on a fresh container** — it does *not* come up as the project's
  author, and a session of mis-attributed commits is only fixable by rewriting pushed history. Check
  `git config user.name` / `user.email` before the first commit.
- **A harness may append an attribution footer to a PR body.** It did on both PRs this branch has
  opened. Read the body back after posting and strip it, per the zero-trace invariant.

## Pick up first, and why

1. **The descent legs still diverge from their own chord slope by −58% to +17%** — 10 of 38 corpus
   legs, unpinned by any golden value. The sample-weighting hypothesis was tested and **disproved**
   last run (details in BACKLOG). Remaining suspects: `descent` is a 0.6 s moving average of a
   smoothed *derivative*, unreliable across multi-second gaps; and short legs (one main leg is
   **1.7 s** against a 0.6 s window) are dominated by the smoothing. **Needs a ground truth first** —
   a device's own stated descent rate, or a second recording of the same flight. This is the
   rank-1 damage case (a flyer sizes a parachute against it) and must not be changed on a guess.
2. **Sweep the remaining unswept readings the same way** — rail-exit velocity, landing energy and
   the drag Cd take flyer-supplied inputs so they need a different harness than the corpus sweep,
   but the technique (recompute independently, diff corpus-wide) has now found three real bugs:
   max-Q, coast efficiency, and this burnout.
3. **TWR rests on two samples at 10 Hz and says so nowhere.** The 0.2 s averaging window is
   sample-count-blind; on a slow logger it averages two readings and is reported to 1 decimal like
   any other figure. Either widen it, or say what it rests on.
4. **CSV export: column selection, a field separator, and a comments block.** Benchmarked against
   OpenRocket's *Export data* tab; the separator is the sharp one — the corpus holds semicolon-
   delimited European exports Debrief reads correctly and cannot write, so a comma-decimal-locale
   flyer opens our CSV in Excel and gets one column.
5. **The report's file-export strip on a phone** — 861 px of nine controls in a 380 px viewport
   behind a 32 px fade, so `Save bundle` is undiscoverable. Needs a sheet, which the app lacks.

BACKLOG.md carries the rest, newest first.
