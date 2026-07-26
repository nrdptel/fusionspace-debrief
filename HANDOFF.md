# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — two increments, one of them a wrong number on a safety reading

The session's branch restarted from `origin/main` at `488db50` (the previous run's PR was squashed
in, so the branch's old commits were already-merged history).

| What | How it was verified |
|---|---|
| **Say which commit the deployed site is running.** `npm run build` stamps `public/version.json` (GITHUB_SHA in CI, `git rev-parse` locally, plus a `dirty` flag); generated, never committed. | Nothing in the served output identified the build, and the obvious workaround does not work — an identical tree builds to *different* chunk hashes in CI than locally, so comparing file names compares build environments, not commits. Both caches deliberately bypass it (`no-store` header + an explicit service-worker rule) because a stale marker answers confidently and wrongly. 2 e2e checks, both falsified. |
| **Read thrust-to-weight against the rocket's own resting value.** | `liftoffTWR` was `mean(accel)/g`, which is T/W only if the channel is SPECIFIC FORCE (+1 g at rest). AltusMetrum's `acceleration` has gravity already removed and rests at ~0, so it yielded exactly **T/W − 1** — a full point low on the figure the code quotes against the **5:1 rail-departure rule**. Measured: 8 AltusMetrum flights rest at −0.79…+1.34 m/s²; 6 AltimeterCloud flights rest at 9.60…10.05. The same AltusMetrum row proves it — `acceleration` reads −0.98 while its own `accel_x` reads 9.78. **After: AltimeterCloud unchanged (≤0.03 drift), AltusMetrum corrected — Stargazer1 3.27→4.29, Kairos 3.89→4.98, intrepid2 25.10→26.10.** Three flights cross the 5:1 line. |

**Why differencing rather than a per-logger table.** Write the channel as `specific force − O` for an
unknown offset O (0 for specific force, g for gravity-removed). At rest `a_pad = g − O`; under
vertical boost `a_boost = T/m − O`. The offset cancels: `(a_boost − a_pad)/g + 1 = T/W`, exactly,
for either convention, with no threshold to tune and no format knowledge in the analyzer. Pinned by
a synthetic that runs the same motion under both conventions and requires the same answer — it
fails against the old form by **1.0000000000000018**.

**The cost, stated plainly:** 3 AltusMetrum flights whose records start after liftoff have no
resting stretch, so the convention is unknowable and TWR is now **withheld with a stated reason**
rather than published a point out. They previously printed a wrong number. BACKLOG carries the two
routes that would recover them (a channel-side convention flag, or mapping AltusMetrum's `accel_x`).

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

1. **The liftoff threshold has the same convention blindness TWR just had** —
   `acceleration[i] > 2 * G0` is absolute, so it means 2 g of net thrust on one logger and 3 g on
   another. Same cure (threshold on the rise above the resting value). Measured to move a reported
   TWR by 0.93 on a synthetic.
2. **Give a `Channel` a convention flag** (`lib/flight/types.ts:32`), set by each parser. It is the
   architectural hole under this run's bug — `build.ts:129` applies only a linear unit scale, so the
   analyzer cannot know what an accel channel means. It would also recover the 3 flights now
   withheld. `lib/flight/reported.ts:117` already models the distinction on the wrong side.
3. **Map AltusMetrum's `accel_x/y/z`** — its true specific-force body axes are in the same file and
   dropped at parse time. Gives a genuine resultant and fixes the withheld flights.
4. **The drogue leg still starts at apogee, not at deployment** (a 31% gap on a real file). Now
   known to be multi-pass: every deployment boundary in the corpus is parsed and thrown away because
   `ChannelKind` has no event kind and `ROLE_TO_KIND` is closed. BACKLOG lists all five sources,
   including 9 AltusMetrum files that carry it as literal `state_name` text.
5. **Pin the four-altimeter descent chord** (0.12% agreement across 4 recordings of one flight) as
   the first descent golden value — `expected.json` still asserts no descent rate anywhere.
6. **CSV export: column selection, a field separator, a comments block.** The corpus holds
   semicolon-delimited European exports Debrief reads correctly and cannot write, so a
   comma-decimal-locale flyer opens our CSV in Excel and gets one column. The read side already
   sniffs the delimiter (`lib/csv.ts:11`); the write side hard-codes `,` in three places
   (`lib/csv.ts:175`, `lib/explore.ts:65`, `lib/report.ts:600`).
7. **The report's file-export strip on a phone** — 861 px of nine controls in a 380 px viewport
   behind a 32 px fade, so `Save bundle` is undiscoverable. Needs a sheet, which the app lacks.

BACKLOG.md carries the rest, newest first — including several reading-only findings marked
unreproduced.
