# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **Three pull requests merged: `#156`, `#157`, `#158`.** Production was confirmed serving `ada0a17` and then `592bd5d` mid-run. Re-measure before believing any of this: `git fetch --prune origin`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"` — and the version is now on the page footer too. |
| **Pending on the branch** | **One increment** — the visible build stamp (`306dda1`), gated green locally, in a pull request. Everything else reached `main`. |
| **Sev-1** | **One found, reproduced on real files, fixed.** A burnout speed labelled `measured` over a barometric derivative — **2 of 38** analysable corpus recordings, at 121.2 and 128.4 m/s, three rows under the identical figure labelled `derived`. |
| **D — capability** | **D11 SHIPPED, all five slices.** Every clause of its *done when* is met and pinned. The D-track has no in-progress milestone: D8's tilt slice is MEASURED AND BLOCKED (unchanged), D9 has slice 3b left, D10 has slices after its first. |
| **P — product & craft** | **P9 SHIPPED, all five slices.** **P5 IN PROGRESS** — slices 1, 2 and 3 shipped (the README, the landing claims, the visible build). |
| **§9 counts, start → end of run** | radius **0→0** · card treatments **3→3** · off-scale spacing **0→0** · off-scale type **1→1** · inverted-type files **10→10** · `ui` adopters **36→37**. **The only count that moved went UP.** `Card` adopters 25→26 in the ratchet. |
| **Another session merged into `main` during this run** | `9698d04` (PR #159), a `DESIGN.md` §8 rule about scale drawings, mirrored from the sibling tool. It adds no compliance count and Debrief has no scale drawing, so nothing here changed — but **the sibling repo is being worked on concurrently**, which is new information and bears on everything below marked "owed to the sibling". |

## The one thing to read before anything else

**I pushed a commit with a red unit suite, and the reason was the shape of my gate command.**

It was `npm test 2>&1 | tail -3 && npm run build && npx playwright test`. A shell pipeline's exit
status is the LAST command's, so `tail` returning 0 made a red suite look green to the `&&` — and
`tail -3` cut off the "Tests N failed" line that would have said so. Build and e2e then ran and
passed, and the summary read as three greens. CI caught it (`0baaa5b` → failure, run #748) and the
fix was one commit later.

The failure itself was benign and even good news: `lib/design-system.test.ts` pins `Card` adoption
at an exact count, and a new surface adopting the primitive moved it 25 → 26. But that is luck.

**Run the gate so each exit code is readable**, e.g.

```bash
npm test > /tmp/unit.log 2>&1;            echo "UNIT rc=$?";  grep -E "Tests +[0-9]+" /tmp/unit.log
npm run build > /tmp/bld.log 2>&1;        echo "BUILD rc=$?"
npx playwright test --workers=1 > /tmp/e2e.log 2>&1; echo "E2E rc=$?"; tail -3 /tmp/e2e.log
```

The general form of the lesson is the one `MAINTAINING.md` already records about a suite dying in
4 ms: **read the result, not the exit code of whatever you piped it through.**

## Three more things this run learned the hard way

1. **A subagent's review found a real bug in the commit I had just made, my first fix was worse than
   the bug, and the e2e caught that.** The grouping token was the flight's own id, which moves when
   the flyer re-nominates the primary. The obvious repair — earliest `addedAt`, the rule `planJoin`
   already uses — is *not stable either*: `saveRecent` stamps a fresh `addedAt` on every re-read,
   including a plain re-open. A row's **id** is the only thing there that does not move. *"Looks
   immutable" is not a property; grep for what writes it.*
2. **The opening Sev-1 screen ranked its two findings the wrong way round.** It led with a leak that
   fires on **0 of 38** corpus recordings and put second the provenance mislabel that fires on
   **2 of 38** today. A corpus sweep settled it in ten minutes. **Sweep before you rank** — an agent
   ranks by how bad a thing sounds; the corpus knows how often it happens.
3. **Four assertions this run could not fail, and each was caught by falsifying rather than by
   reading.** Three were in my own new tests (one restated a `toEqual` two lines above it; one
   compared two `undefined`s; one checked that a loop had pushed twice). The fourth was subtler: an
   e2e comparing the footer's build line to a saved report's used `toContain`, which passes when the
   footer drops the date, because the shorter string is a substring of the longer one.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout.** `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the corpus suite is **148 tests**;
  **38 recordings** analyse end to end through the plain parser path. `FIXTURES_TOKEN` is NOT set, so
  `npm run fetch-fixtures` is a no-op — the attached checkout is the whole reason there is a corpus.
- **`node_modules` was ABSENT.** `npm install` first, before anything measures.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every
  session; it belongs in the environment's setup script.** Said for at least the ninth run running.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before
  the first commit.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window.
- **The harness appended an attribution footer to every pull-request body.** Read back and stripped
  with `update_pull_request`, which does not re-append. Parked in `OWNER-NOTES.md`.
- **A full gate cycle is ~10 minutes** — unit ~1:50, build ~40 s, e2e ~7:00 at `--workers=1`. Budget
  four or five gates an hour, not more; that is the real cost of an increment here.
- **The GitHub MCP `actions_list` response is enormous** (65 KB+ for four runs) and will blow a
  context window. Ask a cheap subagent for `sha status conclusion run#` and nothing else.
  `pull_request_read` with `method: "get_status"` is cheap but only reports legacy commit statuses,
  which this repo does not use — it reads `pending` even when every check is green.

## What shipped, in order

| commit | what | pinned by |
|---|---|---|
| `c16c89b` | **D11 slice 3 — the flyer's grouping travels with the record** | `lib/flightGroups.test.ts` + `lib/canonical.test.ts` + an e2e walk, falsified 8 ways |
| `7161f5a` | **Sev-1 — a burnout speed said "measured" over a differentiated altitude**, 2 of 38 corpus recordings; plus the same family's latent leak (three readings gated on one reason where the flag is set for two) | a corpus sweep with a floor, falsified on the real file at 121.2 m/s |
| `838576f` | **Three ways the restored grouping could lose the flyer's most recent word** — the token, a deliberate separation, a note claiming success over a failed write | `groupToken` + `lib/ingest.test.ts` |
| `e46c347` | **P9 slice 4 — the two paragraphs nobody could read in one go.** 705 and 614 words broken at eight subject changes, rendered text character-identical | the 400-word paragraph ratchet |
| `f366af9` | **P9 slice 5 — the methods page cites its sources.** Five verified sources; 46 of 51 blocks deliberately cite nothing | 4 checks, falsified 4 ways, + an e2e |
| `e901e5a` | **The composite stopped forgetting which stage flew first** | `lib/firstStage.test.ts` + an e2e with the ids reversed |
| `bec785e` | **P5 slice 1 — the README shows the tool.** 4,545 words / 32 KB / 0 images → 1,948 / 16 KB / 4 | `lib/readme.test.ts`, falsified 3 ways |
| `b0744ee` | **D11 slice 5 — the composite writes files now, and comes back from them** | `lib/firstStage.test.ts` + an e2e that wipes the logbook between saving and dropping |
| `0baaa5b`+`c3f9bb2` | **P5 slice 2 — the landing surface says what this does that your own software cannot**, and the ratchet correction | `lib/whyDebrief.test.ts`, falsified from both directions |
| `306dda1` | **P5 slice 3 — the page says which build you are looking at**, linked to the commit | `lib/buildInfo.test.ts` + an e2e comparing the footer to a saved report |

## Pick this up first

1. **D9 slice 3b, and it is scoped down to a UI decision.** Read this run rather than planned:
   `lib/parsers/openrocket.ts` ALREADY parses every `<simulation>` into a run with its name, its ten
   figures in canonical SI and its saved trace — and `predictionFigures` throws all of it away when
   there is more than one, returning a refusal that names them. So the remaining work is to return
   the runs, offer the names, and feed the chosen one to the figures and the overlay. **The fixture
   exists**: the corpus's one `.ork` states **five** simulations.
   **It was deliberately not started at the end of this run**, because it changes what reaches the
   cross-check panel — where a PREDICTION sits beside real readings — and that is the blur the
   safety spine exists to prevent. Take it first, with a whole session in front of it.
   Also open on the D-track: **D10's remaining slices** (the capabilities the committed fixtures do
   not cover still need synthesized, labelled logs — including the `/stitch` sample this run
   declined to fake), and **D8's tilt slice**, which is MEASURED AND BLOCKED and should stay
   blocked — read its status line before reopening it.
2. **P5 slice 5 — a visible CHANGELOG.** The version is on the page and traceable to a commit now,
   and a flyer can report a bug or ask for a logger from inside the app (slices 3 and 4). What is
   missing is a human account of what changed between builds — which is the half that cannot be
   generated from commit subjects without becoming noise, and is worth an increment of writing.
3. **The two D11 gaps filed rather than fixed** (`BACKLOG.md`, newest first) — a restored group whose
   recordings were CROPPED can compute an apogee spread over two different stretches, and two copies
   of one record under different names group as a flight recorded twice. **Both are downstream of one
   root**: the record bakes the flyer's crop into the samples instead of stating it. Fix the root and
   both go.
4. **The multi-source surface audit's findings**, filed and mostly unreproduced. Two are worth a
   session: `analyzedDataCsv` is the only report artifact with no recording line while shipping in
   the same ZIP as the .md that has one; and the comparison surface — whose entire subject is several
   recordings of one flight — never reads the grouping the logbook already holds, down to
   `compareJson.sameFlight` having no verdict a stated grouping could produce.

## Owed to the sibling repo

`DESIGN.md` is identical in both, and **the sibling is being worked on concurrently** — PR #159
landed a §8 change here from that side during this run, which is the mechanism working. Nothing in
this run changed `DESIGN.md`, so nothing new is owed. Still owed from earlier runs: §5's `Popover`
and `SectionNav`, and **§2's tertiary token still fails AA in dark** (4.12:1 on page, 3.67:1 on
raised, against 4.83:1 in light) at five sites that are not disabled controls. Parked in
`OWNER-NOTES.md` → *Awaiting the owner*.

## The done-check, executed — what each step returned

1. **Corpus sweep: 148 tests over 62 manifest fixtures, on every gate, 0 goldens moved all run.**
   Three deliberate sweeps beyond the suite, each naming its count: **2 of 38** analysable recordings
   publishing a burnout speed labelled `measured` off a derived trace (the Sev-1, before); **0 of 38**
   after; and **0 of 38** reaching the gap-in-the-ascent leak — which is why that half was fixed by
   making one flag single rather than by adding a guard that fires on nothing.
2. **Cold walks.** The record round-trip and the composite round-trip both driven end to end in the
   real app, each wiping the logbook between saving and dropping. Plus a phone + OFFLINE walk of the
   built export at 390×844: all six routes 200 with real headings, **offline 6/6 served from the
   service worker**, the methods measure 62 characters at 16 px, longest rendered paragraph 372
   words, **zero console errors**. Production fetched separately and confirmed serving the merged
   SHA at two points in the run.
3. **`COMPETITION.md` row 37 added AND resolved in the same run** — a method write-up that cites.
   Debrief had 0 URLs and no named algorithm in 102 KB; it now cites five verified sources, and the
   row records why that is a lead rather than parity (OpenRocket's bibliography is excellent and
   frozen at v13.05 while its app is many releases past it).
4. **§9 counts: table at the top. The only one that moved went up** (adopters 36→37).
5. **`BACKLOG.md` read and appended to** — 4 new entries, each with the measurement that makes it
   actionable. Two describe exposures this run's own work created and were filed the same day as the
   feature rather than after it.
6. **Both track questions.**
   - **D:** a flyer who flew two altimeters, or flew a staged rocket on two boards, can save the
     whole thing as files, come back months later, drop them in, and get **one flight** or **one
     composite in the right order** rather than a pile of unrelated logs — with the tool saying it
     remembered rather than that it worked it out.
   - **P:** the methods page cites its sources where it cited none; the repo landing page is 1,948
     words with four pictures instead of 4,545 words with none; the landing surface states what the
     tool is for instead of leaving a flyer to discover it; and the page says which build it is. Plus
     one wrong reading corrected on two real corpus flights.
7. **`ROADMAP.md` updated** — D11 and P9 both marked SHIPPED with every clause named against its
   check, P5 to IN PROGRESS with three slices done and what is left in order, and **four decisions**
   recorded under *Decisions taken without the owner* with the alternative rejected in each.
8. **`OWNER-NOTES.md`: zero notes are open without a verdict.** All eight carried verdicts dated
   2026-08-08 and none is new, so none was owed one this run. **Two moved to `## Resolved`** — `ON-1`
   (the docs wall) and `ON-4` (the canonical round-trip) — which are the first entries that file has
   ever had there. **Six items sit under *Awaiting the owner*** (counted, not recalled), one added this run: the GitHub
   repo description, topics and pinned links, which no tool in this session can write.
