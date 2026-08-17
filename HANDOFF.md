# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **`311341c` (#199) was `main` when this run ended** — this run's own work is in **#201**, open. **Do not count from this line — measure**: `git fetch --prune origin && git log --oneline origin/main \| head -3`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **#201, one commit plus a merge of `main`.** Gate green locally, run ALONE. Merging on green is pre-authorised and is the FIRST thing to do next run if it is still open. |
| **Sev-1** | **None inherited** — the baseline gate was green before anything was touched (unit 1,439 across 93 files with the corpus attached, build clean, e2e 358). **One FOUND and FIXED — see below.** |
| **D — capability** | **No D-track slice shipped.** The Sev-1 preempted it, which is the rule working as written. D10's last capability is still the coarse-GPS flight, and this run bought it a real map instead of a guess — see *Pick this up first*. |
| **P — product & craft** | **P1: the explorer's stats table gained a `scope` concept** distinct from `caveat`, so the warning hue keeps meaning "refused". §9 half-steps **66 → 65**; every other count unchanged, nothing moved the wrong way. |

## The Sev-1 this run found and fixed — and the shape of it is the transferable part

**Four surfaces were computing ½ρv² and only one of them knew where the ascent was.** `analyzeFlight`
restricts max-Q to liftoff → apogee, because q squares the speed and a deployment transient swings the
derived velocity hard negative. That fix landed on the HEADLINE in an earlier run and **nowhere else**.

| fixture | explorer | headline | ratio |
|---|---|---|---|
| `blueraven__reddit-meraki2-121km` | 47,322 kPa | 404 kPa | **×117** |
| `missileworks-rrc3__euroc-stacarl2` | 401 kPa | 60 kPa | ×6.7 |
| `blueraven__trf-f1machbuster-jan18` | 266 kPa | 84 kPa | ×3.2 |
| `eggtimer__euroc-skyward-lynx` | 230 kPa | 103 kPa | ×2.2 |

4 of 37 corpus recordings, none caveated, in a table whose own comment calls these "the numbers a cert
document quotes" — and in the analyzed-data `.csv` a flyer pastes into a cert document. **After: 0 of
37.** The window now lives on `FlightSeries.ascent` and `lib/dynamicPressure.ts` is the only reader.

**The general lesson, which is bigger than this bug:** a fix applied to a HEADLINE is not applied to
the CURVE, the STATS TABLE or the EXPORTS unless somebody carries it there. Search for the arithmetic,
not for the metric name — `grep '0.5 \* .*airDensity'` found all four sites in one command.

## The check that could not fail, and how it was caught

**Dropping the ascent window entirely — the exact bug — left every max-versus-headline assertion
GREEN across all 37 recordings.** The transient that produces 47,322 kPa is NEGATIVE, and the sign
guard alone already refuses it, so the obvious assertion was pinning the sign guard rather than the
window. Only an assertion on the window's own contract reddens on that mutant, and that is what
shipped. **Falsify by mutating the thing you claim to have fixed, not by re-reading the assertion.**

The mirror image: dropping the SIGN guard changes nothing today, because no corpus ascent contains a
negative sample. It is recorded in the module as defensive rather than load-bearing, so nobody later
reads it as protection it is not providing.

## What the pre-push review caught — read this before trusting your own new test

Four real defects in one diff, and one of them would have reddened every public clone:

1. **The new corpus block walked only `__corpus__`, which is gitignored.** On a public clone or fork
   CI it found zero files, asserted over empty arrays, and the floor assertion failed. It now walks
   `__fixtures__` too and clears a real floor of **8 with no corpus, 45 with it**. Paths resolve
   against the FILE (`fileURLToPath(new URL(...))`), not the cwd.
2. **The analyzed-data `.csv` gated its q column on `velUsable` alone**, so a no-ascent record would
   print a confident header over an all-empty column while the explorer offered no channel at all.
3. **`resample` dropped the first finite sample at the leading edge of any gap** — `NaN + (vb − NaN) *
   1` is `NaN`. Pre-existing; exposed the moment a series acquired an interior NaN.
4. **The ascent note was initially put in `caveat`**, which renders amber for "numbers the report
   refused". It fires on every flight, and `explore.test.ts` already states the rule that breaks: *a
   caveat on every flight is a caveat nobody reads*. It is a `scope` now, rendered in zinc.

## An agent finding that was REFUTED, kept so it is not "found" again

The competitive probe reported that a GPS track losing lock at altitude is presented as a landing.
**The data half reproduces — 5 of the 12 corpus recordings carrying lat/lon end with their last fix
above the pad, two above 3,200 ft — and the conclusion is wrong.** `landedInRecord` is already `false`
on every one, and every surface branches on it: the tile reads "Last fix from pad", the GPX waypoint
is named `Last fix (record ends in the air)`, the prose says "not a direction to walk". The guard's own
docstring cites **the same 3,548 ft flight the probe rediscovered**. Full refutation in
`COMPETITION.md` row 47 and `BACKLOG.md`. What IS missing is small and real: the not-landed branch
never says how HIGH the last fix was.

## Pick this up first

1. **Merge #201 if it is still open**, then confirm production moved.
2. **D10's last capability: the coarse-GPS flight — but read the map first.** This run's GPS surface
   audit enumerated **38 distinct sinks** that present, label or withhold a GPS-derived value, and
   found that **exactly one** of them states horizontal fix quality (`GroundTrack.tsx:789`, prose).
   `lib/synthetic.ts` has no lat/lon on `SynthSample` at all and no writer emits a GPS column, so the
   generator needs extending before a sample exists. Consider whether the honest order is
   *surface first, sample second*: a sample demonstrates a capability, and this one is thin.
3. **`COMPETITION.md` row 47's quality half** — the satellite signal-strength bins are already in the
   committed fixture and Featherweight publishes the dB-Hz→accuracy table; `featherweightGps.ts:256`
   names them in a comment and pushes only the total. Settle the 2D-fix inconsistency first
   (`altusmetrum.ts:250` keeps a 2D position, `featherweightGps.ts:72` drops the row).
4. **`BACKLOG.md`'s two new pre-existing entries**: the comparison overlay's q peak runs up to **27.5%
   BELOW** its own printed max-Q (800-point decimation, not the window), and the ascent scope note
   reaches three sinks and not the other four.

## The corpus

Attached as a second repository and symlinked, which is the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the suite's
own counts — **50 corpus recordings**, **37 that analyse end to end** through the new agreement check
(**45 including the committed fixtures**), and **16 GPS recordings** named by
`lib/groundTrackEmpty.test.ts`. A run that cannot say those numbers did not have a corpus.

## Environment

`npm install` first — `node_modules` arrives empty. Then `npx playwright install chromium`: the image
ships chromium-1194, this Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on
purpose. It succeeds through the proxy in about a minute. Do **not** set `PLAYWRIGHT_CHROMIUM_PATH`
afterwards. **Both remain standing candidates for the environment's setup script — this is the fourth
run to pay for them by hand.**

**Four CPUs, and ONE GATE AT A TIME is not advice.** This run started a second gate while an earlier
e2e was still running and a 34 s unit test tripped its own 30 s timeout — which reads exactly like a
regression and was CPU starvation. Check `pgrep -f "playwright test"` before starting a gate. Note
that `pgrep -f` also matches this agent's own command line, so confirm with `ps aux` before concluding
a process is stuck.

**Read the LOG, not the harness's exit status.** A backgrounded compound command reports the exit code
of its last element; the harness announced "completed (exit code 0)" for a run whose unit half had
failed. Write the rc of each stage to its own file and read those.

**`main` moved underneath this run** (155dd0b → 311341c, #199) and another session's branch appeared
mid-run. Fetch before every claim about the remote, and merge `main` before merging a PR.

The git identity arrives as the harness vendor's default and must be set per-repo before the first
commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. **The harness appended an
attribution footer to #201's body on CREATE**; it was read back and stripped. Do that every time.
