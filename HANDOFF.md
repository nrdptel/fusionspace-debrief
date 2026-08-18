# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **PR #211 (`d1002da`, confirmed live) and PR #212 (`6c7d4bd`) merged**. `d1002da` was confirmed live by fetching `version.json?cb=…` (built `13:14:24Z`, read at `13:15:56Z`). **#210 was CLOSED, not merged** — its commit is inside #211 byte for byte, with its claims corrected. Do not read this line next run: measure with `git fetch --prune origin && git log --oneline origin/main \| head -3` then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **PR #213, one commit** — D12 slice 4. Full local gate green (1,482 unit / 97 files, build, 365 e2e); merge it on green CI. |
| **Sev-1** | **None inherited** — the baseline gate was green before anything was touched (unit 1,467 / 95 files WITH the corpus, build clean, e2e 364). **One FOUND, reproduced, and deliberately NOT fixed**: max-Q's air density. See below; it is the first thing to pick up. |
| **D — capability** | **D12 slices 2 AND 4 SHIPPED.** Slice 2 arrived as an unmerged PR from the previous run and this run corrected four of its claims before merging it. Slice 4 moved the satellite-count fix rule out of one parser and into `buildFlight`, so the column mapper grades a GPS spreadsheet the same way a named parser does. **Next: D12 slice 3**, the Featherweight dB-Hz bins. |
| **P — product & craft** | **P1: the logbook's desktop half SHIPPED** — the thing the previous run filed and named as "the next thing here". e2e 364 → 365. |

## The explorer finding, and why its FIRST reproduction mattered

Shipped in #212. The statistics table published **Velocity max 3,728.29 m/s and Mach 12.64** on the
121 km flight — a post-apogee re-entry sample — against the report's 1,663.8 m/s and Mach 5.64.
**2.24x, bare**, in the table whose own comment calls these *"the numbers a cert document quotes"*.
`d-acceleration` had the same hole for the landing spike.

**The first reproduction failed and that is the transferable half.** Run against
`BlueRaven-LR.csv` the explorer and the report agreed exactly (1,719.4 m/s, Mach 5.79). The sweep
had named `Mega38-1_TeleMega.csv` — the SAME flight on the other board, which no named parser claims
and which reaches an analysis only through the column mapper. **Reproduce on the file a finding
names, not on a neighbour**; one more step and it would have been filed as unreproduced and lost.

The second half: `d-altitude` and `d-q` were each given this exact sentence earlier, after the
identical defect was found on each. Speed, Mach and acceleration were never revisited. **When a
qualification is added to a reading, enumerate the FAMILY** — the gap was four readings wide and
each was closed one at a time, months apart.

## D12 slice 4 moved a rule, and the corpus proved it moved nothing else

Worth knowing before touching `buildFlight` again. The satellite-count fix rule lived inside
`lib/parsers/altusmetrum.ts`; it is `applySatelliteFixQuality` in `lib/gpsFix.ts` now and
`buildFlight` applies it, so **every route a file arrives by gets the same answer** — a named
parser, the column mapper, and a reopened flight. The picker gained `altitudeGps`, `satellites` and
the three dilution roles, all of which were already legal roles and legal kinds and none of which
was offered.

**The check that made this safe to do late in a run was the corpus digest snapshot: 149/149,
including the digests, means no reading about any real flight moved.** Run it before believing any
refactor of the analysis or the parsers.

The guard worth preserving: it will not run twice. A `gpsFixGrade` channel already present means a
parser read a real fix-type column, and a STATED grade outranks a DERIVED one.

## Start here: the Sev-1 this run reproduced and could not honestly fix

**Max-Q is computed from an air density read at an altitude the analysis itself refuses to state.**
`lib/analyze/index.ts:1529` builds `airDensity` (and `sosProfile`) from `altClean`, hundreds of
lines before the ascent bounds exist, so the analysis ends up holding TWO heights for one instant.
**4 of the 31 corpus flights that report a max-Q are affected and it runs both ways** —
`irec_2023_telemega` publishes **205.1 kPa** off air about **19% too thick**, taking ρ at
**−296.7 m** (below the pad, where the row prints no height at all) while the file's own GPS reads
**2,340 m** at that index; `f1machbuster-jan10` *states* a 482.5 m load case with ρ taken at
−93.5 m. Max-Q is the structural load case an airframe is sized against.

**Two fixes were built this run and both were refused. Read `BACKLOG.md`'s entry before building a
third** — it carries the numbers. In short: withholding on the peak sample fails because the peak
migrates to an adjacent sample the guard's bands do not catch (the trace is *smoothly* wrong, not
spikily wrong), and correcting the atmosphere in place plus a `ρ(ascentFloor)` bound is
self-consistent but takes max-Q off the 121 km flight, which the corpus asserts at 404.1 kPa.
**What a third attempt needs is a lower bound on ascent altitude that survives a contradicted
barometer.** The evidence is already in the file — GPS reads 2,340 m where the barometer says
−296.7 m — so the route is a cross-source altitude check, which is D-track work rather than a patch.
**Mach shares the root cause** on the same four flights at roughly 3% rather than 19%.

**And measure the blast radius before you start:** correcting the basis alone moves exactly 4
flights on q and Mach, but **15 of 39 in `corpus-digests.json`**, so other metrics ride on those two
arrays and each needs validating. Do not regenerate the snapshot to get green.

## The shape this run kept finding, and it is the transferable part

**A real number quoted at the wrong scope.** Every one of the four claims corrected this run was a
genuine measurement — which is exactly why each survived a full green gate and a review:

- `/methods` said *"a dilution of 12.10 is published exactly as the receiver wrote it"*. 12.10 is
  real; it is `Mega38-1_TeleMega.csv`'s worst position dilution. But no named parser claims that
  file — `importFlight` returns `kind: 'mapping'` — so Debrief publishes nothing from it. **A claim
  about the CORPUS had been written under a sentence about the PRODUCT.** The worst dilution Debrief
  actually reads is **6.10**.
- `/methods` said a single flight runs 0.80 to 1.90. None does; the widest is 0.70 to 3.10.
- `dopSentence`'s own comment argued for stating a RANGE by citing 0.80 to 23.10 — **a range the
  same commit had just removed**, 23.10 being the no-fix placeholder.
- A count stated twice, differently, ten lines apart: 112 raw rows, 108 samples after the parser
  collapses duplicate timestamps.

**The rule, now in `ROADMAP.md`: a figure in prose needs the same scope statement as a figure in a
table.** "The corpus's worst value" and "the worst value Debrief reads" are different quantities,
and **prose is where the difference survives a gate**, because no assert reads it. The fix is to
pin the numbers a documentation page quotes with a test — `lib/dop.test.ts` now does, EXACTLY rather
than by a bound, since a bound goes quietly green the day the corpus moves.

## A published REASON can be wrong while the behaviour is right

Worth separating from the above, because it is a different failure. The parser drops a dilution on
a no-fix row, which is correct. The reason both surfaces gave was that `23.10` gives itself away by
being absurd and that removing it *closed* the quadrature check — reading as though the check
detects placeholders. **The corpus refutes it**: the 121 km TeleMega writes an entirely ordinary
`3.60 / 8.00 / 8.80` on all 12,931 of its zero-satellite rows, satisfying `PDOP² = HDOP² + VDOP²`
to 0.31%. A rule keyed on the number's size keeps every one of those. The test is the missing FIX,
never the number — and a future session trusting the old sentence would get the next file wrong.

## What went right, mechanically, and is worth repeating

- **The corpus did its job twice.** It refused both max-Q fixes. Neither was re-baselined. The
  second refusal in particular came from an assert about the 121 km flight that nothing else would
  have caught.
- **Every assert added was made to fail first**, and each failure message names the file or the two
  numbers it compared. The logbook one is geometric rather than class-based: restoring the flex row
  fails with `787.8 vs 621.0 — the columns do not line up`.
- **The opening fan-out found the max-Q Sev-1**, and an independent four-lens pre-merge review of
  #210 found three of the four false claims separately from the manual read that found them. Where
  they disagreed with measurement, measurement won: one lens called `COMPETITION.md` row 47 a
  blocking finding and it was right; another's framing of the placeholder argument was right too.

## Environment, measured this run

- **Both repos were attached**, so the corpus is real: `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`. The corpus suite named its fixtures and ran 149 tests in
  `lib/parsers/corpus.test.ts` alone.
- **Playwright needed `npx playwright install chromium`** — the image ships chromium-1194 and this
  Playwright wants 1228. It succeeds through the proxy in about a minute. Then plain
  `npx playwright test` with **no** browser variable set. This is paid again every session and
  belongs in the environment's setup script.
- **Git identity arrived as the harness vendor's default** and was reset per-repo before the first
  commit, as `AGENTS.md` warns.
- **The harness appended an attribution footer to the pull request body on creation.** It was read
  back and stripped. Do this every time; a later `update_pull_request` did not re-add it.
- **The clone is SHALLOW** (`git rev-parse --is-shallow-repository` → true), so any commit count or
  file history is a window rather than the record.
- CI fires on `pull_request` and on push to `main` — **not** on a push to a working branch.

## Next, in order

0. **Merge #213 if it is still open** — it is verified and green locally; only CI stood between it
   and production.
1. **The max-Q Sev-1** above — it is a wrong structural load case on a surface a flyer acts on, and
   it is the highest-value thing in the repo right now. It needs the cross-source altitude check.
2. **D12 slice 3** — the Featherweight dB-Hz satellite bins. `COMPETITION.md` row 47 holds the
   vendor's published legend and its warning: the vendor explicitly says not to read the weakest
   satellites as an accuracy signal, so this is a diagnostic to SHOW, never a number to compute an
   accuracy from.
3. **D12 slice 4** — the mapper cannot declare a quality column, which is why the 121 km TeleMega
   yields no dilution at all. `lib/flight/mappingOptions.ts:24` offers latitude and longitude and
   nothing else, while `satellites` and `altitudeGps` are already legal roles.
4. **P1's remaining audit rows** — 5, 7, 9 and 10 are still open; row 5's blocker has halved
   (`Card` takes a `ref`; `Figure`'s own heading is what is left in the way).
