# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D5 IN PROGRESS** — the figure choice now reaches BOTH document surfaces. Order and colour are what remain; the milestone's own notes were wrong about image/paginated export and are corrected in `ROADMAP.md`. |
| **P — product & craft** | **P1 IN PROGRESS** — the §9 ratchet can now fail on the drift that is actually there, which it could not before. Seven items remain, four of whose counts were stale and are corrected. |

**There is ONE open pull request against this repo and it is not stale work — it is unshipped
work.** PR #31 (opened 2026-07-28) claims four things; **part 1 landed by another route (#57) and
parts 2, 3 and 4 are entirely absent from `main`.** Do not close it as superseded without reading
*The open pull request* below.

## What shipped this run

Working branch, each increment independently gated (`npm test` · `npm run build` ·
`npx playwright test`, all three green before every push). The corpus was attached throughout:
`lib/parsers/corpus.test.ts` reports **137 tests over 61 fixtures**, so no claim here rests on a
suite that skipped itself.

### `8234475` — P1: the design ratchet can fail again

Three of `DESIGN.md` §9's compliance greps could not see the divergence they exist to catch, so P1
had been measuring itself with a broken instrument.

- The card grep's character class had no `:`, so every treatment truncated at its first `dark:`
  variant and two cards differing only in their dark surface counted as one. **The count does not
  move — 7 before, 7 after.** What the fix buys is what the metric can *distinguish* for the rest
  of the milestone. Say that rather than bank a correction that did not happen.
- The spacing grep enumerated forbidden values over the prefixes `p m g` and stopped at 14, so it
  never matched `gap-` or `space-{x,y}-` at all. It read **0 while 8 occurrences over 6 sites were
  in the tree**.

**The first draft of that second fix was itself blind to `gap-y-5`**, which was live in
`app/methods/page.tsx`: `gap`/`space` take the axis as a separate segment where padding and margin
fold it in, so they cannot share a prefix pattern. A second false green inside the commit written to
remove the first — **caught by the pre-push review, not by the grep.**

### `bff5a71` — Sev-1: the explorer's mean was an index mean

`windowStats` returned `sum / count`, which is the same defect `timeMean` was written out of the
analyzer for last run, still being published one panel over. On `fwgps__trf-f1machbuster-jan10`
(cadence 0.099–4.900 s) the explorer printed **−49.31 m/s** over the apogee→main leg where the
flight's own report said **64.81** — 23.9% low, on the reading a canopy is sized against, and
reproducing the analyzer's pre-fix 49.33 to 0.04%. Now **−64.78**, 0.0% off the analyzer's own
`timeMean`.

**Then fixed forward after review** (`explore.ts`, same branch): the adjacency rule dropped BOTH
intervals touching a dropout sample where `timeMean` keeps their duration by falling back to the
finite end. The two now agree case for case — checked at 29 against 29 on `t=[0,1,2,3,10]`,
`y=[0,10,NaN,30,40]`.

### D5 slice 1 — the comparison honours the figure choice, and one control serves both surfaces

`components/FigureChooser.tsx`. See `ROADMAP.md` D5 for the two premises this slice refuted.

## Four traps this run hit — read these before you repeat them

- **A gitignored `*-tmp.ts` probe is still TYPE-CHECKED.** `prebuild` runs `tsc --noEmit` over the
  whole repo, so a throwaway with a type error turns `npm run build` red while `git status` shows a
  clean tree — which reads as a broken gate rather than a stray file. Now in `MAINTAINING.md`.
- **Falsify by MUTATING THE CODE, not by trusting the test name.** Four of five new asserts passed
  under the mutation they were supposed to catch. Rewriting them found a real bug in the fix
  itself: `prev === i - 1` is TRUE on the first sample because both sides are −1, so `time[-1]` was
  `undefined` and `dt` was `NaN` — harmless only because `NaN > 0` is false.
- **Two controls must not share an accessible name.** The comparison already has a channel picker
  named Altitude/Velocity/Acceleration; adding figure toggles with those names would have made
  every existing query ambiguous. They are `"<title> figure"`.
- **The vendor PDF is readable here and worth reading.** `WebFetch` returns the binary, but the file
  is saved to disk and a ~15-line Node script (inflate every `stream`, pull `Tj`/`TJ` operands)
  extracts it. That is how row 19 of `COMPETITION.md` was verified verbatim rather than from a
  summary. `pypdf` is installed but broken in this container (`cryptography` panics).

## The open pull request — decide it, do not just close it

**PR #31, `nrdptel/fusionspace-debrief`, opened 2026-07-28, base `e8cbdcc` (long superseded).**
Verified against today's tree, hunk by hunk:

| part | state |
|---|---|
| 1 — `velocityImplausible` → `velocityUnusable` on all five consumers | **ALREADY IN MAIN** via #57. Re-applying is a no-op conflict. |
| 2 — bound the inertial altitude where it stops being an altitude | **NOT IN MAIN, none of it.** |
| 3 — retract "the HR file has no second copy" in `BACKLOG.md:771` | **NOT IN MAIN.** The false claim is still live and unqualified. |
| 4 — map `Apo/Main channel max accel` onto the deployment shocks | **NOT IN MAIN, none of it.** Needs the `ReportedValue` union, the `deviceSummary` keys, a `compareReported` that can resolve an EVENT's `peakAccel`, and four call sites moving together. |

**Part 2 is reproduced and real.** Measured this run over the corpus Blue Ravens, on the copy
Debrief analyses:

```
jan18       -151,147 ..   6,157 ft   baro peak   6,296 ft   never wraps
lemiv-l3     -32,767 ..  32,755 ft   baro peak  12,061 ft   one 65,522 ft single-sample step
meraki2      -32,768 ..  32,765 ft   baro peak 247,754 ft   same 2^16 step
jan10         -2,781 ..  11,265 ft   baro peak  10,266 ft   credible, no wrap
```

It is plotted in the explorer and written into the data CSV as the device's own altitude. The PR's
design is sound and needs no redesign: two scale-free bounds (a single-sample step of ~2¹⁶ ft is a
counter wrapping; two recordings of one flight's height differing by more than the whole flight is
one of them having stopped reading), whichever comes first, with a note saying why the rest is
withheld. Neither fires on `jan10`.

**Recommended disposition:** re-apply parts 2–4 as fresh commits on today's `main`, then close #31
with a comment pointing at them. Merging it as-is is not possible — 22 files against a base that has
moved 20+ commits, and part 1 would conflict with the version that shipped. Note the PR also carries
selector hardening for `e2e/device-summary.spec.ts` that is a **prerequisite** for part 4, not a
tidy-up: four assertions use `hasText: 'Apogee'`, a substring match that goes ambiguous the moment an
"Apogee deployment shock" row joins the same table.

## Pick up first

1. **PR #31 parts 2–4**, above. Part 2 is the one with a wrong number behind it.
2. **D5's remaining clauses** — figure ORDER first (`orderRows`/`moveReading` already do the job for
   the readings and are surface-agnostic), then colour. **Split `MAX_COMPARE` off
   `COMPARE_PALETTE.length` before touching colour**, or a presentation change silently alters how
   many flights a comparison holds and how many series the explorer draws.
3. **P1's remaining seven**, with the two most product in them being `DataTable` and the five
   required states. Both are larger than the milestone text implies — see the warnings in
   `ROADMAP.md` P1: "collapse `CompareView` onto it" is **not buildable as written**, because
   `CompareView` sorts COLUMNS by a row while `SampleTable` sorts ROWS by a column, and the liftable
   part of `SampleTable` is `SortableHeader` (~48 lines), not the file. `components/ui.tsx` has no
   `LoadingState` and no `OfflineState`, so two of the five states have no primitive to adopt yet,
   and `navigator.onLine` appears **0 times** in the whole repo.

## Also found, filed rather than fixed

- **`lib/analyze/index.ts:2593` — `burnoutVelocity` is gated on `!velocityImplausible` alone**, while
  the withhold decision is `velocityUnusable = velocityImplausible || ascentGapBreaksPeak` and max-Q
  correctly tests both. Same shape as the defect #57 fixed. No corpus file is demonstrably in that
  state, so this is a confirmed code-level inconsistency rather than a demonstrated wrong number —
  but the comment beside it already claims it is "withheld with the rest", which it is not.
- Five surfaces `return null` on empty rather than showing an empty state, one of them
  (`ChannelExplorer.tsx:212`, deselect every channel) reachable by ordinary interaction.
- The three Blue Raven descent legs whose explorer mean and reported rate differ by 608–3600%.

## What is owed elsewhere

**Two `DESIGN.md` §9 edits are still owed to `nrdptel/fusionspace-loft`** (from the last run), and
**this run adds three more**: the `:` in the card grep, the generalised spacing grep with its
separate `gap`/`space` branch, and the `sed` that trims trailing space so the shell block and
`lib/design-system.test.ts` agree (untrimmed the shell answers 8 where the test answers 7). The
harness for this run pins only `fusionspace-debrief` and `debrief-fixtures`, so none of it can be
pushed there. Carry all five across in any run that has both repos attached.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run. Set it before the first commit:
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrived as an attached repo, as intended.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`, and the suite then reports **137 tests**. If it reports far fewer, the
  corpus is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: run `npx playwright install chromium` from the repo root**, then plain
  `npx playwright test` with NO browser variable set. ~1 min. It is not in the image, so it is paid
  for every run — that belongs in the environment's setup script.
- **Read all three exit codes on one line**, and never run `npm run build` while e2e is in flight.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on
  `pull_request`. Opening the PR is what runs it. Read it with the GitHub MCP tools, never `curl`.

## The fixtures repo

No commit this run; nothing changed a fixture's contract. The seven `corpus-overrides.json` entries
still need removing once `debrief-fixtures` is re-cut.
