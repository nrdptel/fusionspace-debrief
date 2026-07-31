# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D6 SHIPPED its headline capability.** A flyer who drops two files off one flight is now OFFERED the grouping, with the evidence in words, and accepts or refuses in one press. The signal is the launch second the vendor writes into the file NAME — 16 true pairs, 0 false, over the corpus — which **amends D6's own premise**: its decomposition had concluded no content signal could carry this, having tested three and not the file name. |
| **P — product & craft** | **P1 IN PROGRESS.** `Section` went from **0 adopters to 2** — `/privacy` and `/validation` are built from it, and the heading level those pages skipped is closed. `/methods` was measured and deliberately NOT converted; its own (different) rhythm break was fixed instead. |

**Two Sev-1s were found and both are fixed.** A peak of Mach 7.06 published off a barometric
transient, and a second record of the same class stating Mach 1.19 at 30.5 m AGL against the
Mach 0.93 its own flight's TeleMetrum measured. `BACKLOG.md`'s Sev-1 section is back to none open.

**PR #70 is MERGED and LIVE.** Production was verified serving `bfe9986` with a cache-buster, so
the docs-route slice, the first Sev-1 fix, its correction and D6's offer are all reachable by a
flyer. **PR #71 carries the rest** — the second Sev-1 and the button-hierarchy slice — and is open
on the pinned branch; merging it on green is all that is needed.

## What shipped this run

Every increment independently gated: `npm test` · `npm run build` · `npx playwright test`, all three
green before every push. The corpus was attached throughout — `lib/parsers/corpus.test.ts` reports
**138 tests over 61 fixtures** — so no claim here rests on a suite that skipped itself.

**Steady-state gate at the end of the run: 992 unit tests over 69 files, build clean, 239 e2e.**

### 1. The docs routes are built from `Section` (P-track, P1)

`DESIGN.md` §5 calls `Section` "what a route is built from" and it had **zero** adopters. Measured on
the built export, both themes: `/privacy` and `/validation` now go **30 px → 20 px → 16 px** with
**32 px (`mt-8`)** between sections. They used to go 30 px straight to 16 px, skipping `text-xl`.

- Docs prose went `text-sm` → `text-base`, which is §3's own table ("prose in docs"). Dense
  reference lists — the device-data key list, `/methods`'s 47-entry glossary — keep `text-sm`
  explicitly, because a reference list is not prose.
- `/methods` has ONE `<h2>`, in a helper rendered 47 times inside a two-column grid. Those are
  glossary terms with `id` anchors, not section headings; `Section` would have destroyed the layout.
  Its real break was that the term had **no size class at all** and rendered at its body's 14 px. It
  is `text-base font-medium` now, and its lede joined the other two at `text-base`, so the three
  docs pages no longer change body size as a flyer walks between them.
- **`Section`'s `title` was broken and nobody could have known.** Declared `React.ReactNode` and
  intersected with `HTMLAttributes`, which resolves to `ReactNode & string` — so it accepted a plain
  string and rejected every heading carrying markup. Fourteen sections failed `tsc` at once. `Card`
  already carries the `Omit<…, 'title'>` that prevents this, with a comment explaining it. **A
  primitive with zero adopters is a contract nobody has executed** — that is the argument for
  adopting one rather than merely shipping it.

### 2. Sev-1 — a peak speed read off the opening barometric transient (preempted the D-track)

`missileworks-rrc3__xprs2015__XPRS_Scratch_2015.rff` published **7,876 ft/s** and **Mach 7.06**
against the manifest's ground truth of **~2,450 ft/s (~Mach 2.2)** — 3.2× — with **max-Q 3,498 kPa**
beside it where the flight's real boost load case is ~320 kPa, a 10.9× structural figure. Not
withheld, no caveat: every warning on screen was about the altitude baseline and none mentioned the
velocity.

Cause: `maxVelIdx === liftoffRef`. The trace said the fastest instant of the whole climb was the
moment liftoff was detected — the sample where the record FIRST shows it moving. The log opens
part-way in and its altitude
runs −451 → −389 → −286 → −29 → +96 m in 0.2 s; that jump is fast enough to be read as the launch
and is then reported as the top speed.

**Both existing guards missed it for structural reasons worth remembering.**
`velocityNoiseDominated` divides the worst negative swing by the peak, so **the more absurd the
spike the smaller its own ratio** — this flight swings to −182 m/s against a "peak" of 2,401, which
is 7.6% and inside the 20% tolerance, where the same swing against its real 679 m/s peak is 27% and
refused at once. Its window also ran `liftoffRef..maxVelIdx`, here **one sample**, so `worst` could
only ever be 0. `velocityOutclimbsItself` missed by 1.4× — 1.39% against a 1% floor — because a peak
pinned at t≈0 puts the whole climb in its numerator.

Fixed by `velocityPeakAtLiftoff`. **Corpus: 49 of 50 records byte-identical, 1 moved deliberately**;
the digest snapshot moved exactly one line. Pinned by a synthetic test and a corpus test, both
falsified by mutation.

### 3. The correction to increment 2 — read this one even if you skip the rest

**The Sev-1 commit stated its evidence three times, and the evidence was wrong.** A third commit
corrects it in the code, in `BACKLOG.md` and on the PUBLIC validation page:

- "38 corpus records that analyse" is **50**. The sweep behind it only took files `importFlight`
  returns as `kind: 'flight'`, so it skipped the **eleven records that reach analysis through the
  column mapper**.
- "every other published peak comes at least 0.700 s later" is **0.050 s**. 0.700 s was the minimum
  over the named-parser subset — precisely the subset that excluded the counterexample. The sweep
  did not merely under-count; it removed the evidence that the class was not closed.
- "A rocket is AT REST when it leaves the pad" is not what `liftoffRef` means: it is the first
  sample with `altClean > 3 m` AND `velocity > 2 m/s`, and on one real record `velocity[liftoffRef]`
  is **385 m/s**.

None of it changed behaviour. What it changed is that the repo now says something true about why.

### 4. The second Sev-1, and the measurement that unblocked it

`perfectflite…endurance-20211030` published **Mach 1.19 and a Mach-1 crossing 30.5 m off the pad**
against the **Mach 0.93 its own flight's TeleMetrum measured** — peak one sample after liftoff, an
implied 398 g. Fixed by the ascent-noise guard judging the WHOLE climb, which had been reverted
earlier in the run on the bad sweep above.

**What unblocked it is the pattern worth keeping:** the objection was that widening might shadow
`velocityOutclimbsItself` on real files. Measured per record over all 50, by which warning fires —
**that guard reaches ZERO corpus records, before and after.** An objection about coverage was
answered by measuring coverage, and it took ten minutes. Apogee-exclusion and the 3-point median are
part of the rule (each decides a real record), not patches.

### 5. P1 — one primary per surface, six buttons onto the primitive, `Segmented` adopted

- **`RecentFlights`'s Compare is secondary now.** §5 allows one primary per SURFACE, and that
  component is embedded in two routes that each already have one. Verified on the built export:
  with two flights ticked there is now exactly ONE indigo-filled control on the page.
- **Six hand-rolled buttons onto `<Button>`.** All were `px-4 py-2` against §4's `px-3 py-1.5`; one
  was `py-2.5`; one carried `hover:bg-indigo-700`, off the accent ramp. `bg-indigo-600` outside
  `ui.tsx` is down to **1** — a `<label>` that cannot be a `Button` because it is neither a button
  nor a link.
- **The inverted-file count went 16 → 18 on that conversion and back to 16, fixed at the cause.**
  That is §9's own documented adoption effect and no glyph changed size — but what it exposed was
  real: `CropControl` rendered its heading, both input labels and its refusal line at caption size,
  and that line carries the sample count a flyer is about to read.
- **`Segmented` 0 → 2 adopters**, and the third candidate was REFUSED with the reason written in
  place: the report's "Zoom to" has a real none-active state, and `Segmented` marks exactly one
  option pressed. "Three surfaces hand-roll one control" was a count; only two were the same control.

## Pick up first

1. **P1's remaining slices, in the order the design audit ranked them** — all measured this run:
   **`Segmented` still has 0 adopters while three surfaces hand-roll one** (`CompareView`'s
   `seg()`, `RecentFlights`'s "Sort by", `FlightReport`'s "Zoom to" — three looks for one control);
   **`tabular-nums` is missing on both cross-check tables** (`GpsApogee`, `DeviceSummary` — the
   side-by-side comparison §6 exists for, with digits that do not line up); and **a sixth radius
   nobody counts**, bare `rounded` (0.25rem) at 11 sites, which no §9 grep sees.

2. **D6 shipped a working offer; two things are left.** The banner suggests a primary and does not
   yet let the flyer change it before accepting (the row control still does, afterwards). And
   Featherweight publishes an in-file join key — a sync counter shared by the HR and LR files —
   which would separate *one recording exported twice* from *two instruments*, the relation
   `same_flight_group` conflates. `lib/parsers/blueraven.ts` already quotes the manual on it.

3. **D6's other groundwork, still true and still unused.** This is measured, not guessed — do not
   re-trace it.
   - **The only arrival fact that survives a drop today is `addedAt`.** `lib/ingest.ts:165` hands
     `saveRecent` name / formatLabel / apogeeM / maxVelocityMs / flownAt / text / bytes and nothing
     about the drop: no batch id, no folder name, no drop index.
   - **Folder identity EXISTS at drop time and is thrown away.** `components/useWindowFileDrop.ts`
     has `folders`, `loose` and `found` as three distinct lists and flattens them into
     `onFiles([...loose, ...found])`. The folder NAME escapes only through `onEmptyFolder`. One
     extra argument on the `onFiles` contract is the cheapest capture point in the codebase.
   - **`lib/dropEntries.ts` returns a flat `File[]`** and never records which directory entry each
     file came from; `webkitRelativePath` is read nowhere in the repo. So per-flight SUBfolders —
     the layout D6 would most like to key on — are today indistinguishable from one flat folder.
   - **Adding a field to `RecentFlight` is compile-gated but only partly.** `lib/recents.ts:212`
     forces it into `FromTheFile` or `FLYER_OWNED`, but three further rebuilds must also name it and
     fail SILENTLY: `toMeta`, `serializeLogbook`, `normalizeFlight`. The file's own comment says
     this is the quietest failure it has.
   - **The accept path already exists whole.** D3's manual grouping is: tick ≥2 rows → "These N are
     one flight" (`components/RecentFlights.tsx`) → `planJoin` (`lib/flightGroups.ts`) → `useLogbook.group`
     → `setFlightIds` (`lib/recents.ts`), writing `flightId` on each joined row. **Accepting a
     proposal writes exactly what the manual press writes**, so D6 adds a way to OFFER and nothing
     to the data model.
   - **The UI has a template too:** the `forgotten` banner in `RecentFlights` is a dismissible,
     props-driven post-drop panel above the list, mounted on both surfaces. A second banner of that
     shape is the whole of the proposal increment; refusal is the existing dismiss.
   - **`RecentFlights` is mounted TWICE** (`Analyzer` and `CompareSurface`), so a proposal appears on
     `/` and `/compare` for free — and a refusal on one must not be re-offered by the other. That
     makes the refusal state a `useLogbook`/persistence decision, not local component state. Decide
     it in increment 1 rather than discovering it in increment 3.
   - **Two standing negatives the roadmap does not name.** `lib/parsers/d6Grouping.test.ts`'s
     `STAGED_GROUPS` names THREE staged groups (`iss-kairos`, `iss-sg1.2`, `reddit-meraki2-121km`)
     where `ROADMAP.md`'s *done when* names two — build the checklist from the test, not the prose.
     And `importLogbook` writes every restored row in one transaction, so a restored backup gives the
     whole logbook a near-identical `addedAt`; a co-arrival rule would offer to merge all of it.
   - **The five confusable pairs are computed inside an `it()` and never exported.** They exist only
     in an assertion message. `ROADMAP.md` requires D6's rule to refuse them, so extracting them into
     an exported helper is a prerequisite, not a tidy-up.
   - **Unit-testable without a browser:** `lib/flightGroups.test.ts`'s `row(id, over)` helper builds a
     `RecentMeta` with a fixed `addedAt`, which is exactly a synthetic arrival. Build the proposal as
     a pure function over `RecentMeta[]` and let ingest only record the arrival —
     `lib/ingest.test.ts` says outright that `ingestFiles` needs a real browser and is only
     exercised in e2e.

4. **P1's next slices, in the order the audit ranked them** (all measured this run, none guessed):
   - **Two primaries on one surface, on BOTH flight routes.** `CompareSurface` renders an
     indigo-filled `<label>` beside `RecentFlights`'s `Button variant="primary"`; `DropZone`'s
     "Choose files" does the same on `/`. §5 says at most one per surface.
   - **A fifth button weight**: a borderless indigo-TEXT `<button>` at seven call sites, including
     "← Analyze another flight", the main way back out of a report. `ghost` is neutral, so this is
     not it.
   - **`Segmented` still has 0 adopters while three surfaces hand-roll one** — `CompareView`'s
     `seg()`, `RecentFlights`'s "Sort by", `FlightReport`'s "Zoom to". Three looks for one control.
   - **`tabular-nums` is missing on both cross-check tables** (`GpsApogee`, `DeviceSummary`) — the
     side-by-side comparison §6 exists for, with digits that do not line up.
   - **A sixth radius nobody counts:** bare `rounded` (0.25rem) at 11 sites. `roundedLg` is guarded
     at 0 and no grep sees this one, so the drift just moved one step.

5. **The corpus asserts a velocity on almost none of its fixtures.** The Sev-1 sat in a file whose
   override asserts apogee ONLY, so the suite was green while it published Mach 7.06. Golden values
   pin what somebody thought to assert; the digest snapshot catches change but blesses whatever was
   wrong when written. A pass adding a velocity/Mach assertion to every fixture whose manifest row
   carries one is high-value and is filed in `BACKLOG.md`.

## Traps this run hit — read these before repeating them

- **A regex transform over JSX ate one margin too many, and only the pre-push review caught it.**
  Stripping "the first child's `mt-2`" also stripped a `<ul className="mt-2 …">` that was a SECOND
  child on two pages, so a paragraph butted its list at 0 px. The gate was green through all of it —
  no test looks at a margin. **Take the second opinion on the diff seriously; it is the only thing
  that reads what the tests do not.**
- **`git checkout <file>` to undo a MUTATION also undoes the work.** Reverting a deliberate probe
  edit that way threw away a whole file's conversion, which then had to be redone. Copy the file
  aside first and restore from the copy.
- **A `*-tmp` probe is gitignored but still TYPE-CHECKED.** `prebuild` runs `tsc --noEmit` over the
  whole repo, so a throwaway with a loose cast turns `npm run build` red while `git status` is
  clean. Delete probes before gating, not after.
- **A sweep script that only handles `res.kind === 'flight'` silently skips the mapping-path
  fixtures.** Mine reported "38 analysed" and a clean one-flight delta; the real corpus suite then
  found a SECOND flight had moved, because its file reaches analysis through the column mapper.
  **The corpus suite is the measurement; a hand-rolled sweep is a hint.**
- **A hand-rolled corpus sweep skipped a third of the corpus and nobody noticed for two commits.**
  It only took `res.kind === 'flight'`, so the eleven column-mapper records were invisible — and
  they are where the counterexample lived. The number it produced (38) was then repeated in a
  commit message, a backlog entry and a published page. **The corpus suite is the measurement; a
  hand-rolled sweep is a hint.** If a sweep and the corpus suite disagree about how many records
  analyse, the sweep is wrong.
- **The pre-push review is what caught it**, forty minutes after the commit went out. Both times
  this run, the thing the gate could not see was found by handing the diff to a fresh reader. Budget
  for it finishing rather than pushing while it runs.
- **A claim that reopening a flight moves its `addedAt` is REFUTED.** `lib/reopen.ts` never calls
  `saveRecent`; only `lib/ingest.ts` and `lib/mapped.ts` do, so only re-DROPPING the same file
  refreshes the stamp. Checked because D6 rests on `addedAt`.

## The §9 counts at the end of this run

`DESIGN.md` §9's shell block and `lib/design-system.test.ts` agree exactly, which is itself the
check that the two copies have not drifted.

| count | start of run | end | target |
|---|---|---|---|
| `rounded-lg` | 0 | **0** | 0 — a guard, may never rise |
| off-scale spacing | 0 | **0** | 0 — a guard, may never rise |
| hand-rolled card treatments | 10 | **10** | floor 4, not 1 |
| inverted-type files | 16 | **16** | floor at least 4, not 0 |
| off-scale type sizes | 1 | **1** | floor 1 — the shared brand wordmark |
| files importing the primitives | 27 | **28** | most of the 46 |
| `Card` adopters | 23 | **23** | — |
| `Button` adopters | 10 | **11** | — |
| `Section` adopters | 0 | **2** | — |
| `Segmented` adopters | 0 | **0** | — |

Re-run from `DESIGN.md` §9's own shell block at the end of the run: `rounded-lg` 0, card treatments
10, off-scale spacing 0, off-scale type 1, inverted files 16, components importing `./ui` 28. No
count moved the wrong way.

**The per-primitive count reads `app` as well as `components` now, and that was a real hole.** §5
defines `Section` BY its route — "what a route is built from" — so every `Section` there will ever
be sat outside what the check could read; it would have gone on reporting 0 after the work landed
and the next session would have done it again. All nine route files imported zero primitives
beforehand, so widening the denominator moved no other number. **This is the fourth §9 metric to
measure something other than what it was reached for**, after the two blind greps and the
suite-wide type ratio.

`uiAdopters` deliberately stays on `components`: it IS §9's shared grep character for character, and
widening it would fork a file the sibling repo carries identically. `invertedTypeFiles` stays too,
for a measured reason recorded beside it — a docs route at `text-base` with one `text-xs` back link
reads as "inverted" while being exactly what §3 asks for.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed six `DESIGN.md` §9 edits** — five inherited, and the card
grep's blindness to `rounded-lg`, which applies to the sibling verbatim and whose own count is
probably wrong in the same direction. The harness pins only `fusionspace-debrief` and
`debrief-fixtures`, so none can be pushed there.

**A seventh question is now open and is deliberately NOT decided in one repo:** should §9's
`uiAdopters` grep read `components app` rather than `components`? This repo's per-primitive count
already does, for the reason above, but §9's own command is shared and changing it here alone would
fork it. Decide it in a run that can push both.

## The fixtures repo

No commit this run; nothing changed a fixture's contract. The seven `corpus-overrides.json` entries
still need removing once `debrief-fixtures` is re-cut.

**Three things worth adding there**, each with a reason attached:

- a corpus record holding two genuinely separable burns, which would turn `no corpus record holds
  two burns` red — the signal that staging detection has become possible;
- **a launch day where one flyer's two files were dropped together**, which is the signal D6 rests
  on and which the corpus cannot demonstrate at all: every group in it is assembled by the manifest,
  not by arrival;
- **a velocity/Mach ground-truth column asserted on every fixture whose manifest row carries one.**
  The Sev-1 above lived in the gap where the corpus asserts an apogee and nothing else.

## Environment notes

- **Git identity defaults to the harness's.** Set it before the first commit:
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrives as an attached repo.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`, and the suite then reports **138 tests**. Far fewer means it is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: `npx playwright install chromium` from the repo root** (~114 MB, about a minute,
  succeeds through the proxy), then plain `npx playwright test` with NO browser variable set. This
  is paid again every session — it belongs in the environment's setup script.
- **Kill any hand-started `npm run serve:out` before the e2e suite.** For a manual walk,
  `node scripts/e2e-server.mjs <port>` takes a port argument, so a probe can serve on its own port
  without colliding with the suite.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on `pull_request`.
  Opening the PR is what runs it, and the `frontend` job's corpus half is the part a local run
  cannot reproduce.
- **After a merge, the pinned branch must be restarted from the new `main`** and force-pushed with
  lease. A squash merge leaves no parent link, so the old branch reads as "unmerged" by ancestry even
  when `git diff <old-head> origin/main` is empty — check the diff, not the ancestry.
- **Check the deployed build with a cache-buster:**
  `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. The plain fetch lags about ten
  minutes after a green deploy and will tell you it failed when it did not.
