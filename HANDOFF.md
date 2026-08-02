# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D8 slice 2 STARTED.** Looking for the milestone's own subject (the high-rate gyro/quaternion columns) meant reading the LOW-rate headers, which turned up a roll angle the Blue Raven had already solved and Debrief parsed straight past — and, on the generic importer's path, `Roll_Angle_(deg)` being auto-detected as a roll **RATE**, with a test asserting that was correct. `rollAngle` is its own kind now. **The rest of slice 2 remains**: `ChannelKind` members, units and provenance for the HR `Gyro_*` / `Accel_*` / `Quat_*` channels, which arrive labelled but as `kind: 'other'`. |
| **P — product & craft** | **P1: two more §5 primitives are doing their job.** `useReturnFocus` exists (§5 named it; nothing implemented it) and the two destructive confirms share it. `Readout` went **2 → 9 adopters** — the seven derived-reading panels were hand-rolling a byte-identical hero value. Items **7** (29 hand-rolled `<button>`), item 4's keyboard clause, and the design-system audit's other 30-odd rows remain. |

**Five increments are MERGED AND LIVE**; four more are on the branch in pull request #92. Pull request #91 merged on green (`frontend` and `e2e` both succeeded) and production was
verified serving exactly `c86695c` at 13:07Z. The branch was restarted from `main` after the merge,
as the harness requires.

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

## Traps this run hit — read these before repeating them

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

**The `e2e` job can stick.** On 2026-08-02 pull request #92's `e2e` job sat in its test step for
**40+ minutes with no step progress** while `frontend` finished in 2m56s, and the same suite under
CI's own settings (`CI=1`, which forces one worker and one retry) ran locally in **7.6 s for the
spec in question and 3.8 min for all 254**. It was the runner, not the code. Re-pushing to the
branch supersedes a stuck run with a fresh one; do that rather than reading a stall as a red gate.

**And check what the corpus step actually did.** `Fetch private fixtures corpus` reports success in
about 2 seconds, which is fast for a 26 MB release asset — the evidence that the corpus really ran
is the `Test` step's duration (1m56s on that run, against a corpus-less suite that is far quicker),
not the fetch step's exit code. If you need certainty, read the step's log rather than its
conclusion.

## Pick up first

1. **The rest of D8 slice 2**, and a verified fact reopens the question slice 1 closed. The HR
   channels arrive labelled (`Gyro X`, `Accel Z`, `Quat 1`) but as `kind: 'other'`, so they are
   invisible to `getChannel`, to the analysis and to every kind-keyed surface. Slice 1 refused to
   map any axis to `accelAxial`/`rollRate` because the mounting is unknowable. **For this board it
   is knowable and the board has already done it**: the vendor manual states *"The Blue Raven can be
   mounted in any orientation, and so it measures which direction, relative to its sensors, is the
   rocket axis by measuring the direction of the initial motion while the rocket is on the rail."*
   See `COMPETITION.md` row 25.

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
