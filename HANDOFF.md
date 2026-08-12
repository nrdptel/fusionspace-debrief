# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **TWO squashed commits, both merged and LIVE** — `f6ce4db` (PR #179, D10 slice 5i + a Sev-1) and `1537fa2` (PR #180, P1's contrast slice). Re-measure before believing it: `git fetch --prune origin`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"` — it read `1537fa2`, which was `origin/main` exactly, so the gap was zero. Production was serving `cc48363` when this run started. |
| **Pending on the branch** | **D10 slice 5j** (PR #181), gated green locally at the time this was written. |
| **Sev-1** | **One INHERITED, found by the opening sweep and fixed in `f6ce4db`** — see below. The baseline gate itself was green before anything was touched: unit 1354→1366 with the corpus attached, build clean, e2e 323. |
| **D — capability** | **D10 slices 5i and 5j.** The channel explorer's four data exports carry the made-up claim, then the plot figures and both `.zip` bundles. `SINKS` **27 → 28**, `labelled` **12 → 18**, `todo` **10 → 5**. |
| **P — product & craft** | **P1: both of `DESIGN.md` §9's recorded REACH gaps CLOSED** — the exported report's hand-written palette, and a census that rated only zinc. Three of §2's four semantic tokens turned out to be sub-AA as text; §2 moved with the sites. |

## The corpus sweep, stated plainly

**Ran, and found nothing.** `lib/parsers/corpus.test.ts` names its own count — **9 committed
fixtures and 50 corpus recordings** — and the full unit suite finished **1376 passed across 91
files** with it attached. An empty sweep is a result; the number is here so the next session can
tell it apart from a suite that skipped itself. CI's `frontend` job ran the same suite plus the
116-test corpus half and was green on `f6ce4db`.

## The one thing to read before anything else

**The pre-push review found, in the very panel the D-track slice had just finished, a FOURTH export
that the sink audit had never enumerated** — while the slice had written, four lines away, that the
claim "rides on every column this panel writes out". `ChannelExplorer`'s *"Copy these stats"* puts
min/max/mean/Δ/rate per channel on the clipboard, and the comment above it calls those *"the numbers
a cert document quotes"*. Unwire it and the new walk prints `Altitude (AGL)  ft  -8  5,459  3,574`
going out bare.

**The lesson is the audit's, not the code's: a sink row named after one EXPORT cannot stand in for
the other exports of the same component** — which is verbatim the correction that table recorded on
2026-08-11 about a row named after a component. The `todo` count went 10 → 7 while `SINKS.length`
went 27 → 28. **A `todo` count is a floor.**

## The Sev-1, and why the refutations mattered as much as the confirmation

`crossCheck` excludes made-up flights. `recoveryDisagreement` — same panel, same list — did not, so
a demonstration counted as a recording that *"resolved a deployment"* and two real recordings that
AGREE could be told they differ about the flyer's own recovery system. Fixed in `lib/compare.ts`,
filtering internally where a second caller cannot reintroduce it, alongside `statedDaySplit` and
`undatedNote` (whose count parameter is now the flight array, because the count shape is what had
all three callers passing the wrong number from one line each).

**Two other Sev-1 candidates from the same sweep did NOT survive**, and both refutations are in
`BACKLOG.md` at their true severity:

- the recordings strip printing a bare apogee — refuted 3/3, because `RecordingPicker.tsx:88` already
  withholds every figure for the recording you are *reading*. What survives is the SIBLING rows.
- the logbook ✕ as a one-way door — refuted 2/3: the column mapping survives in `localStorage` and
  auto-reapplies, the caption survives, the grouping is re-read from the file text. Only the typed
  note is lost.

**Send findings to be refuted, not confirmed.** Three of this run's own conclusions were overturned
that way, and one of them was the headline number of the P-track slice.

## The pattern this run kept hitting, and it is the most useful thing here

**Every one of the three pre-push reviews rejected work that the full gate had passed**, and in two
cases the reason was that the check itself could not fail:

- slice 5i's SINKS rows pointed at unit tests of the *writer*; delete the button's wiring and the
  named check stayed green.
- slice 5j's geometry assertion compared the band's own rect in one figure against the plot frame in
  the other, so it asserted only "a band was drawn". **Three independent lenses each built the
  mutant and showed it passing**, and two SINKS rows cited that string as their evidence.
- the P-track census was extended to new hues and *narrowed* in the same edit; the counter that
  should have seen it did not move, because the new rating replaced the old one for one.

The gate going green is not evidence a check works. **Build the mutant.** Every assertion this run
shipped was falsified by breaking the thing it names and watching it go red for the right reason —
and that is the step that found all three.

## Four things this run learned the hard way

1. **This repo ships Tailwind 4, and every palette table in it was Tailwind 3.** `lib/design-system.test.ts`'s
   `ZINC` map, and the hue ramps first written this run, were v3 hex; the app renders `oklch()`.
   zinc agrees between the two to about a unit per channel — which is why that map has been quietly
   correct for months, and exactly why extending to other hues is what exposed it. On indigo the
   difference **decides an AA verdict**: §9 recorded `indigo-500` at "4.47:1, three hundredths under
   AA" and v4's renders **4.58:1, passing**. The ramps are rasterised from the built stylesheet's
   own `oklch()` onto a 1×1 canvas now. Do not hand-edit an entry; re-measure.
2. **Widening a check can NARROW it, silently.** Adding hues to the contrast census made the
   per-literal match take an indigo where it used to take a zinc, and **eight sites lost their grey
   rating** with the `rated` counter unmoved, because the new rating replaced the old one for one.
   Every ramp has a floor of its own now. Reverting to zinc-only had left `rated` at 359 against a
   `> 60` assertion — and green.
3. **The rendered contrast check §9 asks for already existed; nobody had opened the FILE.** axe's
   `color-contrast` is inside the `wcag2aa` tag every audit in `e2e/a11y.spec.ts` already ran, with
   no rule disabled. Six e2e sites download the exported HTML report and every one asserts the
   filename and discards the bytes. `dl.saveAs()` with a real `.html` name plus
   `page.goto('file://…')` is the whole check. **Save it with an extension** — the raw download path
   has none, and Chromium then offers it as a download instead of rendering, so the audit "passes"
   over an empty page.
4. **A `<` is not always a tag opener.** The census scanned every `<`, and `Math.abs(v) < 100` opened
   a "tag" it ran forward through real JSX, fabricating two failures at 1.77:1 and 2.34:1 on text
   that renders above 7:1 and 5:1. It had never fired only because that span happened to contain no
   `text-zinc-`. Fixed at the scanner, not exempted.

## Two clocks, fixed rather than re-diagnosed

Both were pre-existing and both read as a broken tree. `lib/canonical.test.ts`'s corpus round-trip
ran **29,814 ms against `vitest.config.ts`'s 30,000 ms** and went red at 31,890 ms under load — that
config's own reasoning ("30 s is ~12× the slowest test that runs on this default") had been overtaken
by the corpus growing. `e2e/audit3.spec.ts` waited on a whole analysis at Playwright's **5 s** default
where every sibling spec names 20–60 s. Both now name a timeout.

**One or two failures in a full run that pass in isolation is a clock, not a defect.** Check what
else is running before reading a line of the diff — a review workflow with three agents is enough
load to do it, and a vitest run under that also emitted `[vitest-worker]: Timeout calling
"onTaskUpdate"` twice and exited 1 with all 1,381 tests passing.

## Pick this up first

**The P-track's next slice is named by §9's own new limits section**, and it is cheaper than it
looks: **grow the RENDERED check to the app's own routes in the states nothing audits today** — an
unmapped column, a marginal rail exit, an undetected liftoff, a flight with a note. axe is already
reaching for those rules; what is missing is a walk that reaches the STATE. That also routes around
every limit the source census still has, and they are listed in §9: ancestor fills, the `/NN`
opacity suffix, variant-prefixed states (`hover:` — five links carried the failing value one
pointer-move away and were found by hand, not by check), and the largest one, **the `ui.tsx` tone
TABLES are not read at all** because `CARD_TONES` / `CHIP_TONES` / `NOTICE_TONES` are `const` object
literals rather than opening tags. §5 is where the hue vocabulary is supposed to live, and the
census cannot see it.

**The D-track continues inside D10**, whose FIVE remaining `todo` sinks are listed in `ROADMAP.md`
with the code that has to change: `/stitch`'s timeline clipboard table (wants `PROVENANCE_COLUMN`
from `lib/logbook.ts`, not a second answer), `.gpx` and `.kml` (both named in D10's own *done when*;
`trackGpx` already writes a `<desc>` a sentence can ride in and `trackKml` has two `<name>` slots),
the landing-coordinate copy, and the share link — where the behaviour is already right and only the
assertion is missing.

**Then (c): offer the mapper sample.** The generated file has been written and tested since
2026-08-09 and is held back, not missing. Note the trap recorded in `ROADMAP.md`:
`lib/samples.test.ts` asserts every single-file sample auto-detects as a flight, which a mapper
sample cannot do by definition — that needs a second KIND, not a loosened assertion.

**Then, in `BACKLOG.md` and ranked there**, four verified findings this run filed and did not take,
newest first: `recoveryDisagreement` is on the SCREEN only, so the saved `.md`/`.html`/`.json`
comparison is silent about a recovery split the panel calls out; the recordings strip's bare sibling
figures; the logbook ✕'s note loss; and `lib/composite.ts:148`'s transitive simultaneity grouping,
which can print `/stitch` marks out of time order.

## The corpus

Attached as a second repository and symlinked, which is the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the suite's
own count — **9 committed fixtures and 50 corpus recordings**. A run that cannot say those numbers
did not have a corpus.

## Environment

`npx playwright install chromium` is needed every session: the image ships chromium-1194 and this
Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on purpose. It succeeds
through the proxy in about a minute. Do **not** set `PLAYWRIGHT_CHROMIUM_PATH` afterwards — plain
`npx playwright test` is what runs green. **`node_modules` also arrives empty**, so `npm install`
is the first command of the run, not an assumption. Both are standing candidates for the
environment's setup script; paying for them every session is the only reason they are here.

The git identity arrives as the harness vendor's default and must be set per-repo before the first
commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. The harness also appends an
attribution footer to a pull request body after posting; read the body back and strip it.
