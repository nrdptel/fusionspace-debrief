# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **PR #156, four commits, merged on green.** `c16c89b` D11 slice 3 · `7161f5a` the Sev-1 · `838576f` the review fixes · `e46c347` P9 slice 4 · `dda9e05` the filing. Re-measure before believing it: `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending on the branch** | **Nothing.** No pull request is open on either repo. |
| **Sev-1** | **One found, reproduced on real files, fixed.** A burnout speed labelled `measured` over a barometric derivative — **2 of 38** analysable corpus recordings, at 121.2 m/s and 128.4 m/s, three rows under the identical figure labelled `derived`. |
| **D — capability** | **D11 slices 1–4 SHIPPED. Only slice 5 is left**: a stitched composite keeping its stages, which needs the same treatment slice 3 gave the grouping applied to a statement (`debrief.firstStage`) that lives in `localStorage` outside the logbook entirely. |
| **P — product & craft** | **P9 slices 1–4 SHIPPED. Slice 5 is scoped and is the last one: the methods page cites nothing** — 0 URLs, 0 DOIs, no named algorithm in 102 KB, while the code names `Hampel` 11 times. `COMPETITION.md` row 37. |
| **§9 counts, start and end of run** | radius **0** · card treatments **3** · off-scale spacing **0** · off-scale type **1** · inverted-type files **10** · `ui` adopters **36 of 48**. **Identical at both ends; none moved the wrong way.** |

## The one thing to read before anything else

**A subagent's review found a real bug in the increment I had just committed, my first fix for it
was worse than the bug, and the milestone's own e2e caught that.** All three steps matter.

The grouping token in a flight record has to be equal across the records of one flight or the
restore silently does nothing — and "silently" is the whole problem, because the failure looks
exactly like two ordinary flights. I first used the flight's own id. That is its *current primary's*
id, and the primary moves the moment a flyer presses "report by this one". The review caught it.

The obvious repair was the earliest `addedAt` — "the recording opened first", which is the rule
`planJoin` already uses and reads as a property of the set. **It is not.** `saveRecent` writes a
fresh `addedAt` every time a file is re-read, *including a plain re-open*, so exporting a record from
each of two recordings moves "earliest" between the two exports. The e2e walk that had passed an hour
earlier failed with two different tokens.

Three things follow:

1. **"Looks immutable" is not a property; check what writes it.** `addedAt` is named like a creation
   stamp and behaves like a last-touched stamp. One `grep` for its writer would have said so.
2. **A journey test earns its cost on the second change, not the first.** The walk was written to
   prove the feature; what it actually paid for was catching a refactor of the feature.
3. **The review agent was right about four of fourteen findings and wrong or over-stated about the
   rest.** Reproducing each one before acting is what separated them — and three of its findings
   were assertions in my own new tests that could not fail, which is the highest-value thing a
   second reader has found in this repo.

**And the opening Sev-1 screen ranked its two findings the wrong way round.** It led with the
gap-in-the-ascent leak, which is real and reproduces on a synthetic but fires on **0 of 38** corpus
recordings, and put second the provenance mislabel that fires on **2 of 38** today. A corpus sweep
settled it in ten minutes. Sweep before you rank: an agent ranks by how bad a thing sounds, and the
corpus knows how often it happens.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout.** `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the corpus suite is **148 tests**;
  38 recordings analyse end to end through the plain parser path. `FIXTURES_TOKEN` is NOT set, so
  `npm run fetch-fixtures` is a no-op — the attached checkout is the whole reason there is a corpus.
- **`node_modules` was ABSENT at session start.** `npm install` first, before anything measures.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every
  session; it belongs in the environment's setup script.** Said for at least the eighth run running.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before
  the first commit.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window.
- **The harness appended an attribution footer to the pull-request body**, as it did last run. It was
  read back and stripped with `update_pull_request`, which does not re-append. Still parked in
  `OWNER-NOTES.md` → *Awaiting the owner*.
- **A full serial e2e run is ~6.7 minutes** at `--workers=1`, and a full gate cycle (unit + build +
  e2e) is ~10. That is the real cost of an increment here; budget four gates an hour, not more.

## What shipped, in order

| commit | what | pinned by |
|---|---|---|
| `c16c89b` | **D11 slice 3 — the flyer's grouping travels with the record.** The statement rides outside the `RawFlight` fields; the drop path restores it in the second pass that already pairs summaries | `lib/flightGroups.test.ts` + `lib/canonical.test.ts` (16 cases) + an e2e walk, falsified 8 ways |
| `7161f5a` | **Sev-1 — a burnout speed said "measured" over a differentiated altitude**, on 2 of 38 corpus recordings. Plus the same family's latent leak: three readings gated on one reason where the flag is set for two | corpus sweep with a floor + `lib/readings.test.ts` + `lib/analyze/analyze.test.ts`, falsified 6 ways |
| `838576f` | **Three ways the restored grouping could lose the flyer's most recent word** — the token, a deliberate separation, and a note that claimed success over a failed write | `groupToken` (4 cases incl. the re-open case that broke it) + `lib/ingest.test.ts` |
| `e46c347` | **P9 slice 4 — the two paragraphs nobody could read in one go.** 705 and 614 words broken at eight subject changes, rendered text character-identical | `lib/methodIds.test.ts` paragraph ratchet, falsified 2 ways |
| `dda9e05` | **The filing** — 4 `BACKLOG.md` entries, `COMPETITION.md` row 37, D11/P9 statuses, 2 decisions, 2 owner-note progress lines | — |

## Pick this up first

1. **P9 slice 5 — the methods page cites nothing, and it is the sharpest thing on either track.**
   Measured: **0 URLs, 0 DOIs, not one named algorithm** across 102 KB of `lib/methods/content.tsx`
   (`Hampel` 0, `Kalman` 0, `Barrowman` 0, `Savitzky` 0, `1976` 0) while `Hampel` appears **11 times
   in the analysis code** and `1976` twice. This is a gap against `MAINTAINING.md`'s own CLEAN-ROOM
   invariant — *"implement every method from published sources and cite them"* — before it is one
   against the field. `COMPETITION.md` row 37 has the comparison and the trap: OpenRocket's technical
   documentation is thesis-derived and **frozen at v13.05 (2013-05-10)** while the app is many
   releases past it, which is exactly the drift D11 slice 4's build stamp already lets Debrief avoid.
   Scoped in `ROADMAP.md` with a *done when* and a pinning check.
2. **D11 slice 5 — the composite's stage order.** The last clause of D11's *done when*. The statement
   lives in `localStorage` under `debrief.firstStage`, keyed by device-local logbook ids, and is not
   in the logbook backup — so it needs what slice 3 did for the grouping, applied to a statement
   that is outside the logbook entirely.
3. **The two D11 gaps filed rather than fixed** (`BACKLOG.md`, newest first) — a restored group whose
   recordings were CROPPED can compute an apogee spread over two different stretches, and two copies
   of one record under different names group as a flight recorded twice. Both are downstream of the
   same root: the record bakes the flyer's crop into the samples instead of stating it.
4. **The multi-source surface audit's findings are filed and mostly unreproduced.** Two are worth a
   session's attention: `analyzedDataCsv` is the only report artifact with no recording line while
   shipping in the same ZIP as the .md that has one; and the comparison surface — whose entire
   subject is several recordings of one flight — never reads the grouping the logbook already holds
   (`compareJson.sameFlight` has no verdict a stated grouping could produce).

## Owed to the sibling repo, and unshipped there

`DESIGN.md` is identical in both and the sibling was **not attached to this session**. Nothing in
this run changed `DESIGN.md`, so nothing new is owed — but the entries earlier runs left owed are
still owed: §5's `Popover` and `SectionNav`, and **§2's tertiary token still fails AA in dark**
(4.12:1 on page, 3.67:1 on raised, against 4.83:1 in light) at five sites that are not disabled
controls. Parked in `OWNER-NOTES.md` → *Awaiting the owner*.

## The done-check, executed — what each step returned

1. **Corpus sweep: 148 tests over 62 manifest fixtures, run on every gate, 0 goldens moved.** Three
   deliberate sweeps beyond the suite, each naming its count: **2 of 38** analysable recordings
   publishing a burnout speed labelled `measured` off a derived trace (the Sev-1, before); **0 of 38**
   after; and **0 of 38** reaching the gap-in-the-ascent leak, which is why that half was fixed by
   making one flag single rather than by adding a guard. The empty result is the point of stating it.
2. **Cold walks.** The record round-trip driven end to end in the real app at the shipped SHA —
   two logs joined, a record saved from each recording, the logbook cleared, both dropped back, one
   flight. Production fetched separately: `version.json` reported `609cc0b` at session start, equal to
   `main`, so there was no deploy gap to report before this run's merge.
3. **`COMPETITION.md` row 37 added** — a method write-up that cites, verified in part against
   OpenRocket's own documentation page and explicitly marked `UNVERIFIED` where an agent's PDF
   extraction was not repeated.
4. **§9 counts: identical at both ends of the run.** Table at the top. None moved the wrong way.
5. **`BACKLOG.md` read, appended to** — 4 new entries, each with the measurement that makes it
   actionable. Two of them describe exposures this run's own work created, which is why they are
   filed at the same time as the feature rather than after it.
6. **Both track questions.**
   - **D:** a flyer who flew two altimeters and told Debrief so can save both recordings as files,
     come back months later, drop them in, and get **one flight** rather than two — with the tool
     saying it remembered rather than that it worked it out.
   - **P:** the methods page has **no paragraph over 400 words**, where two ran to 705 and 614;
     paragraphs 88 → 96 and the longest 705 → 369, at a line length already held to 49–66 characters.
     And a burnout speed stopped claiming to be measured on the 2 corpus flights where it was not.
7. **`ROADMAP.md` updated** — D11 and P9 statuses rewritten with what each slice delivered and what
   is left, P9 slice 5 newly scoped with a *done when*, and 2 decisions recorded under *Decisions
   taken without the owner* with the alternative rejected in each.
8. **`OWNER-NOTES.md`: zero notes are open without a verdict.** All eight carry verdicts dated
   2026-08-08 and none is new, so none was owed one this run. Two gained a **PROGRESS** line dated
   this run — `ON-1` (the docs wall: measurably gone, one slice left) and `ON-4` (the canonical
   round-trip: multi-source structure now survives). Four items remain under *Awaiting the owner*.
