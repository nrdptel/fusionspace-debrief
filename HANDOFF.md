# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **Four pull requests merged, all green on CI's own two jobs including the corpus half.** `099104c` (#191, the previous session's done-check, open and green when this run started) · `a6fac4a` (#192, two Sev-1s) · `55f021f` (#193, P1's `TextField` + the half-step ratchet + the sample offers) · `966524d` (#194, the flight timeline's empty state). Production was verified by fetching `version.json`, not assumed. **Do not count from this line — measure**: `git fetch --prune origin && git log --oneline origin/main \| head -5`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **Nothing.** The branch was clean and level with `main` at the end of the run. Measure it: `git rev-list --count origin/main..HEAD`. |
| **Sev-1** | **None inherited, two FOUND and both fixed and live.** The baseline gate was green before anything was touched: unit 1,413 across 91 files with the corpus attached, build clean, e2e 353. |
| **D — capability** | **D10's front door was advertising a different flight's apogee.** Fixed, with the check that makes it impossible again. The `.ork` design-overlay sample is scoped in detail below and is the next slice. |
| **P — product & craft** | **P1: `TextField` built from a census of seven, two files adopted; §9's spacing check, which had been reporting a clean 0 over 91 half-step utilities, can now see them; a named tell closed (the explorer's Save was always enabled and failed silently); and the flight timeline stopped deleting its own section.** §9's counts at the end of the run: radius drift **0**, off-scale spacing **0**, half-step **42** (the shell figure; 66 in the test — see §9 for why both are right), off-scale type **1** (the wordmark), card treatments **3**, inverted files **10 of 51**, `./ui` importers **39 of 51**. Nothing moved the wrong way. |

## The two Sev-1s, both found by the opening sweep and both confirmed 2/2 by refuters

1. **A railed accelerometer's boost AVERAGE was published bare** while the peak beside it said
   "may be clipped". Not a corner case: `public/samples/sample-altusmetrum.csv` — a real TeleMetrum
   log, and the file behind *"Try a sample flight"* — rails, with **75 of 79 boost samples (95%)
   inside the detector's band** at an 18.874 g peak, and an average of 18.713 g reported with
   nothing said. Clipping only removes readings from the top, so the average is a floor with a
   known error direction; it says so now on the grid, in the `.txt`/`.md`/`.html` and clipboard, on
   the report's acceleration chart and its screen-reader label, and in the explorer's statistics.
   **0 of the 50 corpus recordings set `accelClipped`**, so no corpus flight moved.
2. **`/stitch`'s prune notice was mounted on the branch a FAILED sample press lands on.** A
   successful press saves two recordings, prunes the logbook, and reached `ready` — where the
   banner did not exist. Pressing one button deleted flights and said nothing on the screen it left
   you on. Verbatim the earlier Sev-1 recurring on the route that had been retrofitted for it.

## The finding that should change how the next session reads its own agents

**Three of the four things the pre-push reviews caught were mine, not the code's** — and the worst
was an honesty error inside an honesty fix. The saturation caveat's justification was grounded on
`sample-saturated.csv`, **a file Debrief made up**, whose own first line says no figure from it
means anything about a real rocket. The real railed recording was in the repo the whole time. The
arithmetic beside it quoted a net-of-gravity figure under a specific-force name; the wording
disowned a peak the app publishes on five surfaces; and the caveat asserted a rail as settled fact
next to a tile that says *may*.

**Take the second opinion on every diff, and read it as a claim rather than a verdict.** One
reviewer's severity tempering was itself wrong — it argued no real file rails, and the app's own
front-door sample does.

## A check that could not fail, caught by falsifying it three times

`lib/samples.test.ts` now holds every sample offer's stated figures against what the app reads off
that offer's own files. Getting it to actually fail took three attempts, and the sequence is worth
copying:

1. **Digits-only substring.** A flight log is tens of thousands of numbers, so `9322` appears
   inside that soup by coincidence. The mutant restoring the exact defect **passed**.
2. **Whole numeric tokens.** Better, and still not enough — `9322` and `1009` are both real values
   somewhere in those logs. Both mutants **passed again**.
3. **Semantic, and it works.** An offer may quote an INSTRUMENT's own stated figures and may not
   quote a number it found in a data log. A summary file *refuses to open as a flight*, and that
   refusal is the discriminator.

**Two mutants, each reddening with its own figure named, is the only reason this is a check.**

## What shipped, in order

- **`8771c47` → merged in `a6fac4a` (#192)** — the railed-accelerometer caveat pair, on every
  surface that presents either reading.
- **`4a53957` → merged in `a6fac4a` (#192)** — `/stitch` names the flights it deleted.
- **`72555b1` — P1: `TextField`, and the spacing check that could not see half-steps.** Seven
  hand-rolled text inputs across four files in four geometries, two focus treatments and two
  placeholder tokens, with nothing to reach for. Two files adopt it; the other three each need a
  decision and are named in the ratchet rather than folded in. The real defect the four carried:
  `dark:placeholder:text-zinc-500`, the value §2 retired at 3.67:1 on dark `raised` — invisible to
  §9's census (it refuses variant-prefixed classes) and to axe (which rates a placeholder only on
  an empty field it walks).
- **The sample offers, held against their own files** — see below.
- **`4b5131e` → merged in `55f021f` (#193) — the explorer's Save refuses an empty view name before
  it is pressed.** *"A control that is always enabled and fails only when pressed"* is a named tell
  and this was one: `commitPreset` opens with `if (!name) return`, so Save on an empty or
  whitespace name did nothing and said nothing. Enter took the same silent path.
- **`966524d` (#194) — the flight timeline says why it has nothing to lay out.** It returned `null`
  and took its own heading with it. **Measured before it was touched, which is what separates it
  from the `ChannelExplorer` row that was refuted**: over every real recording the repo can reach
  (52 that analyse end to end), **3 render no timeline** — two Eggtimer logs and a Blue Raven
  sustainer, one of them the early-deploy anomaly file. All three resolve a `coast` and nothing
  else. The condition is pinned in `lib/phases.test.ts`; the component's branch has no walk,
  because all three files are private-corpus, and that is said rather than implied.

## §9's spacing check had been reporting a clean 0 over 91 half-steps

`-([0-9]+)` cannot match `2.5`, because a dot is not a digit. **The obvious repair does not work
either**: written `(?:…|2)\b`, the exemption list matches the `2` of `px-2.5` and lets it through as
though it were `px-2`, because a dot is a word boundary too. Two drafts reported 0 for exactly that
reason; the lookahead has to clear the whole numeric token.

Measured: **91 half-step utilities, 45 of them `-1.5`** (which §4's own table sanctions), and **46
`-0.5` or `-2.5`, which appear nowhere in §4**. Pinned as a SEPARATE ratchet at 66 raw occurrences
rather than by raising `offScaleSpacing` — that one is documented as a guard that may never rise,
and taking it from 0 to 66 in the commit that widened its pattern would be indistinguishable from
weakening the gate.

**§4 contradicts itself here** — *"The scale is 1 2 3 4 6 8 12. Nothing else"* two lines above a
table whose entry is `px-3 py-1.5` — and §4 is digest-shared with the sibling repo, which is not
attached. Parked in `OWNER-NOTES.md` under *Awaiting the owner*.

## The front door was advertising a different flight's apogee

Measured against the served file rather than against memory:

- **`one-flight` said "Apogee ≈ 9,322 ft"; the report reads 8,022 ft.** Not a rounding gap — 9,322 ft
  belongs to `lib/parsers/__fixtures__/altusmetrum-telemetrum.csv` (serial 2098, flight 12), where
  that directory's README attributes it correctly. The served sample is serial 2718, flight 14.
- **The same offer promised "the recovery track"**, and the file has 20 columns and **no latitude or
  longitude at all**. Every GPS walk uses a fixture, which is why nothing caught it.
- **`two-altimeters` said the pair "agree at ≈ 1,009 ft"**, and Debrief reads **1,025 ft and
  1,029 ft** — so the single number stated was neither recording's, and the 0.4% spread quoted
  everywhere else in the repo cannot be derived from it.

`device-summary` was checked and is **correct**: it quotes the board's own summary file verbatim,
which is a different act from asserting a reading, and the check knows the difference.

## Pick this up first

1. **D10's `.ork` design-overlay sample** — scoped in detail by this run's fan-out, and the *done
   when*'s last uncovered capability besides the coarse-GPS log. What was established:
   - It pairs with **`one-flight` / `sample-altusmetrum.csv`**; both mapping samples land in the
     column mapper (so `results.length === 0` and the design reports as unpaired) and the staged
     pair is not droppable. One parsed flight + one design pairs by the one-of-each fallback.
   - The design must be a **real ZIP** whose member is exactly `rocket.ork`; **exactly one
     `<simulation>`** (two or more produces D9's picker, a different capability); all ten
     `<flightdata>` attributes present or the run is dropped whole; and **`maxvelocity`/`maxmach`
     must imply a speed of sound in 280–380 m/s** or every run is silently dropped.
   - `e2e/orkFixture.ts` already builds one but is **e2e-only** — `tsconfig.json` excludes `e2e/`
     and it returns a Node `Buffer`. ~40 lines to port to `lib/` with `Uint8Array`.
   - Two chores that will fail the suite if missed: `expectGenerated` reads utf8 and compares
     strings, so a binary `.ork` needs a bytes variant; and `public/sw.js`'s precache list is
     asserted EQUAL to the registry.
   - The honesty question to settle first: a made-up prediction is not a made-up flight, and
     `lib/synthetic.ts`'s marker rides on a FLIGHT. `ReportedValue.source` is the only provenance
     axis a predicted figure has.
2. **P1's remaining audit rows**, all confirmed against current line numbers by this run's audit:
   `ChannelExplorer:519` (row 5, chart is a bare `Card` not a `Figure`), `:463` (**a named tell —
   the Save-view button is always enabled and `commitPreset` returns silently on an empty name**),
   `SampleTable:262/:270/:275` (row 7), `ChannelExplorer:424` (row 8), `:345`+6 (row 9),
   `FlightReport:1255` (row 11). Plus two NEW ones worth more than most of the list: **no `Select`
   primitive** (six hand-rolled across four treatments) and **`FlightTimeline` returns `null`**
   where an `EmptyState` belongs, deleting a whole section heading and all.
3. **The three `TextField` sites not yet converted** — the search field, the `text-xs` note editor
   (its own §3 correction), and the explorer's inline view name.

## The corpus

Attached as a second repository and symlinked, which is the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the suite's
own count — **9 committed fixtures and 50 corpus recordings**. A run that cannot say those numbers
did not have a corpus.

## Environment

`npm install` first — `node_modules` arrives empty. Then `npx playwright install chromium`: the image
ships chromium-1194, this Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on
purpose. It succeeds through the proxy in about a minute. Do **not** set `PLAYWRIGHT_CHROMIUM_PATH`
afterwards. Both are standing candidates for the environment's setup script.

**Four CPUs, and ONE GATE AT A TIME — this run proved it again from the other side.** The opening
fan-out ran 2 agents at a time and took ~35 minutes for 11 agents. Later, a gate started while the
previous one was still running **exited 1 with all 1,423 tests passing**, on three
`[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled errors. Re-run alone: `rc=0`, no worker
errors. Read the counts, not the exit code — and check what else is in flight before reading a line
of the diff.

The git identity arrives as the harness vendor's default and must be set per-repo before the first
commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. The harness also appends an
attribution footer to a pull-request body after posting; read the body back and strip it. It did
this run, and it was stripped.
