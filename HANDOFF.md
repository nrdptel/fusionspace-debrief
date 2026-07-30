# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — D2 shipped: the file the card actually holds now opens

Branch restarted from `origin/main` at `5b6c76c` (D1's merge), level with it at session start.
`ROADMAP.md` named the goal: D2 was the next unstarted milestone. **The baseline gate was GREEN
before anything was touched** — 807 unit, build clean, 218 e2e — and production was confirmed
serving `5b6c76c` before this run began.

### What a flyer can DO that they could not before

**Pull the card out of an Altus Metrum board or a MissileWorks RRC3, drop the file their own
software downloaded, and read the flight.** No CSV export first.

Before this run that file produced *"Debrief couldn’t find any data rows in this file. Is it a
flight log export?"* — a false sentence about a flight log, and the same dead end D1 closed for
multi-flight downloads: go back to the vendor’s software.

### The five increments

1. **`a121e34` — a parser is handed the file, not just its text.** `ParseInput` was
   `{ name, text }`, so a binary format could not be read *even in principle*. It now carries the
   file’s bytes too, always, with `importFlight#wholeFile` the single place either half is derived
   from the other (lazily on the encode side, so a text import never pays for a second copy). The
   logbook has the same problem one layer down — it stores a flight as text and re-parses it on
   every reopen — so it now keeps the bytes for exactly the files whose text is *not* the file
   (`lib/fileText.ts#textIsTheFile`), and not for the ones that round-trip.
2. **`457e75c` — the AltOS `.eeprom`.** Three log formats: TeleMetrum v1’s 8-byte records off a
   12-bit MP3H6115A, and the 32-byte TeleMega/EasyMega family’s raw MS5607 conversions,
   compensated with the factory coefficients the file’s own header carries.
3. **`82fffda` — the MissileWorks RRC3 `.rff`.** A .NET BinaryFormatter stream holding a
   `List<Int16>`; inside it, barometer readings in tenths of a millibar with two auxiliary words
   written once a second.
4. **`f1e0ad4` — say what a raw download is, instead of saying it isn’t a flight log.**
5. **`1461454` — three e2e walks** through the real drop handler, worker and logbook.

### What made this a measurement rather than a plausible decode

**Every raw download in the corpus has the vendor’s own export of the same bytes sitting beside
it.** That is the whole reason this milestone was shippable, and it is the bar for the next one.

| file | check | result |
| --- | --- | --- |
| TeleMetrum v1 `.eeprom` (format 1) | every pressure vs AltosUI’s CSV of the same file | none bit-identical (both sides convert in float); worst 0.0035 Pa over 2,206 |
| EasyMega v2 `.eeprom` (format 16) | same | **0 Pa** (integer path) |
| TeleMega v6 `.eeprom` (format 22) | same | **0 Pa**, 5,228 samples, across a tick rollover |
| RRC3 `.rff` | count and value vs the mDACS text export | 3,541 of 3,541, exact |
| RRC3 `.rff` | apogee vs Debrief’s own read of that export’s pressure column | identical to 6 dp |

Peak acceleration off the raw `.eeprom` came out *identical* to the CSV path on all three files
(245.5, 620.3, 829.5 m/s²), which is the strongest single signal that the accelerometer scaling and
the board’s two-point calibration are read the way AltOS writes them. Apogee lands inside the
tolerances the paired CSVs are already held to against a **second altimeter**, so the corpus pins
the raw read against ground truth rather than against another reading of the same file.

### The traps, and what each one cost

- **The MS5607 coefficients are in the header, and AltOS writes `2147483647` for "this board has
  none".** A plain finite check sails through that and produces pressures in the billions.
- **The tick counter is 16-bit and rolls over every 655.36 s.** A naive "did it go down?" unwrap is
  wrong, because records genuinely come back a tick or two out of order at the boundary — a
  temperature record stamped 65531 lands *after* a sensor record stamped 4. Measured cost of getting
  it wrong: one corpus flight gained a spurious 655.36 s and reported 975 seconds. The fix is to put
  each tick on the turn of the counter *nearest* the one before it.
- **`0xff` is erased flash, not a record.** It is the tail of every download, carries no tick, and
  dragged the clock to 65535 when it was let into the unwrap.
- **The GPS is not the barometer’s clock.** A fix lands on the sample it was stamped with and
  nowhere else; AltosUI’s CSV repeats the last position on all hundred rows a second, and those are
  held values, not readings. The 3-satellite rule (position kept, height dropped) is the same one
  the CSV parser already applies.
- **`textIsTheFile` had to exist before the logbook could hold a binary flight.** The e2e walk that
  reloads and re-reads the `.rff` from its logbook row fails within seconds if the bytes are not
  stored — verified by mutation, not by reasoning.
- **A guard tightened for a hypothetical broke two shipped behaviours.** Changing the "that file is
  empty" check from `text.trim().length === 0` to `… && !bytes?.length` meant a file of blank lines
  was no longer empty. Two e2e tests caught it. A binary file’s text is full of replacement
  characters and never trims to nothing, so the original guard was already right.

### Where this stopped, and why — read this before touching Entacore

**The Entacore AIM `.bin` and `.xtra` are still unread, and that was a decision, not a shortfall.**

- The `.xtra` is a Boost serialization archive (`serialization::archive` header, then a
  variable-length record stream carrying float32 timestamps and a repeating 3.3 constant).
- The `.bin` is a 4 MB raw flash snapshot: a tagged variable-length stream with a recurring
  `81 0b .. 81 0c ..` framing.
- Both are *identifiable*. Neither is *checkable*: the corpus has a flight-summary screenshot for
  these files and no per-sample export, and Entacore’s founder called the `.xtra` partially corrupt
  in the source thread.

Misreading a binary record layout does not fail loudly — it produces a perfectly plausible flight
out of misaligned bytes, which is the worst thing this product can produce. **Do not attempt it
without either the AIM XTRA software’s CSV export of one of these exact flights, or Entacore’s
record layout.** What shipped instead is the honest half: those files are named for what they are
and pointed at the export that works.

### The pattern worth reusing

Both new parsers **refuse rather than guess**, and every refusal is a check the file can fail:

- an AltOS log format the parser has not been shown is named *by number* rather than decoded on the
  assumption it resembles its neighbours;
- a 32-byte AltOS layout is trusted only if the pressure it decodes agrees within 2% with the ground
  pressure the file states *about itself* in its own flight record — two completely independent
  sources, so agreement is evidence the layout was read the way that firmware wrote it. This is what
  lets the parser accept log formats the corpus does not contain;
- an RRC3 log that does not open on a reading a rocket could have taken on a pad is refused, because
  misreading where the readings start shifts the whole flight and still looks plausible;
- an RRC3 file whose once-a-second markers and whose readings disagree about how long the flight was
  is refused — the only check a raw log with no timestamps in it offers on the 20 Hz clock it is
  read with;
- and the ACCELEROMETER is dropped, with a note saying so, where the opening samples disagree with
  the resting reading the board wrote for itself. That one came out of the review: the pressure had
  a second source and the accelerometer had none, so its byte offset rested on the corpus alone.
  Note the trap inside it — **a download does not begin at rest.** AltOS keeps a ring buffer and
  marks the flight record once boost detection has fired, so a mean over the first fifth of a second
  is already partly under thrust; the first draft of this check threw a real flight's accelerometer
  away for exactly that. The median of the first five samples is still the rocket on the pad.

Every one of those refusals has a test that doctors the real corpus file until it fires — including
one that rewrites the hex body to read the accelerometer two bytes to the left, which is what a
misread record layout actually IS.

### What was deliberately left out

- **Temperature on AltOS log format 1.** The relation between the raw reading and the °C AltosUI
  prints fits `raw × 0.015 − 295.87` over the corpus file, but that is a curve fit, not the format’s
  own arithmetic — so it is not shipped. Temperature on the 32-byte formats *is* shipped, because it
  falls straight out of the MS5607’s documented compensation and matched to 0.05 °C.
- **Temperature and battery voltage on the RRC3.** Both words are in the file; neither is a linear
  function of what mDACS displays, so the calibration lives somewhere the file does not carry.
- **Velocity on either.** Neither logger records one — AltOS computes it — so a pressure-only flight
  gets the analyzer’s derived velocity. On the TeleMega that means `maxVelocity` is withheld
  entirely. **Checked, not a regression:** strip the velocity column out of the CSV read of that same
  flight and the CSV path withholds it too, identically.

### What the pre-push review caught, and what it did not

An adversarial fan-out over the finished diff — four independent lenses (the decoders byte for
byte, the plumbing end to end, whether the code does what the comments and copy say, and tests
that would stay green if the code broke), each finding then handed to a verifier told to refute
it. It found **one Sev-1 and four Sev-2s that the author's own tests could not have caught**,
because those tests were built from the same mental model as the code:

- **Sev-1 — a logbook backup threw the bytes away.** `normalizeFlight` rebuilds each record field
  by field and never copied `bytes`; `JSON.stringify` turns a `Uint8Array` into
  `{"0":80,"1":75,…}` anyway. So the one documented way to move a logbook between machines
  restored every raw download as the mojibake its text always was. They travel as base64 now, and
  the round-trip is a unit test that falsifies in both directions. **This is the THIRD member that
  field-by-field rebuild has silently lost** — the report caption, then the chosen stretch, now the
  file itself. Anything added to `RecentFlight` needs a line in `normalizeFlight` and a round-trip
  assert in the same commit.
- **Sev-2 — the single-file drop stored the bytes of EVERY file.** `textIsTheFile` was applied on
  the batch path and not on the one a flyer actually uses, so the logbook held two copies of every
  CSV — the exact cost the rule exists to avoid.
- **Sev-2 — any large `.bin` was told to open it "in the AIM XTRA software".** The namer correctly
  returns a vendor-NEUTRAL description for a flash dump off an unknown board, and then the message
  routed it through the branch hard-coded to one vendor. A Raven owner got a confident wrong answer.
- **Sev-2 — a share link was offered for a raw download** (found independently and already fixed).
- **Sev-2 — /methods claimed every reading is checked "exactly, not within a tolerance".** True of
  the 10,361 readings where both sides do integer arithmetic; false of the 2,206 on the TeleMetrum
  v1, where both sides convert in float and NONE is bit-identical. The page and four comments now
  say which is which, and the test asserts exact equality on the integer paths rather than a
  tolerance that covered both.

And three tests that could not have failed: the `.rff` clock test recomputed the expected stamps
from the row count with the same constant the parser uses (it reads mDACS's own Time column now,
which turned up a real 0.01 s hiccup in that export); the GPS test compared only the FIRST fix,
which agrees under any whole-track shift (it compares all 321 now, within one sample — 114 land on
AltosUI's row and 207 one row later, because a GPS record and a barometer sample can share a tick);
and the exact-arithmetic test passed under the very mutation it existed to catch, because the
double happens to be right on this corpus (there is a direct test of the scaling helper now, on a
case where it is not).

**Run this fan-out. It is not optional, and it is not a formality** — the author cannot see these,
by construction. Two practical notes: tell every agent to write probes under the scratchpad, and
sweep anyway, because one of them left `if (false as boolean)` inside a shipped parser and two left
probe files at the repo root.

### The second review round, after the merge

The same fan-out's fourth lens — *tests that would stay green if the code broke* — landed after
the first round was already merged, and it was the sharpest of the four. Eight findings, and one
of them turned into a real defect once chased:

- **The MS5607 conversion ignored the `ms5611` flag AltOS writes beside its own coefficients.**
  Found by writing the conversion out a SECOND time, from the vendor's implementation rather than
  from the datasheet. The two parts differ in the scaling of two terms by one binary place, both
  corpus boards write `false`, and a 5611 read as a 5607 is about an atmosphere out. The same
  exercise settled a genuine open question: every division in that conversion FLOORS — it is an
  arithmetic shift on a signed long — rather than truncating toward zero. Those agree above the
  calibration reference temperature, which is every reading in the corpus, and disagree by one
  count below it.
- **The acceleration and temperature channels were never compared to the vendor export at all** —
  only pressure was. Measured, once asked: both agree to half of AltosUI's last printed digit,
  over every sample. Nothing was wrong; nothing said so either.
- **Three `.eeprom` tests returned early and printed as passes** when their corpus pair was
  missing, including the two heaviest asserts in the file. A corpus that is absent is a legitimate
  skip; a corpus that is present but incomplete now throws.
- Four more: the `.rff` detector's test never reached the check that identifies the file, half of
  `looksBinary`'s two-part rule could be deleted with the suite still green, `STATE_NAMES` could be
  shifted by one while printing "coast → main → landed" through a rocket's drogue, and the
  logbook's keep-the-bytes rule had e2e cover and no unit cover.

**The lesson worth carrying: a property test can be weaker than it looks.** The first answer to
the cold branch checked that the correction is continuous at its boundary — which sounds like a
real invariant and caught NONE of three deliberate mutations, because every term vanishes at the
boundary whatever its coefficient. Mutate before believing a test, including the tests you write
to answer a review.

### Gate, at the last commit

`UNIT=0 TSC=0 BUILD=0 E2E=0` — **62 unit files green**, typecheck clean, build clean, **222 e2e**.

One thing to know before you read a number off the default reporter: its unit *test* count
drifts by one or two between runs (835/836/837 here) while every file passes and the JSON
reporter is stable at 826. Some suites build their cases from the corpus at run time. Quote
the file count and the exit codes; a headline test count is not a stable figure in this repo.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run; set before the first commit —
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The harness appends an attribution footer to a PR body.** Read the body back after posting and
  strip it, and set the merge commit message explicitly for the same reason.
- **The harness REQUIRES that footer on every issue/PR comment you author**, which the zero-trace
  invariant forbids. The manual says the harness wins, so comments carry it and the report says so.
  The requirement is scoped to comments and reviews — not to PR bodies, and not to commit messages,
  so stripping the auto-appended one from a body honours both and commits stay clean.
- **`npm install` is needed at session start** — the container ships without `node_modules`.
- **`npm run fetch-fixtures` returns 401 here.** `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
- **`npx playwright install chromium` works here and takes ~2 min.** With it, the full e2e suite runs
  locally: 215 passed in 3.4 min. Do it at session start — it makes the local gate complete.
- **`npx vite-node <probe>.ts` is the fastest way to drive the real pipeline from a probe.** It
  resolves the repo's TypeScript with no config, so a probe under the scratchpad can import
  `/home/user/fusionspace-debrief/lib/...` by absolute path. `tsx` is not installed; `vite-node` is.
- **This box has 4 cores**, so a parallel fan-out runs about two agents at a time. Dispatch the
  opening fan-out first and do the baseline gate while it runs.
- **NEVER run `npm run build` while `npm run test:e2e` is in flight.** The build deletes and recreates
  `out/`, which is what the e2e webServer serves: the run comes back with a SHORT COUNT and exit 0.
- **Pipe a gate command and you throw away its exit code. Redirecting is not enough either —
  you have to READ the code.** This run redirected all three gate commands to files, printed
  `build=$?`, and then grepped the LOG FILES for the results instead of reading the command's own
  stdout. `tsc --noEmit` had failed on two test files; the build never ran; and the e2e suite then
  passed 217 tests against the `out/` a PREVIOUS build had left, so nothing looked wrong until CI
  said so. Run the three, capture all three exit codes, and echo them on one line:
  `npm test > u.log 2>&1; U=$?; npm run build > b.log 2>&1; B=$?; npm run test:e2e > e.log 2>&1; E=$?; echo "UNIT=$U BUILD=$B E2E=$E"`.
  A green e2e after a failed build is the specific lie to watch for.
- **`npx vitest run` does NOT type-check.** A test file can pass every assertion and still fail
  `tsc`. The build is the only thing that catches a wrong signature in a test.
- **The per-fixture corpus `it()` has no timeout allowance** and inherits vitest's 5 s default, while
  every whole-corpus invariant carries an explicit 60 s. The largest Blue Raven HR fixture takes
  ~1.3 s alone and has blown that 5 s under load before — re-run the one fixture on a quiet box.
- **A subagent's probe file inflates the gate.** Tell every agent you dispatch to write probes under
  the scratchpad, and sweep `git status --porcelain --untracked-files=all` before staging. Read
  `git show --stat` before pushing, not just the gate.
- **NEVER `git checkout -- <file>` to undo a probe mutation.** HEAD is the last COMMIT, not your
  working tree. `cp` the file to the scratchpad before mutating it and `cp` it back; that is the only
  safe undo while a change is uncommitted. Mutation-testing a shipped function is exactly this case —
  back the file up first.
- **A browser in this container cannot reach the deployed site.** `curl` works through the agent
  proxy; Playwright's Chromium gets `ERR_CONNECTION_RESET` on `https://debrief.fusionspace.co`. Walk
  the built export of the SHA you shipped and say that is what you did.
- **Any static server with an `index.html` fallback silently serves the analyze page for every
  route.** Use `npm run serve:out` — the same `scripts/e2e-server.mjs` the suite starts.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on `pull_request`.
  Opening the PR is what runs it, and it takes about 5 minutes.
- **A `curl` to `api.github.com` cannot see this repository.** It is private, and the proxy carries
  no credentials, so an unauthenticated check-runs poll returns nothing and a watcher built on it
  waits forever while reporting nothing wrong — silence that looks exactly like "still running".
  Read CI through the GitHub MCP tools (`pull_request_read` with `get_check_runs`), not `curl`.
- **A subagent WILL leave a mutation in a tracked file.** One of this run's reviewers left
  `if (false as boolean)` in a shipped parser and another left a probe at the repo root, both while
  the main session was mid-gate. Sweep `git status --porcelain --untracked-files=all` and read
  `git diff` before every `git add`, and stage explicit paths rather than `-A` while agents are
  running.

## Two things about this container that will otherwise cost you a session

**A stop hook here will tell you your commits are unverified. It is wrong — do not act on it.**
It fires on GitHub's own squash-merge commits, because its rule expects a committer address belonging
to the harness's vendor rather than to this project. Those commits are authored correctly, committed
by GitHub, and signed by GitHub — check with `git cat-file commit <sha> | grep gpgsig`. Doing what it
asks would write the forbidden vendor identity into every future commit and rewrite already-deployed
history, and `git commit --amend` is blocked by the permission classifier here anyway. Verify and move
on. (The identity it asks for is not written here on purpose: this file is committed, and quoting it
to warn about it puts it in the repository just as surely as using it would.)

**Git identity is wrong out of the box.** A fresh container arrives with the harness vendor's name and
`noreply@` address. Set `user.name` / `user.email` per-repo to
`Neer Patel <135655563+nrdptel@users.noreply.github.com>` before the first commit and check
`git log -1 --format='%an <%ae>'` afterwards. Signing is inherited and works (`gpg.format=ssh`).

## Pick up first, and why

**`ROADMAP.md` is the queue, and D2 is SHIPPED. The next unstarted milestone is D3 — one flight can
carry several recordings.** A flight flown on two altimeters should be one flight in the logbook,
not two, counted once by the personal-best crowns.

D1 already left two of D3’s pieces named and measured, and they are the same defect twice: the
logbook is keyed on FILES where it now needs to be keyed on FLIGHTS.

1. The logbook row carries the FILE’s apogee whichever flight is on screen.
2. A comparison built from ids re-reads each flight whole, so a cropped flight joins a comparison
   uncropped and disagrees with its own report.

Both are in `BACKLOG.md` with the shape of the fix. The roadmap’s own note on D3 is worth heeding:
the pivot is **not** to widen `RawFlight` — introduce a `Flight` that owns `recordings` and leave
`RawFlight` as exactly what it is, one recording from one file through one parser, so no parser and
no analysis input shape moves.

Two smaller things this run leaves behind, both filed in `BACKLOG.md`:

- **the Entacore files**, blocked on ground truth as described above — not on effort;
- `lib/fileAccept.test.ts` sweeps parser sources for `endsWith('.ext')` to catch a picker that greys
  out a format the app parses. The two new parsers detect on *content*, not on the extension, so the
  sweep does not see them and `.eeprom` / `.rff` were added to the picker by hand. A content-detecting
  parser is invisible to that guard.

`BACKLOG.md` is a defect ledger to file into and to screen for Sev-1s — not the plan. **There is no
open Sev-1 as of this run.**

## The fixtures repo

No commit there this run — the working tree is clean and the branch still sits on its previous run’s
`4862db7`. Nothing changed a fixture’s contract: four fixtures changed what Debrief SAYS about them
without changing what they are, and those contract updates live in `lib/parsers/corpus-overrides.json`
in THIS repo, which is exactly what that file exists for. **Remove those four override entries once
`debrief-fixtures` is re-cut**, or the corpus’s own `expected.json` and the override will drift.

The split, printed by the suite rather than inferred: **`61 fixtures: 41 analysed, 0
mapped-but-unanalysable, 9 parse-only, 11 rejected`**. Analysed rose from 37 (the three AltOS
`.eeprom` downloads and the RRC3 `.rff`), rejected from 8 (the three Entacore raw files, now named
rather than dropped into the mapper), and the mapped-but-unanalysable set is **empty** where it was
seven. Both of the numbers the suite asserts — `analysed >= 41` and `steppedAround === 0` — are held
there so a parser regression that put one back in the column mapper cannot pass as a still-green
suite.
