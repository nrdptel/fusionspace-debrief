# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — one increment shipped, one withdrawn in review, and the ground truth the rank-1 item was waiting for

The session's branch started level with `origin/main` at `7962589`.

| What | How it was verified |
|---|---|
| Show the descent rate on the timeline chip for a flight with no detected deployment change | `lib/phases.ts` keys that phase `descent` and its rate lives in `wholeDescentRate`; `FlightTimeline` read `mainDescentRate`, which is **null in exactly that case**. So the one chip that prints a duration and a rate side by side showed the duration alone — on the majority of corpus descents (the methods page counts **18 of 25** with no detected main). Now reads `wholeDescentRate` for that key and leaves `main`/`drogue` untouched. |

**A second change was written, gated green, and then withdrawn** — read this before redoing it. It
made `compareReported` fall back to `wholeDescentRate` so a device's stated "descent velocity" would
cross-check instead of printing *not computed* (it had never once fired: all three AltimeterCloud
flights that state one showed nothing). It works, and it is how the ground-truth numbers below were
obtained. **Why it was withdrawn:** the trigger is `mainDescentRate == null`, which means "no main
deployment **detected**", NOT "single deploy". On a dual-deploy flight whose main Debrief missed —
18 of 25 corpus descents — it would compare the device's real *main-leg* figure against a
drogue+main mixed average, and `WIDE_TOLERANCE`'s 20% band would print **"consistent"**, actively
vouching for two figures that measured different things. That is the 121.6% incident the methods
page already documents, re-opened one layer up. `lib/analyze/types.ts:88-95` says the two fields
"must never share a field" for this reason. Do it properly by establishing single-deploy from the
file (the device's own deploy channel or its stated main-deploy altitude), not from Debrief's
detection failing. The other gaps found in review, worth fixing alongside: the JSON
`loggerSummary` (`lib/report.ts:1084`) is the one caller that would not carry the marker, so the
export would key an apogee-to-landing average as `mainDescentRate` while the same document
publishes `mainDescentRate: null`; and no test anywhere covers the descent row of the four export
surfaces.

## The rank-1 item: descent rate — ground truth found, and a second hypothesis disproved

**Ground truth now exists — and it says Debrief is accurate, which is the opposite of what the
first read of it suggested.** Each Mercury/AltimeterCloud file states an apogee, an apogee time, a
landing height and a landing time, so its stated `Descent velocity` can be checked against its own
header. It does not survive that check: `1786` chord **6.437** vs stated **5.707 (−11.3%)**, `1796`
chord **6.446** vs stated **5.625 (−12.7%)**, `1888` chord **5.373** vs stated **6.208 (+15.5%)**.
Debrief reads **6.49 / 6.49 / 5.17** — **+0.8% / +0.7% / −3.8% against the raw chord**. So on these
flights Debrief is accurate to under a percent and the *device summary* is the outlier. An earlier
note in this run had this backwards; BACKLOG carries the correction. **Hierarchy consequence:** a
device's stated summary is not unconditionally stronger than the file's own data for a descent rate.

**The strongest anchor in the corpus:** group `ac-lilnuke-4altimeter` is **four altimeters on one
flight** agreeing on the apogee→landing chord to **0.12%** (6.441–6.449 m/s). `expected.json`
asserts **no descent rate on any fixture** today. Pin that one first.

**And the finding that probably matters most: a drogue leg does not start at apogee.** On
`blueraven__trf-f1machbuster-jan18` the drogue fires **12.4 s after apogee** and the rocket
free-falls at ~156 ft/s until it does. Apogee→main is **77.6 ft/s**; deployment→main is **59.4**,
against the device's stated **−55.9**. Blue Raven times the leg from deployment, Debrief from
apogee — a **31%** definitional gap that has nothing to do with smoothing. RRC3 writes inline
`Drogue`/`Main` event rows and PerfectFlite states `Drogue At`/`Main At` in its header, so the
boundary is readable on real files. **Settle the definition, document it, and pin it before
touching the window.**

**Hypothesis 2 tested and disproved** (hypothesis 1, sample weighting, died last run).
`lib/analyze/index.ts:1310` sizes the 0.6 s descent smoother with `windowFor(dt, 0.6)` off the
**global** median dt, while lines 1319–1320 compute `descentDt` for exactly that reason. **13 of 35**
analysable fixtures carry an inflated window as a result — up to **12x**, 7.0 s of real time on
`fwgps__trf-lemiv-l3`. Sizing it from `descentDt` makes the chord divergence **worse: 9 legs → 10**,
and it moves the leg boundaries (TeleMetrum drogue 107.0 s → 151.0 s), because `mainIdx` is picked
off that same smoothed series. **Reverted rather than shipped.** The window bug is real and worth
fixing on its own terms; it is not what causes the chord gap.

**What the decomposition does point at.** Per leg, chord vs sample-mean vs time-weighted mean: on
SG1.1 the sampling is even (max gap 0.10 s, 1–2% of the leg) and the sample mean (12.26, 8.48)
matches the chord (12.72, 8.52) — yet the *reported* figures are 13.51 and 9.46, above both. So it
is neither weighting nor gaps: `descent` is a **centred** moving average, so samples within ±half a
window of a leg boundary already blend the leg either side. The two shortest main legs are the two
worst main-leg errors — lemiv-l3 is **1.7 s against a 0.6 s window** (+10.8%), SG1.1 is 18.2 s
(+11.0%). Next pass: drop a half-window at each end of a leg before averaging, or read a leg shorter
than ~2x the window as its chord slope, and judge the result against the three device figures above.

## Environment notes

- **Git identity defaults to the harness's, not the project's.** It came up wrong again this run and
  had to be set before the first commit. Check `git config user.name` / `user.email` every time.
- **`npm run fetch-fixtures` returns 401 here.** The companion repo is at `/home/user/debrief-fixtures`:
  `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm `corpus.test.ts` reports
  **102 tests** — one that skips itself prints much like one that passed.
- **The image's Chromium is the wrong build and fails silently.** `/opt/pw-browsers/chromium` is
  1194; Playwright 1.61.1 wants 1228. Run `npx playwright install chromium` (~2 min); do not set
  `PLAYWRIGHT_CHROMIUM_PATH`. `playwright.config.ts` throws on a mismatch — trust that error.
- **`pkill -f "npx serve"` kills its own shell**, because the pattern matches the command line
  running it. The gate exits 144 with no output and looks like a crash. Use `pgrep -af serve` and
  kill by pid, or just don't — Playwright's `reuseExistingServer` handles it.
- **A piped gate hides its exit code** — echo `${PIPESTATUS[0]}`, not `$?`.
- **A `*-tmp.test.ts` probe is picked up by vitest** and inflates the gate's own numbers (55 files /
  652 tests with four probes present, 51 / 648 without). Delete probes *before* the gate run you
  intend to quote.
- **Nothing identifies which commit production is serving.** No `/version.json`, no build SHA in the
  HTML or `sw.js`. The done-check asks for the gap between the SHA you shipped and what is live, and
  it currently cannot be answered except by matching a content-hashed chunk name out of the served
  HTML against a local build. A tiny build-stamped marker would fix this permanently.
- **CI does not run on a working branch.** `.github/workflows/test.yml` fires on push to `main` and
  on `pull_request` only, so the PR is what makes CI run at all. `deploy-cloudflare.yml` fires on
  push to `main`. **Do not merge before CI reports.**
- **The runners in this environment stall** — budget for 30+ minute `in_progress` runs and open the
  PR early. Parse `list_workflow_runs` as JSON; a regex over the raw blob straddles records.
- **The box has 4 cores**, so a parallel fan-out runs about two agents at a time. Six agents took
  longer than the 30-minute harvest window; dispatch three or four, not six.
- **The clone is shallow**, so any commit count or file history is a window, not the record.

## Pick up first, and why

1. **Settle where a drogue leg starts** (apogee vs drogue deployment — a 31% gap on a real file),
   document it on the methods page, and pin the four-altimeter chord (0.12% spread) as the first
   descent golden value the corpus has ever had.
2. **A build-stamped version marker** (see above). Cheap, and every future done-check depends on it.
3. **The descent-rate method** — the centred-window half-window exclusion described above, judged
   against the raw chords rather than against device summaries that fail their own header check.
4. **The descent smoothing window sized off `descentDt`** — a real bug (13 of 35 fixtures, up to
   12x) worth fixing for its own sake, but it moves leg boundaries, so it needs its own pass and its
   own corpus diff rather than riding along with a method change.
5. **TWR rests on two samples at 10 Hz and says so nowhere.** The 0.2 s window is sample-count-blind
   and the figure is printed to 1 decimal like any other. Either widen it, or say what it rests on.
6. **CSV export: column selection, a field separator, and a comments block.** Benchmarked against
   OpenRocket's *Export data* tab; the separator is the sharp one — the corpus holds semicolon-
   delimited European exports Debrief reads correctly and cannot write.
7. **The report's file-export strip on a phone** — 861 px of nine controls in a 380 px viewport
   behind a 32 px fade, so `Save bundle` is undiscoverable. Needs a sheet, which the app lacks.

BACKLOG.md carries the rest, newest first — including several reading-only findings marked
unreproduced (`baroVel` is not always barometric; `derivative` writes a literal 0 on a duplicate
timestamp; the free-fall ceiling uses the apogee altitude on the main leg).
