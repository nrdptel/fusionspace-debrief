# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **A Sev-1, reproduced and shipped — and it turned out to be a FAMILY** | **Thrust-to-weight was averaged over a count of samples, not a window of time**, so the number quoted against the 5:1 rail rule read up to 25% low — and disagreed with itself across two exports of one flight. Kairos Booster published **4.98:1** from its `.csv` and **4.83:1** from its `.eeprom`, one device, one launch; the truth is **6.44:1** for both. Two more readings had the same shape and both shipped: the boost average (`#124`) and the GPS fix count (`#126`, where one flight published **4,010** fixes behind an apogee resting on **40**). |
| **The pattern behind all three, and the thing to look for next** | **A figure computed per-SAMPLE on a record whose sample rate is not constant is a property of the file, not of the flight** — and the test that exposes it every time is *two exports of one recording must agree*. AltusMetrum writes a `.csv` and an `.eeprom` of the same flight at different rates, which makes that pair a free differential test for this whole class. Three readings were caught by it in one run. Anything else in `lib/analyze` that counts or averages over indices rather than over the clock is a candidate. |
| **The second-opinion pass earned its keep, again** | A fresh agent given only the finished, green D9-slice-3 diff found **six** defects, five of them the same shape: a sentence written for the case in front of me, then reached by a case that was not. It also found the one that would have failed the gate on arrival. **Read *The one thing to read before anything else*.** |
| **D — capability** | **D9 slice 3 SHIPPED and merged (`#120`, live).** A design dropped beside a log is compared against it and never called a measurement. **Slice 4 is next, and it is now scoped and measured** — see *What slice 4 turned out to be*. |
| **P — product & craft** | **The chip census had a second blind spot and it was hiding a real hand-roll** (`#122`). Widening the tag list that morning was necessary and not sufficient: the scan walked through `//` comments as if they were code, so a `>` inside one ended the tag five lines above its `className`. `FigureChooser`'s toggle converted to `ChipButton`. |
| **P — product & craft** (2) | Max Q, the report's structures number, now says it came from a derived speed **and that `q = ½ρv²` squares it** (`#125`) — it was the one derived-speed reading on the page saying nothing. |
| **The lesson of this run** | **I reported the gate green from a run that predated my last edit.** It was not a lie when I ran it and it was false when I said it. The type error sat in the tree for the whole review. Re-run the gate *after the last keystroke*, not after the last interesting one. |

**Re-measure before believing any of this**: `git fetch --prune origin`, then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moves underneath you.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout**: `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the digest snapshot covers **50**.
  `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a no-op — the attached checkout is the
  whole reason there is a corpus.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window, not a record.
- **Playwright needed `npx playwright install chromium`.** The browser cache empties on container
  restart. **Paid for again every session; it belongs in the environment's setup script.** Said for
  at least the fourth run running.
- **`git config user.name/user.email` were already correct** (`Neer Patel`,
  `135655563+nrdptel@users.noreply.github.com`) — carried from the previous run in the same session.
  A fresh container will NOT have them. Set them before the first commit; the harness vendor's
  default is a zero-trace breach.
- **GitHub appends an attribution footer to every PR body**, and **eats anything tag-shaped**. PR
  `#122`'s body was truncated at a literal `<title>` in prose — everything after it silently gone.
  Read every body back after posting: strip the footer, and rewrite any angle brackets as words.
- **`npx tsx` is available** and is how the probes in this run were run.

## The one thing to read before anything else

**A finished, gate-green diff went to a second-opinion agent and came back with six defects. Five
were the same failure, and it is worth naming because it is not carelessness — it is a shape.**

Every one of the five was a sentence I wrote correctly for the case in front of me, which was then
reached by a case I was not looking at:

- `predictionVerdict` said **"flew higher"** — a sentence about altitude — for all ten figures a
  design states. A flight that took two and a half times longer to reach apogee than predicted read
  `Time to apogee — flew higher · +245%`, on the row directly above Apogee.
- The gravity-convention finding fired on **predictions**. It is a *measured* property of instruments
  Debrief has read files from (+1.00 g, to two decimals, on every AltimeterCloud file in the corpus);
  the `.ork` format states no convention at all. On a design it would have printed a confident
  sentence about "the device" under a figure no device wrote, and flipped a real 5–7%
  under-prediction to `agree`.
- A design stating several simulations, which contributes only a refusal, was **also** announced as a
  prediction that landed — two sentences contradicting each other on one screen.
- The pairing note promised **a table that surface does not have**: the cross-check panel lives on the
  single-flight report, and a comparison carries no reported figures at all.
- A prediction verdict was printed under a column headed **`Agreement`**, the one word the file's own
  header says a prediction must never be judged in — and on a device-less row, the same chip twice.

The sixth was arithmetic: the row's Debrief cell was copied off whichever source came first, and
`hasComputed` on a comparison is false when the stated value is 0, so a device figure of 0 blanked
Debrief's read for the whole row while the JSON still carried the number.

**The generalisable rule.** When a change adds a second *kind* of thing to a surface that had one,
every sentence already on that surface is now a claim about both. The five above are all the same
audit that nobody ran: *list the prose this surface emits, and ask of each line whether the new case
makes it false.* That audit takes ten minutes and would have found all five.

**And the one that would have failed the gate:** the new methods-page block was not in
`lib/methodIds.ts`, which is a compile error, because `Method`'s `id` is typed against that list.
I had reported the gate green — from a run that finished before I wrote the block. The number was
true when I measured it and false when I said it. **Re-run after the last keystroke.**

## What shipped this run

Six merges, all on `nrdptel/fusionspace-debrief`.

### 1. `#120` — D9 slice 3: a prediction is a third source, and never judged as a second measurement

An OpenRocket design dropped in with a log takes its own column in the cross-check beside the
logger's figures and Debrief's own read. Two altimeters that recorded one flight *agree*, are
*consistent*, or *differ*, and a gap is worth chasing because one of them is wrong. A simulation is a
statement about a flight that had not happened yet: when the flight misses it, nothing is wrong. So a
predicted row says which way it went, in accent and never in the amber of a discrepancy — and the
direction word belongs to the reading, so a time *took longer* and an acceleration *pulled more g*.

Four things the decomposition did not have, all plumbing:

- **A prediction could not reach a flight at all.** Pairing deduped by metric alone, so a design's
  apogee would have been dropped behind an altimeter's. Keyed on `source:metric` now, in all three
  places that dedupe (`pairSummaries`, `pairPredictions`, `reopen.withSummary`).
- **`compareReported` had no notion of a metric identity** — a 1:1 map, so two sources stating apogee
  gave two rows both labelled "Apogee" under a duplicate React key. `reportedByMetric` groups them.
- **`deltaPct` is unsigned**, which is right for two instruments with no reference between them and
  throws away half the answer for a prediction. `signedPct` rides beside it.
- **The verdict vocabulary had no third case.**

**The sign convention is a decision and the field is split on it.** Debrief states
`(flown − predicted) / |predicted|`; RASAero II's published 43-flight table states
`(sim − flown) / flown` — opposite sign *and* a different denominator, so a flight it prints as
−4.30% Debrief prints as +4.5%. `COMPETITION.md` row 30.

### 2. `#121` — the Sev-1: thrust-to-weight off a sample count

`round(0.2 / dt)` samples, where `dt` is the median interval of the **whole record**. A flight log's
rate is never one number — AltusMetrum writes the pad slowly and the boost fast, and the same board's
two export formats are written at different rates again. So the window was 0.2 s on a uniform record
and as little as 0.02 s on the rest, always short, always reading before the motor was up to pressure.

| flight | published | correct |
|---|---|---|
| Kairos Booster `.csv` (median dt 0.04 s → a 0.050 s window) | 4.98:1 | **6.44:1** |
| Kairos Booster `.eeprom` (median dt 0.10 s → a 0.020 s window) | 4.83:1 | **6.44:1** |
| irec2023 TeleMega (0.05 s → a 0.040 s window) | 9.49:1 | **11.95:1** |
| irec2023 EasyMega, *same airframe* | 11.23:1 | 11.34:1 |
| lilnuke 1785, one of four in one airframe | 14.48:1 | **16.30:1** |

**The Kairos row is the whole argument**: one device, one launch, two export formats, two different
published thrust-to-weights, and the truth identical for both. There is no measurement difference
between those two files — they are one recording, written out twice.

**The corroboration that was not aimed at.** The four-altimeter lilnuke group is the tightest
agreement in the corpus and it **tightened from a 17% spread to 5.6%**. Nothing about the fix targeted
that, which is what makes it evidence.

Pinned by two corpus invariants, both of which fail on the old code with those exact numbers: two
recordings of one launch agree within 10%, two exports of one recording within 2%.

### 3. `#122` — P1: the census could not see what it was counting

The scan finds the end of a JSX opening tag by walking to the first `>` at brace depth zero, and it
walked through `//` comments and strings as if they were code. `FigureChooser` explains, in a comment
between two attributes, why its control is named for the title in angle brackets — and that `>` cut
the tag off above its `className`. **Three copies of that walk existed, character for character**, so
the blind spot was in all three; they are one `openingTag` now.

**The proof is the falsification, not the new finding.** A looser check finds more things. With the
hand-roll present: the old scan passes **20/20 green**; the fixed one fails, naming the file.

So the class error `DESIGN.md` §9 keeps recording has two members. *Enumerating the tag in front of
you* is the first. **Reading a comment as code** is the second, and it is worse: the widening that
fixes the first is visible in a diff, and this one is only visible if you go looking for what the
tool cannot see.

### 4. `#124` — the other half of the Sev-1: the boost average

`avgBoostAcceleration` averaged over samples too. The window (liftoff → burnout) was always right;
only the weighting was wrong. **+16.1%** on `issuiuc-intrepid1`, +4.7% on `issuiuc-endurance`, under
1.3% on 17 of the 25.

**The interesting part is that the obvious evidence was the wrong evidence.** `#121` was settled by
corroboration — two exports of one recording collapsing onto one number. The same check here does
NOT tighten (irec2023 2.2% → 2.2%, lilnuke 8.4% → 8.7%, stargazer1 17.2% → 17.2%). Chasing that last
one found why, and it is a different finding: **`stargazer1`'s two exports detect burnout 0.58 s
apart** — 4.190 s against 3.910 s — on *identical* peak acceleration, so they average over different
windows, and `corpus.test.ts` already records that loggers legitimately disagree about where a burn
ends. Corroboration could never have settled it, and reporting "the spread didn't move" as
counter-evidence would have been as wrong as reporting it as support.

So it is pinned by a **definition, in closed form**: a boost that ramps linearly, sampled ten times
finer through its second half, where the time average is the ramp's midpoint exactly and a sample
mean is dragged toward the top. The test computes both from the trace it built and asserts they are
far enough apart to tell apart *before* asserting which one Debrief reports — 162.09 against the
true 129.70 on the old code.

### 5. `#125` — Max Q carries the speed's provenance, in its own words

`q = ½ρv²` is **quadratic** in the peak speed, so a derived speed that "usually reads high" carries
that through roughly doubled. The speed tile had said so for a long time and Mach rides inside that
same sub-line; max Q sat between them with only "at 1,936 ft" — the report's structures number, bare.

The backlog entry predicted "the fix is a call, not a mechanism" and was half right: the tile was one
call, and **the saved report was a second site**, because `report.ts` builds its Max Q row
independently of `metricTiles`. That is the same failure the entry itself describes the peak speed
having had once already.

### 6. `#126` — GPS fixes, not the rows a receiver repeated itself across

`gpsAscentFixes` counted rows. **`irec2023` published 4,010 behind an apogee resting on 40**;
`sg1.1` published 1,232 for 6. And it had the Kairos shape the filing missed: the same booster's two
exports reported **2,259 and 24** for one flight with 24 true fixes, the `.eeprom` looking nearly
right only because AltusMetrum happens to write it at the receiver's own rate.

**The `satellites` channel is deliberately not consulted** although it was the obvious lever: a
sample with none is a held-over value *by definition*, so it cannot differ from what it was held over
from, and the gate changes not one count anywhere in the corpus.

**Two tests asserted the defect** — `real-files.test.ts` and `e2e/analyze.spec.ts` both required
`gpsAscentFixes > 50` on a fixture whose true count is 3. A test written against a wrong number
defends it, and neither would have gone red on any amount of correct work.

## What slice 4 turned out to be — measured, not started

The roadmap's *done when* for slice 4 reads as though the common case were a design with **no** saved
simulation data. It is not. The corpus `.ork` carries **2,580 datapoints across five `<databranch>`
elements** — one per simulation, 233–695 points each — with the columns declared in a `types=`
attribute and each `<datapoint>` one comma-separated row against it. There is a real curve to draw.

**The cost is not the parse. `uPlot` has one x array for every series**, so a prediction on its own
time base cannot simply be pushed into `Chart`'s `series[]`. Resampling it onto the flight — what the
comparison surface already does to overlay several flights, and says so — is forbidden by this
slice's own text, and rightly: it would make a simulation look measured. **Merge the two time bases
into a union x, every original sample of each kept and NaN elsewhere, with `spanGaps` on.** No value
invented, none moved. `bracketUnsortedX` in `Chart.tsx` is already the same shape of trick. Written
up in full in `ROADMAP.md`.

## Pick this up first

Everything the first version of this list named was shipped in the same run — `#124`, `#125` and
`#126`. What is left:

1. **D9 slice 4**, per the scoping above. It is the only queued milestone increment on either track
   that is scoped and not started, and the measurement it needs has been taken.
2. **A probe script in the repo root fails `npm run build`** — `tsconfig.json` includes root `.ts`
   files while `.gitignore` only stops them being committed, so the gate goes red for exactly the
   stretch of work where probes are being leaned on hardest. **This bit twice in one run.** One line
   in `tsconfig.json`.
3. **The `.ork` acceleration convention is still unverified** (`BACKLOG.md`). Debrief claims neither
   convention for a design and says so in the design's own note, which is honest but is a sentence
   standing in for a fact. What closes it: a corpus flight carrying both a design and a log, or
   OpenRocket's own source.
4. **`FlightPicker` and `RecordingPicker`** are the two chip-census entries whose reason is
   "two-line selectable option, a card in a picker rather than a token in a row". That reason is
   sound and it has now survived two censuses; the third time it is worth asking whether the
   vocabulary is short a word rather than re-recording the exception.

## The done-check, executed — what each step returned

1. **Corpus sweep: 0 findings.** `npm test` → **1,151 tests across 77 files**, of which
   `corpus.test.ts` is 143 over the manifest's **62 fixtures** with **50** covered by the digest
   snapshot. Nothing new fell out; the three defects this run filed were found by reading and by
   probes, not by the sweep.
2. **Cold walk of `611fefd`, the SHA shipped.** Production was serving `10ee723` when the walk ran
   — one commit behind, `#122` still deploying — so the gap is one merge and no more. Walked the
   journey this run changed (a design dropped beside a log) and one not walked this run (the figure
   chooser). The prediction table renders `READING | PREDICTED | DEBRIEF | VS PREDICTION` with **no
   `Agreement` column at all** on a prediction-only flight, verdicts reading *flew higher · +1321%*,
   *flew faster · +359%*, *pulled more g · +35%*, *took longer · +245%* — the per-quantity wording,
   live — and `not measured` on the four figures Debrief has no counterpart for. **0 console
   errors.** The figure toggle: ink 62×44, hit target 44×44 under a coarse pointer.
   **The walk's own first assertion was wrong and that is worth recording**: it measured the toggle
   at 26 px and read as a touch-contract breach. `.touch-area::after` lives inside
   `@media (pointer: coarse)`, and pointer type is a browser-CONTEXT property — `setViewportSize`
   alone does not bring it into play. Any future walk that measures a hit target must run under a
   device preset, the way `e2e/touch.spec.ts` does.
3. **`COMPETITION.md` row 31 added** — thrust-to-weight measured from a flight log. The design tools
   compute it from a motor curve before the rocket flies; the analysis tools do not compute it at
   all (AltosUI's manual does not mention it, verified 2026-08-04). `LEAD`, and the row is written
   around the near-miss rather than the win: Debrief was alone in the field on that number and alone
   in checking it, and what caught the error was not a reviewer but a rule that two exports of one
   recording must agree. Row 30 (RASAero II) was added earlier in the run with D9 slice 3.
4. **§9 counts, all green and none moved the wrong way:** `rounded-lg` **0** · hand-rolled card
   treatments **3** · off-scale spacing **0** · inverted-type files **10** · `ui` importers **≥35**
   · off-scale type sizes **1** · frame treatment written in **1** place · focus managed from **1**
   place · plot-to-image composited in **1** place. Hand-rolled chips: **5 files, all named with a
   reason** — and that census is measuring one more file's worth of the repo than it was this
   morning.
5. **`BACKLOG.md` read and corrected.** The `FigureChooser` entry filed this morning was fixed by
   `#122` the same day and was still sitting open — marked FIXED with its mechanism kept, because
   the account of *why the census could not see it* is the part worth keeping. The
   `avgBoostAcceleration` entry was upgraded from "unmeasured" to a table.
6. **Both track questions, answered plainly.**
   - **What can a flyer DO that they could not before? (D)** Drop an OpenRocket design in with their
     log and read what the simulator expected beside what actually flew — per reading, with the
     direction stated, and without a simulation ever being called a measurement.
   - **What is measurably better about using the tool? (P)** The thrust-to-weight on the report is
     correct where it was up to 25% low, and it no longer changes depending on which file the flyer
     exported. Separately, the chip census now measures a class of control it could not see, and one
     more toggle sits at the system's geometry and the touch contract instead of a hand-roll —
     hand-rolled chips **5 files** and every one carrying a written reason.
7. **`ROADMAP.md` updated** on both tracks — D9 slice 3 marked SHIPPED with its six review findings,
   slice 4 scoped and measured, P1's second increment of the day recorded with the counts.

## Two things this run did that are worth repeating

**Measure the defect before fixing it, with a probe that reproduces the shipped number.** The
thrust-to-weight probe printed the metric the analysis actually returns beside its own recomputation,
and only the files where those matched were used as evidence — which is how six AltimeterCloud rows
were correctly excluded from the argument rather than quoted as if they supported it. The same
discipline, skipped on the first `avgBoostAcceleration` probe, produced a page of alarming numbers
that were entirely my own missing gravity correction.

**Let the digest guard do its job.** `corpus-digests.json` went red on 18 flights, which is the guard
working. Its own instructions say to name the moved files first and regenerate in the commit that
moves the analysis — so every one of the 18 was read back before and after, and the two that did not
appear in the probe turned out to be a defect in the probe's file loader rather than a surprise in
the change.
