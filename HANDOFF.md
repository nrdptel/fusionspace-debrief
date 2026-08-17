# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## OWNER ACTION NEEDED — CI runs ZERO tests until one secret is re-scoped

**CI's `frontend` job now dies fetching the private corpus: `GitHub API 403 for release v1.1.0`.**
`Test` and `Build` are SKIPPED, so **no unit test and no corpus test runs on CI at all**; the `e2e`
job is unaffected and still passes. `FIXTURES_TOKEN` is still set — a 403 (not a 401) means the
grant no longer covers `nrdptel/debrief-fixtures`, or the token expired. Measured: the same step
succeeded in 2 s twice within the hour, then failed twice 35 minutes apart on a commit that changed
only three markdown files. **Fix: re-issue `FIXTURES_TOKEN` with `Contents: read` on the fixtures
repo.** Full entry under *Awaiting the owner* in `OWNER-NOTES.md`.

**Until then, a session MUST have the fixtures repo attached as a second source**, or it has no
corpus at all and CI will not catch what it misses — link it and read the counts (below).

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **Two merged this run: `4dbb5fb` (#201) and `7a888d8` (#202).** `#201` confirmed LIVE by fetching `version.json`; `#202` merged after its deploy check. **Do not count from this line — measure**: `git fetch --prune origin && git log --oneline origin/main \| head -3`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **Nothing.** Both pull requests merged on green CI. The branch is clean and level with `main`. |
| **Sev-1** | **None inherited** (baseline gate green before anything was touched: unit 1,439 / 93 files with the corpus, build clean, e2e 358). **One FOUND and FIXED and LIVE** — see below. |
| **D — capability** | **No D-track slice shipped, and that is the Sev-1 rule working rather than the milestone stalling.** D10's last capability is still the coarse-GPS flight. The run bought it a real map — see *Pick this up first*. |
| **P — product & craft** | **P1 audit row 5's caveat half SHIPPED.** The explorer stops giving a different answer from the report about one curve. §9: `Notice` adopters 10 → 11, half-steps 66 → 65 (42 → 41 in the shell count), everything else unchanged. |

## The Sev-1 this run found, fixed and shipped — and its shape is the transferable part

**Four surfaces computed ½ρv² and only one of them knew where the ascent was.** `analyzeFlight`
restricts max-Q to liftoff → apogee because q squares the speed and a deployment transient swings the
derived velocity hard negative. That fix landed on the HEADLINE in an earlier run and **nowhere else**.

| fixture | explorer | headline | ratio |
|---|---|---|---|
| `blueraven__reddit-meraki2-121km` | 47,322 kPa | 404 kPa | **×117** |
| `missileworks-rrc3__euroc-stacarl2` | 401 kPa | 60 kPa | ×6.7 |
| `blueraven__trf-f1machbuster-jan18` | 266 kPa | 84 kPa | ×3.2 |
| `eggtimer__euroc-skyward-lynx` | 230 kPa | 103 kPa | ×2.2 |

4 of 37, uncaveated, in a table whose own comment calls these "the numbers a cert document quotes"
and in the `.csv` a flyer pastes into one. **After: 0 of 37.** The window lives on
`FlightSeries.ascent`; `lib/dynamicPressure.ts` is the only reader.

**The lesson, bigger than the bug: a fix applied to a HEADLINE is not applied to the CURVE, the
STATS TABLE or the EXPORTS unless somebody carries it there.** Search for the arithmetic, not the
metric name — `grep '0.5 \* .*airDensity'` found all four sites in one command.

## Three checks that could not fail — found by mutating, not by re-reading

This run tried to ship three assertions that were green against the bug they claimed to catch:

1. **Dropping the ascent window left every max-versus-headline check GREEN**, because the transient
   is NEGATIVE and the sign guard alone already refuses it. The shipped assertion is on the window's
   own contract instead.
2. **The explorer e2e passed on the OLD code** when scoped to the explorer *section* — the section
   already held that sentence in the stats table, which is the defect. It anchors on the card
   holding the canvas now.
3. **The corpus block walked only the gitignored corpus**, so on a public clone it asserted over
   empty arrays and examined nothing. It walks the committed fixtures too now: a real floor of **8
   with no corpus, 45 with it**.

**Mutate the thing you claim to have fixed. Re-reading the assertion finds none of these.**

## An increment BUILT, GATED GREEN and DELIBERATELY REVERTED — read before rebuilding it

**"How high was the last GPS fix" on a record that ends in the air.** The gap is real: **5 of the 12
corpus recordings carrying lat/lon end above the pad, two above 3,200 ft.** The implementation was
complete and the full gate was green. The pre-push review killed it and was right:

- On `intrepid2` — the flight the 3,548 ft figure comes from — **the record ends AT its peak**, so
  the last-fix index IS the apogee index. `apogeeIsFloor` is true there, so the Apogee tile says
  *"at least this high"* while the new tile published the same number bare. One number, two
  surfaces, one qualified: the exact defect the rest of this run was spent fixing.
- Reading `altitude[i]` raw bypasses `altAt`, the adjudicator — and `GroundTrack.tsx:41-47` already
  says the card carries no height **for that reason**.
- `fmtLength` renders negatives verbatim: "−12 ft above the pad".

Full entry, plus the two test traps it exposed, is in `BACKLOG.md`. **A reading that lies is worse
than a reading that is missing**, and at that hour the honest move was to revert rather than
half-fix. Rebuild it with the apogee qualifier travelling with the number.

## Pick this up first

1. **D10's last capability: the coarse-GPS flight — but read the map before scoping it.** This run's
   GPS surface audit enumerated **38 distinct sinks** that present, label or withhold a GPS-derived
   value, and **exactly one** states horizontal fix quality (`GroundTrack.tsx:789`, prose, caption
   size). Two consequences: `lib/synthetic.ts` cannot express such a flight (`SynthSample` is
   `{t, altitude, velocity, accel?}` — no lat/lon, and **no writer emits a GPS column at all**), and
   **a sample demonstrates a capability that is currently thin.** Consider surface first, sample
   second.
2. **`COMPETITION.md` row 47's quality half.** The satellite signal-strength bins are already in the
   committed fixture and Featherweight publishes the dB-Hz→accuracy table;
   `featherweightGps.ts:256` names them in a comment and pushes only the total;
   `altusmetrum.ts:184` drops `pdop`/`hdop`/`vdop` from a CSV it already parses. **Settle the 2D-fix
   inconsistency first** (`altusmetrum.ts:250` keeps a 2D position, `featherweightGps.ts:72` drops
   the row). Honest limit recorded in the row: HDOP buys graded confidence, **not** extra filtering.
3. **The reverted last-fix-height increment**, done properly (above).
4. **`BACKLOG.md`'s new pre-existing entries**: the comparison overlay's q peak runs up to **27.5%
   BELOW** its own printed max-Q (800-point decimation, not the window); the ascent scope note
   reaches three sinks and not the other five; `Figure`'s `text-xs` override against §5's `text-sm`.

## An agent finding that was REFUTED — kept so it is not "found" again

The competitive probe reported that a GPS track losing lock at altitude is presented as a landing.
**The data half reproduces; the conclusion is wrong.** `landedInRecord` is already `false` on every
one, and every surface branches on it: the tile reads "Last fix from pad", the GPX waypoint is named
`Last fix (record ends in the air)`, the prose says "not a direction to walk". The guard's own
docstring cites the same 3,548 ft flight the probe rediscovered. Full refutation in
`COMPETITION.md` row 47.

## The corpus

Attached as a second repository and symlinked, the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the suite's
own counts — **50 corpus recordings**, **37 analysing end to end** through the max-Q agreement check
(**45 including the committed fixtures**), **16 GPS recordings** in `lib/groundTrackEmpty.test.ts`.
A run that cannot say those numbers did not have a corpus.

## Environment — three things that cost this run real time

**`npm install` first** (`node_modules` arrives empty), then **`npx playwright install chromium`**
(the image ships 1194, this Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on
purpose). Do **not** set `PLAYWRIGHT_CHROMIUM_PATH` afterwards. **Both remain standing candidates for
the environment's setup script — this is the fourth run to pay for them by hand.**

**FOUR CPUs, and ONE GATE AT A TIME is not advice.** This run started a second gate over a still-
running e2e **twice**, and both times a 34 s unit test tripped its own 30 s timeout
(`lib/groundTrackEmpty.test.ts`), which reads exactly like a regression and is CPU starvation. Run
alone and it is green. Check `ps -eo args | grep "[p]laywright test"` before starting a gate —
**`pgrep -f` also matches this agent's own command line**, so it reports "still running" when nothing
is; confirm with `ps aux` before concluding a process is stuck.

**Read the LOG, not the harness's exit status.** A backgrounded compound command reports the exit
code of its last element; the harness announced "completed (exit code 0)" for runs whose unit half
had failed. Write each stage's rc to its own file and read those.

**`main` moves underneath you.** It went 155dd0b → 311341c (#199) → 776f77c (#200) mid-run, and
another session's branch appeared. Fetch before every claim about the remote; merge `main` before
merging a PR.

The git identity arrives as the harness vendor's default and must be set per-repo before the first
commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. **The harness appended an
attribution footer to BOTH pull-request bodies on create**; both were read back and stripped. It also
writes the pinned branch name into a `git merge` commit subject, which the zero-trace invariant
forbids — that message was rewritten before pushing. Do all three every time.
