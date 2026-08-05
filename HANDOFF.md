# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Everything below is LIVE.** | Ten pull requests, `#130`–`#139`, all merged to `main` and all confirmed serving at `debrief.fusionspace.co`. Nothing is pending on a branch. |
| **A Sev-1, shipped — and its OBVIOUS fix was worse than the bug** | **The deployment shock was under-reported by up to nine-fold** (`#130`). 12 of the 23 corpus readings moved and **11 went up**. Kairos Booster's apogee charge is **84.6 g**; the old code published **22.8 g** from the `.csv` and **1.5 g** from the `.eeprom`, and neither was the charge. |
| **D — capability** | **D9 slices 1–4 all SHIPPED.** A design dropped in with a log is compared against it *and now draws its saved curve on the altitude chart* (`#131`, `#136`), dashed, on a union x that resamples nothing. **Only slice 3b is left in D9.** |
| **P — product & craft** | Four increments. §9's compliance block could not see the drift it exists to catch (`#131`); the comparison's only two exits were **20 px** on a phone (`#133`); §5's fifth state got its primitive and `/stitch` stopped being silent to screen readers (`#137`); and `/stitch` stopped telling flyers their composite did not exist (`#139`). |
| **Two honesty breaches closed on cert-document surfaces** | The channel explorer published a peak speed the report withholds (`#135`), and the comparison's Max Q was bare where the report's is caveated — plus a missing `rankBlocked` the filing had not spotted (`#138`). |
| **§9 counts, start and end of run** | `rounded-lg` **0** · card treatments **3** · off-scale spacing **0** · off-scale type **1** · inverted-type files **10** · `ui` adopters **36 of 48**. **Identical at both ends; no count moved the wrong way.** |

**Re-measure before believing any of this**: `git fetch --prune origin`, then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moves underneath you.

## The one thing to read before anything else

**Five times this run a confident answer was wrong, and not one was caught by reading. Every one
was caught by trying to break it.** They are listed because the pattern is the lesson, not the
individual bugs.

1. **The obvious fix made the Sev-1 worse.** The deployment shock was read over a window of SAMPLES
   sized from the record's median interval — real, and the fix that follows from it is wrong.
   Converting it to a symmetric ±0.3 s of clock made the two exports agree beautifully and made the
   number systematically wrong, because **a charge does not fire at the index Debrief detects the
   deployment at.** It would have shipped **0.65 g where the airframe took 63.2 g**. Caught by the
   pre-push review, twice independently.
2. **A reported Sev-1 was ordinary physics.** "Drag loss 10× the apogee is self-evidently
   impossible" — it is not. A rocket at Mach 1.3 coasts ~10 km in vacuum and manages ~3.4 km in
   air; 17 of 28 corpus flights exceed their own apogee and always will. Measured and dismissed.
3. **A reported fix would have removed a documented decision.** The channel explorer's velocity
   trace stays deliberately "so a mis-scaled column can still be seen and diagnosed", and a test
   already said so. The defect was the `max` STATISTIC beside it, not the trace.
4. **An e2e case passed three times with its feature disabled.** Each disable was a type error, so
   the build failed and the suite ran against the last good `out/`. See the section below.
5. **Two checks I wrote could not fail.** The Max Q crown assertion passed with `rankBlocked`
   removed, because both fixtures carried the same value. And the loading-state check read `//`
   comments as code — it failed naming the comment I had just written.

**The rule this produces:** in this repo, writing the assertion is not the work. *Trying to break
it* is. Every check that shipped this run was falsified before it was trusted, and two of them
turned out to be worthless until that step.

## A stale `out/` fails OPEN — check the build succeeded

`npm run test:e2e` serves `out/`. **A build that FAILS leaves the previous build there**, so the
suite tests code that was never written and reports green. Falsifying D9 slice 4's e2e took four
attempts; three "passed" with the feature disabled and all three were a type error in the disable
itself. Piping the build to `tail -1` or `/dev/null` is how each got past me.

This repo already said *"re-run the gate after the last keystroke"*. The stronger form: **confirm
the build SUCCEEDED before believing anything the e2e suite tells you.**

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout**: `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the digest snapshot covers **50**;
  `corpus.test.ts` is **148 tests**. `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a
  no-op — the attached checkout is the whole reason there is a corpus.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every
  session; it belongs in the environment's setup script.** Said for at least the fifth run running.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before
  the first commit. A fresh container will NOT have them.
- **GitHub appends an attribution footer to EVERY pull request body** — it did on all ten — and
  **eats anything tag-shaped**: `<flightdata>`, `<databranch>`, `<Card>` were all silently stripped
  from bodies this run. Read every body back through the authenticated API and repost. **A plain
  `curl` of the PR reported one body "clean" while the footer was present**, so check with the tool
  that authenticates, not with curl.
- **Subagent tooling failed hard, then recovered.** One whole fan-out came back with every agent
  BLOCKED by the harness permission layer; a one-agent probe minutes later worked. If a fan-out
  returns unanimously blocked, re-probe with one agent before concluding anything — and note the
  agents were right to return BLOCKED rather than NONE.
- **A schema on `agent()` broke all 8 agents** of the first fan-out (StructuredOutput retry cap).
  Plain-text returns with a stated format worked on the retry.

## What shipped, in order

| PR | what | pinned by |
|---|---|---|
| `#130` | **Sev-1: deployment shock read where the charge fired.** Also `testTimeout` — a full run went red at exactly 5,000 ms and the next passed. | corpus invariant over 3 export pairs, falsified against BOTH wrong versions |
| `#131` | The `.ork` saved curve is READ (columns by NAME — 24.12 localizes them); §9's radius/spacing/type greps made able to see drift | `openrocket.test.ts`, and a fixture where the old greps reported 0 against 7 violations |
| `#132` | `COMPETITION.md` row 32 — Project APEX overlays a prediction **the other way round** | — |
| `#133` | The comparison's only two exits were 20 px on a phone | `e2e/touch.spec.ts`, widened to see anchors at all |
| `#134` | The cold walks' findings filed, one as an unverified Sev-1 candidate | — |
| `#135` | The channel explorer's stats published a peak speed the report withholds | `explore.test.ts` ×4 |
| `#136` | **D9 slice 4: the predicted curve is DRAWN**, dashed, on a union x | `overlay.test.ts` ×6, incl. a no-resample PROPERTY; `e2e/analyze.spec.ts` |
| `#137` | §5's fifth state gets `Loading`; `/stitch` was silent to screen readers | 2 design-system assertions, falsified separately |
| `#138` | The comparison's Max Q: no refusal, no caveat, **and no `rankBlocked`** | `report.test.ts`, both halves falsified |
| `#139` | `/stitch` prerendered "Nothing to assemble yet" over a real composite | raw-HTML fetch, falsified |

## Pick this up first

1. **D9 slice 3b — let a flyer pick which simulation** when a design states several. The last slice
   of D9. It is a control with its own state, persistence and touch contract, which is why the
   unambiguous case shipped first. The corpus `.ork` states five simulations (50.59–319.75 m), so
   the fixture for it already exists and is currently exercised only by the refusal path.
2. **`DESIGN.md` §9 is OWED TO THE SIBLING REPO.** Both repos carry an identical copy and a change
   to one is owed to both *in the same run*. The sibling was not attached to this session, so the
   §9 correction is unshipped there. It is §9's block plus the paragraphs under it.
3. **The cert deliverable's CSV cells are display strings** (`BACKLOG.md`) — **and read that entry
   before starting, because the obvious fix is a trap.** `CompareMetricRow` already carries
   `values: number[]`, which makes it look like a five-minute change; swapping the cells for bare
   numbers would strip `(baro)`, `(at least)` and `withheld — …` out of the document a flyer files,
   undoing `#135` and `#138` in one gesture. The entry proposes the shape that keeps both.
4. **Two §9 greps are still blind, measured and deliberately unchanged** (`DESIGN.md` §9): the card
   grep anchors on a literal class ORDER and scans `components` only, and an attribute-reading
   rewrite reports **0 where the truth is 3**; the inverted-file loop never measures a route, and
   adding `app/**/*.tsx` takes it **10 → 12** (`app/validation/page.tsx` 1/0,
   `app/privacy/page.tsx` 4/3). Both need the ratchet to move in the same commit.

## Roadmap counts that were stale, corrected by measurement

The P1 scout re-measured what P1 has been spending increments against, and three were wrong:

- **item 7** records 41 hand-rolled `<button>`s outside `ui.tsx`; there are **18**, of which about
  four are genuinely convertible.
- **item 2**'s "16 of 46" is stale against the ratchet's current **10 of 48**.
- **`ROADMAP.md:2266` still calls the offline state "the thing to fix first"** while `DESIGN.md:308`
  records Debrief offline-complete and P1's own header agrees with `DESIGN.md`. **A contradiction
  inside one milestone**, and exactly what sends a session off to build a phantom. Not corrected in
  the file this run — do that before scoping P1.

## The done-check, executed — what each step returned

1. **Corpus sweep: 0 findings.** 148 tests over **62 manifest fixtures**, 50 covered by the digest
   snapshot. Nothing new fell out; every defect this run came from a probe, a walk or a review.
2. **Cold walk of the built export**, at each merge and again at the end. It found `#139` — a
   defect no test failed on and the source reads correctly for. Production confirmed serving each
   SHA before moving on; the gap at the end of the run is **zero**.
3. **`COMPETITION.md` row 32 added**, and it corrected an assumption slice 4 was about to build on.
4. **§9 counts: unchanged at both ends of the run** (table at the top). None moved the wrong way.
5. **`BACKLOG.md` read and corrected** — the entries this run fixed are marked with what was
   *learned*, including that one reported fix would have been wrong.
6. **Both track questions.**
   - **D:** a flyer can drop an OpenRocket design in with their log and see the curve it predicted
     drawn against the one they flew — dashed, on its own clock, never resampled onto the flight.
   - **P:** the deployment shock is correct where it was understated up to nine-fold; two
     cert-document surfaces carry caveats they were dropping; `/stitch` announces its wait and no
     longer denies a composite exists; and the comparison's two exits are thumb-sized.
7. **`ROADMAP.md` updated** — D9 marked slices 1–4 SHIPPED with its three pinning checks named, and
   the bracket widths recorded under *Decisions taken without the owner* with the two alternatives
   that were measured and rejected.
