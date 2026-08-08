# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **The owner's inbox was full, and it is now empty of unanswered notes.** | `OWNER-NOTES.md` arrived with **eight open notes and no verdicts**. All eight carry a verdict dated 2026-08-08. Four became milestones (**D10, D11, P8, P9**), two sharpened milestones that already existed (**P4**, **P5**), one is a `DESIGN.md` token change, one a `COMPETITION.md` row. |
| **Shipped to production** | `#143`, squashed to `84d2455`, **confirmed serving** at debrief.fusionspace.co. Five increments. |
| **Pending on the branch** | `#145` (`2fb1854`) — P8 slices 2 and 3. Open, CI running at the time of writing. **Merging it on green is pre-authorised and is the first thing to do.** |
| **D — capability** | **D10 slice 1 shipped.** Three sample flights where there was one, and the second demonstrates D3 — two boards recording one physical flight, agreeing at 1,025 vs 1,029 ft. **D11 (canonical round-trip) is decomposed and NOT STARTED.** |
| **P — product & craft** | **P8 SHIPPED** (the `?` explains in place). **P9 slice 1 shipped** (the methods page has a structure). §5 gained two primitives: `Popover` and `SectionNav`. |
| **§9 counts, start and end of run** | `rounded-lg` **0** · card treatments **3** · off-scale spacing **0** · off-scale type **1** · inverted-type files **10** · `ui` adopters **36 of 48**. **Identical at both ends; none moved the wrong way.** |

**Re-measure before believing any of this**: `git fetch --prune origin`, then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moved twice underneath
this run — PR `#144` landed mid-session from elsewhere.

## The one thing to read before anything else

**Four defects this run were invisible to every test that existed, and three were invisible to the
tests I wrote for them.** The pattern is the lesson.

1. **The popover shipped-ready in ALL CAPS.** `text-transform` and `letter-spacing` INHERIT, and
   the `?` opens from inside `Readout`'s `text-xs uppercase tracking-wide` label — so all 51
   explanations rendered as capitals at 12 px. Every text assertion passed, because `innerText` is
   identical either way. **Only `getComputedStyle` could see it.** If a change is about how
   something READS, assert the computed style, not the text.
2. **A "widened" ratchet was still blind to the exact case it had just been widened for.**
   `\bz-(\d+|\[[^\]]+\])\b` never matches `z-[60]`: the character before the trailing boundary is
   `]`, which is not a word character. The check passed, green, against a hand-roll planted to trip
   it. Only the falsification run said so.
3. **Two of my assertions could not fail** — one was true before the action it was testing, one was
   satisfied by an import line. Both were found by the pre-push review, not by me.
4. **A build that FAILS leaves the previous `out/` in place**, and `npm run build | tail -1 && npx
   playwright test` does not short-circuit, because a pipeline's exit status is `tail`'s. A probe
   then reported the OLD behaviour and I nearly read it as "the fix did not work". Check the build's
   own exit code, not the pipeline's.

**The rule this produces, and it is the same one the last run reached from a different direction:**
writing the check is not the work. Trying to break it is — and if the thing you changed is visual,
the check has to look at what the browser computed rather than at what the DOM says.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout.** `nrdptel/debrief-fixtures` on disk, symlinked
  into `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; `corpus.test.ts` is **148
  tests**. `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a no-op — the attached
  checkout is the whole reason there is a corpus.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every
  session; it belongs in the environment's setup script.** Said for at least the sixth run running.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before
  the first commit, in BOTH repos.
- **GitHub appends an attribution footer on PR CREATE and eats anything tag-shaped.** Confirmed
  again: the first body lost `<a target="_blank">`, `<details>`, `<summary>` and `<body>` to
  silent stripping, and gained a footer. `update_pull_request` does NOT append one. **Write PR
  bodies with no angle brackets at all** and read every body back through the authenticated tool —
  a plain `curl` of the API is 403 through this proxy, so it cannot be the check.
- **The e2e suite flakes under its own parallelism on this 4-core box** — a different test each
  full run, including ones the change never touched. `--workers=1` is what CI does and is the
  signal to quote. A full serial run is ~8 minutes.
- **`npm run build` crashed twice with a webpack `WasmHash` TypeError.** Not memory (15 GB free),
  not the change. `rm -rf .next` fixed it. If the build dies in `bundle5.js`, clear the cache
  before diagnosing anything else.

## What shipped, in order

| PR / commit | what | pinned by |
|---|---|---|
| `#143` → `84d2455` | **Eight owner notes triaged**, four became milestones | — |
| ↳ | **§5 gains `Popover`**; the units panel's hand-rolled overlay converted | 3 design-system assertions + a dismissal walk, each falsified |
| ↳ | **The methods page gets a structure** — 1 `h1` → 11 `h2` → 51 `h3`, contents, pinned strip; `SectionNav` lifted out of `FlightReport` | `lib/methodIds.test.ts` ×2 + `e2e/smoke.spec.ts`, falsified twice |
| ↳ | **The Velocity chart carries the refusal six other surfaces carry** | `e2e/analyze.spec.ts`, falsified both ways |
| ↳ | **Three sample flights from one**, incl. two boards on one flight | `lib/samples.test.ts` ×6 + 2 e2e walks |
| `#145` → `2fb1854` | **The `?` explains in place**; 51 blocks moved to a shared module | `e2e/analyze.spec.ts` (scroll ≤4 px, 0 navigating, computed typography), falsified |

## Pick this up first

1. **Merge `#145` on green.** It is P8's completion and it is not reachable by a flyer until then.
2. **P9 slice 2 — the prose itself, which is the half of ON-1 still open.** `Method` wraps each
   block's body in a single `<p>`, so **no block on the page can have a second paragraph** — the
   wall is structural, not editorial. **36 standalone `{' '}` lines sit exactly where paragraph
   breaks were intended** and render as one space; the worst single block is **826 words in one
   unbroken paragraph**. Now that the text is data in `lib/methods/content.tsx`, this is cheap.
3. **D11 — the canonical round-trip.** Decomposed, not started. D10 slice 1 gave it files that ship
   in the repo, which was the reason it was queued second.
4. **`.touch-area` does not do what it documents, on at least nine controls.** See `BACKLOG.md`:
   exempting it from the coarse-pointer floor restores the readings grid to its old density AND
   drops nine comparison controls to 26×26, which means they were never getting their 44 px from
   the `::after` they appear to opt into. Find out which before touching that rule.
5. **§2's tertiary token fails AA in dark** — 4.12:1 on page, 3.67:1 on raised, against 4.83:1 in
   light, at five sites that are not disabled controls. Measured, filed, not fixed. It is a
   `DESIGN.md` change owed to both repos.

## Owed to the sibling repo, and unshipped there

`DESIGN.md` is identical in both and the sibling was **not attached to this session**. Two entries
are owed: §5's `Popover` and §5's `SectionNav`. The sibling's own `ON-5` asks for the same popover
primitive from the other direction, so building it twice is the live risk. Parked in
`OWNER-NOTES.md` → *Awaiting the owner*.

## The done-check, executed — what each step returned

1. **Corpus sweep: 0 findings.** 148 tests over **62 manifest fixtures**, run on every gate. Two
   deliberate sweeps beyond the suite: `velocityUnusable` reaches the report on **15 of 50**
   analysable recordings (became a fix), and the reported `burnoutVelocity` gate mismatch reaches
   **0 of 50** (became a `BACKLOG.md` entry rather than a guard that fires on nothing).
2. **Cold walk of the built export**, at 390×844, **including offline** — the journey not otherwise
   walked this run. Three sample entry points on the landing page; the two-altimeter sample reaches
   a cross-check; the popover is fully on screen (12..378 px, ends y=832 of 844) with
   `text-transform: none`; `/methods` keeps 11 subjects and 51 blocks; **offline `/methods` returns
   200 with its structure intact**; zero console errors. Production confirmed serving `84d2455`;
   the gap at the end of the run is `#145`, open and pending.
3. **`COMPETITION.md` rows 33 and 34 added** — the suite's shared controls, and in-app explanation
   of a computed value, where Debrief now leads rather than matches.
4. **§9 counts: identical at both ends of the run.** Table at the top. None moved the wrong way,
   and the ratchet caught one regression I introduced (23 off-scale spacing values) which was
   brought onto the scale rather than re-baselined.
5. **`BACKLOG.md` read and corrected** — one entry this run invalidated (`FlightReport`'s
   section-nav chip is no longer a `-2.5` site; 11 → 10), and **eight new entries**, each with the
   measurement that makes it actionable.
6. **Both track questions.**
   - **D:** a flyer can open, in one click and without supplying a file, a flight recorded by two
     different altimeters and see the two readings set side by side — the reconciliation Debrief
     shipped in D3 and could not demonstrate for nine days.
   - **P:** a flyer meeting a term of art gets the explanation where they are standing instead of
     losing their place to a second tab (21 readings, 0 of which now navigate away), and the
     12,700-word reference behind it went from 51 flat headings to a document with subjects, a
     contents list and a you-are-here marker.
7. **`ROADMAP.md` updated** — P8 `SHIPPED`, P9 and D10 `IN PROGRESS` with what is left named, D10's
   route change recorded, and three decisions under *Decisions taken without the owner* with the
   alternative rejected in each.
8. **All eight open notes carry a verdict dated 2026-08-08.** Zero remain `(pending)`. Two
   questions are parked in *Awaiting the owner*, neither blocking.
