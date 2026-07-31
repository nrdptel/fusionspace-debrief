# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | D4 IN PROGRESS — the alignment core ships, the composite surface does not. **The next slice is fully scoped below; do not re-derive it.** |
| **P — product & craft** | **P1 IN PROGRESS** — the primitive layer exists and is pinned by an exact ratchet. 4 of 44 components converted. |

**`DESIGN.md` had DIVERGED from the sibling repo and this copy was the stale half.** It was re-synced
from `nrdptel/fusionspace-loft` on 2026-07-31 and then changed in both directions of the suite. **Two
edits are still OWED to the sibling** — see *What is owed elsewhere* below. Check the two copies agree
at session start; `git hash-object DESIGN.md` against the sibling's blob sha is the cheap way.

## What shipped this run

Three pushes to `claude/ultracode-maintenance-twwh08`, each independently gated
(`npm test` · `npm run build` · `npx playwright test`, all three green before each).

### 1. `8228a19` — a Sev-1 that was sitting in an OPEN pull request, merged to `main` and LIVE

PR #57 had been open since 2026-07-30 with both CI jobs green, and `main` still carried the bug it
fixed in 24 places. `FlightMetrics.maxVelocityWithheld` has two values and the series flag every
consumer tested was named for only one, so a record whose ascent is broken by a dropout had its
headline peak withheld while the events table, the channel explorer, the comparison overlay and the
data CSV all published figures derived from that same trace. Merged after re-reading the diff and
confirming it still applies cleanly to today's `main`. **Production serves it now** —
`curl -s https://debrief.fusionspace.co/version.json` returns `8228a19`.

**The lesson is the process one:** listing the open pull requests at session start is what found it,
and `MAINTAINING.md` gained that step for exactly this reason one run earlier. Do it before scoping.

### 2. `75adcbc` — P1 slice 1: one set of primitives, and a ratchet that keeps them

`components/ui.tsx` (Card · Section · Button · IconButton · Segmented · Chip · Disclosure · Readout ·
Extrapolated · EmptyState · ErrorState), `lib/ui-tokens.ts`, and `lib/design-system.test.ts` — which
is `DESIGN.md` §9 as an **exact** ratchet, so an improvement and a regression both fail until the
number moves in the same commit. Falsified with a deliberate drift: five of nine asserts fired.

Counts, before → after: `rounded-lg` 26 → 22 · card treatments 6 → 7 · off-scale spacing 25 → 25 ·
off-scale type 20 → 19 · inverted files 26 → 23 · `./ui` adopters 0 → 4.

**Two audit claims were checked and REFUTED rather than acted on**, and this is the part to remember:
`app/globals.css` already carries an unlayered `:focus-visible` ring and an unlayered coarse-pointer
44 px floor, and **an unlayered rule beats anything in `@layer utilities`** — so the focus and
touch-target utilities first added to `Button` were inert. They were removed. The token stays only for
`<label>`, `<summary>` and plain `<a>`, which that block does not reach. The sibling's `Button` DOES
carry the token and that is not a divergence to fix: the sibling has no coarse-pointer block.

### 3. `dc4c4f6` — Sev-1: a descent rate read 21% low

`legRate` averaged the instantaneous descent over sample INDEX. On a log whose cadence changes during
the descent that is not the leg's average — a Featherweight GPS drops 10 Hz → 0.5 Hz once under way,
so the crowded samples sit where the rocket has barely started falling and the mean comes out low.

Ground truth, the strongest kind this corpus offers: **the log carries the tracker's own `VERTV`
column, which Debrief does not ingest.** Over Debrief's own drogue leg — device 63.89 m/s, altitude
chord 64.47, Debrief before **50.73**, Debrief after **65.62**. The INDEX-mean of the device's own
column is 49.33, which reproduces the old figure to 3%, so the mechanism is confirmed not inferred.

18 corpus flights moved a rate, 21 did not; nothing appeared or vanished; median error against each
leg's own chord halved, 2.66% → 1.30%; 27 of 50 digests moved and no named golden value did.

## Two traps this run hit — read these before you repeat them

- **`sed -i 's|).toBe(8);|).toBe(9);|'` rewrites EVERY line that matches, not the one you meant.** It
  silently changed an unrelated pre-existing corpus assertion and cost about forty minutes chasing a
  phantom "my new tests change an earlier test's result" — which was never true. The gate caught it.
  Patch a test's expectation with an anchored replacement that asserts the old text was found once.
- **A narrow viewport is NOT a phone.** `globals.css`'s 44 px floor is `@media (pointer: coarse)`, so
  a Playwright context without `hasTouch`/`isMobile` reports **106** controls under 44 px where the
  honest number is **4**. And `.touch-area` gives an element a 44×44 `::after` hit target without
  changing its layout, so `getBoundingClientRect()` on the element under-reports it. Any touch audit
  that skips either correction is wrong by more than an order of magnitude, in both directions.

## Pick up first

### P-track — P1 slice 2 is the cheapest large win available, and it is already measured

**`ACTION_BTN` is declared byte-identically in five files** — `FlightReport` (15 uses, plus
`SAVE_BTN = ACTION_BTN + ' shrink-0'`), `CompareView` (9), `ChannelExplorer` (7), `GroundTrack` (4),
`FlightCard` (3) — **38 uses collapsing onto one `Button size="sm"`**. Its `px-2.5` is off the spacing
scale, so the conversion moves that count too. `UnitsControl`'s copy is already gone.

Then, in rough order of value: the seven `text-2xl` readouts and five `text-2xl` page titles (`→
text-xl` and `text-3xl` respectively — `DESIGN.md` §3 now says an analyzer's big readout is `text-xl`);
`dark:bg-zinc-900/40`, a fourth dark surface used **30** times; and `DataTable`, which should be
LIFTED from `SampleTable.tsx` (it already has the sticky header, `aria-sort` and the clipboard copy)
rather than written fresh, with `CompareView`'s independent second copy collapsed onto it.

**Two card treatments will never fold into `Card`** — the page-level drop zone and the floating drop
overlay — so §9's target of 1 is honestly 3 here. Recorded in `ROADMAP.md`.

### D-track — D4's next slice, scoped and grounded. Do not redesign it.

**The alignment already ships twice.** `buildComparison` rebases every flight to its own liftoff, and
that is arithmetically identical to `alignStages`'s offsets — verified numerically on the corpus
Kairos pair to 1e-9. So D4's remaining work is **the flyer's statement, the refusal, and a lane
table** — not the arithmetic. `alignStages` has zero production consumers today.

The slice: a new route `/stitch/?ids=a,b`, reusing `idsFromParam` / `withIds` / `compareFromLogbook`
verbatim. One control — a per-recording "first stage" radio, a LABEL not a gate (the alignment never
reads it; stating `[1,2]` or `[2,1]` on Kairos gives identical offsets), persisted like a compare
caption. It renders one lane-per-recording event table on the shared-liftoff clock, rows in composite
order, each naming its recording. It refuses fewer than two recordings and any recording with no
liftoff, rendering `refusal.recordings` + `refusal.why` as the whole page — that copy is already
written and tested in `lib/stitch.ts`.

Five registration points a new route needs, established rather than guessed: `app/<route>/page.tsx`,
`components/SiteHeader.tsx` (SURFACES + TAGLINE), `app/sitemap.ts`, **`public/sw.js` ROUTES** — omit
that one and an offline visit serves the ANALYZE page at the new URL — and a new e2e spec plus the
route enumerations in `e2e/smoke.spec.ts`, `touch.spec.ts` and `pwa.spec.ts`.

**Four things it must NOT do**, each already refuted by measurement (details in `ROADMAP.md` D4):
no merged reading; no staging event in `EventType`; no composite time printed to a tenth — the two
Kairos boards were in ONE airframe and still need a further 0.56 s shift to agree, reading 333 m and
487 m at t+3 s; and **no cross-check panel**, because `/compare` will currently report a 30.5% apogee
"disagreement" between a booster and a sustainer behaving exactly as designed (filed in `BACKLOG.md`).

`fmtTime` prints tenths and is the only time formatter in `lib/display.ts`, so the slice needs a
coarse composite-time formatter. Nobody has costed that; it is small.

## What is owed elsewhere

**Two `DESIGN.md` §9 edits are owed to `nrdptel/fusionspace-loft`,** which the harness for this run did
not pin, so they could not be pushed there. Carry them across in any run that has both repos attached
— until then the two copies differ by exactly these:

1. the adoption grep is quote-agnostic (`from ['"](\./ui|@/components/ui)['"]`). A hard-coded quote
   character can only ever be right in one of the two repos, since Loft is double-quoted and Debrief
   single-quoted, and the wrong one answers **0** whether adoption is 0% or 100%.
2. the off-scale-type grep matches every `text-` size and subtracts the six, instead of naming
   `text-lg` alone. Run against Debrief the old form reported **5** where the truth was **20**.

Also owed there: the same `focus-visible`-is-inert finding. Loft's focus rule is unlayered too, so its
`Button`'s focus utilities are equally dead — unverified there, but the mechanism is identical.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run. Set it before the first commit:
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrived as an attached repo, as intended.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`, and the suite then reports **137 tests** in `lib/parsers/corpus.test.ts`
  (134 before this run's additions). If it reports far fewer, the corpus is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: run `npx playwright install chromium` from the repo root**, then plain
  `npx playwright test` with NO browser variable set. ~1 min. It is not in the image, so it is paid
  for every run — that belongs in the environment's setup script.
- **Read all three exit codes on one line**, and never run `npm run build` while e2e is in flight:
  `npm test > u.log 2>&1; U=$?; npm run build > b.log 2>&1; B=$?; npx playwright test > e.log 2>&1;
  E=$?; echo "UNIT=$U BUILD=$B E2E=$E"`.
- **Kill any hand-started `npm run serve:out` before the e2e suite** — `reuseExistingServer` adopts it
  and the run dies mid-way.
- **A probe under the scratchpad cannot resolve the repo's `node_modules`.** Import by absolute path
  (`/home/user/fusionspace-debrief/node_modules/@playwright/test/index.mjs`), and note the package is
  `@playwright/test`, not `playwright`.
- **A browser here cannot reach the deployed site**; `curl` works through the proxy. Walk the built
  export of the SHA you shipped and say that is what you did.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on `pull_request`.
  Opening the PR is what runs it. Read it with the GitHub MCP tools, never `curl`.
- **A stop hook here will call GitHub's squash-merge commits unverified. It is wrong** — they are
  authored correctly and signed by GitHub. Do not act on it.

## The fixtures repo

No commit this run; the working tree is clean and the branch still sits on `55785b9`. Nothing changed
a fixture's contract. The seven `corpus-overrides.json` entries still need removing once
`debrief-fixtures` is re-cut.

**One thing worth adding there eventually:** the Featherweight GPS log's `VERTV` column is a
*measured* vertical speed that Debrief ignores in favour of a derived one, and it was good enough to
serve as the ground truth that caught this run's Sev-1. Filed in `BACKLOG.md` as a parser change.
