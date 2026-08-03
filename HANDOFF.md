# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **A Sev-1 that WASN'T** | A "main descent rate published off a record that never landed" was found, fixed, gated green, verified in the running app — and then **refuted before it was pushed**. The fix was reverted. **Read *The one thing to read before anything else* before touching `lib/analyze/index.ts`.** |
| **P — product & craft** | **P1: §2's colour-by-magnitude clause is closed on both surfaces that broke it**, and two stale roadmap pointers that would each have cost a session an increment are corrected. |
| **D — capability** | **D8 slice 3 is SHIPPED** — a replayed block in a high-rate download is detected and stated, and the statement is about the stretch the flyer is actually shown. Slice 4 (tilt) stays blocked, but its blocking number was measured over spliced data and slice 3 is what makes de-splicing it possible. |

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

### 6. A storage refusal stops being reported as a deletion (`f3751f2`, MERGED)

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

### 7. One chart export instead of three (`0285985`, MERGED)

`savePng` / `saveChartPng` existed **three times, byte for byte** across `FlightReport`,
`CompareView` and `ChannelExplorer` — differing only in which ref they read and the output
filename (and in whether they were declared `function` or `const`). That is the `ACTION_BTN`-in-six-files shape P1's opening audit removed once already,
restarted for chart export. `lib/plotPng.ts` is now the one implementation, written as
`lib/copyTable.ts`'s sibling for the same reason that file exists.

Pinned by *"composites a plot to an image from exactly one place"* — the frame/focus shape, not a
§9 grep, since a §9 addition is owed to the sibling repo. Matched on `.drawImage(` — member and bracket form —
rather than `toBlob`, because `FlightCard` calls `toBlob` correctly on its own canvas.

**The guard's own source list was the thing review caught, and it is the useful part.** §9's list is
`['components', 'app']` over `['.tsx', '.css']`, which never walks `lib/` — the one directory the
failure message names — and cannot see a `.ts` under `components/`. So a second composite in `lib/`,
or in the `components/usePlotExport.ts` hook that is the most natural home for this code, would have
kept it green while the message insisted otherwise. A guard whose message names a file it never
reads is worse than none. Falsified both ways after widening.

**Checked before shipping, and worth not re-deriving:** `dark` resolves to the same
`useIsDark()` at all three call sites, so the collapse changed no behaviour — and the four PNG
export e2e cases already covered the paths, so the refactor is proven end to end rather than by
inspection. What it exposed is filed: the figure light/dark toggle governs the exported SVG and not
the PNG. The PNG is right to take the page theme (it composites the live canvas), but two buttons an
inch apart behave differently and nothing says so.

### 8. A refused restore stops telling a flyer their backup landed (`6e1a050`, MERGED)

The worst member of the storage-refusal family, and the one filed as "fix this first" an hour
earlier in the same run. `importLogbook` resolved on the transaction's `onabort` and then returned
`flights.length` regardless, so a restore the browser refused reported **"Restored 12 flights."**
over an empty logbook. What makes it the worst is what a flyer does next: the obvious move after a
successful restore is to delete the file it came from.

Its sibling failure blamed them too — the `catch → 0` rendered *"No flights found in that file — is
it a Debrief logbook export?"* over a perfectly good backup.

`importLogbook` reports its transaction's OUTCOME now, as `{ restored, blocked }`. Three outcomes,
and `{ restored: 0, blocked: false }` — a file with genuinely nothing in it — is the only one that
says anything about the flyer's file.

**The test aborts the readwrite TRANSACTION rather than removing `indexedDB`**, and that distinction
is the whole reason it proves anything: a missing `indexedDB` is caught long before the write, so a
stub-based test would have passed against the old code too. This is the shape a full quota, a
private window and Safari's ITP eviction actually take. Falsified by restoring the
resolve-and-count, which puts "Restored 1 flight." straight back over an empty logbook.

**The first version of this fix got the atomicity backwards, and review caught it.** I kept
`preventDefault()` on the transaction's error while reporting `blocked` — but preventing the default
on an IDB error is exactly what stops the transaction aborting, so one oversized record would have
resolved *"nothing was restored, keep the file"* while the transaction went on to commit every other
flight, invisible until a reload. That is a regression on that path: the old "Restored N" was nearer
true. The restore is atomic now — either the whole backup lands or none of it does — which is the
shape `setFlightIds` already used, and it is what makes `blocked` true when it says so.

**And the pin's assertion ORDER was load-bearing.** The two negatives are `toHaveCount(0)`, which
passes on its first poll while the message still reads "Restoring…" — so putting them first made
them pass regardless and left only one assertion falsifying. The positive goes first now, and the
test also checks the second half of its own name: that the logbook really did stay empty.

**What is still open in that family:** `saveRecent` has the same never-awaited transaction, so
`savedId` is non-null on a quota abort. That is why the `/compare` "Added … to your logbook" half
was reverted earlier today rather than shipped, and it is the next thing to fix here.

### 9. The save reports what the browser did, not what it was asked to do (`a294fc5`, MERGED)

The **root** of the storage-refusal family, taken last because everything above it was a wording and
this is an invariant. `saveRecent` assigned `savedId` the moment the `put` was *queued*, and its
`onerror`/`onabort` both called `preventDefault()` — so a QuotaExceeded abort returned a perfectly
good-looking id with nothing stored. Every surface above it reads `savedId` as *"the logbook took
it"*, and that reading was true only where IndexedDB is absent entirely: the case an `addInitScript`
stub simulates, and the rarest one in the wild. **Mobile Safari's ITP eviction and a full quota are
the common ones, and both returned an id.**

It awaits its transaction now and returns `{ id: null, forgotten: [] }` on an abort.

**Why the `preventDefault()`s had to go rather than stay, which is the third time this run that
reasoning ran backwards.** Preventing the default on an IDB error is precisely what *stops* the
transaction aborting. Keeping them while reporting failure would let the write commit while this
said nothing was saved — strictly worse than the bug being fixed, because the flyer would then be
told to re-drop a file that is already in their logbook. Letting the error abort is what makes
`id: null` true when it says so.

**The prune goes atomic with it, and that is a second claim made honest.** `forgotten` names flights
the logbook dropped to make room. Those deletes ride the same transaction as the `put`, so an abort
drops neither — and `forgotten: []` is then the only correct answer. The old shape could have
reported *"Rocket 4 was forgotten to make room"* for a save that never landed, which is the same lie
one layer up and would have sent a flyer looking for a flight that is still there.

**An abort is not "there is no flight here" — it is "this write did not land", and getting that
wrong would have shipped a fresh bug.** An aborted transaction rolls back, so where the save was a
replace-in-place the earlier copy survives at exactly that id, and that id is still the flight's
address. The first version returned a flat `null`, and `Analyzer` hands this straight to
`rememberOpenId`, which **deletes `?open=` when it is null** — so reopening a logbook flight on a
quota-full device would have read perfectly and then silently dropped its own address out of the
URL, leaving Back and reload on the empty drop zone. `existing ? id : null` is the honest answer,
and it also means the case is a *narrowing* of the old behaviour rather than a change to it: the old
code returned the id here too. Pinned by *"a refused write does not take away the address of a
flight already in the logbook"*.

**The `/compare` half that was reverted this morning is restored with it — and rewritten twice more
before it was right.** A drop on a browser refusing storage used to announce *"Added a.csv, b.csv to
your logbook — tick them"* while the list below said the browser would not keep a logbook. Two
corrections, both found by the pre-push review and both worth more than the original fix:

- **The accounting was below the `merged.length >= 2` early return, so it only fired when the drop
  lost EVERYTHING.** Drop six logs on a quota-full browser, three commit and three abort: `merged`
  is three, the comparison assembles, and the three that never landed are named nowhere. That is the
  *commonest* shape of the failure, and it was the one case still silent — inside the change written
  to end silent loss. The sentence rides `load`'s note now, so it is said on every drop.
- **`STORAGE_REFUSED` says "read or keep", and a refused write reads fine.** Using it here would
  have told the flyer their browser could not READ a logbook directly above a logbook list showing
  their flights — the same two-surfaces-one-viewport contradiction, pointing the other way.
  `STORAGE_WRITE_REFUSED` is the write half; the shared string is now two shared strings because the
  condition genuinely has two truths.

**Pinned by three tests**, each falsified by mutation: *"a save the browser refuses is not announced
as a flight added"* (restoring `savedId = id` ahead of the await puts "Added cert.csv" back over a
logbook with nothing to tick), *"a drop that keeps some flights and loses others names the ones it
lost"* (dropping `notKeptNote` from the `load` call — the exact defect the review found), and the
address test above. All abort the readwrite **transaction** the way a full quota does rather than
removing `indexedDB`, which is caught before the write and proves nothing about the outcome path.
Assertion order is positive-first for the reason recorded under increment 8.

**Filed, not fixed:** the report's caption panel says *"Kept with this flight on this device"*
whenever it has an id — true of the flight, false of a caption typed while writes are refused. It is
pre-existing (the old code returned an id on every abort, so it rendered there already) and the
honest repair is to split `SaveResult` into an address and a `stored` flag, which is also what
`Analyzer.tsx:293`'s missing `else` needs. `BACKLOG.md` carries both, together.

### 10. The logbook stops promising to remember once a save has been refused (`4bedd32`, MERGED)

**Found by the done-check's cold walk of the built export, not by a test — and it is the best
argument for that step in the whole run.** With increment 9 shipped and live, walking `/compare` on
a write-refusing browser produced a note that was finally honest — *"refused.csv was read but could
not be kept: this browser won't let Debrief keep a logbook on this device"* — sitting directly above
a logbook list rendering *"Flights you open are remembered here on this device — never uploaded.
Got a logbook backup from another machine? Restore it."* Both visible, one viewport, opposite
stories, with an offer to restore that would also have failed. **The same defect the whole family
exists to end, one layer down and pointing the other way.** Nine increments of work on this
condition did not catch it; one walk of the running artifact did.

**Why no test could have caught it.** The list's state comes from a READ, and on a quota-full device
the read works perfectly. `status` was `ready` with no rows, which is the state whose copy is that
promise — and it was *correct* about everything it could observe. A refused write is not discoverable
by reading; only an attempted save knows.

So `useLogbook` gains a fourth status, `write-blocked`, reported IN by all six surfaces that attempt
saves (two on `/compare` — the drop and the mapper — and four in `Analyzer`). It is cleared by
evidence that storage is writing again: a save that lands, a restore that lands, or `clear()`. A
refused READ still outranks it — that is the stronger statement and its copy already covers both
halves.

**The pre-push review found two serious gaps in the first version, and both were real:**

- **The flag was a one-way latch, and `clear()` was the case that mattered.** Clearing FREES the
  origin's quota, so a refusal measured before it is stale by construction — and Clear is the app's
  one irreversible action. Left latched, a flyer who deleted their season to make room was told
  nothing more would be kept, on a logbook that had just become writable, *and* (see below) was
  shown no way back to the backup they had just been advised to take. Pinned by *"clearing the
  logbook does not leave it insisting nothing can be kept"*.
- **A refused RESTORE still printed the promise, and an existing green test was holding the
  contradiction in place.** `importAll` resolves `{ restored: 0, blocked: true }` — an unambiguous
  refused write — and reported nothing, so *"That backup could not be written"* rendered one line
  above *"Flights you open are remembered here on this device."* The same two-sentences-one-viewport
  defect this increment exists to end, on the same component, and the existing restore test asserted
  both were on screen at once. That test now asserts the promise is gone.

**And a third correction, where my own justification comment was wrong on its own terms.** The first
version replaced the whole empty-state paragraph, taking the "Restore it" control with it, reasoning
that a restore is a write and so cannot succeed either. It does not follow: a quota abort is
per-transaction and size-dependent, so a 200 KB backup can commit on the device where an 11 MB
flight text aborted — unlike a refused *read*, where `idb()` itself failed and nothing can run. And
that control is the ONLY way to open the file picker in the empty state, so removing it removed
importing entirely and left the import-result line as markup nothing could reach. The promise goes;
the offer stays, with the size reasoning said out loud.

**Two things learned while building it, both worth keeping:**

- **The caveat says it in the app's own shared sentence, embedded mid-sentence so no re-casing is
  needed.** The first draft hand-wrote the same words with `&apos;`, which renders a STRAIGHT quote
  against the constant's curly one — two spellings of one sentence, potentially in one viewport.
  That is exactly the drift a shared string exists to prevent, and it cost the first test run.
- **`RecentFlights` is not on the report screen at all.** The first version of the test asserted the
  caveat there and failed; the list returns when the flyer goes back to the drop zone, and that is
  where the test walks now. Which also means the analyze page still says nothing about a refused save
  *while the report is up* — the open `BACKLOG.md` item, now with a measured reason rather than a
  guess.

Pinned by *"the logbook stops promising to remember once a save has been refused"*, which covers both
routes in (`/compare`'s drop and the analyze page's own save path across a round trip to the report
and back). Falsified by reverting the hook's status upgrade to a plain `status`.

### 11. A replayed block is not a recording — D8 slice 3, on the second attempt (pending push)

**The D-track increment this run, and the milestone's own account is what made it buildable.** A Blue
Raven *backup* download can write part of the flight twice: the sensor rows repeat an earlier stretch
byte for byte. The LOW-rate half has been caught for a long time — the analysis sees a record that
returns to the ground and climbs again and says *"holds the same flight written twice"* — but the
high-rate half has no altitude, so none of that machinery can see it, and Debrief drew every replayed
sample as though it were a fresh instant of the flight.

**This was built and REVERTED earlier the same day.** What shipped is what the revert's account
demanded, and it differs in exactly three ways:

- **Detection and STATEMENT are separate, which is the whole design.** `findRepeatedSpans` is pure
  and knows nothing about extents; the spans ride the flight as `RawFlight.repeatedSpans`; and
  `repeatedSpanNote(spans, extent)` turns them into a claim only where both halves are in hand. That
  seam exists because **the extent is decided by the analysis long after the parser that can see the
  repeat** — `lib/report.ts`'s `howRead` is the first place holding both, so every export inherits the
  note, and `FlightReport` calls the same builder for the screen.
- **The copies are UNIONED.** jan10's four blocks overlap and sum to 41,463 rows; the union of what
  they mark as a copy is **27,261**. A row replayed twice is still one row that is not its own
  instant. The first attempt reported a per-block number — that is where "wrong about how many" came
  from — and the corpus assertion now fails on exactly that mutation.
- **A still board is not a replay.** Identical rows repeat trivially while nothing is moving. Measured:
  this removes nothing from the corpus, so it guards a file the corpus does not hold rather than
  filtering one it does — kept because the alternative is telling a flyer their download is corrupt
  because their rocket was on the pad.

**Extent-awareness is the clause that mattered, and it is worth restating.** Debrief already truncates
jan10 — its low-rate half is doubled too — so the report draws `0 – 20.22 s`. jan10's largest block
(20,160 samples) sits at flight clock ≈40 s, **outside what the flyer sees**, while a 7,101-sample
block lands at ≈14.1 s, inside it. The first version named the big one. The note now names only what
is drawn, clips the span to the extent, and says how many more lie outside it.

**Re-measured before rebuilding, and the roadmap's numbers reproduce exactly** — 27,261 / 44,793 / 0 /
0 — but only with the payload taken from the `Sync` column onward. **A first pass at re-deriving them
reported ZERO repeats on every file**, because the row also carries `Year,Month,Day,Time`, a wall
clock that makes every row unique. That looks exactly like "the roadmap was wrong" and is not; it cost
ten minutes and is recorded in `ROADMAP.md` so it is not made a third time.

Pinned by `lib/highRateRepeats.test.ts` — 17 tests, 7 of which drive the real read path over every
corpus high-rate pair. Falsified by two mutations: dropping the extent filter (3 fail, including the
jan10 case) and dropping the union (the two corpus counts fail).

**And then the pre-push review found the same class of error one layer down — read this part.** The
rebuild consulted the extent for *which* repeat to name and for the *range*, and not for the *count*:
jan10 read *"14.1–20.2 s … 7,101 of them"* for a 6.13 s window holding about 3,065 samples. **A 2.3×
over-claim, checkable by a flyer from two numbers in one paragraph** — the same "wrong about how many"
that got the first attempt reverted, surviving into the version written to fix it. The note now
derives nothing: the span's range and count are facts about the file, where the read ends is a fact
about the analysis, and all three are stated separately.

Three more, all real, all fixed before pushing:

- **"Nothing has been removed: every sample the file holds is still drawn" was false by ~64×.** The
  high-rate trace is an ENVELOPE — one sample per flight instant — so at most 1,012 of jan10's 64,290
  samples reach it. The roadmap's own slice-3 account already recorded that, and the note sitting
  beside mine in the same list said "an envelope rather than the stream itself". I wrote a sentence
  that contradicted its own neighbour. Deleted.
- **An unconditional claim about the low-rate half** that `repeatedSpanNote` had no access to check.
  True for the two corpus files, false on any board where `recordedTwice` refuses. Deleted.
- **130 MB of transient strings on the main thread**, on a 192,000-row file with no repeats at all.
  Now a 32-bit hash into an `Int32Array` used only to bucket, with every match confirmed by exact
  comparison — so a collision costs a comparison, never a wrong answer. Faster too: 1,030 → 641 ms.

**The lesson, and it is the same one as last run's:** the review is not ceremony. Two of the three
things it caught were claims I had written *while explicitly reasoning about honesty* in the same
file, and one of them contradicted a sentence rendered six inches away on the same screen.

### 12. §5 gains the button weight the code reached for eight times (pending push)

**The P-track increment.** `DESIGN.md` §5's heading read *"three button weights, and only three"*
and then listed FOUR — and the code had hand-rolled a fifth eight times across four files: a
`<button>` with indigo text, no border, no fill, sitting inside running prose. *"Got a backup?
**Restore it**."* · *"← Analyze another flight"* · a **clear sort** beside a column header.

**Eight sites independently reaching for one missing word is the VOCABULARY being wrong**, not four
files being careless, so §5 gained `Button variant="link"` rather than the sites being converted
into something they are not.

**`link` is not `ghost`, and that is the variant's definition rather than an exception to it.**
`ghost` is a button that happens to have no border — it keeps `px-3 py-1.5`, a hover fill and the
44 px touch floor, because it lives in a toolbar or a table row. `link` takes neither
`BUTTON_SIZES` nor `TOUCH_TARGET`, because it sits in a sentence at the surrounding size where
control padding breaks the line and a hover fill looks like a selection. One converted site keeps
`min-h-11` by hand and says why in a comment: it is in a table row on a phone.

**The count was wrong twice before it was right.** The roadmap entry said **7 across 5 files**; a
first grep this run said **13**; the honest figure is **8**. Three different things wear indigo on a
button and only one of them is the missing weight:

| what | example | verdict |
|---|---|---|
| resting indigo text, no geometry | "Restore it" | **the missing weight** — 8 sites |
| a SELECTED state (`sort === row ? 'text-indigo-600' : ''`) | a sorted column header | §2's `accent` doing its job — 5 sites, correct |
| a HOVER affordance (`hover:text-indigo-600`) | a filename | a hint, not a weight — 2 sites, correct |

The pin has to let the last two through or it fails naming files that are right. Pinned by
`lib/design-system.test.ts` → *"is not re-invented by hand"* and *"carries no button geometry, which
is what makes it not a ghost"*, both falsified by mutation. `Button` adopters **18 → 19** — moved in
the same commit, as the exact ratchet requires; only `Analyzer` is a new adopter because the other
three already imported `Button` for something else, so read the two numbers together.

**Then the pre-push review found a blocker the entire gate is blind to, and this is the one to
remember.** The size opt-out was written `text-inherit`. That is Tailwind's **colour** utility, not
a size one — so the element shipped `text-indigo-600 text-inherit`, adjacent in one
`@layer utilities` run at equal specificity, and the later one won. **Every `link` rendered in the
surrounding prose colour in LIGHT mode**; dark mode looked correct because `dark:text-indigo-400` is
emitted later still. Verified from the built stylesheet: `.text-indigo-600` at byte 25,858,
`.text-inherit{color:inherit}` at 25,999.

**Nothing in the gate could catch it.** `npm test` passed, `npm run build` passed, all 267 e2e
passed — because every assertion on those controls is `getByRole('button', { name })`, and neither
the role nor the name changed. A control that is the right element with the right name and the wrong
colour is invisible to this suite. The lesson generalises past this variant: **a change whose whole
effect is visual needs a look at the built CSS or the rendered pixels, not a green suite.**

Three more the same review corrected, two in the binding file:

- **§5's touch-floor claim was false.** `app/globals.css` floors every bare `button` at 44×44 under
  `@media (pointer: coarse)` with no exemption for one inside a `<p>`, and `e2e/touch.spec.ts`
  measures exactly that — so dropping `TOUCH_TARGET` is a no-op for the button branch and "a `link`
  in a toolbar is a 14 px target" was wrong. The shape that IS under-sized is `link` **with `href`**,
  an `<a>` the coarse rule does not cover. Filed.
- **§5 named four Debrief components verbatim**, in a file §10 declares shared and identical with
  the sibling, where that sentence would be false about Loft's codebase.
- **The one in-row site lost its resting underline** — right in prose, wrong for 11 px of accent text
  on a device with no hover.

**And the pin was being carried by an amnesty clause**: it skipped any tag containing `${`, and
every legitimate survivor has an interpolation, so the clause was doing all the work while a
hand-rolled link written with a template literal passed silently.

### 13. SEV-1: an apogee Debrief disowns, published bare (pending push)

**Found by the opening fan-out's Sev-1 screen, survived adversarial verification, and reproduced
end-to-end before a line was changed.** `lib/analyze` can flag an altitude channel
`altitudeUnproven` — *"this record's climb is too slow to be a flight, so its altitude channel is in
doubt"*. One corpus flight is in that state: `issuiuc-sg1.2` reads **31 ft**, while a second
altimeter in the same airframe recorded **2,115 m**.

`lib/report.ts` built the apogee row as `m.apogeeIsFloor ? apogeeSub(m) : undefined` — gating the
caveat on the OTHER of its two flags. `apogeeSub`'s own docstring had promised the opposite in as
many words: *"onto the tile, into every export, onto the shareable card."*

**What each artifact actually did, measured — and my first draft of this note overstated it.**

| artifact | before |
|---|---|
| metric tile | the full sentence |
| clipboard table · JSON · share card | **nothing at all** |
| `.txt` · `.md` · `.html` | apogee row bare — but a separate warning elsewhere in the document said the record does not describe a rocket flight |
| comparison `.md` / `.html` / on screen | nothing — and `CompareFlight` carries no `warnings` at all |

So "every artifact published it as flat fact" was too strong. The accurate claim is narrower and
still Sev-1: **the caveat did not ride with the value on any of them**, and four carried no
qualification whatsoever. A number quoted out of a cert document travels without the paragraph three
sections below it.

**The fix is one source of words for six surfaces.** `lib/readings.ts` gains `apogeeCaveat` (the
caveats alone — `apogeeSub` still composes them with "N s to apogee", which the tables print as their
own row) and `apogeeIsQualified`. The comparison also withholds its "highest" crown for an unproven
apogee, which it did only for a floor: **an unproven altitude needs that more, not less** — a floor is
a true reading that is a lower bound, while an unproven one is a channel the app has said it does not
trust.

**Three things the pre-push review caught, and two of them were tests that could not fail:**

- **The crown assertion was vacuous.** Both compare flights were built from one metrics object, and
  `compareMetricRows` zeroes the crown on a TIE regardless of `rankBlocked` — so it passed
  identically under the old gate, leaving the widening completely unpinned. The two flights have
  different apogees now, `best` is read directly rather than by an index regex that missed position
  ≥ 2, and a second case asserts a crown IS awarded where the set can settle it.
- **The `(unproven)` tag reached the comparison exports with no legend** — against a rule written
  thirty lines away in the same file, and worse here than for the other tags because a comparison
  export has no document-level text at all. `compareHasUnprovenApogee` + `LEGEND_UNPROVEN` now feed
  the Markdown footer, the HTML notes and the on-screen legend from one string.
- **The share card hand-rolled a third copy of the words**, six lines below a comment explaining that
  the max-velocity line had been moved off hand-rolled words for exactly that reason.

**One deliberate change to a shipped artifact, named because the ledgers should not hide it:** a
FLOOR record's apogee row loses its "N s to apogee" clause, because the exports now take
`apogeeCaveat` rather than the full sub. Two corpus flights read
`3,268 ft — at least this high…` instead of `3,268 ft — 3.3 s to apogee · at least this high…`. No
number moved, no caveat was lost, and `Time to apogee` is its own row directly below.

Pinned by `lib/apogeeCaveat.test.ts` (10 tests), falsified three ways: restoring the wrong gate,
dropping the card's branch, and restoring the old `anyFloor` crown gate. It also asserts the fixture
is still in the state the file exists for, so a corpus re-cut that changes it fails loudly rather
than passing green over nothing.

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
   least five surfaces implement two or more. ~~Real gaps found: `RecentFlights.tsx:171` collapses
   three distinct states…~~ **That one is CLOSED**: the logbook now implements loading, empty,
   populated, read-refused and write-refused — five states, four of them shipped this run. What is
   still open from that audit: `Analyzer.tsx:293` silently swallows a failed save (and now has the
   `write-blocked` machinery waiting for it — `RecentFlights` does not render on the report screen,
   so that surface needs its own line, measured not guessed); `ParachuteCd.tsx:107` is missing the
   extrapolated state the panel beside it already has; and a search with no match is still the same
   empty state as an empty logbook.

   **The highest-leverage single change in the whole area is now `SaveResult`**, because three filed
   items collapse into it: separate *"this flight has an address"* from *"this write landed"*. That
   closes `Analyzer.tsx:293`'s missing `else`, the report caption panel's false *"Kept with this
   flight on this device"*, and the one remaining `write-blocked` staleness path. `BACKLOG.md`
   carries all three together with the reason they must be done together.
3. **`BACKLOG.md` gained a large, verified batch this run** — the design-system audit's fresh rows, the
   refused-main surface gaps, the chart-above-apogee measurement, and the logbook's unbasis'd star.
   Read the head of the file before scoping.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed the same `DESIGN.md` §9 edits**, unchanged for seven runs. Not
attempted — this session was created with `debrief` and `debrief-fixtures` only, so pushing there was
impossible rather than skipped.

**§5's fifth button weight is owed to the sibling, added 2026-08-03.** `Button variant="link"` is
in this repo's `DESIGN.md` §5 and `ui.tsx`; `nrdptel/fusionspace-loft` carries the same §5 and this
session had only this repo attached, so the edit is written to make sense there too and the port is
outstanding. It is a self-contained addition — one entry in `BUTTON_VARIANTS`, one clause in the
`Button` class list, one §5 bullet.

**A THIRD §5 question, opened 2026-08-03 and owed to both repos: §5's five states have no name for a
DEGRADED capability.** The logbook shipped `write-blocked` this run — reads fine, writes refused —
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
