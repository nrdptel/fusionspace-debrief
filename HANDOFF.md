# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — 8 increments, each verified and pushed on its own

| SHA | What | How it was verified |
|---|---|---|
| `180e887` | Read a Featherweight GPS ground-station export as the flight it received | New named parser + 6 unit tests + a committed trimmed fixture; corpus entry flipped from `kind: mapping` (never analysed) to a `flight` asserting **6,295.75 ft** — the Blue Raven's stated figure for the same flight, which Debrief reads at 6,264 ft (0.50%). Setting the assert to 7,000 ft fails as it should. Driven in the browser: **6,286 ft** on screen from the fixture (0.16%). |
| `8c06161` | Stop confirming a supersonic flight off a GPS-derived speed | Both corpus GPS flights with a second instrument measured: Mach 1.46 vs a Blue Raven's measured 1.14 on the same flight (+28%), and 1,466 ft/s vs the tracker's own stated 1,340 (+9%). 3 corpus regressions + a public-fixture e2e that used to assert "Went supersonic" on a GPS log. |
| `09585c1` | Say which way a mixed measured/derived spread is wrong | Four same-flight pairs, derived/measured = 1.31, 1.05, 2.10, 1.23 — four out of four HIGH, none "softer". Corrected on the compare screen, the Markdown/text export, the HTML export, both footnote and legend; corpus regression pins each pair. |
| `73c0f88` | Read max-Q off the boost, not off a deployment transient | Corpus sweep: 6 of 34 flights took max-Q from a negative-velocity sample. Worst 47,321.8 kPa → 404.1. 27 of the remaining 33 unchanged to within 0.1%. 6 named regressions + a whole-corpus sweep asserting no reported max-Q exceeds the climbing, at-or-before-apogee peak; all 7 fail with the old window. |
| `6ddd9ac` | Show the offline page its address names, or say it is missing | Driven in a real browser with the network cut, before/after: `/validation` → "Debrief" → "How Debrief is validated"; tapping Methods → `/methods/index.txt` → `/methods/`. 2 e2e tests, both failing against the previous worker. |
| `534d60b` | Map a launch-day file's columns without leaving the comparison | Driven: 3 files in → "Comparing 2 flights" + a `Map perfectflite-stratologger →` button → mapper in place → "Comparing 3 flights" with all three ids in the URL, surviving a reload. e2e test checks the address is kept through the mapper and extended after. |
| `c6b441e` | Say a flight is too big to link before the button is pressed | Driven on a phone viewport: a 220 KB log reads "Too big to link" up front, a small one still reads "Share link". Existing e2e updated; the recovery advice now names buttons that exist. |
| `272dab3` | Make a loaded comparison a phone surface, not a desktop one squeezed | Measured at 390 px: reorder controls were `hidden sm:flex` (count 0 — the feature had no touch path), no `<h1>` once flights load, 152×36 primary CTA. Touch suite now measures a *loaded* comparison; both new checks fail against the previous UI. |

Local gate green before every push: **634 unit tests** (51 files, incl. **91 corpus** tests
against the real corpus — confirmed running, not skipped), `npm run build`, **170 e2e**.

## Environment notes

- **CI does not run on this branch.** `.github/workflows/test.yml` triggers on push to `main`
  and on pull requests only; `actions_list` for this branch returns 0 runs. The full local gate
  is therefore the only gate — run all three (`npm test`, `npm run build`, `npm run test:e2e`)
  before every push, as this run did.
- **`npm run fetch-fixtures` returns 401 here** (the token has no access to the fixtures
  release). The companion repo is checked out at `/home/user/debrief-fixtures`, so:
  `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Do this while orienting and
  check the corpus suite reports ~91 tests — a corpus suite that skips itself prints much like
  one that passed and is worth nothing.
- `npm install` is needed on a fresh container; `npx playwright install chromium` takes ~2 min.
- Kill any hand-started `npx serve` before running Playwright — `reuseExistingServer` adopts it
  and the run dies mid-suite.

## Pick up first, and why

1. **Sweep the other derived readings the way max-Q was swept.** The max-Q bug survived every
   golden-value assert because no fixture asserted max-Q; what caught it was recomputing a
   reported metric independently from the same series and comparing. That shape has not been
   applied to Mach, rail-exit velocity, coast efficiency, landing energy or the drag Cd. It is
   the highest-yield thing this run found, and it found it by accident.
2. **Count how many `kind: mapping` corpus fixtures are silently skipped.** The corpus suite's
   mapping branch returns before asserting when a file has no `time` role — which is exactly
   how the ground-station file passed for as long as it did while being unanalysable. That
   skip is invisible in the output. Make it visible (log the count, or fail on an unexplained
   skip) and then look at what it has been hiding.
3. **The report's file-export strip on a phone** — 861 px of nine controls in a 380 px
   viewport behind a 32 px fade, so `Save bundle` is undiscoverable. Needs a sheet, which the
   app doesn't have yet; it is the one cold-walk finding this run left unfixed, deliberately,
   because the current shape is a considered trade rather than an oversight.
4. **A clock column as a time base in the generic mapper.** `clockSeconds`/`dayNumber` and the
   midnight-rollover rule already exist in `lib/parsers/featherweightGps.ts`; lifting them into
   `lib/flight/build` unlocks any file whose only clock is a wall clock. Left deliberately —
   no corpus file needs it now that the one that did has a named parser, and a capability with
   no real file behind it should be built on purpose, not as a rider.

BACKLOG.md carries the rest, newest first, including two things this run noticed and did not
chase: the GPS Doppler `HORZV`/`VERTV` channels (a real velocity measurement, unusable until
its unit is documented), and a "Copy summary" confirmation that did not appear on an emulated
phone.
