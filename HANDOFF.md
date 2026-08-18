# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## The last handoff's OWNER ACTION is RESOLVED — CI runs the corpus again, and nobody had to do anything

**`FIXTURES_TOKEN` works.** Run `32096594423`'s `frontend` job logs `resolving
nrdptel/debrief-fixtures@v1.1.0`, `downloading corpus-v1.1.0.zip (26.1 MB)`, `sha256 verified`,
`corpus ready`, then **1,448 passed / 7 skipped of 1,455**. The 403 that skipped `Test` and `Build`
entirely for a run is gone. Whether the token was re-issued, the grant re-propagated, or the 403 was
transient is not knowable from here — which is exactly why the entry in `OWNER-NOTES.md` is struck
through rather than deleted: **if it comes back, read it as "this has happened before"**, re-run the
job once, and only escalate if it persists. The session-fixable half is still open and filed:
`fetch-fixtures.mjs` maps 404 and 401 to messages and leaves 403 unexplained.

**A green CI run is now the strong signal again**, and a fixtures-less container is back to being a
weaker gate rather than the only gate.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **SIX merged this run.** Five are named — `0df7eea` (#204), `21641b2` (#205), `feeded2` (#206), `992a6d0` (#207), `fc08365` (#208) — and `fc08365` was confirmed LIVE by fetching `version.json?cb=…` at 07:13:30Z. The sixth is D12 slice 1 (#209), whose squash sha cannot be written here because this file is inside it. Do not count from this line — measure: `git fetch --prune origin && git log --oneline origin/main \| head -6`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **Nothing, once #209 lands.** It carries D12 slice 1 with the full local gate green (1,473 unit / 96 files, build clean, 364 e2e in 8.8 m). Next increment: **D12 slice 2** — the dilution-of-precision columns AltOS already parses and throws away, with the `2147483647` *never supplied* sentinel read first. `ROADMAP.md` has it with the measurement. |
| **Sev-1** | **None inherited** (baseline green before anything was touched: unit 1,450 / 94 files with the corpus, build clean, e2e 359). **Two FOUND and FIXED this run**, both the same shape. **Two more FOUND, reproduced and FILED** — see below. |
| **D — capability** | **D10 SHIPPED, D12 decomposed to replace it, and D12 SLICE 1 SHIPPED** — on its second attempt, the first having been built, measured and thrown away the same run. A GPS apogee that rests on a hole in the record is now labelled a bound on all three surfaces. See below. |
| **P — product & craft** | **Two craft fixes shipped**, both a value whose identity was hover-only or absent: the logbook's two figures, and `/changelog`'s pinned strip. §9 counts all at or better than the last run's. |

## The shape both Sev-1s shared, and it is the transferable part

**A figure Debrief qualifies in one place and publishes bare in another.** This repo has now found
that shape four runs running — max-Q on four surfaces, the withheld peak speed, and both of this
run's. It is worth searching for directly rather than waiting for a sweep to trip over it.

1. **The explorer's altitude `max`** published **12,060 ft** into `Copy these stats` and the
   plotted-data `.csv` while the Apogee tile read **11,765.5 ft** — 295 ft, on a table whose own
   comment calls these *"the numbers a cert document quotes"*. 3 of 39 analysable records.
2. **The Events table** printed a qualified apogee flat on **five** surfaces — `.txt`, `.md`,
   `.html`, `analysisJson` and the screen — while the reading beside it said *"at least this high"*
   or *"(unproven)"*. 3 of 39 records, every one publishing its apogee twice in one document.

**The search that finds these:** take a value the report QUALIFIES, then grep for every other place
that value is formatted. Not the metric name — the formatting call (`fmtLength(e.altitude`,
`0.5 * .*airDensity`). The qualification lives on the reading; the arithmetic is what travels.

## Two defects this run reproduced and did NOT fix — and one of them changed grade when driven

Both are in `BACKLOG.md` with lines. Neither was absorbed, deliberately, because a run that spends
itself on defects ships no capability. **One was filed by the sweep as a Sev-1 one-way door and is
not one** — the entry says so with the measurement that settles it, which is the point of the
reproduce-before-you-scope rule cutting in the direction nobody expects.

1. **Every rocket-shaped input is stored under ONE global key, not per flight** (`lib/deviceData.ts`,
   read by `FlightReport.tsx:172,189,206`, `DragCoefficient`, `ParachuteCd`, `DrogueCd`, `RailExit`).
   Enter flight A's descending mass, open flight B, and B's landing energy and Cd are computed from
   A's rocket. A launch day is exactly the case where that bites. **Measure the on-screen effect
   before scoping** — the fields may be re-prompted in ways source reading cannot see. This is the
   one still carrying a genuine "wrong number a flyer would act on" claim.
2. **The logbook's per-row ✕ is destructive with no confirm and no undo** — and its severity was
   corrected DOWN by driving it. Measured at 1280 px: one click takes the list from 2 rows to 1, and
   the page then holds **zero** undo affordances. Real, and the sharpest part is the asymmetry —
   *Clear*, which deletes strictly less per press on a grouped row, does confirm. But it is a
   destructive action without a guard rather than a state a flyer is stuck in, and the logbook is a
   12-slot cache with Export/Import behind it, so **it is not a Sev-1 preemption**. The grouped-row
   case (several recordings, one press) is the half still unreproduced.

## D12 slice 1 — refused, rebuilt, shipped, all in one run

D10 shipped, the D-track went dry, and `ROADMAP.md`'s rule applied: decompose the next area rather
than fall back to the ledger. **D12 — How good the fix was, wherever a GPS value is read** — is
written up with five slices, every one measured by this run rather than chosen from a list. **Slice
1 is now shipped, and the two attempts are worth reading in order.**

**The gap is real and BIGGER than the milestone first assumed.** On `SG1.1-Booster` the GPS apogee
reads **2,251 ft against a barometric 2,502 ft — 10% low — on BOTH exports**, and the cross-check
panel called that "differ" without ever saying the GPS figure is a lower BOUND. That flight spends
13 distinct solutions on three satellites, whose heights are dropped. So the corpus DOES contain
the case; the first cut assumed it did not.

**Why the first build was refused.** A `gpsApogeeGapS` metric — seconds without a usable height
beside the peak — fired on that flight's **`.eeprom` (17.9 s) and not on its `.csv`**. An AltOS
eeprom writes a GPS record only when the receiver actually solved one, so its position channel is
NaN between fixes in a 100 Hz array, while AltosUI's CSV repeats the held position on every row. **A
metric defined over SAMPLES answers differently for two exports of one download** — the exact
one-value-two-accounts defect the rest of this run was spent closing.

**What shipped instead.** `gpsApogeeGap` and `gpsSolutionInterval` walked over SOLUTIONS the way
`gpsAscentFixes` already is, and `peakRestsOnAGap` in `lib/gpsFix.ts` as the ONE gate the panel, the
three documents and `analysisJson` all ask. Both SG1.1 exports now read **57 solutions, a 1.00 s
median interval and an 18.00 s gap**; the Kairos pair agrees to 10 ms. The figure is tagged
`(at least)` and explained — **never dropped**, which is row 47's standing rule for every quality
signal in this milestone.

**The threshold is not fitted, and that is checkable.** Across every corpus recording that states a
GPS apogee the gap-to-cadence ratio is **1.0, 1.1, 1.1, 1.1, 1.4 and 18.0** — an order of magnitude
of empty space, so nothing turns on where in it the line sits. The rule is *three times the record's
own cadence AND at least two seconds*, and **both clauses are load-bearing against a real file**: the
ratio clause is what keeps `endurance` quiet, which carries the corpus's second-largest absolute gap
at 7.0 s on a 5 s receiver and whose GPS apogee reads ABOVE the barometric one.

**Five mutants, all red**: sample-counting, each threshold clause alone, the document tag removed,
the JSON flag removed. Sample-counting is killed by the CORPUS cases rather than by a unit case —
which is the whole point, because the first attempt passed a full green gate.

**What it could not pin, and it is filed.** `components/GpsApogee.tsx` has **no automated coverage of
any kind**: not one of the ten parseable files in `public/samples/` produces a `gpsApogeeAltitude`,
so no e2e run has ever rendered that panel. The screen half is held by a source-level check that it
asks the shared rule rather than carrying its own thresholds. `BACKLOG.md`'s newest entry has the
measurement and what a fix needs.

**The corpus snapshot moved on all 50 flights, and that was proved benign before it was
regenerated.** Two new metric keys change every digest by construction. Re-running the snapshot with
only those two keys excluded reproduced the committed hashes exactly, so no reading about any real
flight moved — worth repeating whenever `corpus-digests.json` goes red on a metrics addition, rather
than regenerating on the assumption.

## Five things this run got WRONG first, and what caught them

Kept because each survived the thing that should have stopped it — three were green under a full
gate, the fourth was written down as fact, and the fifth produced numbers rather than an error.

1. **Featherweight's satellite count published as `satellites`.** That kind means satellites IN the
   fix, where 0 says the position beside it is held over. The column is satellites the receiver can
   HEAR — the ground-station file has **ten rows whose own FIX column says NO FIX while the count
   reads 16, 18 or 19**. Would have made a held-over position claim to be measured.
2. **A scope quoting a whole-record percentage beside a WINDOWED table.** `windowStats` recomputes
   every figure per zoom and the heading flips to *"In the selected window"* — so the sentence would
   have stopped describing the number beside it the moment a reader dragged the chart. It states no
   figure now.
3. **"384 two-dimensional fixes"** — a count of ROWS. The same flight reads 371 in the CSV its board
   exported and 13 in the raw download that CSV was made from; counted as SOLUTIONS both read 13.
   The methods page teaches exactly this about the ascent-fix count, two paragraphs below where the
   row count had been written in.

4. **A CI hang that never happened, published in this very file.** The Pending row above said this
   pull request's `e2e` job was *"stuck in E2E (headless browser) for 50+ minutes against an
   8-minute suite"*, called it a CI-infrastructure finding, and told the next session to re-run the
   job. **GitHub's own record refutes every part of it.** The pull request was opened at
   **06:47:36 UTC**, its first workflow run was created at **06:47:40**, and the commit publishing
   the 50-minute claim was authored at **06:52:48** — there was no 50-minute window for it to
   happen in. The job then finished **green in 7m36s**, and `frontend` in 2m25s. Nothing was wrong
   with CI.

   **The elapsed time was never measured. It was asserted.** A job's `started_at` came off the API
   and was subtracted from a "now" carried in context rather than read off a clock — which is the
   same error as quoting a figure without its basis, committed against the one artifact whose whole
   job is telling the next session what is true. **A duration is a measurement: read `date -u` at
   the moment you read `started_at`, and subtract those two.** If you have only one of the pair,
   say only what the record says — *"started at X, still running when I looked"* — which is both
   honest and enough to act on.

5. **A measurement about a file format, read one column out of alignment — and it did not error,
   it answered.** Scouting D12 slice 2, the AltOS CSVs were indexed with an offset for the `#` that
   begins their header line. The data rows have no matching extra field, so every column shifted by
   one. The result was not a crash and not a blank: it was `nsat` **41**, `vdop` **24.00–32.00**, and
   a `PDOP² = HDOP² + VDOP²` consistency check failing on **100%** of rows — which reads exactly like
   a real and rather exciting finding about a broken vendor format, and was about to be written into
   `ROADMAP.md` as one. **What caught it was physical plausibility**: no GPS receiver has 41
   satellites in a fix. Re-indexed correctly, the triple is consistent on essentially every row and
   `hdop` runs 0.5–5.4 — the figure `ROADMAP.md` had already recorded, which is the other thing that
   should have raised an eyebrow when the first pass disagreed with it. **Sanity the units before
   believing a measurement, and when a new measurement contradicts one already written down, suspect
   the new one first.**

**The lesson under all five: a full green gate proves the code does what it says, not that what it
says is true.** Hand the diff to a fresh agent with no context before every push.

## Two checks that could not fail, and one that failed against correct code

- `expect(c.caveat).toBeUndefined()` was the only case asserting "a scope, not a refusal" — on
  metrics where the caveat is unconditionally undefined. Deleting the whole helper left it green.
- No file in reach carries a Featherweight `FIX == 2` row, so reverting that parser's rule left the
  entire suite green. The test WRITES such a file now.
- And the other direction: a walk scoped to `#events` searched an element with no rows, because that
  id is on the HEADING rather than the section. **A check that fails against correct code is the
  same species of problem as one that passes against broken code** — both cost a session its trust
  in the gate.

## The corpus

Attached as a second repository and symlinked, the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the suite's
own counts — **50 corpus recordings** (`canonical.test.ts`), **39 analysable records**, **12 GPS
recordings**, **3 committed GPS fixtures across 3 families** (`gpsFix.test.ts`). A run that cannot
say those numbers did not have a corpus.

## Environment

**`npm install` first** (`node_modules` arrives empty), then **`npx playwright install chromium`**
(the image ships 1194, this Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on
purpose). Do **not** set `PLAYWRIGHT_CHROMIUM_PATH` afterwards. **This is the fifth run to pay for
both by hand; they belong in the environment's setup script.**

**FOUR CPUs, one gate at a time.** And a trap this run hit: **`pkill -f "playwright test"` matches
this agent's own shell command line** and killed the compound command that had just started a unit
run — the same shape `pgrep -f` was already recorded for. Check with `ps -eo pid,args` and kill by
PID, or simply don't.

**Read the LOG, not the harness's exit status.** A backgrounded compound command reports the exit
code of its last element.

**`main` moves underneath you** — it went 072ed8d → 0df7eea → 21641b2 during this run. Fetch before
every claim about the remote.

The git identity arrives as the harness vendor's default and must be set per-repo before the first
commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. **The harness appended an
attribution footer to BOTH pull-request bodies on create**; both were read back and stripped. Do both
every time.

**The harness pinned a branch whose name carries a tool vendor's word.** `feature/…` and `fix/…` were
used instead, on the zero-trace invariant and on explicit permission in the session prompt, and the
pinned name appears in no commit, body or file.
