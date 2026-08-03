# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **A Sev-1 that WASN'T** | A "main descent rate published off a record that never landed" was found, fixed, gated green, verified in the running app — and then **refuted before it was pushed**. The fix was reverted. **Read *The one thing to read before anything else* before touching `lib/analyze/index.ts`.** |
| **P — product & craft** | **P1: §2's colour-by-magnitude clause is closed on both surfaces that broke it**, and two stale roadmap pointers that would each have cost a session an increment are corrected. |
| **D — capability** | **D8 slice 3's blocker is SOLVED but NOT SHIPPED.** The question its ROADMAP entry said would unblock it — *what is jan10's attitude solution doing that the other three are not* — is answered: **its high-rate file contains a verbatim replayed block.** See *Pick up first*. |

**Re-measure before believing any of this**: `git fetch --prune origin`, then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moves underneath you.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout**: `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` carries **61 fixtures**; the suite analyses 41+ and the
  digest snapshot covers **50**. `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` would have
  been a no-op — the attached checkout is the whole reason there was a corpus.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window, not a record.
- **Playwright needed `npx playwright install chromium`** — the image ships chromium-1194 and this
  Playwright wants **1228**. That is the manual's documented path and it worked (114 MB, ~1 min). It
  is paid for again every session; it belongs in the environment's setup script.
- **Baseline gate was GREEN before anything changed**: 1064 unit / build / 257 e2e. So nothing in this
  run's report is an inherited failure.
- **No open pull requests** on either repo at session start.
- Production was serving `07198a0`, identical to `origin/main`.

## The one thing to read before anything else

**A confidently-wrong finding got within one command of production, and what stopped it was the
adversarial verify pass — not the gate, not the corpus, not my own review.** `MAINTAINING.md` says a
confidently wrong finder is worse than a lazy one because you ship a fix for a problem that was never
there. This run is the worked example, and the whole sequence is recorded because the near-miss is
more useful than the fix would have been.

**The finding.** `landingIdx` defaults to the last sample, so the main-deploy search walks back from
the end of a truncated file as though it were touchdown. On `issuiuc-irec2023 easymega` that marks a
*Main deploy* at **7,717 m AGL — 93% of its own 8,299 m apogee** — and publishes **13.11 m/s** as a
main-chute rate, on a log whose last sample is 5,489 m up. Its sibling recording of the same flight
finds no main. It reproduces exactly, and it looks like a textbook Sev-1: a descent rate a flyer
sizes a canopy against, measured on a leg that was never terminal.

**What I did.** Reproduced it, measured the blast radius (2 corpus records moved, 31 unchanged),
gated a fix that requires the record to reach the last tenth of its own apogee, pinned it with two
checks both falsified by mutation, accounted for all 7 moved digests, rewrote the methods and
validation pages, ran a surface audit, and confirmed the new behaviour in the running app.

**Why it was wrong.** Sampled in 5 s buckets after apogee, **both** recordings of that flight fall at
**34–35 m/s** and **both break to 10 m/s at t≈60 s and ≈7,72x m**. A 3:1 rate step at the same second
and the same height on two independent altimeters is **a canopy opening**. `telemega` then rides that
same canopy from 7,740 m all the way down — 13.5 → 12.7 → 11.8 → 9.9 → 8.1 → **6.5 m/s** as the air
thickens, exactly as a canopy does — reaching 170 m at t=796 s and going flat (0.0, −0.1, +0.1 m/s).
**It landed.** So the leg after 60 s IS the terminal descent, 13.11 m/s is a faithful reading of it
(the sibling reads ~12.2 m/s over the same window), and my fix deleted a true reading and replaced it
with a `wholeDescentRate` of 14.80 m/s that **blends 35 m/s of freefall into 13 m/s of canopy
descent** — a worse number, on exactly the reading a flyer sizes a canopy against.

**Three things made the wrong version so convincing**, and each is worth recognising again:

1. **The symptom was real and reproduced every time.** Everything I verified, I verified correctly.
   What I never checked was the premise — *is there a canopy there?* — and the one measurement that
   settles it takes about a minute: print the post-apogee rate profile of **both** recordings.
2. **The internal inconsistency looked like proof.** The analysis refuses to say the flight landed
   (no landing event, no flight time, no descent time) and still reports a main-chute rate. That
   reads as self-contradiction. It is not: the record genuinely holds a deployment and a long
   terminal leg; it just does not hold the ground.
3. **93% of apogee is genuinely absurd for a "main"** — and that is a LABEL defect, not a number
   defect. I let an obviously-wrong label carry an assumption that the number under it was wrong too.

**What is actually defective here, both now filed rather than fixed:** the *label* (a sole canopy at
25,318 ft is called "Main"), and the opposite inconsistency — **`telemega` MISSES the deployment its
own trace plainly shows**, because its at-rest tail drags the terminal median under the
`mainTerminal > 1` guard. Two recordings of one flight disagree about whether a charge fired, purely
from where each log stopped. The reverted fix would have "resolved" that by silencing both.

**The one thing kept from the whole exercise** is `lib/compare.ts`'s cross-check note, and it stands
on its own: it told the flyer their boards *"disagree about whether a charge fired"* and that one
*"read a single descent with no deployment change in it"* — a claim about their ROCKET drawn from a
limit of ours, false on the very pair it was written for.

**Process lesson, for the next run:** the fan-out's verify phase is not ceremony. Every finding that
is about to become an increment gets an agent whose job is to REFUTE it, and the refutation gets read
before the fix is written, not after it is gated. I did it in the wrong order and spent most of an
hour on a fix that had to be thrown away.

## What shipped this run

Every increment independently gated — `npm test` · `npm run build` · `npx playwright test`, all three
green before every push — **with the corpus attached**.

**All of it is MERGED AND LIVE.** Pull request #96 squashed to `a905949` on `main`; production was
confirmed serving it, and confirmed by fetching the page rather than trusting `version.json`: the
prerendered `/` now carries *"Looking for flights remembered on this device"* and **zero**
occurrences of the promise it replaced, and `/compare/` no longer prerenders "Your logbook is
empty". Zero assistant trace on the served site.

### 1. A superlative stops wearing a claim colour (`e5fc04e`)

`DESIGN.md` §2 reserves its hues for meaning and says outright never to colour a number by whether it
is large. Both surfaces built for ranking flights did: the logbook's ★ was `text-amber-500`, §2's
**caveat** hue, so on a column scanned for an apogee the mark praising a reading wore the colour that
elsewhere warns the reading is soft; the comparison's winning cell was `text-indigo-600`, §2's
**selected**. Pinned by *"never carries a superlative in a semantic colour"*.

**The pre-push review found three real defects in this fix, and that is the part worth keeping:**

- **Removing the colour without replacing it made the comparison WORSE.** Weight alone left zinc-900
  against zinc-800 — **1.19:1** in light, **1.15:1** in dark, on a `font-mono` column of numerals — so
  a sighted low-vision flyer lost the mark entirely while the screen-reader text stayed perfect. The
  comparison now carries the **same ★ the logbook uses** (verified in the running app at 8.4×18 px),
  and every cell is §2 PRIMARY, because every one is a number being read. The old `zinc-800/zinc-200`
  was **not a §2 text token at all**, and the first draft cited it as "§2's own primary/secondary
  step", which does not exist.
- **The check enumerated forbidden hues instead of subtracting allowed ones** — the fifth time this
  file has had to make that exact correction. It passed `ring-indigo-500`, `fill-amber-500`,
  `text-violet-600` and `text-[#f59e0b]`. And `\bbest\b` cannot match `isSpeedBest`, the actual
  variable guarding one of the marks, so the whole check hung on a prose `title=` string.
- **It reported line numbers wrong by up to 72**, because stripping comments deleted lines rather than
  blanking them — in a commit whose own ledger entry is about one defect filed three times at three
  wrong line numbers.

Also corrected two stale roadmap pointers, each of which would have cost a session an increment:
**`Figure` shipped in `9d57303` with four call sites** while P1 item 12 still called it "the next slice
of P1", and **D8's status line said slice 2 remained** after its own body recorded it shipped and named
its pinning assertions.

### 2. The cross-check stops claiming a flyer's charges disagreed (`3e2e8f1`)

`recoveryDisagreement` fires when some compared recordings resolved a deployment and others carry
only a whole-descent figure. It said the second group *"read a single descent with no deployment
change in it"* and that the boards *"disagree about whether a charge fired"*. **A whole-descent
figure means Debrief did not RESOLVE a deployment in that record; it never meant none happened** —
and on `iss-irec2023`, the pair this note exists for, both traces show the same canopy opening at
t≈60 s. The wording is cause-agnostic now: *either no deployment is in that record, or Debrief could
not identify one in it*, and it points the flyer at the recordings instead of at their rocket.

**Nothing else from the reverted work survives**, and that is deliberate: the methods page, the
validation page, the corpus invariant, the synthetic test and the regenerated digests all described
a rule that is no longer there, so all of them went back.

### 3. The logbook stops promising to remember flights it has not looked for (`38e0217`)

`RecentFlights` used `recents.length === 0` for three of `DESIGN.md` §5's five states — empty,
loading, and storage-refused — and only the first is what its copy says. **Every route here is a
static export**, so that block is prerendered into `out/index.html` and `out/compare/index.html`: a
flyer with fifty flights read *"Flights you open are remembered here on this device"*, with an offer
to restore a backup, on **every cold load** until the bundle hydrated and IndexedDB answered.
`CompareSurface` carried the identical conflation with *"Your logbook is empty"*.

One layer down, the refusal could not be told from an empty logbook at all: `listRecents()` caught
the failure and returned `[]`, so a private window and a first-ever visit were the same value.
`readRecents()` now reports `{ recents, blocked }`; `useLogbook` exposes
`status: 'loading' | 'ready' | 'blocked'`; `listRecents` stays a thin wrapper so its other callers
are untouched.

**The pin reads the ARTIFACT, because the source could never have shown this.**
`e2e/logbook.spec.ts` → *"the prerendered page does not tell a returning flyer their logbook is
empty"* fetches `/` and `/compare/` as raw HTML, before a line of JS runs. Beside it, *"a browser
that refuses storage says so"* removes `indexedDB` and checks the surface says so and that analysis
still works. Both falsified by mutation.

### 4. The logbook-states change, corrected after review (`9fb45ee`)

**I pushed increment 3 before its review came back, and the review then found six real defects in
it — one worse than the bug it fixed.** Nothing reached production, because the work was on a branch
behind an unmerged pull request; that is exactly what `MAINTAINING.md` says the pull request is for.
Fixed forward in this commit:

- **A transient read failure would have wiped the logbook.** `refresh()` runs after every remove,
  note, group, clear and import, and any rejection set `blocked` — so one flaky read mid-session
  replaced a flyer's fifty rows, and their search, notes, export, import and clear with them, with a
  confident and probably false diagnosis. `blocked` is now only reported on a logbook that has
  **never** been read successfully.
- **`status` defaulted to `'ready'` — the DEFECT value.** A third call site forgetting the prop
  would silently reprint the prerendered promise with nothing failing. Required now.
- **A screen reader heard "Looking for flights…" and then silence**: the loading live region
  unmounts at the transition and the empty state had none. It has one.
- **The blocked copy told the flyer to "export anything you want to keep"** from a branch that
  renders no export control. It now points at the report's own export.
- **`/compare`'s blocked copy directed them into the one action that surface cannot complete** — a
  comparison there is built from logbook ids, so with storage refused there is nothing to build
  from. It says that instead.
- **Two "checking…" lines rendered on `/compare` for one wait.** The drop zone says what it is for;
  the list reports its own state.

And the two pins were weaker than they looked. The negatives matched exact prose that is also
written out in the component and five comment blocks, so adding a full stop would have turned them
green with the defect restored — they assert on the empty state's **control** now. Neither pinned
the loading→ready transition at all (`setStatus('loading')` unconditionally passed both); a third
test does, falsified by exactly that mutation.

**Adding the empty state's live region broke an unrelated e2e**, which is the trap `HANDOFF.md`
already recorded once for a ground-track locator: `compare-page.spec.ts`'s bare
`getByRole('status')` was unique only by accident and went to two elements. Scoped to the region it
asserts about. **When you add a shared shape, grep the suite for locators that select on the shape
rather than on the surface** — that is twice now.

### 5. The D-track increment was built, gated, verified — and reverted (nothing pushed)

**Second revert of the run, same root cause as the first, and that is the finding.** A Blue Raven
backup download can write the same samples twice; the LOW-rate half is already reported as *"holds
the same flight written twice"* and the high-rate half says nothing. I built the detector, pinned it
with exact corpus counts and two mutation-falsified guards, bounded it against a quadratic blowup,
gated it green over **1,077** tests, and confirmed the note on the running report. The pre-push
review then showed the note was wrong three ways.

**The one that decided it:** Debrief ALREADY truncates `jan10` to its first copy — its low-rate half
is doubled too, so the analysis extent is `0 – 20.22 s`. The 20,160-row block I reported sits at
flight clock ≈40 s, **outside what the flyer is shown**, while a 7,101-row block at ≈14.1 s is inside
it and was the one my "longest block only" rule discarded. I reported the invisible repeat and hid
the visible one.

**And the count was wrong anyway:** `jan10` holds **three** row-0-anchored repeats totalling
**27,261** rows, not 20,160; `jan18` totals **44,793**. Two further comments I had written
confidently were false — `lemiv` and `meraki` have no repeated run at ANY offset, so the anchor I
credited was doing no work on this corpus, and my "541 duplicate rows" for `meraki` did not
reproduce under any measure.

**The lesson, and it is the same one as the Sev-1 earlier in this run.** Both times I checked a
premise, and both times I checked the wrong boundary. On the Sev-1 I verified the record stopped
mid-air without asking whether a canopy had opened. Here I verified the repeated rows survive
`highRateStream`'s strictly-ascending filter — true, and irrelevant — without asking whether they
survive the ANALYSIS EXTENT, which is the boundary that decides what a flyer sees. **Ask what the
flyer is shown, not what the parser keeps.**

Everything measured is written into `ROADMAP.md`'s D8 section and `COMPETITION.md` row 27, including
the requirement the next attempt has to meet (the statement must be extent-aware, and the extent is
decided long after the parser that finds the repeat). Nothing was pushed.

### 6. A storage refusal stops being reported as a deletion (pending push)

Two surfaces accused the flyer's own device of losing a flight nobody had asked for:
`lib/compareFromLogbook.ts` reported every id as *"no longer in this logbook"*, and the
`/?open=<id>` deep link said *"That saved flight could no longer be read"*. `readRecent(id)` now
reports `{ rec, blocked }` beside `readRecents`, and both say a shared `STORAGE_REFUSED` sentence.

**The claim is narrower than the one I first wrote, and the narrowing is the useful part.** I set out
to give the condition ONE VOICE and said in a doc comment that it reached four surfaces. Review
measured **seven**, and showed the invariant the ambitious half rested on is false: `saveRecent`
assigns its id straight after `store.put` **without awaiting the transaction**, with `onerror` and
`onabort` `preventDefault()`ed — so a quota abort returns a **non-null id with nothing stored**. A
`/compare` change built on "a failed save has a null `savedId`" was therefore correct only for the
case an `addInitScript` stub simulates, and the rarest one in the wild. Reverted the same day.

**The worst member of that family is filed and should be fixed first:** `importLogbook` resolves on
`transaction.onabort` and returns `flights.length` regardless, so a refused restore reports
*"Restored 12 flights."* — and the logbook's Clear confirm offers that same export as the safe way
out before the app's only irreversible action. It tells a flyer their backup landed when it did not.

**And my pin would have passed with the defect present.** The first version asserted at page level,
where the logbook's own blocked paragraph — which renders on every `/` — satisfied it on its own.
It asserts on the ERROR CARD now, and fails on exactly the mutation that restores the old message.

## Traps this run hit — read these before repeating them

- **`innerText` hides collapsed `<details>` content, and this repo's report is full of them.** A probe
  reading `body.innerText()` saw 7,616 characters and reported the Descent-rate tile **ABSENT** on a
  flight that renders it perfectly; `textContent` saw 46,526 and found it. I nearly recorded an app
  defect that was a probe defect. Use `textContent` when asserting a value EXISTS.
- **Running `npm test` while the e2e suite is still finishing produces phantom failures.** Three
  failures and two errors, all timeouts, on a tree whose real failure count was one. `corpus.test.ts`
  documents this for its own sweeps; it applies to the whole suite. **One gate at a time.**
- **The bash working directory persists across calls** — a `cd` into the fixtures repo silently
  followed the next command. Already in the manual; hit it anyway. Prefix or check `pwd`.
- **A corpus digest regeneration is not a fix.** Seven moved here; the temptation is
  `CORPUS_DIGESTS=write` and move on. Diff the metrics and events **before and after** and account for
  every one, or a real regression rides along inside a legitimate re-baseline.
- **The fan-out's concurrency cap is `min(16, cores − 2)` and this container has 4 cores** — so a
  seven-way investigation runs **two at a time** and takes over an hour. Harvest from the workflow's
  `journal.jsonl` as results land rather than waiting for the whole thing.

## The §9 counts

| count | start of run | now | target |
|---|---|---|---|
| `rounded-lg` | 0 | **0** | 0 — a guard, may never rise |
| off-scale spacing | 0 | **0** | 0 — a guard, may never rise |
| hand-rolled card treatments | 3 | **3** | 3 — a GUARD, may never rise |
| inverted-type files | 14 | **14** | not 0 — read P1 item 2 first |
| off-scale type sizes | 1 | **1** | floor 1 — the shared brand wordmark |
| files importing the primitives | 34 | **34** | most of the 46 |
| hand-rolled `<button>` outside `ui.tsx` | 29 | **29** | few |

No count moved this run. The colour work is a §2 rule, and §2 has no §9 counter — deliberately, since
§9's block is carried identically by the sibling repo and adding a command to it is a change owed to
both. The new assertion says so in its own comment, like the frame and focus assertions before it.

## Pick up first

1. **D8 slice 3 is UNBLOCKED — the jan10 question is answered, and the answer is that its file is
   CORRUPT.** Its ROADMAP entry says the two things that would unblock it are a fifth high-rate fixture
   *or an account of what jan10's attitude solution was doing*. Here is the account, **verified
   independently by md5, not taken on an agent's word**:
   - In `…jan10__BLRVN87-bckup HR_01-10-2026_14_55_30.csv` (64,290 data rows), **rows 2–20161 and
     20162–40321 are byte-identical from the `Sync` column onward** — a **verbatim replayed block of
     20,160 rows, nearly a third of the file**, Sync counter included. 13,053 rows in the file share a
     duplicate suffix. Reproduce in ten seconds:
     `cut -d, -f6- "<file>" | sed -n '2,20161p' | md5sum` against `sed -n '20162,40321p'`.
   - The quaternion snaps back to **exact identity (1,0,0,0)** at the seams — 914 samples between
     liftoff and apogee — which is what made its tilt comparison read 22.72° where the other three
     read 0.64°–1.96°.
   - Restricting jan10 to before its first reset (t ≤ 12.17 s) takes it to **4.71° mean / 7.3° worst**.
   - **Debrief does not detect this today**: `lib/highRate.ts` has no duplicate/replay detection, so a
     replayed block is read and plotted as though it were recorded. Its LOW-rate sibling IS caught, by
     `a file that holds the same flight twice says so`. **That asymmetry is the increment**: *a
     replayed block is not a recording*. It is smaller and safer than slice 3, it is squarely in D8's
     scope, and it is the prerequisite — with it, slice 3 can refuse jan10 on a principled, detectable
     criterion instead of an unexplained outlier. **Do that before attempting slice 3.**
   - Note what this does NOT do: no reading is computed off the high-rate stream (slice 1's boundary),
     so the replay corrupts a **trace**, not a number. It is not a Sev-1.
2. **P1 item 5's two headline numbers are wrong**, and an audit re-measured them. The entry counts
   `ui.tsx` primitive adopters (`EmptyState`/`ErrorState`), not states — which is why it read 1. At
   least five surfaces implement two or more. Real gaps found: `RecentFlights.tsx:171` collapses
   **three distinct states** into one empty state (an empty logbook, a storage refusal, and a search
   with no match); `Analyzer.tsx:292` silently swallows a failed save; `ParachuteCd.tsx:107` is missing
   the extrapolated state the panel beside it already has.
3. **`BACKLOG.md` gained a large, verified batch this run** — the design-system audit's fresh rows, the
   refused-main surface gaps, the chart-above-apogee measurement, and the logbook's unbasis'd star.
   Read the head of the file before scoping.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed the same `DESIGN.md` §9 edits**, unchanged for seven runs. Not
attempted — this session was created with `debrief` and `debrief-fixtures` only, so pushing there was
impossible rather than skipped.

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
