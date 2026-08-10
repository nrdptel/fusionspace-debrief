# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **THREE pull requests merged and confirmed LIVE** — `fd18f3a` (#169, five commits: D10 5a + 5b, P1 item 5), `3b62dac` (#171: D10 5c), `2988ba1` (#172: D10 5d). Production was fetched after each and served the shipped SHA. **Nothing is pending on a branch.** Re-measure before believing any of it: `git fetch --prune origin`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Sev-1** | **None inherited.** The baseline gate was green before anything was touched — unit 1334/1334 with the corpus attached, build clean, e2e 317 passed. One Sev-1-shaped defect was *created and caught inside this run*; see below. |
| **D — capability** | **D10 slice 5a SHIPPED.** A flight Debrief made up now says so on every surface a flyer READS. Slice 5b (the documents that leave) is next and its open design question is now settled by a citation rather than a preference. |
| **P — product & craft** | **P1 is the live milestone.** See *Pick this up first* — the design-system audit ran this run and its output is a ranked, reproduced list rather than a hunch. |

## The one thing to read before anything else

**Run the pre-push review, with three lenses, and give it the diff and nothing else. It has now
found real defects in four consecutive diffs that had already passed the full gate — and this run
it found a defect that was strictly worse than the one the slice was fixing.**

The slice added `RecentMeta.synthetic` and a shared `fileFacts()` over the three logbook save sites.
`lib/reopen.ts` rebuilds a hand-mapped flight from its stored text plus its stored mapping, and it
passed headers, rows, mappings and `reported` — never `synthetic`. So:

1. the one route a generated demonstration file can take lost its label on reopen; and
2. **a reopen is a save**, `fileFacts` reads the rebuilt flight, and a save is a replace in place —
   so one click on the logbook row **deleted the stored flag permanently**, after which the made-up
   apogee could take the ★ that says *"Highest of your remembered flights"*.

Nothing in the suite could see it: every other assertion builds its flight directly rather than
through `importRecent`, and the first walk only reloaded the landing page. **The extraction is what
introduced the erasure** — before it, the field did not exist. Fixed, pinned by a unit test that
fails alone when the one-line spread is removed, and the walk now clicks the row.

Eight more findings from the same review were acted on, and three are worth naming because they are
about the CHECKS rather than the code:

- **`labelled` was a state the suite was structurally incapable of falsifying.** The audit table's
  own docblock claimed every `labelled` row's reason "names the check that actually holds it"; two
  of five named none, and nothing could tell. Every such row now carries `check: { file, contains }`
  and the assertion reads the file off disk.
- **The save-site check iterated three literal paths** while its docblock claimed to cover *every*
  route — blind to precisely the fourth save site the refactor exists to prevent. It walks the tree
  now. Falsified by adding a fourth caller: it is named, with no list to update first.
- **The SINKS docblock said "adding an exporter without adding it here fails the count"**, which is
  true only inside `lib/documents.ts` — and this run's own three additions disproved it three lines
  above where it was written.

## Five things this run learned the hard way

1. **A shared helper over N copied literals can DELETE data the copies preserved.** `fileFacts` is
   correct and the extraction was right; what made it dangerous is that a member it owns is
   *recomputed* on a path where the input cannot reproduce it. Before extracting, ask of every
   member: is this derivable on **every** path that calls the helper, including the reopen path?
2. **`git checkout <file>` on an UNCOMMITTED file destroys it.** Used mid-falsification to undo a
   deliberate break, it took the new tests with it. Copy to the scratchpad and copy back; the
   backup files were already there for the other two falsifications and this one skipped them.
3. **The rc file from a previous gate run reads exactly like a phase that has already passed.**
   Three phases reported green before the current run had reached any of them. The gate script
   clears its rc files first now — same class as reading the harness's exit code instead of the log.
4. **`--grep` without `cd` into the repo scans the whole tree.** Costs a full minute and reports
   "No tests found" after erroring on a dozen vitest files. `MAINTAINING.md` already records it;
   it happened anyway.
5. **A competitive probe answered a design question the roadmap had been carrying open for a day.**
   D10 asked for "a column or a decision" on the data CSV. `COMPETITION.md` row 41 measures how the
   instrumentation world marks un-measured data — NMEA per sentence, HL7 per message, DICOM per
   instance — and the shared principle (the claim lives in a field the consumer must already parse)
   settles it. Aim one probe at the thing you are about to decide, not only at the thing you built.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout.** `nrdptel/debrief-fixtures` on disk, symlinked
  into `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the corpus suite runs 16
  regression cases plus the cross-file sweeps, and `lib/canonical.test.ts` round-trips **50 corpus
  recordings**. `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a no-op.
- **`node_modules` was ABSENT.** `npm install` first.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every
  session; it belongs in the environment's setup script.** Said for at least the eleventh run.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before
  the first commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. The GLOBAL config is
  still the vendor default — only the repo-local one is corrected.
- **The clone is SHALLOW** — any history claim is a window.
- **A full gate cycle is ~11 minutes** — unit ~4 min with the corpus, build ~50 s, e2e ~6 min — and
  **the subagent concurrency cap here is 2** (four cores), so a six-agent fan-out runs in three
  waves and takes 25+ minutes. Size fan-outs for two-at-a-time, and do not run one during a gate.
- **The shell's working directory is NOT stable between commands.** Prefix with
  `cd /home/user/fusionspace-debrief &&`. And **the harness's completion status is the trailing
  `echo`'s, not the work's** — write the rc to a file, and delete last run's rc first.

## What shipped, in order

| commit | what | pinned by |
|---|---|---|
| `fd18f3a` | **D10 slice 5a — a made-up flight says so where a flyer reads it**: the report, the readings grid, the logbook row, the logbook's clipboard table and the logbook backup; and it can never wear a personal-best ★ | `lib/synthetic.test.ts` (19), `lib/logbookStar.test.ts` (+4), `lib/logbook.test.ts` (+3), `lib/recents.test.ts`'s two `Required<>` fixtures, 2 walks in `e2e/analyze.spec.ts` |
| `fd18f3a` | **The reopen erasure** — `lib/reopen.ts` dropped the marker, and a reopen is a save | `lib/synthetic.test.ts` → *"survives being REOPENED"*, falsified alone |
| `fd18f3a` | **The audit table stopped being able to lie**: `labelled` rows name a check that is read off disk, the save-site list is discovered rather than typed, `SINKS` 20 → 25 | `lib/synthetic.test.ts`, falsified 3 ways |
| `fd18f3a` | **D10 slice 5b — the two spreadsheet destinations say it on every ROW**: the data CSV and the readings clipboard table each grow a `Provenance` column, and the logbook's table converts onto the same vocabulary | `lib/synthetic.test.ts` ×3, falsified both ways on both exports |
| `fd18f3a` | **P1 item 5 — the logbook's four states take §5's primitives**, and `PRIMITIVE_ADOPTERS` becomes exhaustive against `components/ui.tsx`'s exports | `lib/design-system.test.ts` (26), falsified by exporting a new primitive |
| `fd18f3a` | `COMPETITION.md` rows **40** (demonstration data across the field) and **41** (how the world marks un-measured data) | — |
| `3b62dac` | **D10 slice 5c — the shareable card says it in a BAND drawn on the canvas**, and the `.png` and clipboard image are the same pixels. Walked by reading the pixels back, not the DOM | `e2e/analyze.spec.ts` → *"the shareable card carries it as a band"*, falsified by passing `synthetic={false}` |
| `3b62dac` | `BACKLOG.md` ×7, including a CORRECTION to the design audit's own icon-button count | — |
| `2988ba1` | **D10 slice 5d — the comparison carries which of its flights Debrief made up.** `CompareFlight` had no provenance member at all; a ROW here where the other tables take a COLUMN, because this one is transposed | `lib/compare.test.ts` (+2), falsified by dropping the carry-through |

## Pick this up first

1. **D10 slice 5e — and it is a REFACTOR before it is a label.** Seven sinks are still `todo` in
   `lib/synthetic.test.ts`. The three comparison documents (`compareMarkdown`, `compareHtml`,
   `compareJson` in `lib/report.ts`) each build their own table instead of reading the one builder
   the screen, the `.csv` and the clipboard share — which is exactly why they did not come along
   with slice 5d. Give them one builder and they all gain the row at once; add the row to each of
   them and you have written the same answer a fourth, fifth and sixth time. Then `/stitch`'s
   composite readings and its timeline table (it needs the required `synthetic` prop `MetricGrid`
   and `FlightCard` took), then the explore CSV and the sample-table column copy.
   `lib/synthetic.ts` exports `PROVENANCE_COLUMN` and `provenanceCell` — four surfaces share them
   already.
2. **The `/stitch` composite is an unlabelled screen sink and nobody had noticed.** Added to `SINKS`
   this run by the review, not by the audit: it renders every stage's apogee and max speed by name
   on a top-level route with no report above it, and copies a timeline table. It needs the same
   required `synthetic` prop `MetricGrid` took.
3. **The next P-track slice, reproduced and ready.** `app/page.tsx:21` and
   `components/LogDetails.tsx:29` each hand-roll `Disclosure` with a class string **byte-identical**
   to the primitive's own (`components/ui.tsx:1043`) — `Disclosure` 3 → 5 for two one-line edits.
   Then the seven one-glyph controls hand-rolling `IconButton`, which exists with 2 adopters, and
   the four copies of one text input across `FlightReport` and `CompareView`.
4. **The rest of the design audit**, reproduced before scoping: `SiteHeader`'s active nav item is a
   sixth button weight and a fourth dark surface; `app/page.tsx` and `components/LogDetails.tsx`
   each hand-roll `Disclosure` with a class string byte-identical to the primitive's own; seven
   one-glyph controls hand-roll `IconButton`, which exists with 2 adopters; four copies of one text
   input across two files; `max-w-prose` at three sites that §3 names by name as the trap.

## The done-check, executed — what each step returned

1. **Corpus sweep: the full suite on every gate, 1,349 unit tests over 62 manifest fixtures, and 0
   goldens moved all run.** No calculation changed, so no independent recompute was owed. Said
   plainly: an empty sweep is a result.
2. **Cold walks.** Every slice is driven end to end in the real app: a made-up flight through the
   column mapper (the only route one can take), its logbook row, its reopen, and — the walk added
   last — the actual **download**, because the per-row column being right in `analyzedDataCsv` does
   not prove the save strip calls it with the flight that knows. Production fetched separately and
   reported below.
3. **`COMPETITION.md` rows 40 and 41 added.** Row 41 is the one that paid: it answered a design
   question the roadmap had been carrying open, from outside rocketry.
4. **§9's six shell counts, measured against `origin/main` in a worktree rather than recalled:**
   radius **0→0** · card treatments **3→3** · off-scale spacing **0→0** · off-scale type **1→1** ·
   inverted-type files **10→10** · ui adopters **38→38**. **None moved, in either direction** —
   this run's craft work was per-primitive adoption, which the shell block cannot see. The ratchet
   that can: `Chip` **7→8** · `Notice` **6→8** · `EmptyState` **1→2** · `Disclosure` **3→5** ·
   `Loading` **uncounted→3** · `ChipButton`, `CopyTableButton`, `Sources` **uncounted→counted**.
   Nothing moved down.
5. **`BACKLOG.md` read and appended to — five new entries**, each with the measurement that makes
   it actionable, and each naming what was *not* checked.
6. **Both track questions.**
   - **D:** a flyer who opens a flight Debrief made up can no longer mistake it for a recording —
     it says so on the report, beside the readings, on its logbook row, in the CSV they paste into
     a spreadsheet, in the readings they copy into a cert document, and in the backup they restore
     six months later; and it can never wear a personal best.
   - **P:** the landing surface's list stopped rendering four of §5's five required states by hand,
     the app's two byte-identical copies of `Disclosure` became one primitive, and the ratchet that
     is supposed to make P1 mechanical went from blind to four of its own primitives to exhaustive
     against the file it measures.
7. **`ROADMAP.md` updated** — D10 5a and 5b recorded against the *done when* with what is left
   named in order; P1 item 5 records the slice, the counts, and the one thing measured and
   deliberately not done.
8. **`OWNER-NOTES.md`: zero notes are open without a verdict, and the count is now honest.** Eight
   notes carry verdicts dated 2026-08-08/09; none is new, so none was owed one this run. Two
   (`ON-1`, `ON-4`) had been marked RESOLVED a day ago and left sitting in `## Open` in full, so
   the inbox read as eight open when six are — they are collapsed into `## Resolved` with the
   owner's verbatim words carried across. **Seven items sit under *Awaiting the owner***, one added
   this run.

## Owed to the sibling repo

**One change this run, and it is owed.** §5's `Button variant="link"` entry cited *"Got a backup?
**Restore it**."* as its canonical in-a-sentence example, and that control no longer exists — the
logbook's empty state took `EmptyState`, whose action is a standalone button. The example was
replaced with two that do exist; the rule is unchanged. Parked in `OWNER-NOTES.md`.

Still owed from earlier runs: §5's `Popover` and `SectionNav`, and **§2's tertiary token still fails
AA in dark** (4.12:1 on page, 3.67:1 on raised) at five sites that are not disabled controls. Parked
in `OWNER-NOTES.md` → *Awaiting the owner*.
