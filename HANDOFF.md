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
| **Shipped to production** | **FIVE merged this run: `0df7eea` (#204), `21641b2` (#205), `feeded2` (#206), `992a6d0` (#207), `fc08365` (#208).** `fc08365` was confirmed LIVE by fetching `version.json?cb=…` at 07:13:30Z. A sixth PR (#209) is documentation only — the capability it originally carried was withdrawn before merge. Do not count from this line — measure: `git fetch --prune origin && git log --oneline origin/main \| head -6`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **One PR open: `feature/gps-dop`** — D12 slice 2, shipped. Gate green (1,475 unit / 96 files **exit 0**, build clean, 364 e2e). |
| **Sev-1** | **None inherited** (baseline green before anything was touched: unit 1,450 / 94 files with the corpus, build clean, e2e 359). **Two FOUND and FIXED this run**, both the same shape. **Two more FOUND, reproduced and FILED** — see below. |
| **D — capability** | **D10 SHIPPED, D12 decomposed, slice 1 refused TWICE and slice 2 SHIPPED.** The dilution-of-precision columns AltOS writes and Debrief dropped are now read, with two separate "no value" conventions handled and neither of them in the milestone as written. **Next: D12 slice 3.** See below. |
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

## D12 slice 1 — built twice, refused twice, and the second refusal is the useful one

**Start the next run at slice 2.** Slice 1's first half already ships (`gpsAscentFixes`); its second
half qualifies a state no reachable file is in.

**What happened, in order.** D10 shipped, the D-track went dry, D12 was decomposed, and slice 1 was
built. It measured the receiver's silence around the GPS peak over SAMPLES, so it fired on
`SG1.1-Booster`'s `.eeprom` (17.9 s) and not on its `.csv` — one download, two answers — and was
refused. Correct refusal. **The note written alongside it was not**: it claimed *the corpus does
contain the case*, inferred from that flight's GPS apogee reading 10% below barometric plus an 18 s
gap existing somewhere in the file. **Nobody checked the two were in the same place.**

Slice 1 was then rebuilt over solutions. Both exports agreed (57 solutions, 1.00 s median, 18.00 s
gap), the full gate went green — **1,473 unit, 364 e2e, five mutants reddened** — and a pre-merge
review killed it on two counts at once:

1. **The walk gated solutions on the GPS ALTITUDE channel.** A run of two-dimensional fixes — real
   positions whose height `lib/gpsFix.ts` strips, because a 2D fix's height is an assumption — was
   counted as *silence*. Over positions the same file holds **69** solutions, not 57.
2. **The hole is nowhere near the apogee.** Barometric apogee is at **t = 13.1 s**; the 18 s hole
   runs **35.1 → 53.1 s**, under the parachute. The document row it produced contradicted itself
   inside one line: *"not the same peak — the two put it 39.8 s apart — the receiver went 18.0 s
   without a solution across the peak"*.

**Then measured properly, which is what settles the slice.** Solutions over POSITION, and the
interval that actually BRACKETS the barometric apogee: `SG1.1-Booster` solved **0.99 s** before and
**1.02 s** after its apogee, and every corpus recording that states a GPS apogee sits at a
bracketing ratio of **0.9–1.4**. **Not one file fires.** And the flight that motivated the whole
slice is already handled: its altitude solution LAGS, the peaks are 39.8 s apart, `peakAgreement`
returns *"not the same peak"*, and `lib/methods/content.tsx` has described that exact flight since
before D12 existed. The qualification added nothing and published a false cause on four surfaces.

`ROADMAP.md` carries the four conditions a third attempt would need. The first is a real file to
fire on — **a synthetic one is not evidence here**, precisely because D10's generator can produce
this state on demand.

**Two things worth more than the feature was, both kept:**

- **`components/GpsApogee.tsx` has no automated coverage of any kind.** Not one of the ten parseable
  files in `public/samples/` produces a `gpsApogeeAltitude`, so Playwright has never rendered that
  panel. In `BACKLOG.md` with what a fix needs.
- **D12 slice 2 re-measured**, in `ROADMAP.md`: the `2147483647` sentinel is whole-FILE rather than
  per-row (346/346 and 4,118/4,118), `PDOP² = HDOP² + VDOP²` holds on essentially every fix row of
  every file carrying all three, and 3 of the 11 AltOS CSVs carry no DOP columns at all.

**One process note that is worth keeping.** When two new metric keys made all 50 corpus digests move,
re-running the snapshot with *only those two keys excluded* reproduced the committed hashes exactly —
which proved the change moved no reading about any real flight. Do that whenever
`corpus-digests.json` goes red on a metrics addition, rather than regenerating on the assumption.

## D12 slice 2 — shipped, and the milestone was under-specified in two places

`lib/parsers/altusmetrum.ts` mapped `nsat` and threw away `pdop`/`hdop`/`vdop` from a CSV it had
already tokenised. All three are channels now, and the recovery view **and every saved document**
state the horizontal spread behind the positions a flyer is looking at. 6 corpus recordings carry
them, 16 channels, 5 with a track to state it against.

**The milestone named one "no value" convention. There are two, and the second is in no manual.**

1. **`2147483647` (INT32_MAX) means never supplied — PER COLUMN, not per file.** The entry said
   per-file and that was wrong: `intrepid2/telemetrum_data.csv` supplies `pdop` at 1.60–1.70 on all
   346 rows while marking `hdop` and `vdop` never-supplied on every one. A sentinel VALUE becomes
   NaN; only a column that is sentinel throughout loses its channel, so absence reads as absence.
2. **`23.10` in all three, beside a zero-satellite row.** `endurance`'s TeleMetrum log writes it on
   **all 112** of its no-fix rows — one repeated value, ten times worse than anything real in the
   file. Left in, the recovery view would have said *"HDOP 0.80 to 23.10"* and a flyer would have
   read 23.10 as that flight's worst geometry. Dropped with the position it belonged to.

**What makes the second removal a disclosure and not a filter, and it is checkable**:
`PDOP² = HDOP² + VDOP²` held on 22,199 of 22,307 rows before it and on **22,199 of 22,199 after —
every single row, worst case 7.96%**. The 108 exceptions *were* the placeholder. Taking out a
non-reading closed the invariant rather than loosening it. Nothing anywhere looks at how BAD a
dilution is; the worst real value in the corpus, 12.10, is published as written.

**A Sev-1-shaped defect found and fixed on the way past.** `fixQualitySentence` was **screen-only**
— the exports carried the landing coordinate with nothing saying how many of the track's positions
rested on an assumed height. Fifth run running for that shape, and **introduced by this run's own
#204**, which is the useful part: it is not legacy, it is what happens by default when a
qualification is written where it is first noticed. Both sentences now ride `howRead`, one call
reaching `.txt`, `.md`, `.html` and the JSON.

**A red gate that reads exactly like a green one, worth knowing about.** The new test first walked
the corpus once per case; five walks took the run past vitest's own `onTaskUpdate` RPC timeout on
this four-CPU box, and **an unhandled reporter error exits non-zero while every test still prints as
passed**. `npm test | tail` said *1,475 passed*; `echo $?` said **1**. Parse the corpus once per
file. And check the exit code, not the summary line.

## Six things this run got WRONG first, and what caught them

Kept because each survived the thing that should have stopped it. Three were green under a full
gate; the fourth was written down as fact; the fifth produced numbers rather than an error; and the
sixth was **both** — green under a full gate AND written down as fact, a run earlier.

**Two of the six are the same error, and it is the one to carry forward: an inference published as
a measurement.** Read the last two together before trusting anything this run wrote down.

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

6. **"The corpus does contain the case" — a claim never measured, which then cost a second build
   of D12 slice 1.** When slice 1's first attempt was refused, the ledger entry beside it recorded
   that `SG1.1-Booster` demonstrates the defect the slice targets. The basis was two facts that are
   both true — its GPS apogee reads 10% below barometric, and there is an 18 second gap in the file
   — and one step that was never taken: **checking they were in the same place.** They are not. The
   apogee is at t = 13.1 s and the gap runs 35.1 → 53.1 s, under the parachute. Measured over
   POSITION solutions, that receiver solved 0.99 s before and 1.02 s after its own apogee, and no
   corpus recording sits above a bracketing ratio of 1.4.

   **What makes it worth six paragraphs rather than one line**: the flight is 10% low for a reason
   Debrief has always stated correctly — its altitude solution lags, `peakAgreement` says *"not the
   same peak"*, and the methods page has described that exact flight for milestones. So the second
   build layered a false cause on top of a correct verdict and shipped a self-contradicting sentence
   into four surfaces, under a green gate with five mutants reddened. **A pre-merge review caught
   it. The gate could not have.**

**The lesson under all six: a full green gate proves the code does what it says, not that what it
says is true.** Hand the diff to a fresh agent with no context before every push — this run did, on
its last change, and that review is the only reason a false claim did not reach production.

**And the sharper half, from #4 and #6 together. Both were INFERENCES stated as MEASUREMENTS**, and
both were published — one into this file, one into a merged pull request, a ROADMAP entry and a
ledger entry. A 50-minute hang was inferred from a start time and a remembered "now". A corpus case
was inferred from a low figure and a gap elsewhere in the same file. Neither took the one further
step that would have killed it, and both read exactly like findings. **Before writing a number or a
because down: name the two things you compared, and confirm you actually looked at both.**

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

## One zero-trace breach is OPEN, and it needs the owner

**A comment on `#208` carries a *"Generated by Claude Code"* footer and cannot be removed from
here.** Filed in `OWNER-NOTES.md` under *Awaiting the owner* with the comment link — the owner
deletes it, and nothing else is affected.

**The mechanism, because it will bite again.** The GitHub MCP server appends that footer to every
comment **server-side, after the body is submitted**, so composing a clean body does not help. This
session's direct GitHub API access is blocked in both directions — `403 GitHub access is not enabled
for this session` on a `PATCH` and on a `GET` alike — so there is no edit and no delete path.

**The rule that follows: prefer editing a pull request's BODY over posting a comment.** The body
update path strips the footer, verified on `#209` twice. Comments cannot be cleaned. Post one only
when the alternative is leaving a false claim standing on a public artifact, which is the trade this
run made deliberately.

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
