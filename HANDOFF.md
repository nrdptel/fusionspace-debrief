# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D8 slice 2 SHIPPED.** The roll angle the Blue Raven had already solved was being parsed past — and on the generic importer's path `Roll_Angle_(deg)` was auto-detected as a roll **RATE**, with a test asserting that was correct. Then the slice's own subject: the HR `Gyro_*` / `Accel_*` / `Quat_*` channels now carry real `ChannelKind`s, and **Debrief measures which sensor axis is the airframe's long one** off the gravity the board felt on the rail — so a flyer can tell which of six traces is the roll. **Slice 3 is MEASURED and deliberately NOT SHIPPED** — read its ROADMAP entry before touching it. |
| **defects** | **Two `BACKLOG.md` entries closed, and reproducing each changed what the fix was.** A wrong number was reaching the report — a StratoLogger temperature stated `58.7F` per cell, preselected as Celsius by a CASE MISMATCH, printing 138 °F. And the geospatial exports drew one trajectory from two instruments and said nothing. **Reproduce before scoping; both filings had the cause wrong.** |
| **P — product & craft** | **P1: three more §5 primitives are doing their job, and the chart now answers a keyboard.** `useReturnFocus` exists (§5 named it; nothing implemented it); `Readout` went **2 → 9 adopters**; `Chart.tsx` had `role="img"` but no `tabIndex` and no key handling, where `GroundTrack` beside it has had arrow keys since it was built. Items **7** (29 hand-rolled `<button>`) and the design-system audit's other 30-odd rows remain. |

**All fourteen increments are MERGED AND LIVE**, across pull requests #91, #92 and #93. Each PR
merged on green and the branch was restarted from `main` after each, as the harness requires.
Production was verified serving each merge in turn — `c86695c`, then `5b737b2`, and finally
**`bba3648`**, confirmed not just by `version.json` but by fetching the live methods page (it
carries the new **Which way is up the rocket** section) and the live JS bundle (it carries the
chart's keyboard contract). The branch is restarted on `bba3648` and clean.

**Both merged pull requests had the harness's attribution footer appended to the body on posting,
and both were stripped after a read-back.** That is a zero-trace breach on a public artifact and it
recurs on every `create_pull_request` call — but NOT on `update_pull_request`, verified three times.
Read the body back every time regardless.

**Re-measure before believing any of this**: `git fetch --prune origin`, then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moves underneath you.
It moved twice during this run.

## The one thing to read before anything else

**The opening fan-out's job is to find things you would not have looked for, and this run it found a
Sev-1-shaped defect inside the milestone rather than beside it.**

D8 slice 2 is written as "name the orientation channels". The premise is the high-rate file. Reading
the LOW-rate file's headers instead — all four app-CSV corpus exports — found three angle columns
side by side (`Tilt_Angle_(deg)`, `Future_Angle_(deg)`, `Roll_Angle_(deg)`) with only the first
mapped. And the third was not merely unread:

- `normalize` turns `Roll_Angle_(deg)` into `roll angle deg`, so the generic importer's `\broll\b`
  **rate** test matched. A column of degrees was arriving as a channel of degrees per second.
- It is the identical defect `releaseAttitudeRoll` exists to stop, in the one shape that guard
  cannot see: it fires only where `pitch` AND `yaw` siblings prove an attitude solution, and a board
  writing tilt/future/roll has neither.
- **`lib/flight/columns.test.ts` was ASSERTING it** — `expect(by('Roll_Angle_(deg)').role)
  .toBe('rollRate')`, with a comment explaining why that was correct. That is how it survived. A
  golden assert only guards the number somebody thought to assert, and it can pin the wrong one.

**And the first version of this section overstated it, which the pre-push review caught.** That
path is the column mapper, for an UNRECOGNISED file. `blueraven.ts` mapped no roll column at all
beforehand — measured across all 17 parser source files at the commit this branch started from,
not one pushed a mapping with a `roll` role — so no named-parser file ever published a wrong roll
figure. The defect was reachable and
latent, not observed. Overstating a defect's blast radius is its own wrong claim.

The Blue Raven's roll angle is **cumulative and unwrapped** — peaks of 26,099° on meraki, 24,240° on
jan18, −4,969° on jan10 — which is why such a column read as a rate gives a figure no flyer could
sanity-check. **On meraki it is also a FLOOR**: that file's board-measured `Roll Rate (HZ)` column
holds at exactly ±6.38889 rev/s (2,300 °/s) for **46 of its 36,700 samples**, which is a sensor at
its limit. Integrating that rate reproduces the board's own stated angle exactly — **25,333° either
way** — which confirms the vendor's stated method and makes the total a lower bound.

## The other thing to read before anything else

**The pre-push agent review found four real problems in the focus-return commit, and the most useful
one was about the check I had just written, not the code.** Do not skip that step.

- My new §9 assertion matched `\.focus\(\)` — the ZERO-ARG form only. `el.focus({ preventScroll:
  true })` is the commonest real variant, so a third hand-rolled confirm could pass the guard by
  adding one argument. Now `\.focus\s*\(`.
- The same assertion was comment-blind, so a component that merely DESCRIBED focus handling would
  fail it — failing for a reason other than the one it gives. Comments are stripped now, and only
  there: the suite-wide counts above it are §9's own greps and must stay literally that.
- `useReturnFocus` documents "the trigger stays MOUNTED" as its central contract and enforces
  nothing. Stated in the primitive rather than left implied.
- The logbook's confirm changed colour, border and body size in that commit and **nothing audited
  it**, while its identical twin on the privacy page has had an armed-panel axe run in both schemes
  since a hand-run audit caught that control's first contrast failure. Now both are guarded.

## What shipped this run

Every increment independently gated: `npm test` · `npm run build` · `npx playwright test`, all three
green before every push. **The corpus was attached throughout** — verified, not assumed: the sweep
reports **61 fixtures, 41 analysed, 0 mapped-but-unanalysable, 9 parse-only, 11 rejected**.

### 1. `useReturnFocus`, the §5 primitive nothing had implemented (`2845c54`)

Two surfaces hand-rolled all three of its parts and are the same control written twice — the
logbook's Clear confirm and the privacy page's Forget-these-settings confirm. Measured before: **6
imperative focus calls across 2 files.** After: **2, both in `components/ui.tsx`.**

**`Panel` itself is deliberately still not built, and that is a measurement refuting this
milestone's own entry.** `ROADMAP.md` named `UnitsControl` and `FigureChooser` as the two surfaces
hand-rolling it. Both are wrong: `UnitsControl` is a native `<details>`/`<summary>` where the
browser owns dismissal, and `FigureChooser` is an inline row of toggle chips with no dismiss at all.
Nothing in the app has the shape §5 draws.

The logbook's confirm also stopped hand-rolling its container — the control radius on a container,
and its whole body at caption size, on the app's only irreversible action.

### 2. D8 slice 2 — the roll angle the board already solved (`0f6da49`)

See above for the defect. `rollAngle` is a `ChannelKind` and `ColumnRole` in degrees, offered in the
mapper beside the rate. The board's own limit travels with the channel — the vendor states the angle
is an integration of the measured roll rate that ignores motion in the other two axes, so it drifts
— and **no size is put on that drift**, because nothing in the corpus measures roll orientation
independently and a percentage would be invented.

**`Future_Angle_(deg)` is refused, and the refusal is now pinned.** It is the board's projection of
where its tilt is heading, not a recording. Debrief reports flights that were flown.

**A wrong number this nearly introduced, caught by reading the conversion path rather than assuming
it:** the first draft offered `['deg','rad']` as the mapper's unit choice for the new kind. There is
no `angle` quantity in `lib/units.ts` — only `rotation`, which is a RATE — so an angle kind resolves
no converter and is passed through untouched. Picking radians would have stored radians labelled
`°`. No unit choice is offered, exactly as for `tilt`.

### 3. `Readout` takes the seven panels that were copying it (`de149cf`)

Seven byte-identical hero values — deploy altitude, drag Cd, drogue Cd, ejection delay, landing
energy, parachute Cd, rail exit — the `ACTION_BTN`-in-six-files shape, restarted for readings. The
primitive gained exactly two things, each a real case: `label` optional (all seven carry their own
`<h3>` above the value) and `layout="inline"` (the number and its qualifier read as one sentence).
`Readout` adopters **2 → 9**.

`GroundTrack`'s `Stat` is an eighth site and is deliberately NOT converted: it is `<dt>`/`<dd>`
inside a `<dl>` and `Readout` renders `<div>`s, so adopting it would strip list semantics. Its two
genuine §3 breaches were fixed in place instead.

### 6. Which way is up the rocket, measured off the gravity on the rail (`a0c292a`)

A Blue Raven's high-rate file gives six traces named for the board's own axes, and which one is the
ROLL depends on the mounting — two corpus flights rest on `X`, two on `Z`. **The vendor's stated
method was measured and rejected**: "the direction of the initial motion", reduced to which axis
carries the largest excursion, separates winner from runner-up by only **1.1×–2.4×** and picks the
WRONG axis on two of four, because at 500 Hz the lateral axes see shock that rivals the boost.

Gravity does it instead, on the stretch before the record moved: the long axis sits **0.26°–1.72°**
off the at-rest vector and outweighs the runner-up by **33.2×–216.4×**. The window is the LAST still
stretch, not the first and not the longest — a rocket is often horizontal while prepared, for longer
than it stands on the rail. `Gyro_*`/`Accel_*`/`Quat_*` also stop being `kind: 'other'`.

The kinds deliberately do NOT become `rollRate`/`accelAxial`: those are what the analysis reads, and
the stream arrives reduced to an envelope. Naming a trace is not reading a number off it.

### 7. A keyboard can read the chart (`fd4c990`)

`Chart.tsx` carried `role="img"` and an `aria-label` but no `tabIndex` and no key handling, so it
could not be focused. `GroundTrack` beside it has had arrow keys, Home/End, PageUp/PageDown and
Escape since it was built — an inconsistency inside one report as much as a gap against a
spreadsheet. **`COMPETITION.md` row 26, which I wrote earlier this run, overstated it** ("no `role`,
`tabindex` or focusable element"); the role was there, and the row is corrected in place.

Arrows walk the samples in the VISIBLE window, so a zoom changes what they traverse. It drives
uPlot's own cursor, so the live legend is the same element for mouse, finger and key. Only
deliberate presses write to the `aria-live` region — a pointer would queue one per pixel.

### 8. The exported track says which instrument drew it (`326244b`)

Filed in `BACKLOG.md` as "the KML draws the GPS track at BAROMETRIC height", **unreproduced** —
and reproducing it changed the fix. The height is not wrong: `relativeToGround` means height above
the ground, which is what a barometric AGL series measures. A receiver's altitude is above the
ELLIPSOID, a different quantity — the **nine** corpus flights carrying both disagree by
**197–1,771 m on average**, up to 2,949 m. Swapping to `altitudeGps` would have been a regression
dressed as a fix.

The real defect was the provenance: geometry drawn by two instruments, with the file silent. The
KML now says so, and says it differently where a receiver altitude exists and was not drawn. The
GPX stays without `<ele>` for a **stated** reason — GPX elevation means above the ellipsoid — and
carries a `<desc>` so two exports of one flight no longer disagree in silence.

### 9. A wrong number on the report, and it was a case mismatch (`7110307`)

Walk B's **GROUND TEMP 138 °F** on a PerfectFlite StratoLogger. The file says `58.7F` in every
cell; 58.7 read as Celsius is 137.66 °F. `unitFromCells` had been reading that `F` **correctly all
along** and resolving it to canonical `'f'`; `ColumnMapper.rowFor` then asked whether
`['C','F','K']` includes `'f'`, got false, and fell through to `options[0]`.

Temperature is the only role whose options are not already in canonical spelling, which is why
nothing else ever showed it — and why the fix is a shared `prefillUnit` rather than a re-spelling
of that one list. It also closes the compounding half (a saved template replays through the same
path), and fixing it turned up `setRole`, which threw the file's own unit away whenever a flyer
corrected a role by hand.

## Traps this run hit — read these before repeating them

- **Falsify by MUTATION, not by reading the code — it found a guard of mine that no test could
  reach.** Deleting the at-rest magnitude check from `longAxisFromRest` changed nothing: the
  per-sample run detection already rejects a window that is not at 1 g, and the case I had written
  to cover it was actually being caught by the 15° refusal. The guard's real job is a window rocking
  **symmetrically** about an axis — every sample a full 1 g, the average pointing straight but short.
  Four guards, four mutations, one hole.
- **A `p.sr-only[role="status"]` locator in an unrelated e2e was unique only by accident.** Giving
  every chart its own live region made it match five elements and turned a ground-track test red for
  no reason of its own. When you add a shared shape, grep the e2e suite for locators that select on
  that shape rather than on the surface.
- **The measured LONG AXIS is what makes the board's quaternion agree with its own tilt column.**
  Using the wrong axis gives 43°–89° mean error and looks like the whole approach is broken — which
  is what I concluded for half an hour. Two entirely separate channels pick the same axis; if a
  quaternion reading ever disagrees, suspect the axis before the quaternion.

- **The Bash working directory persists across calls, and a `cd` into the fixtures repo silently
  followed the next command.** `npx playwright test` then reported **"No tests found"**, which reads
  like a broken config and is a wrong cwd. Prefix or check `pwd`.
- **A comment that quotes the class it is removing puts the §9 count straight back.** Rewording a
  conversion's own explanation from `text-xs` to "caption size" moved `RecentFlights` from a
  reported 17/8 to the true 16/7. §9's greps read source, including prose — the repo already
  records `rounded` matching inside "G**rounded**".
- **`text-[11px]` → `text-xs` moves the inverted-file count the WRONG way while every glyph gets
  BIGGER.** `GroundTrack` went 4/4 → 7/4 that way. This is a fourth distinct mode for that metric,
  recorded in `lib/design-system.test.ts` beside the other three. Do not "fix" it by pushing
  captions to `text-sm`; they are what §3 says the caption size is FOR.
- **`ps -eo cmd` dumps the entire system prompt into context**, because the harness process carries
  it. Use `pgrep -af` with a narrow pattern, and note that `pgrep -f playwright` matches that
  process too.
- **The methods page has a compile-checked anchor list.** A new `<Method id="…">` fails
  `tsc --noEmit` until the id is added to `lib/methodIds.ts` — the guard working, not a build break.
- **A synthetic parser fixture is only proof that the parser agrees with the fixture.** Both
  roll-angle assertions run over the real corpus and compare the channel's extremes against the
  column read straight out of the file.

## The §9 counts

| count | start of run | end of run | target |
|---|---|---|---|
| `rounded-lg` | 0 | **0** | 0 — a guard, may never rise |
| off-scale spacing | 0 | **0** | 0 — a guard, may never rise |
| hand-rolled card treatments | 3 | **3** | 3 — a GUARD, may never rise |
| inverted-type files | 13 | **14** | not 0 — and see the trap above; this rise is three glyphs getting BIGGER |
| off-scale type sizes | 1 | **1** | floor 1 — the shared brand wordmark |
| files importing the primitives | 34 | **34** | most of the 46 |
| `Readout` adopters | 2 | **9** | — |
| `ErrorState` adopters | 2 | **2** | — |
| hand-rolled `<button>` outside `ui.tsx` | 29 | **29** | few |
| imperative focus moves outside `ui.tsx` | 6 | **0** | 0 — new assertion this run |

## A CI note worth having before you push

**`get_check_runs` on a pull request can report `in_progress` long after the run has finished, and
it did so for 40 minutes on 2026-08-02.** Pull request #92's `e2e` check read `in_progress` on
every poll while the run had in fact **completed successfully at 13:54:26, 5m36s after it
started** — normal, and the same duration as #91's. `list_workflow_runs` showed the truth
immediately; the per-PR check-run view was stale.

**This nearly became a wrong diagnosis in this very file.** The first version of this note said the
runner had stuck, and that was false. If a check seems hung, confirm against
`list_workflow_runs` (or the run's own `jobs` endpoint, which carries per-STEP timestamps) before
concluding anything — and before re-pushing to "supersede" a run that already passed. The local
reproduction that made the stall look impossible was itself sound and is worth keeping: `CI=1`
forces the same one worker and one retry CI uses, and the suite ran in **7.6 s for one spec and
3.8 min for all 254**.

**And check what the corpus step actually did.** `Fetch private fixtures corpus` reports success in
about 2 seconds, which is fast for a 26 MB release asset — the evidence that the corpus really ran
is the `Test` step's duration (1m56s on that run, against a corpus-less suite that is far quicker),
not the fetch step's exit code. If you need certainty, read the step's log rather than its
conclusion.

## Pick up first

1. **D8 slice 3 is measured and NOT shipped — read its ROADMAP entry before doing anything.** The
   arithmetic works: the Blue Raven's `Quat_1..4` is `(w, x, y, z)`, all four records open at
   quaternion identity with their tilt column at 0.00°, and tilt taken as the angle between the
   MEASURED long axis rotated by the quaternion and where it sat at rest reproduces the board's own
   `Tilt_Angle_(deg)` over the ascent to **0.64°, 1.28° and 1.96°** on three files. **`jan10` sits at
   22.72° and nothing explains it** — the obvious guard is refuted, since its gyros rail but so do
   all three of meraki's and meraki is the best of the four. Do not ship a tilt on three files out of
   four. What would unblock it: a fifth high-rate fixture, or an account of what `jan10`'s attitude
   solution was doing. **Scope any future attempt to the ASCENT**: over the whole record the two
   tumbling machbuster flights alias badly (54°–61°) while the stable two stay under 1.6°.

2. **The design-system audit ran for the first time and returned 40 rows.** `MAINTAINING.md` calls
   it "the audit that has never been run". Three are fixed; the rest are in `BACKLOG.md` with
   file:line. The two worth reading first are §2's colour-by-magnitude clause on `RecentFlights`
   (an **amber** ★ against an apogee, where §2 gives amber the meaning "caveat") and
   `CompareView`'s indigo crown — **and the audit overstated the second one**: it is only rows
   marked `rank: true`, with `rankBlocked` withholding the crown on a clipped peak, a floor apogee
   or a mixed source. The basis §2 asks for is there; the HUE is what is off.

3. **`Segmented`'s selected pill is `dark:bg-zinc-700`** (`ui.tsx`), off §2's three-surface ramp,
   and every adopter inherits it — the one place a drift cannot be contained.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed the same `DESIGN.md` §9 edits**, unchanged for six runs. Not
attempted — the session was created with `debrief` and `debrief-fixtures` only.

**Two `DESIGN.md` §5 edits still owed to both repos:** `Frame` is not listed in §5 though it has six
adopters, and the invented "indigo text" button weight survives at `RecentFlights.tsx:835`. A third:
§9's card grep is the only compliance command scoped to `components` alone.

## The fixtures repo

Nothing shipped there this run, and the situation is sharper than the last handoff recorded.
**`v1.0.0` and `v1.1.0` are the SAME COMMIT** (`c0cdd23`); `VERSION` reads `v1.0.0` at both tags and
at `HEAD`; and the attached checkout (`0e90bfd`) is **3 commits ahead** of the tag
`corpus.lock.json` pins. The diff is `.gitignore` plus **162 lines of `expected.json`** —
`maxVelocity` and `maxAccel` assertions that do not exist in the pinned release.

So the local corpus is a **strict superset** of the one gating CI: same files, more asserted. Cutting
a `v1.2.0` release and re-pinning is an **owner action** — the session's GitHub tools are read-only
for releases.

**Worth adding, each with a reason:** a SECOND genuinely staged record (still the highest-value
fixture this corpus could gain); a baro-less board's log (Altus Metrum EasyTimer — the field's
leader analyses these and Debrief refuses outright); a Blue Raven pair whose LR file carries a `Sync`
column; a descent-rate ground truth in a machine-readable column.

## Environment notes

- **Git identity defaults to the harness's**, which the zero-trace invariant forbids. Set it before
  the first commit: `git config user.name "Neer Patel"` /
  `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrives as an attached repo.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`. The full suite then reports **1,024+ tests across 70 files**; far fewer
  means it is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: `npx playwright install chromium` from the repo root** (~114 MB, about a minute,
  succeeds through the proxy), then plain `npx playwright test` with NO browser variable set. **This
  is paid again every session and belongs in the environment's setup script.**
- **4 CPUs**, so a workflow's concurrency cap is 2: a four-agent fan-out ran in two waves and took
  **~15 minutes**. Dispatch it and do the baseline gate while it runs.
- **The app clone is shallow**; the fixtures clone is NOT. Commit counts and history are a window in
  one and the record in the other.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on
  `pull_request`. Opening the PR is what runs it.
- **The full e2e suite is 250 tests and takes ~4 minutes.** The unit suite with the corpus linked is
  ~85 s. One gate at a time: a second `npm run build` deletes `out/` from under a running suite.
- **Check the deployed build with a cache-buster:**
  `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`.
