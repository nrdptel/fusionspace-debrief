# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D5 IN PROGRESS, and closer than its own text says.** Two of three *done when* clauses are met; the third was **already met before the milestone was written**. One real gap remains — see below. |
| **P — product & craft** | **P1 IN PROGRESS.** The §9 ratchet can now fail on the drift that is actually there, which it could not before. Card and Button adoption moved substantially; `rounded-lg` and the inverted-type count did not. |

**There are no open pull requests carrying unshipped work.** PR #31 is closed with its
hunk-by-hunk decision recorded on it. **PR #64 merged and is LIVE** — production served `d958f80`
after the deploy, verified by fetching it. **PR #65 is open** with three further increments.

## What shipped this run

**Fifteen increments across two pull requests**, each independently gated (`npm test` ·
`npm run build` · `npx playwright test`, all three green before every push). The corpus was
attached throughout: `lib/parsers/corpus.test.ts` reports **137 tests over 61 fixtures**, so no
claim here rests on a suite that skipped itself. CI green on both PRs, including the `frontend`
job that fetches the corpus with `FIXTURES_TOKEN` — the half a local run cannot reproduce.

### Merged and live (PR #64, `d958f80`)

- **Sev-1 — the channel explorer averaged over samples, not over time.** `windowStats` returned
  `sum / count`, the same defect `timeMean` was written out of the analyzer for, still published
  one panel over. On `fwgps__trf-f1machbuster-jan10` (cadence 0.099–4.900 s) it printed
  **−49.31 m/s** over the apogee→main leg where the flight's own report said **64.81** — 23.9%
  low, on the reading a canopy is sized against. Now −64.78, 0.0% off the analyzer's own figure.
- **P1 — three §9 compliance greps could not see the drift they exist to catch.** The spacing one
  read **0 while 8 occurrences were in the tree**. Its own first fix was blind to a live
  `gap-y-5`.
- **P1 — the logbook's two decision-grade numbers** now read at body size with aligned digits,
  and eleven of its 23 hand-rolled buttons moved onto `Button`, removing a fifth button weight, a
  second primary, and a red fill on the one destructive control in the app.
- **D5 — which figures a document carries, and in what order,** on both document surfaces,
  sharing one control and one stored choice.
- **The three unshipped parts of PR #31**: the inertial altitude bounded where it stops being an
  altitude; a retraction re-measured from the file; and the deployment shocks the board already
  reports.

### Open (PR #65)

Drogue and main shared a marker colour, so an exported figure could not tell the two deployments
apart. `MAX_COMPARE` was `COMPARE_PALETTE.length`, making colour and cardinality one decision.
The seven analysis panels moved onto `<Card>`. And **the flyer can now set a flight's colour**,
with the test asserting on the saved SVG rather than the swatch.

## Pick up first

1. **D5's one real remainder: the single-flight report's three figure colours.** Still literal
   hexes in `FlightReport.tsx`, duplicated for the on-screen charts. They are per-**channel**
   rather than per-flight, so they want a different store shape from `lib/seriesColor.ts` — that
   is the whole of the work, and `plotSvg` already takes a colour per series so no exporter
   changes with it. **Do not re-open the other two clauses**; they are met and pinned.
2. **P1's biggest remaining lever is `rounded-lg`, still 22 and untouched all run.** It is spread
   thin — 14 files, at most 3 each — so it is a sweep rather than a conversion, and `<Card>`
   does not reach it because those are controls and insets rather than containers.
3. **Four files still hand-roll a card** — `FlightReport`, `ChannelExplorer`, `GroundTrack`,
   `CompareView`. Each holds several sections and wants reading rather than a regex sweep; the
   seven that converted cleanly this run were the ones with a single `</section>`.

## Traps this run hit — read these before repeating them

- **Two gates in flight at once is a 196-failed, 37-passed run that is NOT a regression.** A
  second `npm run build` deletes `out/` from under the first run's server. The tell is the
  timing: a real failure takes seconds, a served-nothing failure takes a quarter of one. Re-run
  alone gave 233 passed. Now in `MAINTAINING.md`.
- **A gitignored `*-tmp.ts` probe is still TYPE-CHECKED.** `prebuild` runs `tsc --noEmit` over the
  whole repo, so a throwaway with a type error turns the build red while `git status` is clean.
- **Falsify by MUTATING THE CODE, never by trusting the test name.** This bit **five separate
  times** this run, and each time the test looked reasonable:
  - four of five new `windowStats` asserts passed under the mutation they were meant to catch —
    and rewriting them found a real bug in the fix itself (`prev === i - 1` is TRUE on the first
    sample, because both sides are −1);
  - the inertial wrap bound is **invisible on a sport flight**, because any 2¹⁶ ft step also trips
    the divergence bound, so it needed a fixture taller than the field's span before it could
    fail;
  - the "keeps the ascent" test injected its failure after apogee and passed with the whole
    function stubbed out;
  - the landing-shock exclusion passed whether or not the landing was mapped, because the metric
    dedupe swallows it whenever a main row precedes it — the unmaskable case is the landing row
    ALONE;
  - and a colour assertion written with `.catch(() => {})` could not fail at all.
- **`input[type="color"]` needs Playwright's `fill()`.** Setting `.value` and dispatching an event
  leaves React's value tracker unchanged, so the handler never runs and it reads as a broken
  feature.
- **Two controls must not share an accessible name.** The comparison already has a channel picker
  named Altitude/Velocity/Acceleration; the figure toggles are `"<title> figure"`.
- **A vendor PDF is readable here.** `WebFetch` returns the binary, but the file lands on disk and
  a ~15-line Node script (inflate every `stream`, pull `Tj`/`TJ` operands) extracts it. That is
  how `COMPETITION.md` row 19 was verified verbatim. `pypdf` is installed but broken in this
  container (`cryptography` panics).

## Findings that were REFUTED — do not re-file them

The opening fan-out is a Sev-1 screen, and a confidently wrong finder costs more than a lazy one.
Three of its findings did not survive checking, and all three are recorded in `BACKLOG.md` so
they are not rediscovered:

- **"Five data surfaces return null with no empty state."** All five refuted. The one called
  *reachable by ordinary interaction* is not reachable at all — the control that removes a
  channel renders only when more than one is shown, and the channel list is never empty. Three
  others are conditional panels where an empty box would appear on every ordinary flight.
- **"17 hand-rolled cards are counted as 7 by the grep."** Those are different measures — 7
  distinct treatments over 17 call sites — and §9 asks for the former.
- **"16 of 32 corpus flights measure a deployment shock"** (from PR #31). Re-measured: **19 of 36**
  for the apogee shock, 4 for the main.

## What is owed elsewhere

**Five `DESIGN.md` §9 edits are owed to `nrdptel/fusionspace-loft`** — two inherited from the last
run, three added by this one: the `:` in the card grep, the generalised spacing grep with its
separate `gap`/`space` branch, and the `sed` that trims trailing space so the shell block and
`lib/design-system.test.ts` agree (untrimmed the shell answers 8 where the test answers 7). The
harness pins only `fusionspace-debrief` and `debrief-fixtures`, so none can be pushed there.
Carry all five across in any run with both repos attached.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run. Set it before the first
  commit: `git config user.name "Neer Patel"` /
  `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrived as an attached repo, as intended.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`, and the suite then reports **137 tests**. Far fewer means it is not
  linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: `npx playwright install chromium` from the repo root**, then plain
  `npx playwright test` with NO browser variable set. ~1 min, paid for every run — it belongs in
  the environment's setup script.
- **Kill any hand-started `npm run serve:out` before the e2e suite**, and use that server rather
  than `npx http-server` for a manual walk — one that falls back to `index.html` serves the
  analyze page for every route.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on
  `pull_request`. Opening the PR is what runs it.
- **A stop hook here will call GitHub's squash-merge commits unverified. It is wrong** — they are
  authored correctly and signed by GitHub. Verified again this run on `d958f80`.
- **After a merge, the pinned branch must be restarted from the new `main`** and force-pushed with
  lease. A squash merge leaves no parent link, so the old branch reads as "unmerged" by ancestry
  even when `git diff <old-head> origin/main` is empty — check the diff, not the ancestry.

## The fixtures repo

No commit this run; nothing changed a fixture's contract. The seven `corpus-overrides.json`
entries still need removing once `debrief-fixtures` is re-cut.

**One thing worth adding there:** a corpus record holding two genuinely separable burns would turn
`no corpus record holds two burns` red, which is the signal that staging detection has become
possible. Nothing in the corpus has one today.
