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
| **Shipped to production** | **`0df7eea` (#204) is LIVE** — confirmed by fetching `version.json?cb=…`. **`21641b2` (#205) merged and its deploy was still in flight at handoff time.** Do not count from this line — measure: `git fetch --prune origin && git log --oneline origin/main \| head -3`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **One PR open: `feature/coarse-gps-sample`** — D10's last capability, full local gate green. Merging it on green is pre-authorised. |
| **Sev-1** | **None inherited** (baseline green before anything was touched: unit 1,450 / 94 files with the corpus, build clean, e2e 359). **Two FOUND and FIXED this run**, both the same shape. **Two more FOUND, reproduced and FILED** — see below. |
| **D — capability** | **D10 is SHIPPED** — all six capabilities in its *done when* now have a named sample. Its last one, the coarse-GPS flight, needed the SURFACE built first (one rule for a degraded fix across four parsers, and the grade a file states carried as a `gpsFixGrade` channel), and both landed this run. **The next D milestone has to be written**: `ROADMAP.md`'s D-track is dry, and extending it IS one increment's work rather than a reason to go to the defect ledger. |
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

## Then: the D-track is DRY, and extending it is the work

D10 shipped, and `ROADMAP.md` says plainly what to do about that: *"When the last milestone ships,
decompose the next area yourself, in the order given at the bottom of `ROADMAP.md`, to the same
shape. Do not ask which. Do not fall back to the defect ledger because the roadmap looks finished;
extending it IS the work in that case, and it takes one increment."*

**One gap D10 opened rather than closed is the obvious seed**, and it is filed with its measurement:
a **GPS apogee resting on fewer solutions than the trace suggests is published bare**. An early
draft of the coarse-GPS generator made a 5,466 ft flight report **1,312 ft**, unqualified, because
the heights around its peak were dropped and neither `apogeeIsFloor` nor `altitudeUnproven` fires on
that shape. No corpus recording is in that state, which is why a sample found it and four runs of
sweeps did not. `metrics.gpsAscentFixes` already counts the solutions and `GpsApogee` already prints
the count; the missing half is a qualification when it collapses near the peak.

**And the mapper cannot express GPS quality at all** — `mappingOptions.ts:24` offers latitude and
longitude and no way to declare a satellite count beside them, so a flyer with their own GPS
spreadsheet gets a position and nothing about how good it was, while the same data through a named
parser is graded. Filed; it is a real capability gap rather than a defect.

## Three things this run got WRONG first, and the reviews that caught them

Kept because each was green under a full gate and only a second pair of eyes killed it.

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

**The lesson under all three: a full green gate proves the code does what it says, not that what it
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
