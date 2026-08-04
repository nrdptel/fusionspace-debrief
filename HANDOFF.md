# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **A Sev-1, reproduced and shipped** | **A descent rate published 2.4× too fast.** `legRate` read the rate off a derivative smoothed three times; `timeMean` only telescopes to the chord when handed the bare finite difference. It is the chord between two short **medians** now — and that second half came from the pre-push review, not from me. Over the flights recorded more than once, 7 of 8 groups tightened and none widened. |
| **The review earned its keep twice** | The first version of the Sev-1 fix was a bare chord, and a fresh agent given only the diff found that (a) it rested a safety number on 2 samples, one of them `argMax` by construction, and (b) my new pinning test had become a **tautology**. Both are fixed. **Read *The pre-push review is not a formality*.** |
| **D — capability** | **D9 slice 2 SHIPPED and merged (`#114`, live).** Debrief reads an OpenRocket `.ork` prediction and refuses to call it a flight. **Slice 3 is next.** |
| **P — product & craft** | **`ChipButton` shipped — §5's sixth word — and the scan that was supposed to catch hand-rolls could not see any of them.** It read `<span\|li\|div>`, so every chip-shaped BUTTON was invisible; widened to `button\|a` it named six at once. `invertedTypeFiles` 11 → 10, `uiAdopters` 35 → 36. §5 also **settles `offline`**: Debrief is offline-complete and the "0 of 21 surfaces" debt was phantom. |
| **The lesson of this run** | **A `BACKLOG.md` entry told me not to make the fix, and it was wrong.** Its arithmetic was right and its premise was not. Engaging with it took twenty minutes and was the most valuable twenty minutes of the run. Read *The one thing to read before anything else*. |

**Re-measure before believing any of this**: `git fetch --prune origin`, then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moves underneath you.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout**: `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` now carries **62 fixtures** (61 + the new `.ork`); the
  digest snapshot covers **50**. `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a no-op —
  the attached checkout is the whole reason there is a corpus.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window, not a record.
- **Playwright needed `npx playwright install chromium`** — the image ships chromium-1194 and this
  Playwright wants 1228. Documented path, worked, ~1 min. **It is paid for again every session and
  belongs in the environment's setup script.** Said for at least the third run running.
- **No open pull requests** on either repo at session start. Two were opened and merged this run.
- **GitHub MCP tools work; there is NO route to create a release or upload an asset**, and no `gh`.
  Direct `api.github.com` returns 403 through the proxy even with `GITHUB_TOKEN` set. That is why the
  corpus release below is an owner action.
- Production was serving `b8823e5`, identical to `origin/main`, at session start.

## The one thing to read before anything else

**A `BACKLOG.md` entry said "Do NOT fix it by using the chord directly." I made the fix anyway, and
that was right — but only because I checked, and checking is the whole point.**

The entry was about eight descent legs that disagreed with their own chord by ≥5%. It had done real
work: it named all eight, measured the median and mean error, identified the 0.6 s smoothing as the
likely mechanism, and — to its credit — said the mechanism's prediction *held for main legs and did
not hold for drogue legs*, so it refused to call the cause established. Then it closed with a
specific instruction not to use the chord, on this evidence: on the `eggtimer euler-explosion` file,
a 15.3 s leg gives a chord implying **303 m** of descent on a flight whose apogee reads **292 m**.

**That arithmetic is exactly right.** I reproduced it. The trace goes 292.0 m → −10.4 m, below the
pad.

**The premise underneath it is wrong, and that is the part to learn from.** The instruction assumes
the smoothed figure was the sounder of the two on that file. Measure it: **7.31 m/s over that same
15.3 s leg implies 112 m of descent, contradicting the same trace by 191 m**, where the chord's
303 m matches it. Both are readings of an unsound trace — the "apogee" arrives at t = 1.0 s, 0.8 s
after liftoff, because it is a blast pressure spike from a motor that exploded at Mach 2.4. Neither
number is trustworthy. The smoothed one was merely **more plausible-looking**, which is the worse of
the two failures and exactly the kind this repo keeps paying for.

So the honest split, which the entry had bundled together: **six of the eight were a real estimator
defect** (proved by the same-flight pairs and by the files' own speed columns), and **two are records
whose altitude trace is not a flight profile at all**. The second group is not an estimator problem
and no estimator will fix it. It is filed as its own entry now, with the numbers.

**The generalisable rule:** a backlog entry that says "do not do X" is a claim like any other. Read
what it measured, then check whether its conclusion follows. This one's measurements were sound and
its inference was not, and taking it at face value would have left a 2.4× wrong canopy-sizing number
in production indefinitely — the entry was, in effect, protecting the defect.

## What shipped this run

Four merges, all live. Two repos.

### 1. `nrdptel/debrief-fixtures#4` — the corpus's first prediction, reachable at last

Slice 1's `.ork` had been pushed to a **branch** by an earlier session and never merged, so a session
that went looking for it found nothing — which is what happened to this run's own scoping agent. It
is on that repo's `main` now.

And the reason it mattered more than it looked: **`scripts/make-release-zip.sh` listed its ten format
directories inline.** Adding an eleventh family to the repo did not add it to the release asset. The
zip would have built clean, the sha would have matched, `fetch-fixtures` would have verified it, and
`corpus.test.ts` would simply never have seen those fixtures — a skip that prints exactly like a
pass. The payload is derived from disk now, and the built asset is checked against the manifest
before it can be published: a named file that is missing makes the script refuse, print it, and
delete what it built. Falsified by appending a bogus manifest row.

### 2. `#114` — D9 slice 2: Debrief reads a prediction and refuses to call it a flight

`lib/parsers/openrocket.ts` opens the `.ork` zip, reads `rocket.ork`, and returns the ten stated
scalars as `ReportedValue[]` with `source: 'predicted'`. A `.ork` dropped alone is refused with a
sentence naming the design and what it needs. **Nothing shows a prediction yet — that is slice 3.**

**Units say only what they can prove**, and the first draft of this did not. `maxvelocity / maxmach`
is the speed of sound only if the velocity is m/s — 340.1, 338.7, 339.1, 339.1, 339.1 over the
fixture's five simulations — re-checked per file, and a run that fails is dropped. The other nine
rest on OpenRocket writing all ten from one internal SI model: **evidence, not proof.** The header
and the README both claimed proof for all ten until the pre-push review caught it.

Three defects in code that already existed, found on the way in:

- **The three cross-check renderers fell through to acceleration.** Each wrote
  `q === 'length' ? … : q === 'speed' ? … : accel`. `reported.ts` already records that shipping once,
  dividing a device's own descent rate by g. Adding `time` and `mach` would have printed a flight
  time as g on all three. `renderReported` is total and fails to compile when incomplete.
- **The picker greyed out three formats the app can read.** `fileAccept.test.ts` swept for
  `endsWith('.ext')` only, so an anchored regex was invisible to it. Widened to both forms it
  immediately named `.xtra` and `.bin` too — a flyer with an Entacore AIM download had it greyed out
  and so could never reach the message explaining what to do with it.
- **A classification guard was a hand-typed list of six**, blind to every metric added since.

Six more found by reading the diff back, and one of them was the units over-claim above. Also: a
refusal that told a flyer to run a simulation they had already run; a refusal that could not name the
file; a self-closing `simulation` element that swallowed the next one's figures; a rocket name that
could be a component's; **a test that could not fail** (a regex built from the type's own members);
and a JSON document that contradicted its own units block.

### 3. The Sev-1 — a descent rate 2.4× too fast

See *Read this first*. `legRate` publishes the leg's own chord, read between a short **median** at
each end rather than between two single samples.

**What settles it is the same-flight groups**, not an argument about estimators — two instruments
watching one descent have no reason to agree better unless the reading got closer to the truth:

| flight recorded more than once | leg | spread before | spread after |
|---|---|---|---|
| XPRS 2015 (`.rff` + `.txt`) | whole | 40.1% | **1.8%** |
| Stargazer 1 (EasyMega ×2) | whole | 9.0% | **0.3%** |
| sg1.1 Booster (`.csv` + `.eeprom`) | drogue | 10.6% | **0.5%** |
| sg1.1 Booster | main | 11.5% | **0.8%** |
| lemiv L3 (3 recordings) | main | 19.9% | **4.3%** |
| lemiv L3 | drogue | 4.9% | **4.0%** |
| Kairos (3 recordings) | whole | 153.6% | **112.3%** |
| ac-lilnuke (4 recordings) | whole | 0.2% | 0.1% |

**7 tightened, 1 unchanged, 0 widened.** 42 legs moved; 43 of 50 digests. One record **gained** a
rate it had been withholding — `euroc-stacarl2` eggtimer, 25.15 m/s, where the old estimator
produced nothing usable and a flyer saw no descent rate on a record that plainly states one.

### 4. `#116` — §5 gains `ChipButton`, and a scan that had gone blind

`Chip` is a static token rendering a `<span>`. Four surfaces wanted its geometry with a click on it
and each hand-rolled the same string. **The pin that holds `Chip`'s hand-rolled count could not see
any of them** — it scanned `<span|li|div>`, so every chip-shaped BUTTON was invisible and it read
green while four sat on the page. Widened to `button|a`, it named six at once.

`ChipButton` is built from that census, so its three props are exactly what the four sites varied
in. Geometry moves to §5's own `px-2 py-1` — §4 has no `-0.5`, and a static chip beside an
actionable one must not be two heights. Two of the six are two-line picker options and a third wants
`Segmented`; each is recorded in `DELIBERATE` with its reason rather than left as a silence.

**§5 also settles `offline`.** A census kept reporting "0 of 21 data surfaces implement offline, in
a PWA". One runtime `fetch` exists in the whole app and the service worker precaches it, so even the
sample flight opens with the radio off — three `e2e/pwa.spec.ts` cases pin it. Debrief is
offline-complete, and "0 of 21 **need** it" is the opposite finding. **I shipped a change disabling
that button offline before checking and the suite refused it**, which is why the section now carries
the grep and the test name.

## The pre-push review is not a formality

**A fresh agent handed only the diff, with no other context, found two things I had missed, and one
of them was in the fix I had just written to correct a Sev-1.** Both were real. This is the second
run running that the adversarial pass has caught something the gate could not — last run it refuted
a wrong finding one command from production; this run it caught a wrong *fix*.

- **The bare chord rested a safety number on two samples**, and one of them is `argMax(altClean)` —
  the record's most extreme sample by construction, which is exactly where a spike survives. The
  Hampel filter does not always catch one: `blueraven meraki2-121km` peaks at 75,516 m on two
  samples sitting between neighbours of 54,233 and 58,509, because at 121 km the whole neighbourhood
  is that noisy and there is no local consensus to measure an outlier against. The bare chord
  published **138.85 m/s** off those two samples. Endpoints are short medians now: **107.4**, which
  is what the superseded estimator read there to 0.01%. It also fixed the one same-flight group the
  bare chord had made *worse* (lemiv L3 main 19.9% → 25.0% → **4.3%**).
- **The test I added to pin the fix had become a tautology.** It compared the published rate against
  a chord it recomputed at the same two indices — the same arithmetic on the same doubles, agreeing
  to 0.000% because it could not do anything else, in a commit whose own message called it a real
  ratchet. **Two further attempts were also wrong**, and the pattern is worth keeping: a
  least-squares fit is biased on a curved leg (it read 81.70 where the device's own column says
  63.89), and a sensitivity check measured the sensitivity of the test's *own reimplementation* of
  the endpoint rule, so mutating the estimator changed nothing. What works is a **second
  instrument**: the device's own speed channel, 11 legs, median error 0.109%, and it fails on a +12%
  estimator error. The legs it cannot use are counted and named in the message.

**The rule this run would add:** when a fix and its new test are written together, the test is the
part to distrust. It was authored by whoever just convinced themselves the fix was right.

## Traps this run hit — read these before repeating them

- **A red gate that was not one.** `npm test` reported 5 failures — two of the heaviest corpus
  fixtures timing out at exactly **5000 ms** — while six investigation agents, an `npm install` and a
  browser download competed for CPU. Re-run alone: **1126/1126**, same code. **The tell is that the
  failures were timeouts, not assertions.** `MAINTAINING.md` already warns that a whole suite dying
  instantly is an environment report; this is the same lesson at a smaller scale. Run the gate alone.
- **`git checkout <file>` is not an undo for a mutation experiment.** Falsifying asserts by mutating
  the source is right and I did it; reverting with `git checkout` was not. On an **untracked** file it
  silently does nothing (so two mutations stayed in the tree), and on a **tracked** file with
  uncommitted work it discards that work (it wiped a finished edit to `lib/flight/reported.ts`,
  which I then had to rewrite). Both were caught by re-running the tests, which is the only reason
  this is a note and not a shipped bug. **Save a patch and `git apply -R` it, or make the inverse
  edit explicitly.**
- **GitHub eats angle brackets in a PR body**, even inside backticks. `<flightdata>` posted as an
  empty code span. Write element names as prose (`the flightdata element`) and **read the body back
  after posting** — which you are doing anyway to strip the attribution footer the harness appends.
  It appended one to both PRs this run.

## The §9 counts

Run at the end of the run, on the tree that shipped. **Two moved the right way and none moved the
wrong way**, both earned by `#116`'s `ChipButton` conversions.

| check | count | target |
|---|---|---|
| `rounded-lg` | **0** | 0 |
| card treatments | **3** | 1 (documented floor is 3, and it is a guard) |
| off-scale spacing | **0** | 0 |
| off-scale type | **1** | 0 — `components/SiteHeader.tsx:62`, `text-2xl` |
| inverted type files | **10** | 0 — was 11; `ChannelExplorer` left the list |
| `ui.tsx` adopters | **36 of 48** | most — was 35 |

`lib/design-system.test.ts` is green at 20 tests, which is the ratchet holding each of these exactly.

## The corpus sweep, and it is NOT empty

`npm test` runs **1133 tests across 77 files** with the corpus attached — `manifest.csv` carries
**62 fixtures**, the digest snapshot covers **50**, and `corpus.test.ts` alone is **143 tests**.

The sweep that mattered this run was a recomputation: **every reported descent rate against the
leg's own chord, over the 41 legs the corpus test sweeps.** Eight disagreed by ≥5%. All eight are
closed — **but by construction**, because the published rate IS the chord now, so that comparison
stopped being evidence the moment the fix landed and had to be replaced. See *The pre-push review is
not a formality*. The check compares against the **device's own speed channel** now: 11 legs, median
error **0.109%**, worst 1.7%, exclusions counted and named, and it fails on a +12% estimator error.

**43 of 50 digests moved**, every one accounted for by the 42 descent legs that changed. Regenerated
with `CORPUS_DIGESTS=write npx vitest run lib/parsers/corpus.test.ts`.

## The two track questions, answered

**What can a flyer DO after this run that they could not before? (D-track)** Drop an OpenRocket
design file on Debrief and be told what it is — a prediction, how many simulations it states, and
what to drop alongside it — where before it fell into the column mapper as a table of XML with
nothing to map and no way out. And, separately: read a descent rate they can size a canopy against,
on the six corpus flights where it was previously wrong by 5–144%.

**What is measurably better about using the tool after this run? (P-track)** Four hand-rolled
chip-shaped controls became one primitive, so a filter chip and a static chip in the same row are
now one height instead of two, and each gained a focus ring and a 44 px hit box.
`invertedTypeFiles` **11 → 10**, `uiAdopters` **35 → 36**. Separately and worth as much: the
`offline` state stopped being a phantom 21-surface debt — measured, Debrief is offline-complete, and
§5 now records that with the grep rather than letting every census re-file it.

Three more P-track-adjacent things landed inside the D work, named so nobody re-finds them: the file
picker stopped greying out three formats the app can read, every refusal message now names the file
it is refusing, and one refusal stopped instructing flyers to do something that could not help.

## Pick up first

1. **P1 item 5 — the five required states, and the census is now trustworthy where it was not.**
   `ROADMAP.md` said 15 data surfaces; it is **21**, and 0 of 21 implement all five. **But two of
   the alarming numbers dissolved on inspection this run, and the pattern is the thing to carry:**
   - **`offline` is not a debt.** Debrief is offline-complete — one runtime `fetch` in the whole
     app, precached by the service worker, pinned by three `e2e/pwa.spec.ts` cases. §5 records it.
     **I shipped a change disabling the sample button offline before checking, and the suite
     refused it.** Do not re-open this without re-running the grep.
   - **`loading` genuinely has no primitive**, and that half stands.
   - Several "implements zero of five" claims were **parent-gated surfaces** whose parent handles
     the states properly. `CompareSurface` in particular handles four distinct cases with careful
     copy. Check the parent before filing a child.
   The ranked conversions, highest leverage first — and **verify each before scoping it**, because
   two of the three I checked were not what the census said:
   - **The save-refused path — real, but not the defect that was filed.** The claim was that
     `Analyzer.tsx:295` returns `id: null` "with no `else`, save-failure swallowed". **There is an
     `else`**: `:301` calls `logbook.reportWriteRefused()`, and six call sites across `Analyzer`
     and `CompareSurface` do the same. The genuine defect is that the message lands on the
     **logbook**, not on the report the flyer is looking at when the save fails. That is a
     `Notice` on the report, not new machinery.
   - **`Chart.tsx`** — on every report; empty, loading and error all absent. **Not verified by me** —
     treat it as a claim.
   - **`CompareView.tsx`** was filed as "1128 lines, implements zero of five". Its parent
     `CompareSurface` handles empty, loading, storage-blocked and one-flight with four distinct,
     carefully-written messages. Read the parent before believing the child.
   The seven `Readout`-only reading panels are a *two*-increment job, not one: the shared
   `extrapolated` decision wants a corpus measurement before a component edit.

2. **D9 slice 3 — the cross-check table grows a third column.** Everything it needs is in place:
   `source: 'device' | 'predicted'` exists, `REPORTED_QUANTITY` covers all fourteen metrics,
   `renderReported` makes a missed unit a compile error, and `METRIC_FIELD` already records which
   four figures get no verdict. **The real work is that no renderer reads `source` yet** — both
   `DeviceSummary.tsx` and `lib/report.ts` are hardcoded to "The logger's own summary" / "The device
   wrote these figures into the file", so a prediction reaching either would be captioned as a
   measurement, and `isGravityConvention` would tell a flyer the *simulator* reports acceleration
   net of gravity. The verdict language has to distinguish "these two measured the same flight and
   disagree" from "the flight did not do what was predicted", which is not a discrepancy at all.

3. **File the descent-rate gate.** Two records publish a rate off a trace that is not a flight
   profile — `eggtimer euler-explosion` (apogee at t = 1.0 s, a blast spike, leg ending 10.4 m below
   the pad) and `blueraven meraki2-121km` (121 km, where the barometric model has no validity). Both
   are in `BACKLOG.md` with the numbers. **No estimator fixes these**; they need a gate, the way
   `descentAboveFreeFall` already withholds with a reason.

## What the owner has to do, and nobody else can

**Cut a `v1.2.0` corpus release.** The D9 prediction fixture is on `nrdptel/debrief-fixtures` `main`
but in **no release asset**, and `npm run fetch-fixtures` downloads the asset pinned in
`corpus.lock.json`, still `v1.1.0`. So **CI cannot see the fixture**, and three cases in
`lib/parsers/openrocket.test.ts` carry an `existsSync` guard and skip there — deliberately, with a
comment saying so. The 24 synthetic cases are what gates CI.

This session had no route to do it: `api.github.com` returns **403 through the proxy even with
`GITHUB_TOKEN` set**, there is no `gh`, and the GitHub MCP tools have no release verb. Two commands:

```bash
scripts/make-release-zip.sh v1.2.0     # in the fixtures repo → corpus-v1.2.0.zip, 26 MB
                                       # sha256 fc06599b2b9fefb690acebf453474085b38d77e8e6d7ba064a6a85bf8eaeb4ba
```

then attach it to a `v1.2.0` release and bump tag + asset + sha256 in `corpus.lock.json` in one
commit. That repo's `#4` already fixed the reason this would otherwise have gone unnoticed.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed the same `DESIGN.md` §9 edits**, unchanged for seven runs.

**IMPOSSIBLE IS THE WRONG WORD, and it has been for at least seven runs — corrected 2026-08-03.**
This paragraph has said the port could not be attempted because the session was created with
`debrief` and `debrief-fixtures` only. **Checked rather than assumed this run:
`nrdptel/fusionspace-loft` is listed, public, and `can_push: true`** — a session can attach it with
the harness's add-repo tool and push. So the debt has been *deferred*, not *blocked*, and every run
that read this line took "impossible" at face value and moved on. That is the cost of an unchecked
claim in a handoff: seven runs of compounding divergence between two files the design system says
are identical.

**Not attempted THIS run either, and the reason is different and smaller:** it arrived at the end of
a long session, behind an outstanding pre-push review, and `loft` had been pushed to 34 minutes
earlier by something else — opening a front in a second repository whose current state I had not
read was the wrong risk to take late. **A session with room should attach it and pay the whole debt
in one pass**, which is now three §5 words plus §9, not one.

**What is owed, as of this run — three words, not one.** `Button variant="link"`, `Chip`'s
`good`/`warn`/`danger` tones, and `Notice`. Each is self-contained and each is described in its own
entry above with the census that justified it. **Port `Notice` first if only one fits**: it carries
the accessibility decision (the primitive must not own `role`), and Loft will hit the degraded-state
question the moment it keeps anything on the device.

**§5's fifth button weight is owed to the sibling, added 2026-08-03.** `Button variant="link"` is
in this repo's `DESIGN.md` §5 and `ui.tsx`; `nrdptel/fusionspace-loft` carries the same §5 and this
session had only this repo attached, so the edit is written to make sense there too and the port is
outstanding. It is a self-contained addition — one entry in `BUTTON_VARIANTS`, one clause in the
`Button` class list, one §5 bullet.

**§5's chip tones are owed to the sibling, added 2026-08-03.** `good` · `warn` · `danger` on the
`500/30` + `500/10` ramp, `font-medium` on every hued tone, and — the part that matters most to port
— **`default` moved off `bg-zinc-50`/`dark:bg-zinc-900`, which are byte-identical to two `CARD_TONES`
fills.** If Loft's `Chip` still carries the old neutral, its default chips are invisible against their
own containers in at least one theme, exactly as Debrief's were. Self-contained: one `CHIP_TONES`
map, one clause in the class list, one §5 bullet, and the visibility test that pins the relationship.

**~~A THIRD §5 question~~ — ANSWERED 2026-08-03, and only the PORT is still owed. §5's five states
had no name for a DEGRADED capability**, and now they do: `Notice`, the inline primitive built this
run on a census of six hand-rolls. Everything below is the argument that produced it, kept because
it is the reasoning a porting session needs. **What is owed to `nrdptel/fusionspace-loft` is the
primitive and the §5 bullet, not the decision.** The logbook shipped `write-blocked` this run — reads fine, writes refused —
and it is genuinely none of empty, loading, error, populated or offline. It is the surface working
while one thing it promises does not, which is a shape any repo with local storage will hit; Loft
will hit it the moment it keeps anything on the device. Debrief solved it privately with a fourth
status and an amber `role="status"` caveat that sits ABOVE real content rather than replacing it,
which is a pattern §5 could name in a paragraph. **Do not re-derive the argument:** the reason it is
not `ErrorState` is recorded in `BACKLOG.md` under the 2026-08-03 amber/danger entry, and the reason
it is not simply `blocked` is that a full quota reads perfectly, so the shared read-or-keep sentence
would be half false. Deciding this is a §5 change, and §5 is carried identically by the sibling.

**Two `DESIGN.md` §5 edits still owed to both repos:** `Frame` is not listed in §5 though it has six
adopters, and the invented "indigo text" button weight survives — and the audit measured it at **7
standalone controls across 5 files**, not the 1 the ledger records (`Analyzer.tsx:699`,
`ChannelExplorer.tsx:421`, `CompareView.tsx:562/587/596`, `MethodsPointer.tsx:32`,
`RecentFlights.tsx:838`). A session scoping a one-line fix against that entry will find a five-file
problem.

**An owner action:** the attached fixtures checkout (`0e90bfd`) is **3 commits ahead** of the tag
`corpus.lock.json` pins, and `v1.0.0` and `v1.1.0` are the same commit. So the local corpus is a strict
superset of the one gating CI. Cutting a `v1.2.0` and re-pinning is the owner's call.

**And a fixtures-repo finding worth acting on:** `jan10`'s high-rate file carries a 20,160-row verbatim
replay. Whether that is a bad download or a genuine board artefact changes what it should be used for —
either way the fixture wants a `knownIssue` note recording it, so no future run re-derives it.
