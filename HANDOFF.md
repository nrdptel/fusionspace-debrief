# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — a gate that lies, and two numbers that did

Branch restarted from `origin/main` at `1539d69`, level with it at session start (0 ahead, measured
after `git fetch --prune`). No focus was named, so the queue came from the opening fan-out — eight
lenses over the app, each finding adversarially verified before anything was scoped.

**The baseline gate was RED before anything was touched**, and that was the first finding rather
than a mystery: `npx serve` crashed twice with `EMFILE` part-way through the e2e run and took three
`worker.spec.ts` tests with it. Fixing the gate came first, because every later increment's evidence
depended on it.

### Shipped to production

**`ebf0d22` — PR #34, squash-merged to `main`, CI green (frontend + e2e).** Three increments:

1. **The e2e web server could not survive its own suite.** `serve` holds a descriptor per request
   until the response drains; at 195 tests against this container's 4,096-descriptor limit it ran
   out mid-run and every test after the crash failed with `ERR_CONNECTION_REFUSED`, naming something
   else. `scripts/e2e-server.mjs` answers from memory (3.4 MB, 57 files), revalidated by mtime.
   **Diffed against the incumbent address by address before the swap** — identical status, bytes and
   content-type everywhere the app or the suite asks, with three deliberate differences. The review
   then found that the replacement could itself be killed by one request (`/日.html` → Node throws
   `ERR_INVALID_CHAR` on the redirect header, which in an async handler ends the process); every
   request is inside a `try`/`catch` now and redirect targets are re-encoded and keep their query.
   `npm run serve:out` is the same server, which retires the `-s`/`--single` footgun for good.

2. **Two flights that share a file name collapsed into one.** `isDup` keyed on name + format, so the
   second `data.csv` DELETED the first, took its id — an address, used by `/?open=` and
   `/compare?ids=…` — and inherited its note and report label. A launch day of six identically-named
   exports left six flights on screen and one row in the logbook. Identity is the file now (name,
   parser, bytes); a reopen still replaces in place because it saves the text it was stored with.
   Three things assumed names were unique and no longer do: the row's three controls (identically
   named to a screen reader), the "forgotten" banner (`data.csv, data.csv, data.csv`), and the
   reopen assertions in the e2e round-trip, which read the store before the reopen's own write
   landed and so could pass vacuously.

3. **A main descent rate off a record that never reached the ground was published bare.** 3 of the
   37 corpus flights analysed end to end; the loudest reads 50 ft/s, the top of the 20–50 ft/s band
   the genuinely-landed mains fall in, handed over as a touchdown speed. The whole-descent tile has
   carried that caveat for a while and `landingRate` already withheld the landing energy — the grid
   and the saved report printed the figure anyway. The landing-energy card was also explaining the
   withheld number WRONGLY on these flights.

### On the branch, gated green

4. **The comparison surface, which increment 3 did not reach.** The table cell printed the same
   descent rate bare, and the cross-check paired a leg that landed with one that stopped in the air
   and called it corroboration. **Both** corpus groups that cross-check a main leg are in that
   state — `iss-endurance` pairs a StratoLogger that landed (13.4 m/s) with a TeleMetrum that stops
   (15.2); `trf-lemiv-l3` pairs a Blue Raven and a Featherweight GPS that landed (8.1, 7.5) with a
   Quantum-FW that stops (9.4). A `partialLeg` flag with its own ‡ footnote on the panel, in the
   Markdown and HTML reports and in the comparison JSON, plus a per-cell "(stops in the air)" tag
   with the legend line the other per-cell tags already had. The ‡ names a DIRECTION, because a
   caveat without one is not actionable: a leg cut short reads HIGH, by 13% and 21% above the landed
   recordings in those two groups.

5. **Logbook Import returned less than Export wrote.** `normalizeFlight` rebuilt each record field
   by field and never copied `caption` or `summaryText` — both of which `exportLogbook` writes — so
   a restore dropped the report label and notes the flyer TYPED and the paired device summary, and
   then said "Restored N flights." Export/Import is the only insurance against Clear. `captionOf`
   validates rather than coerces (a malformed member fails the whole caption instead of restoring
   half of it) and judges blank on the trimmed strings, the way `saveCaption` does, so import cannot
   resurrect a whitespace caption that then rides out through every reopen.

### What the reviews caught that the tests didn't

The pre-push agent review paid for itself on every increment it saw, and always on the thing the
author was most confident about. On increment 1 it found that the new server — written to end a class of
web-server death — could be killed by a single request. On increment 2 it found that the row-naming
fix still collided for the closest pair of flights (a batch drop reads "just now" throughout and two
apogees can round to one figure), and that two of the new e2e assertions raced the write they were
testing. On increment 4 it found that the new ‡ footnote described a "main leg" while the flag also
fires for a whole-descent row, and that its wording asserted a landed comparator that a set of two
truncated legs does not contain. On increment 5 it found that the round trip's only end-to-end
evidence could pass vacuously — the assertion after `fill()` re-read what Playwright had just typed,
and the export raced a fired-and-forgotten `saveCaption`. **Send the diff out before every push, and
give the reviewer the domain rule it needs to judge the caveats.**

**Every assert added this run was falsified individually** — each mutation reverted one behaviour and
the matching assert failed naming its own case. That discipline also caught a wrong number in the
author's own prose: "4 of 46" was measured with a probe that analysed known-issue fixtures too; the
corpus runner's own set is **37 of 61**, and 3 of those 37 are in the state. Measure against the set
the assert uses.

**An agent's absence claim was checked in both directions and refused.** A lens filed "the drogue
descent rate is the last uncaveated descent reading". It isn't a defect:
`drogueDescentRate = legRate(apogeeIdx, mainIdx)` is only ever assigned inside
`if (mainIdx !== null && cameDown)`, between two indices INTO the record, so the leg cannot run past
the end of the file whether or not a landing was found. The code is the evidence — the test that
pins it is a regression pin against someone wiring the flag on by symmetry, and the second review
was right to say it is not itself proof.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run; set before the first commit —
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The harness appends `_Generated by …_` to a PR body.** It did again this run. Read the body back
  after posting and strip it, and set the merge commit message explicitly for the same reason.
- **`npm install` is needed at session start** — the container ships without `node_modules`.
- **`npm run fetch-fixtures` returns 401 here.** `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
- **The image's Chromium is 1194 and Playwright wants 1228.** `npx playwright install chromium` (~2 min).
- **This box has 4 cores**, so a parallel fan-out runs about two agents at a time. An eight-lens
  opening fan-out takes ~40 minutes end to end, not ten. Dispatch it first and do the baseline gate
  while it runs.
- **THE `EMFILE` WEB-SERVER FAILURE IS FIXED** — `serve` is gone, and a full run is 196 passed with
  zero `EMFILE`. If a cluster of tail-end e2e failures ever comes back, still read the
  `[WebServer]` lines first, but the old advice about `ulimit` no longer applies.
- **NEVER run `npm run build` while `npm run test:e2e` is in flight.** The build deletes and recreates
  `out/`, which is what the e2e webServer serves: the run does not fail loudly, it comes back with a
  SHORT COUNT and exit 0. If a suite reports fewer tests than the last full run, suspect this first.
- **Pipe a gate command and you throw away its exit code.** Redirect to a file and read `$?`.
- **`npm run build` can crash in webpack's WasmHash** and dump ~2 MB of minified bundle into the
  terminal. It happened again this run. `rm -rf .next` and rebuild — a cache flake, not a code
  error. `tsc --noEmit` passes either side of it. Do not grep that output for "error".
- **The per-fixture corpus `it()` has no timeout allowance** and inherits vitest's 5 s default, while
  every whole-corpus invariant carries an explicit 60 s. The largest Blue Raven HR fixture takes
  **783 ms alone** and blew that 5 s under load this run. A flake that reads exactly like a parser
  regression — the control is to re-run the one fixture on a quiet box.
- **A subagent's `*-tmp.*` probe inflates the gate.** Sweep `find . -name "*-tmp.*"` immediately
  before any gate run you intend to quote.
- **A browser in this container cannot reach the deployed site.** `curl` works through the agent
  proxy; Playwright's Chromium gets `ERR_CONNECTION_RESET` on `https://debrief.fusionspace.co`. Walk
  the built export of the SHA you shipped and say that is what you did.
- **Any static server with an `index.html` fallback silently serves the analyze page for every
  route.** Use `npm run serve:out` — the same `scripts/e2e-server.mjs` the suite starts.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on `pull_request`.
  Opening the PR is what runs it, and it took about 5 minutes end to end this run.

## Pick up first, and why

`BACKLOG.md` carries the eight-lens audit in full, each entry with the code evidence that verified
it. Ranked by what a flyer loses:

1. **`Clear` wipes the noted flights the same screen promises are kept for good**, on a
   double-click, with no undo and no prompt to Export first. The only irreversible control in the
   app. Its escape hatch — Export/Import — is whole as of increment 5, so this is now a fair fight,
   but the confirm should say what it is about to destroy.
2. **A drop onto a loaded comparison replaces the set instead of adding to it**
   (`CompareSurface.tsx:144`), so adding the rest of a launch day throws away the assembly you had.
3. **A dropped FOLDER cannot be read at all** (`useWindowFileDrop.ts:75` reads only
   `dataTransfer.files`) — on the gesture `lib/ingest.ts` is named for and the methods page
   advertises. Verified by search, not yet driven in a browser.
4. **The comparison's label and notes, and its column sort and order, are not remembered** — the
   same defect the report's label had before it moved into the logbook entry, with a fix to copy.
5. **`landedInRecord` conflates two questions and `descentSource: 'second-copy'` splits them** —
   see `BACKLOG.md`. Latent (no corpus file reaches it), which is exactly why it was written down
   rather than fixed blind on a safety number.

The Blue Raven high-rate merge remains the largest single capability gap and is surveyed in full in
`BACKLOG.md`.

## The fixtures repo

No commit there this run. Nothing changed a fixture's contract: the corpus was used to *measure*
(37 analysed end to end; 3 carrying a main leg with no landing; 2 of 2 same-flight groups mixing a
landed main with one that stops in the air) rather than to re-cut anything. The three flights and
both groups are named in the asserts, so a fixture entering or leaving those states is a visible
change rather than a silent one.
