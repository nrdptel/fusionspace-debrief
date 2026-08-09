# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **Three merges: `26fa023` (D9 + P5) and `f9ced22` (D10 slice 3).** Production was confirmed serving `26fa023` and `/changelog` live at 200. Re-measure before believing any of this: `git fetch --prune origin`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **PR #164** (P4 slice 2). Gated green locally in full. Everything else this run is merged and live. |
| **Sev-1** | **None found.** The opening fan-out's two claimed Sev-1s were both reproduced by hand and both downgraded — see *The two Sev-1 claims that were not*. |
| **D — capability** | **D9 SHIPPED, all five slices. D10 slice 3 SHIPPED** — a synthetic flight says so, and says it in the file. D10's remaining slices are now decomposed in `ROADMAP.md` from a real audit rather than guessed. D8's tilt slice is MEASURED AND BLOCKED and should stay blocked. |
| **P — product & craft** | **P5 SHIPPED, slices 1–5** (only its repo-METADATA half is left, and it is owner-level). **P4 slice 2 SHIPPED** — the comparison reads down the page on a phone. P4's other two named surfaces are untouched. |
| **§9 counts, start → end of run** | radius **0→0** · card treatments **3→3** · off-scale spacing **0→0** · off-scale type **1→1** · inverted-type files **10→10** · `Card` adopters **26→28** · `Section` **2→3** · `SectionNav` **2→3** · `Notice` **5→6**. **Every count that moved went UP, and the two that tried to move DOWN were refused rather than re-baselined** — see the ratchet note below. |

## The one thing to read before anything else

**The pre-push review found seven real defects in a diff that had already passed the full gate, and it is the reason this run shipped something honest rather than something green.**

`MAINTAINING.md` asks for one fresh agent on the `git diff` before every push. This run gave three, with different lenses — React correctness, the safety spine, and can-a-flyer-actually-use-it. Every one of the seven had shipped past 1,299 unit tests, a clean build and 309 e2e:

1. A saved record that already named its simulation got the refusal stapled on beside it, and the picker opened showing *Don't compare one* over a populated Predicted column — reachable by doing exactly what Debrief's own note tells a flyer to do.
2. Two designs claiming one flight were offered a picker that would delete one of them.
3. Both notes said "below" about a control that renders above them, and about nothing at all in an export.
4. The picker printed onto the cert document.
5. Every chip press reset all three charts' zoom, including presses that changed nothing.
6. The chip promised an altitude curve for designs whose curve Debrief cannot draw — it keyed on `hasSeries` (a `databranch` exists) rather than on a trace that could be read out of it.
7. The design's freshness word was missing in the one case where **Debrief** rather than the flyer does the picking.

Three of those (1, 2, 6) are wrong-claim defects, not polish. **Budget for this: it cost about ninety minutes and two extra gate cycles, and it was the highest-value ninety minutes of the run.**

## Five more things this run learned the hard way

1. **The shell's working directory is NOT stable between commands in this harness.** A backgrounded `npm run build` ran from the parent of the checkout and reported `ENOENT … /home/user/package.json`; later a bare `npx playwright test --grep` ran from the same place, found no config, scanned the whole tree and reported "No tests found" after erroring on a dozen **vitest** files. Neither output says "wrong directory". Now in `MAINTAINING.md`. **Prefix every command with `cd /home/user/fusionspace-debrief &&`.**
2. **The harness's completion status is the trailing `echo`'s, not the work's.** `cmd > log 2>&1; echo "rc=$?"` backgrounded is announced as "exit code 0" because the echo succeeded. A build that never ran read as green for twenty minutes, and the e2e after it failed on an empty `out/` — which reads exactly like a catastrophic regression. **Write the rc to a file and read the file.** Same shape as the `tail`-swallows-a-red-suite note already in the manual.
3. **A single e2e failure in a full run is not a red gate until you have tried to reproduce it.** `compare-page.spec.ts:104` failed once at 310/311. It passed alone, passed across all 45 compare-suite tests, and passed in a full 311/311 re-run. Recorded as a flake **after** three attempts to reproduce it, not instead of them.
4. **A grep-based ratchet cannot tell code from prose ABOUT code.** `DESIGN.md` §9's card check scans the source for a treatment's class string, so a COMMENT quoting that string counts as the treatment. It refused P4 slice 2 twice: once correctly, for a hand-rolled fourth card, and once for the comment explaining that refusal. Describe the shape; never quote the class.
5. **The competitive probe found a defect in the surface the run was building, not in a competitor.** Aiming it at *the thing you are about to ship* rather than at the field in general is what made it pay: OpenRocket shows a status per simulation row, which is how the hover-only freshness word here was noticed at all.

## The two Sev-1 claims that were not

Both were reproduced by hand before being ranked, which is the whole point of the rule.

- **"Airframe figures are keyed to the device, not the flight."** True — `debrief.mass.kg` and its two siblings are device-global `localStorage`, deliberately. **Not a Sev-1**, because the mass renders in a `NumberField` on the same `LandingEnergy` card as the joules it feeds, so the stale input is visible beside the output. Filed with that reasoning, because the next run will find it again.
- **"Colour reset has no touch path."** Half wrong: `dblclick` *is* synthesized from a double-tap in current mobile browsers, and the repo's own help line says "double-click or double-tap". What remains unverified — and is marked `UNVERIFIED` in the ledger rather than guessed — is whether iOS Safari's double-tap-to-zoom swallows it without `touch-action: manipulation`. Needs a real device.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout.** `nrdptel/debrief-fixtures` on disk, symlinked into `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the corpus suite is **149 tests**. `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a no-op — the attached checkout is the whole reason there is a corpus.
- **`node_modules` was ABSENT.** `npm install` first.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every session; it belongs in the environment's setup script.** Said for at least the tenth run running.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before the first commit. Note the GLOBAL config is still the vendor default — only the repo-local one is corrected, which is enough but is worth knowing.
- **The clone is SHALLOW** — 70 commits, 2026-08-03 to 2026-08-09. Any history claim is a window.
- **The harness appended an attribution footer to the pull-request body.** Read back and stripped with `update_pull_request`. Still parked in `OWNER-NOTES.md`.
- **A full gate cycle is ~12 minutes** — unit ~2:05, build ~50 s, e2e ~8:00 at `--workers=1` — and roughly doubles while subagents are running. Four cores. **Do not run a large fan-out and a gate at the same time and then wonder why the suite crawled.**

## What shipped, in order

| commit | what | pinned by |
|---|---|---|
| `357e342` | **D9 slice 3b — a flyer can say which simulation flew** | `lib/predictionChoice.test.ts` + 2 e2e walks, falsified 5 ways |
| `766be0f` | D9 marked SHIPPED; the design's freshness word made visible | `COMPETITION.md` row 38 |
| `ffbfc1e` | **Four ways the picker could contradict the panel beside it** | 3 cases + 2 e2e, falsified 4 ways |
| `321e90b` | **Three more from the third review lens** — a promised curve, a missing word, a doubled paragraph | 3 cases, falsified 3 ways |
| `8578a4e` | Four ledger entries with the measurement that makes each actionable | — |
| `413b8b6` | Two environment traps recorded in `MAINTAINING.md` | — |
| `da70440` | **D10 slice 3 — a synthetic flight says so, and says it in the file** | `lib/synthetic.test.ts` (14 cases, falsified 5 ways) |
| `aff686b`+`38baa07`+`e4dadfb` | **P4 slice 2 — the comparison reads down the page on a phone**, plus the two corrections its own checks forced | `e2e/touch.spec.ts`, falsified 2 ways |
| *(P5)* | **P5 slice 5 — `/changelog`, and “Readings that changed” as its spine** | `lib/changelog.test.ts` (8 cases, falsified 6 ways) + an e2e |
| *(P5)* | `a.out` removed — a 416-byte stripped ELF committed to a public repo root since `94fa36c` | `.gitignore` now covers it |

## Pick this up first

1. **D10's remaining slices.** The committed fixtures cover a single flight, two boards on one flight, and a log beside its board's summary. Still needing SYNTHESIZED, labelled logs: a deliberately mis-scaled column for the mapper, a saturated accelerometer, and a staged flight on two devices — the last of which is also why `/stitch` still has no sample. The *done when*'s hardest clause is unchanged: **labelled synthetic on every surface that can carry it out of the app**, pinned by an asymmetry check rather than a per-surface list.
2. **A multi-simulation design dropped into a COMPARISON says nothing at all.** Filed this run with the repro. It contributes no figures so it is never in `paired`; it finds a target so it is never in `skipped`; `predictionOffers` is read only by the analyze page; and its refusal lands on `flight.notes`, which `CompareView` does not render. That is the *"silent nothing … which is false and is the worse failure"* `predictionFigures` names in its own header. The fix is a `predictionUnshown` list out of `ingestFiles`, rendered by both surfaces from one builder, the way `predictionNote` already is.
3. **P-track: P1, P2, P3 or P4.** P4 (*The range on a phone*) is `NOT STARTED` and sharpened by `ON-6` to name three surfaces to answer *"laid out vertically, not merely narrowed"* against: the comparison table, the channel explorer, and the chart legends. This run's phone lens filed several supporting measurements in `BACKLOG.md`.
4. **The design-system audit's output**, which had never been run before this session and now has been. It returned ~20 divergences — hand-rolled `Disclosure` in two files with `Disclosure`'s own class string byte-for-byte, `SampleTable` reaching past `DataTable` and `IconButton`, `NumberField` bypassed in `CropControl`. **Reproduce each before scoping**: one was sent to adversarial verification this run and was refuted on all three of its claims.

## Owed to the sibling repo

`DESIGN.md` is identical in both and **nothing in this run changed it**, so nothing new is owed. Still owed from earlier runs: §5's `Popover` and `SectionNav`, and **§2's tertiary token still fails AA in dark** (4.12:1 on page, 3.67:1 on raised) at five sites that are not disabled controls. Parked in `OWNER-NOTES.md` → *Awaiting the owner*.

## The done-check, executed — what each step returned

1. **Corpus sweep: 149 tests over 62 manifest fixtures, on every gate, 0 goldens moved all run.** No independent sweep beyond the suite was needed: this run shipped no calculation change. Said plainly rather than dressed up — an empty result is a result.
2. **Cold walks.** Five e2e walks drive the picker end to end in the real app, including one that wipes the logbook between saving a record and dropping it back. Production fetched separately and confirmed serving `8714271`.
3. **`COMPETITION.md`: row 38 added and resolved, row 14 resolved.** Row 38 is how the field handles "which simulation, and is it current" — verified from OpenRocket's own source and issue tracker, with one claim marked `UNVERIFIED`. Row 14 closes P5's whole subject.
4. **§9 counts: table at the top. Four moved and all four went UP.**
5. **`BACKLOG.md` read and appended to** — 4 new entries, each with the measurement that makes it actionable, and each recording what was checked rather than assumed.
6. **Both track questions.**
   - **D:** a flyer whose design holds several simulations can say which one flew and see it compared beside their flight — where before they had to go back to OpenRocket and re-export a design with one simulation in it.
   - **P:** the tool can now tell a flyer what changed between builds, and specifically **which builds moved a number** — the question a saved cert report could pose and nothing could answer. Plus `Card`/`Section`/`SectionNav`/`Notice` adoption up, and a stray binary off the public repo root.
7. **`ROADMAP.md` updated** — D9 SHIPPED with every clause named against its check, P5 slices 1–5 SHIPPED with the owner-level remainder named.
8. **`OWNER-NOTES.md`: zero notes are open without a verdict.** All eight carry verdicts dated 2026-08-08 and none is new, so none was owed one this run. **Six items sit under *Awaiting the owner*** (counted, not recalled) — unchanged by this run.
