# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **Five merges: `26fa023` (D9 + P5), `f9ced22` (D10 s3), `f97c173` (P4 s2 + the compare silent-nothing fix), `780b51b` (D10 s4), `91e7b7f` (P4 s3).** A sixth (P4 s4+s5) was on its way through CI when this was written — check it. Re-measure before believing any of this: `git fetch --prune origin`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Sev-1** | **None found.** The opening fan-out's two claimed Sev-1s were both reproduced by hand and both downgraded — see *The two Sev-1 claims that were not*. |
| **D — capability** | **D9 SHIPPED, all five slices. D10 slices 3 and 4 SHIPPED** — a synthetic flight says so and says it in the file, and every document a flyer keeps is now one registry (`lib/documents.ts`) that the report's save strip renders FROM. D8's tilt slice is MEASURED AND BLOCKED and should stay blocked. |
| **P — product & craft** | **P5 SHIPPED, slices 1–5** (only its repo-METADATA half is left, and it is owner-level). **P4 SHIPPED, slices 1–5** — all three of `ON-6`'s surfaces read down the page, and the milestone's own acceptance sentence is finally walked by a check. |
| **§9 counts, start → end of run** | radius **0→0** · card treatments **3→3** · off-scale spacing **0→0** · off-scale type **1→1** · inverted-type files **10→10** · `Card` adopters **26→28** · `Section` **2→3** · `SectionNav` **2→3** · `Notice` **5→6**. **Every count that moved went UP, and the two that tried to move DOWN were refused rather than re-baselined.** |

## The one thing to read before anything else

**Run the pre-push review. It has now found real defects in three separate diffs that had already
passed the full gate, and this run it found the defect that the slice itself created.**

`MAINTAINING.md` asks for one fresh agent on the `git diff` before every push. Give it three, with
different lenses. On the D9 diff it found seven (see last run's list). On this run's legend diff it
found the thing the change had just made possible: **making the chart legend keyboard-reachable
handed a screen-reader user the ability to hide a trace — and the chart's arrow-key reading still
announced the hidden trace's value.** Only a mouse user could hide a trace before, and a mouse user
does not listen to that announcement. Nobody sitting inside the change would have found it, because
it is not a bug in the code written; it is a bug the code written made reachable.

Two more from the same review are filed rather than fixed, with the reasoning, in `BACKLOG.md`.

## Five things this run learned the hard way

1. **A floor check only reaches controls somebody has already NAMED as controls.** `e2e/touchTargets.ts`
   enumerates roles — `button, [role=button], nav a …`. uPlot's legend rows toggle their traces and
   ship as bare `<th>` with `cursor: pointer`, so they were 30×67 px, keyboard-unreachable, and
   **invisible to every touch sweep this repo has ever run**. The paired falsification is the one
   that proves it: delete the 44 px rule *and* the selector entry and the sweep goes green on a
   broken page. Any third-party widget dropped in here can open the same hole.
2. **`innerText` is not a reliable test for "does this element show text".** Measured: the sample
   table's sort button returns `textContent` of `"Time (s)▼"` and `innerText` of `""`, stably, on a
   visible button with a non-zero box. A first cut of `e2e/hoverOnly.ts` reported four working
   controls as broken because of it. Walk the tree and subtract `display: none`, `visibility: hidden`
   and the `sr-only` clip. Several existing `e2e/` assertions use `innerText` and none was audited.
3. **A milestone's acceptance sentence needs a check, or the milestone closes on a claim.** P4 has
   asked for "zero controls under 44 px **and** zero states reachable only by hover" since it was
   written. Only the first count had ever been asserted. The first run of the second count found
   three live cases — including the same shape D9 shipped and a competitive probe caught.
4. **An exemption list must assert the thing it points at.** The hover-only check tolerates four
   cases, each with a reason naming where the fact appears as text. Two of those reasons name a
   sentence this run added — so the walk asserts those sentences are on the page. Without that, the
   exemption keeps the check green after someone deletes the fix it describes.
5. **The competitive probe's most valuable output was a correction to our own framing, not a gap.**
   `COMPETITION.md` row 39 verdicts the phone reading surface `BETTER` — and then says why that is
   nearly worthless: none of the field needs Debrief to get data off the board, and **Debrief cannot
   do that for any board**. Debrief's phone case is post-recovery. P4's title reads wider than that,
   and `ROADMAP.md` now says so beside it.

## The two Sev-1 claims that were not

Both were reproduced by hand before being ranked, which is the whole point of the rule.

- **"Airframe figures are keyed to the device, not the flight."** True — `debrief.mass.kg` and its two
  siblings are device-global `localStorage`, deliberately. **Not a Sev-1**, because the mass renders
  in a `NumberField` on the same `LandingEnergy` card as the joules it feeds, so the stale input is
  visible beside the output. Filed with that reasoning, because the next run will find it again.
- **"Colour reset has no touch path."** Half wrong: `dblclick` *is* synthesized from a double-tap in
  current mobile browsers. What remains `UNVERIFIED` is whether iOS Safari's double-tap-to-zoom
  swallows it without `touch-action: manipulation`. Needs a real device. **Partly closed this run**
  for a different reason: the *instruction* was hover-only, and both surfaces now say it in text.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout.** `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the corpus suite is **149 tests**.
  `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a no-op.
- **`node_modules` was ABSENT.** `npm install` first.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every
  session; it belongs in the environment's setup script.** Said for at least the tenth run running.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before
  the first commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. The GLOBAL config is
  still the vendor default — only the repo-local one is corrected.
- **The clone is SHALLOW** — any history claim is a window.
- **The harness appended an attribution footer to every pull-request body.** Read back and stripped
  with `update_pull_request`, every time. Still parked in `OWNER-NOTES.md`.
- **A full gate cycle is ~11 minutes** — unit ~2:05, build ~50 s, e2e ~7:24 at `--workers=1` — and
  roughly doubles while subagents are running. Four cores. **Do not run a large fan-out and a gate at
  the same time and then wonder why the suite crawled.**
- **The shell's working directory is NOT stable between commands.** Prefix with
  `cd /home/user/fusionspace-debrief &&`. And **the harness's completion status is the trailing
  `echo`'s, not the work's** — write the rc to a file and read the file. Both in `MAINTAINING.md`.

## What shipped, in order

| commit | what | pinned by |
|---|---|---|
| `26fa023` | **D9 — which simulation flew** (all five slices) + **P5 slice 5 — `/changelog`** | `lib/predictionChoice.test.ts`, `lib/changelog.test.ts`, 5 e2e walks |
| `f9ced22` | **D10 slice 3 — a synthetic flight says so, in the file** | `lib/synthetic.test.ts` (14 cases, falsified 5 ways) |
| `f97c173` | **P4 slice 2 — the comparison reads down the page**, + the compare surface's silent nothing | `e2e/touch.spec.ts`, falsified 2 ways |
| `780b51b` | **D10 slice 4 — one registry for every document a flyer keeps** | `lib/documents.test.ts` |
| `91e7b7f` | **P4 slice 3 — the channel stats read down the page** | `e2e/touch.spec.ts` |
| *(this PR)* | **P4 slices 4 + 5 — the chart legends, and the acceptance sentence walked** | `e2e/touch.spec.ts` ×2, `e2e/hoverOnly.ts`, falsified 11 ways |
| *(this PR)* | `COMPETITION.md` row 39, and P4 scoped to what it can be | — |

## Pick this up first

1. **D10's remaining slices.** Still needing SYNTHESIZED, labelled logs: a deliberately mis-scaled
   column for the mapper, a saturated accelerometer, and a staged flight on two devices — the last of
   which is also why `/stitch` still has no sample. `lib/documents.ts` now exists, so the *done
   when*'s hardest clause has the registry it asked for; what is left is the comparison's own
   registry, which `lib/documents.ts`'s header names and deliberately does not invent.
2. **A P-track milestone: P1, P2 or P3.** P4 and P5 are both done bar P5's owner-level metadata half.
   **P1 (one design system, adopted)** is the largest structural gap and `COMPETITION.md` row 2 is the
   measurement behind it.
3. **The hover-only count on the surfaces it has never been measured on.** `e2e/hoverOnly.ts` runs on
   the analyze report and the comparison only. `/stitch`, `/methods`, `/validation` and the column
   mapper have never been checked, and the mapper is a dense form full of `title`s.
4. **The design-system audit's ~20 divergences.** **Reproduce each before scoping**: one was sent to
   adversarial verification and was refuted on all three of its claims.

## Owed to the sibling repo

`DESIGN.md` is identical in both and **nothing in this run changed it**, so nothing new is owed. Still
owed from earlier runs: §5's `Popover` and `SectionNav`, and **§2's tertiary token still fails AA in
dark** (4.12:1 on page, 3.67:1 on raised) at five sites that are not disabled controls. Parked in
`OWNER-NOTES.md` → *Awaiting the owner*.

## The done-check, executed — what each step returned

1. **Corpus sweep: 149 tests over 62 manifest fixtures, on every gate, 0 goldens moved all run.** No
   independent sweep beyond the suite was needed: this run shipped no calculation change. Said plainly
   rather than dressed up — an empty result is a result.
2. **Cold walks.** Every slice this run is driven end to end in the real app by an e2e at 390×844,
   including one that cuts the network first. Production fetched separately and confirmed serving the
   shipped SHA with `/changelog` at 200.
3. **`COMPETITION.md`: row 39 added and resolved** — the phone reading surface against AltosDroid,
   Featherweight FIP, Eggtimer WiFi, Jolly Logic AltimeterThree, PerfectFlite and a spreadsheet.
   `BETTER`, with a counter-note that undercuts most of the claim and is the useful half of the row.
4. **§9 counts: table at the top. Nothing moved down.**
5. **`BACKLOG.md` read and appended to** — 4 new entries, each with the measurement that makes it
   actionable and each naming what was NOT checked.
6. **Both track questions.**
   - **D:** a flyer whose design holds several simulations can say which one flew; a flight Debrief
     made up says so in the file, everywhere it can go; and every document a flyer keeps is one list,
     so a seventh export gets a button and a check in the same commit or neither.
   - **P:** the range on a phone is done — the comparison, the channel stats and the chart legends all
     read down the page, hiding a trace is no longer a mouse-only capability, and the milestone's
     acceptance sentence is walked by a check instead of asserted by a status line.
7. **`ROADMAP.md` updated** — P4 SHIPPED with every clause named against its check; P4's framing
   scoped by the competitive row; D10 and P5 statuses carried forward.
8. **`OWNER-NOTES.md`: zero notes are open without a verdict.** All eight carry verdicts dated
   2026-08-08 and none is new, so none was owed one this run. **Six items sit under *Awaiting the
   owner*** (counted, not recalled) — unchanged by this run.
