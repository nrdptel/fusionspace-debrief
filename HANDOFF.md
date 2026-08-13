# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **Every commit this run is merged and live.** The code ones, in order: `d7dee41` · `6a4340d` · `40aa74a` · `b188ab6` (#186, the track exports' provenance) · `9710392` (#187, the marker through a named parser) · `d858d6b` (#188, `/stitch`'s staged pair) · `f7154c3` (#189, the explorer's chip row) · `d305708` (#190, the saturated-accelerometer sample) — and the documentation commit carrying THIS file merged after them, so it is not in that list and its SHA is not knowable from inside itself. Every one was green on CI's own two jobs, corpus half included, before merging. **Do not count from this line — measure**: `git fetch --prune origin && git log --oneline origin/main | head -12`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | Measure it, do not trust this line: `git rev-list --count origin/main..HEAD`. At the end of this run it was the documentation commit below and nothing else. |
| **Sev-1** | **None open, none inherited.** Four were found and fixed earlier in this run; nothing since has produced one. The closing gate was **unit 1,413 across 91 files** with the corpus attached, **build clean**, **e2e 353**. |
| **D — capability** | **D10's labelling half is DONE, and the OFFER half went from one sample to three.** `SINKS` reads 24 labelled · 5 carries · 0 todo across 29 rows. (c) shipped, and two of (d)'s three logs shipped: a staged pair (so `/stitch` has a demonstration for the first time, and `COMPETITION.md` row 40 is resolved) and a saturated accelerometer (so the app's own refusal to publish a railed peak has one). |
| **P — product & craft** | **P1: audit row 4 shipped and row 6 was refuted.** The explorer's chip row went from three heights to one, on a new `DismissibleChip` — and the census that exists to find hand-rolled chips could not see either of them, which is the more useful half. |

## The done-check

`DESIGN.md` §9's compliance block, run on the shipped tree at the end of the run:

| count | target | now |
|---|---|---|
| radius drift | 0 | **0** |
| off-scale spacing | 0 | **0** |
| off-scale type | 0 (honest floor 1) | **1** — the brand wordmark, §10's non-negotiable |
| card treatments | 1 + named non-card primitives | **3** |
| files where `text-xs` > `text-sm` | 0 | **10 of 51** — read `lib/design-system.test.ts`'s note before treating that as a defect total |
| components importing `./ui` | most | **39 of 51** |

**Nothing moved, in either direction.** That is the expected result for this run's P work rather
than a null: converting two hand-rolls inside a file that already imported `./ui` moves no
file-level count, which is exactly the blind spot `ROADMAP.md` P1 records about §9's own greps.

**The cold walk found two things and neither was a defect, which is worth saying rather than
implying.**

1. The `/` aside now carries the SYNTHETIC clarifier twice, once per made-up sample —
   *"…told about SYNTHETIC — a flight Debrief made up, not a recording · A sensor that ran out of
   range SYNTHETIC — a flight Debrief made up, not a recording"*. Read linearly that is per-offer
   redundancy, which is the principle `COMPETITION.md` row 41 argues FOR, and the chips are not
   part of either button's accessible name. Left alone deliberately.
2. `Coast efficiency 100%` sits above `15 ft short of a drag-free coast` on the new saturated
   sample, which is drag-free by construction. A rounding artifact rather than a wrong number, and
   the sub-line is what keeps it honest — **filed in `BACKLOG.md`** rather than fixed, because the
   fix changes a shipped reading's formatting on every flight and wants its own gate. Reachable on a
   real clean airframe too, so it is not an artifact of a made-up file.

## A zero-trace breach was found in the repo itself, and fixed

The closing audit greps every tracked source file for an AI vendor's name — the first invariant —
and `OWNER-NOTES.md` matched. **One occurrence in the whole tree**, on a note a previous session
filed on 2026-08-08 to report that the harness mandates an attribution footer the invariant forbids.
The note quoted the harness instruction verbatim, product name included — so the file filed to
report the breach was the only place in the repo committing it, in public, for five days.

Paraphrased, with a dated parenthetical saying why, so the next session does not "restore" the quote
thinking it was mangled. Nothing else about the note changed and its verdict stands.

**The lesson is narrow and worth keeping**: a note ABOUT a leak is a place a leak hides, because
quoting the offending text is the natural way to report it. The audit that found it is three lines
and belongs in every closing pass — it is in this file's own done-check section now:

```bash
grep -rlinE "\bclaude\b|\banthropic\b|\bcopilot\b|\bchatgpt\b" \
  --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.js" \
  --include="*.yml" . | grep -v node_modules | grep -v "^./.next" | grep -v "^./out"
```

Also checked and clean this run: every commit author is
`Neer Patel <135655563+nrdptel@users.noreply.github.com>`, no `Co-Authored-By` trailer on any
commit, and all five pull-request bodies were read back after posting — the harness appended its
footer to every one and it was stripped from every one.

## Production was verified, not assumed

`version.json` served **`d305708`** at the end of the run, which was `origin/main`'s head, and all
three new sample files were fetched from the live site and hashed against `origin/main`: byte-
identical, each with `Synthetic,"…"` as its first line. The deploy pipeline does not mangle them.

**One thing worth knowing before believing a 404.** `sample-saturated.csv` returned **404 for about
two minutes after its deploy finished** — with a cache-buster on the URL — and then 200, while the
two files from the previous merge served immediately. A brand-new PATH takes a moment to propagate;
an old path with new bytes does not. A session that checks a new asset the second the build reports
done and reads the 404 as a broken deploy will go looking for a bug that is not there. Wait and
re-fetch before diagnosing.

## What shipped this run, in order

1. **`b188ab6` (#186)** — the track exports say which instrument drew them: `<src>` in the GPX,
   `<ExtendedData>` in the KML. `COMPETITION.md` rows 43 and 44's action.
2. **`9710392` (#187)** — **a made-up flight keeps its marker through a NAMED PARSER.**
   `syntheticFromRows` was called from exactly one place, `analyzeTable`, so a generated flight in a
   format Debrief RECOGNISES arrived with no marker and `isSynthetic` — the predicate every surface
   branches on — returned false for it. Measured by prepending the marker to three real fixtures:
   all three auto-detected, all three unlabelled. Unreachable while every generated file was a
   mapper file; the staged pair made it reachable on its first line.
3. **`d858d6b` (#188)** — **`/stitch` gets a demonstration.** A booster and a sustainer of one
   launch, made up and labelled. The booster is on the ground at T+27 s while the sustainer is still
   climbing to apogee at T+31 s, and no single one of the two files says that — which is what the
   sample exists to show, and what the tests assert rather than the heights.
4. **`f7154c3` (#189)** — **the explorer's chip row is one height.** Measured 26 / 30 / 34 px on a
   pointer device and 44 / 54 / 50 on a phone; now 26 / 26 / 26 and 44 / 46 / 46.
5. **#190** — **a sample for the thing Debrief refuses to say.** An accelerometer clipped at 16 g
   over a 24 g boost, with the height and speed columns integrated from the unclipped curve, so the
   file is its own evidence. The report has exactly one thing to say about it, and the walk asserts
   that count.

## The three findings worth carrying forward

**1. A prerequisite discovered twice, and the second time recorded so it is not discovered a
third.** The staged pair could not ship until `importFlight` carried the marker; the coarse-GPS log
cannot ship as a mapper file at all, because everything that demonstration rests on hangs off
`flight.meta.altitudeSource === 'gps'`, and that field is set in exactly two places, both inside
`lib/parsers/featherweightGps.ts`. The mapper has no role that says an altitude came from the
constellation. Written into `ROADMAP.md` D10 (d).

**2. The chip census's blind spot was not about the tag, and that is new.** Seven previous entries
in §9's list were "the scan enumerated the element in front of it". This one required `px-…`, and a
chip with a trailing ✕ is `pl-2 pr-1` by construction — so the whole class of "chip that grew an
action" was invisible, which is also the class most likely to be hand-rolled, because neither
`Chip` nor `ChipButton` can hold a nested control. **A predicate can be blind to a SHAPE, not only
to a name.**

**3. Adopting a primitive is a contrast change even when the diff touches no colour.** The
explorer's unit label carried `text-zinc-500` across unchanged: 4.61:1 on the hand-rolled chip's
`bg-white`, 4.4:1 on `Chip`'s raised `zinc-100` tile. The source census rates the class clean and is
right to — the ink did not change, the ground under it did. Recorded in `DESIGN.md` §9 beside the
wash entry it is NOT a duplicate of.

## D10's own two lists disagree, and someone has to settle it

Surfaced while marking the saturated accelerometer shipped. The *done when* names six capabilities
including **the OpenRocket design overlay**; slice (d) lists three synthesized logs and never
included it, so it has been invisible to every status line this milestone has written. Four of the
six are covered; a coarse-GPS flight and the design overlay are not, and the overlay is not a
synthesized log at all — an `.ork` is a design, and `e2e/orkFixture.ts` already builds one. Ship it
or move it out of the *done when* with a reason; do not let a third status line be written against
the shorter list.

## The corpus sweep, stated plainly

**Not re-run this run.** The previous run swept it and found nothing (its numbers are in git
history), and this run's work was additive — three new generated files and one primitive — none of
which touches a reader, an analyzer path or a metric. The corpus was attached for every gate:
`lib/parsers/corpus.test.ts` names **9 committed fixtures and 50 corpus recordings**, and the full
suite ran 1,413 across 91 files with it. **An unrun sweep is not an empty sweep**, so it is said
plainly here rather than left to be inferred from a green suite.

## Pick this up first

1. **P1's remaining design-system audit rows, queued in `ROADMAP.md`.** Rows 1–4 are shipped or
   refuted; what is left is mostly one more sweep of `ChannelExplorer` — row 5 (its chart is a bare
   `Card` plus a hand-written axis line where `Figure` owns that row), row 8 (`Button variant="link"`
   re-padded at the call site, which is the one thing that weight is defined by not having), row 9
   (seven one-glyph controls across FIVE geometries, none wearing `ghost`'s tint) — plus row 7
   (`SampleTable`'s `text-[11px]` on body text and on a live region) and rows 10–11.
   **Read row 3 and row 6 before starting**: both were refuted by measurement, and the lesson each
   taught is that an audit reading source finds divergence and cannot weigh it. Weigh row 9 the same
   way before converting anything — measure the five geometries in the running app first.
2. **D10 (d)'s last log: a coarse-GPS flight** — and read the prerequisite in `ROADMAP.md` D10 (d)
   first. It cannot be a mapper file: `altitudeSource: 'gps'` is set in exactly two places, both in
   `lib/parsers/featherweightGps.ts`, and the mapper has no role for it. Either write the file in
   that logger's format — the staged pair's route, and its honesty argument applies unchanged, with
   the borrowing stated in the file's own metadata block — or add the mapper role, which is a
   product change rather than a sample and should be decided as one.
3. **Settle D10's two lists** — see the section above. The OpenRocket design overlay is named in the
   *done when*, absent from (d), and has been invisible to every status line this milestone has
   written. It is the cheapest of the three remaining items and `e2e/orkFixture.ts` already builds
   an `.ork`.
4. **`BACKLOG.md`'s newest entry**: coast efficiency renders `100%` above `15 ft short of a
   drag-free coast`. Small, real, and it wants its own gate because the fix changes a shipped
   reading's formatting on every flight.

## The corpus

Attached as a second repository and symlinked, which is the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the suite's
own count — **9 committed fixtures and 50 corpus recordings**. A run that cannot say those numbers
did not have a corpus.

## Environment

`npm install` first — `node_modules` arrives empty. Then `npx playwright install chromium`: the image
ships chromium-1194, this Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on
purpose. It succeeds through the proxy in about a minute. Do **not** set `PLAYWRIGHT_CHROMIUM_PATH`
afterwards. Both are standing candidates for the environment's setup script; paying for them every
session is the only reason they are here.

**Four CPUs.** Do not run a heavy fan-out and a gate at the same time and then believe the gate —
re-run any single failure in isolation before reading a line of the diff.

The git identity arrives as the harness vendor's default and must be set per-repo before the first
commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. The harness also appends an
attribution footer to a pull request body after posting; read the body back and strip it. It did
this run, and it was stripped.
