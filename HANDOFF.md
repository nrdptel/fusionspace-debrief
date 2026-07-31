# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D5 SHIPPED. D6 decomposed and STARTED — its first increment is in.** The decomposition changed the milestone: two of the three signals D6's own entry named do not exist in the corpus, and `lib/parsers/d6Grouping.test.ts` now pins that. Read D6's section in `ROADMAP.md` before scoping any of it. |
| **P — product & craft** | **P1 IN PROGRESS, and moved a long way this run.** `rounded-lg` is at 0 and guarded. Card treatments 19 (true figure) → **10**, against a floor of 4. `Card` 0 → 23 adopters, `Disclosure` 0 → 3. The four files the last handoff named as hand-rolling a card no longer do. |

**PR #64, #65, #66, #67 and #68 are all merged and LIVE.** Production was verified serving
`e44adbe` — the last of them — by fetching `/version.json` with a cache-buster. **Use the buster:**
the plain fetch lags by about ten minutes after a green deploy and will tell you it failed when it
did not. **There are no open pull requests carrying unshipped work**, and the pinned branch was
restarted from `main` after each merge.

## What shipped this run

Every increment independently gated (`npm test` · `npm run build` · `npx playwright test`, all three
green before every push). The corpus was attached throughout — `lib/parsers/corpus.test.ts` reports
**138 tests over 61 fixtures** — so no claim here rests on a suite that skipped itself.

**Steady-state gate: 979 unit tests over 68 files, build clean, 236 e2e.**

### Merged and live

- **Sev-1 — the channel explorer averaged over samples, not over time.** `windowStats` returned
  `sum / count`, the same defect `timeMean` was written out of the analyzer for. On
  `fwgps__trf-f1machbuster-jan10` (cadence 0.099–4.900 s) it printed **−49.31 m/s** where the
  flight's own report said **64.81** — 23.9% low, on the reading a canopy is sized against. Now
  −64.78.
- **Three §9 compliance greps could not see the drift they exist to catch.**
- **D5 shipped** — which figures a document carries, in what order, in what colour, on both document
  surfaces, through one control and one stored choice.
- **The three unshipped parts of PR #31**, rebuilt on today's `main` and re-measured.

### Shipped in PR #66

- **`rounded-lg` 22 → 0, and it is a guard now.** Classified one at a time by what the element IS:
  **15 containers to `xl`, 7 controls to `md`**.
- **The card grep was blind, and the conversion proved it** — see the trap below. Treatments went
  7 → 18 → 12.
- **The seven `bg-zinc-50` panels** onto `<Card tone="sunken">`, the tone added for exactly them.
- **The four chart containers** onto `<Card>`; `Card` takes a `ref` now.
- **Seven derived-reading panels stopped whispering.** Labels, inputs, descriptions and every state
  message were at caption size, leaving the heading as the only body text on the panel.
- **D6 decomposed**, and the decomposition is mostly a measurement — below. Its first increment
  followed: `lib/parsers/d6Grouping.test.ts`, five assertions, four mutations.
- **The design docs were shipping the utilities they forbid.** Tailwind v4 auto-detects sources, so
  it read every file whose job is to NAME a banned class and emitted **25 dead rules** into the
  production stylesheet. Found by the done-check's cold walk on the built export, not by reading
  source — which is the argument for walking the artifact.

### Shipped in PR #67 and #68

- **D6's first increment** — `lib/parsers/d6Grouping.test.ts`, five assertions, four mutations.
- **The three alert callouts** onto `Card`'s `warn`/`danger` tones, live-region roles intact and
  falsified.
- **A conversion RULED OUT** — the bordered frames must not become `Card`s; see below.
- **`Disclosure` went from 0 adopters to 3.**
- **The docs-route heading fix, measured and scoped rather than executed** — see pick-up item 3, and
  the `BACKLOG.md` entry it points at. Filed deliberately: it is a pass over three published pages
  and the run's remaining time did not allow doing it with both themes checked.

## Pick up first

1. **D6's first increment is DONE — `lib/parsers/d6Grouping.test.ts`.** The next one is the arrival
   signal: nothing in the corpus can demonstrate it, because every group in it is assembled by the
   manifest rather than by a flyer dropping a folder. So either add such a fixture to
   `debrief-fixtures` (see the bottom of this file) or build the proposal against a synthetic
   arrival, and keep the five confusable pairs that test names as the standing negatives.
2. **P1's remaining card treatments are 10, and the floor is 4.** The alert callouts converted this
   run. **Do NOT convert the bordered table frames** — an earlier version of this list said they
   "want `pad={false}`" and that was wrong, found by trying it. `FlightCard`'s canvas,
   `ColumnMapper`'s and `SampleTable`'s tables, `GroundTrack`'s `<dl>` and its `Stat` tile share a
   bordered treatment with **no background, and the missing background is the point**: `SampleTable`'s
   sticky header is `dark:bg-zinc-900`, which is exactly `Card`'s default dark fill, so the header
   band that currently reads against the `zinc-950` body would flatten into the card. Reasoning in
   `lib/design-system.test.ts`. If that frame ever earns a primitive it is `Frame`, not a `Card` tone.
   What is genuinely left is three treatments that will never fold in (drop zone, drop overlay,
   frame) plus `Card` itself.
3. **`Section` on the three docs routes — scoped, measured, and filed in `BACKLOG.md` ready to
   execute.** They skip a heading level (`text-3xl` straight to `text-base`, no `text-xl`), which is
   the measurable half of "these pages read as a different author's". `Section` implements the fix
   and has **zero** adopters. It is not a one-line swap: the entry names the three obstacles — the
   parent's `space-y-6` colliding with `Section`'s own `mt-8`, the doubled `mt-4`/`mt-2` gap, and the
   `text-sm`-vs-`text-base` prose question that must be decided in the same pass. **Roughly 30–45
   minutes done properly, both themes checked.** It was measured rather than executed at the end of
   this run precisely because rushing three published pages is how the drift started.

4. **`Segmented` is the other primitive still at zero**, and `EmptyState` / `ErrorState` have one
   adopter each while §5 says "a surface with no empty state is not finished". Note the empty-state
   hunt has already been run once and all five candidates were refuted — see below — so start from
   §5's list of surfaces rather than from a grep for `return null`.

## The §9 counts at the end of this run

The shell block in `DESIGN.md` §9 and `lib/design-system.test.ts` agree exactly, which is itself the
check that the two copies have not drifted:

| count | start of run | end | target |
|---|---|---|---|
| `rounded-lg` | 22 | **0** | 0 — a guard now, may never rise |
| off-scale spacing | 0 *(really 8 — the grep was blind)* | **0** | 0 — a guard now |
| hand-rolled card treatments | 7 *(really 19)* | **10** | **floor 4**, not 1 |
| inverted-type files | 23 | **16** | **floor at least 4**, not 0 |
| off-scale type sizes | 1 | **1** | floor 1 — the shared brand wordmark |
| files importing the primitives | 20 | **27** | most of the 46 |
| `Card` adopters | 12 | **23** | — |
| `Disclosure` adopters | 0 | **3** | — |

**Three of those targets are not 0**, and each says why where it is defined. A budget whose target is
unreachable trains the next session to ignore it.

## Traps this run hit — read these before repeating them

- **A compliance grep anchored on the COMPLIANT value can only see drift that is already half-fixed.**
  This bit twice now, in the same file. Last run the spacing grep read 0 while 8 occurrences sat in
  the tree. This run the card grep read 7 while the true figure was **19** — it anchors on
  `rounded-xl border`, so eleven hand-rolls sitting one radius step away at `rounded-lg` were
  invisible to the check written to catch them. Converting the radius made the count go UP, 7 → 18,
  which reads exactly like a regression and is the opposite: measured radius-agnostically on the
  pre-conversion tree it was 19, so the conversion's net effect was **−1**. **Before believing one of
  these numbers, ask what the pattern cannot see.**
- **A metric can be satisfied by a tie, and that is not the same as being right.** The inverted-type
  filter is a strict `>`. Four of the seven panels would have flipped on labels and inputs alone,
  landing at exactly 4/4 and counting as fixed. The state messages were converted because they are
  body text, not because the count needed them.
- **Some of these budgets have a floor above 0 and the file now says which.** `invertedTypeFiles` can
  never reach 0: §5 makes `Chip` `text-xs` by definition, so a component built out of chips is
  permanently "inverted" while fully compliant. `EventChips`, `RecognizedFormats`, `SiteFooter` and
  `FusionSpaceBadge` are already correct. `ChannelExplorer` was taken 17/4 → 11/10 by fixing six
  genuine violations and **left there**, because the remaining eleven are all sanctioned.
- **Falsify by MUTATING THE CODE.** Dropping the ground track's `ref` fails three e2e tests — the
  read-at-a-point, the landing marked once, and the map fitting its own card. That was checked rather
  than assumed, because a 0×0 canvas is invisible to a test that only asserts the element exists.
- **A gitignored probe is still TYPE-CHECKED.** `prebuild` runs `tsc --noEmit` over the whole repo, so
  a throwaway with a type error turns the build red while `git status` is clean.
- **Two gates in flight at once is a 196-failed, 37-passed run that is NOT a regression.** A second
  `npm run build` deletes `out/` from under the first run's server. The tell is the timing.
- **The corpus manifest's `local_path` is the corpus author's own absolute path** — `/Users/…`, not
  anything on this disk. Build the path from `file_name`: the vendor directory is the part before the
  first `__`.

## What D6's decomposition found, in one paragraph

Because it is the kind of thing a later run will otherwise re-derive: **the wall clock is not there.**
11 of 44 corpus files yield a `flownAt` at all, and of the 21 manifest groups exactly one holds two
dated files — the staged booster/sustainer pair, which is precisely the relation that must never be
merged. One logger reports 2013 for a 2023 flight and passes the sanity window because it is a real
date. And **apogee agreement alone is worse than useless**: over all 253 pairs, the tightest agreement
in the corpus (0.28%) is between two files that are NOT one flight, tighter than the median true pair
(0.51%). The cause is physics — the same airframe on the same motor twice in a day agrees to a
fraction of a percent because it should. What survives is how the files ARRIVED.

## Findings that were REFUTED — do not re-file them

- **"Five data surfaces return null with no empty state."** All five refuted. The one called
  *reachable by ordinary interaction* is not reachable: the control that removes a channel renders
  only when more than one is shown, and the channel list is never empty.
- **"17 hand-rolled cards are counted as 7 by the grep."** Those are different measures — distinct
  treatments over call sites — and §9 asks for the former. (Note this is a different matter from the
  blindness above, which was real.)
- **"16 of 32 corpus flights measure a deployment shock."** Re-measured: **19 of 36** for the apogee
  shock, 4 for the main.

## What is owed elsewhere

**Five `DESIGN.md` §9 edits are owed to `nrdptel/fusionspace-loft`** — two inherited, three added by
the run before this one: the `:` in the card grep, the generalised spacing grep with its separate
`gap`/`space` branch, and the `sed` that trims trailing space. The harness pins only
`fusionspace-debrief` and `debrief-fixtures`, so none can be pushed there. **A sixth is now owed:**
the card grep's blindness to `rounded-lg` applies to the sibling verbatim, and its own count is
probably wrong in the same direction and by a similar margin.

## Environment notes

- **Git identity defaults to the harness's.** Set it before the first commit:
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrives as an attached repo.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`, and the suite then reports **138 tests**. Far fewer means it is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: `npx playwright install chromium` from the repo root**, then plain `npx playwright test`
  with NO browser variable set.
- **Kill any hand-started `npm run serve:out` before the e2e suite**, and use that server rather than
  `npx http-server` for a manual walk.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on `pull_request`.
  Opening the PR is what runs it, and the `frontend` job's corpus half is the part a local run cannot
  reproduce.
- **A stop hook here will call GitHub's squash-merge commits unverified. It is wrong** — they are
  authored correctly and signed by GitHub.
- **After a merge, the pinned branch must be restarted from the new `main`** and force-pushed with
  lease. A squash merge leaves no parent link, so the old branch reads as "unmerged" by ancestry even
  when `git diff <old-head> origin/main` is empty — check the diff, not the ancestry.

## The fixtures repo

No commit this run; nothing changed a fixture's contract. The seven `corpus-overrides.json` entries
still need removing once `debrief-fixtures` is re-cut.

**Two things worth adding there**, both now with a reason attached:

- a corpus record holding two genuinely separable burns, which would turn `no corpus record holds two
  burns` red — the signal that staging detection has become possible;
- **a launch day where one flyer's two files were dropped together**, which is the signal D6 now rests
  on and which the corpus cannot demonstrate at all: every group in it is assembled by the manifest,
  not by arrival.
