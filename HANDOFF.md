# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **FOUR commits, one pull request — `#177`.** `84874ac` (D10 5f), `39c791e` (D10 5g), `de47580` (P1 contrast), `906fb36` (D10 5h + the CI fix). Re-measure before believing any of it: `git fetch --prune origin`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. Production was serving `a66676b` when this run started, which was `origin/main` exactly. |
| **Sev-1** | **None inherited.** The baseline gate was green before anything was touched — unit 1354/1354 with the corpus attached (9 committed fixtures, 50 corpus recordings), build clean, e2e 321 passed. |
| **D — capability** | **D10 slices 5f, 5g, 5h SHIPPED.** The comparison is one table builder, it no longer crowns a flight nobody flew, and it no longer claims two recordings agree when one of them is made up. `SINKS` **26 → 27** (a sink was found in the same breath as one was closed), `labelled` **11 → 12**, `todo` **10**. |
| **P — product & craft** | **P1: every ENABLED grey in `components` and `app` clears WCAG AA in both themes**, held by a check that did not exist — §9 had been naming two commands that were fiction. §2's `tertiary` token was the defect: symmetric across two asymmetric surfaces, 4.12:1 and 3.67:1 in dark. |

## The corpus sweep, stated plainly

**Ran, and found nothing.** `lib/parsers/corpus.test.ts` names its own count — **9 committed fixtures
and 50 corpus recordings** — and the full unit suite finished **1366 passed across 91 files** with it
attached. An empty sweep is a result, not a stop condition; the number is here so the next session
can tell it apart from a suite that skipped itself.

## The one thing to read before anything else

**The pre-push review earned its place again, and this time it found the defect one level ABOVE
everything the slice had touched.** Slice 5f made `compareTableRows()` the single builder that
decides which rows a comparison has, and every renderer read it. The review pointed out that a
builder can only label what its INPUT told it — and there are **two routes into a comparison**.
`lib/compareFromLogbook.ts` set `synthetic` on each `CompareInput`; `components/Analyzer.tsx`, the
DROP route, did not. A made-up flight dropped alongside real ones would have reached all five
surfaces bare no matter how careful the row assembly was.

It is pinned by a **discovered** check rather than a typed list — `lib/synthetic.test.ts` →
*"every route into a comparison carries whether the flight was made up"* walks `lib/` and
`components/` for `buildComparison(` callers — because the failure it exists to prevent is a THIRD
route. It strips comments before matching, because the paragraph documenting the rule names the
very symbols the rule looks for, and a file-wide grep would have passed on the file that documents
the violation.

**Then the same review found that the slice had made an OLDER defect legible rather than causing
it.** Putting the provenance row on screen meant the table now said *"made up by Debrief, not
flown"* two rows above a ★ titled *"Highest of the flights being compared"*, with the same cell
bolded in the `.md` and `class="best"` in the `.html`. That became slice 5g.

## Four things this run learned the hard way

1. **A `next build` that dies inside `bundle5.js` is a poisoned `.next` cache, not your code.**
   `TypeError: Cannot read properties of undefined (reading 'length')` at
   `WasmHash._updateWithBuffer`. It cost real time because `prebuild` had already passed — so
   `tsc --noEmit` was green and the log opened with a version stamp — and because it dumps **2.2 MB
   of minified webpack source** into the log, so `tail` and any naive grep land in vendor code. It
   is **not** a flake: it reproduced on two consecutive builds whose immediate predecessor was
   green, which reads exactly like "my last change broke the build". Disk was 29 GB free.
   `rm -rf .next` fixes it in one go. Now written into `MAINTAINING.md`.
2. **And a red build silently poisons the e2e run after it**, because `npm run test:e2e` serves
   `out/`. The suite then reports a failure in whatever you changed last, against a stale export.
   Check the build's rc before reading a single e2e failure.
3. **An e2e assertion that pins a POSITION in the comparison table is wrong.** The column order
   follows the logbook, not the order files were opened in, so `.first()` pinned whichever flight
   happened to sort first — the walk went red against a table that was labelling perfectly. Count
   the cells that carry the claim instead. Each cell also carries the phone layout's `aria-hidden`
   column label, so it is `hasText`, never `toHaveText`.
4. **`e2e/units.spec.ts`'s sample wait sat inside the default 5 s timeout.** Measured 5.6 s
   standalone; it went red once in a full parallel run and passed alone immediately after. Every
   other spec that waits on an analysis already names 60 s. Fixed, and it is the signature to
   recognise: one failure in a full suite that passes in isolation is a clock, not a defect.

## Pick this up first

**The D-track continues inside D10**, whose remaining `todo` sinks are listed in `ROADMAP.md` with
the code that has to change. The next one is the cheapest and closes two rows at once: both
`exploreCsv` call sites — the explorer's `<flight>-explore.csv` and the comparison's
`compare-data.csv` — want the claim threaded the same way, and neither receives a flight today.

**The P-track's next slice is named by the check this run wrote.** `DESIGN.md` §9 now records two
gaps in its REACH, both measured and neither closed:

- **`lib/report.ts` writes the exported HTML report's palette as literal hex, and two rules are
  sub-AA** — `thead th #71717a` on `body #f4f4f5` is **4.40:1**, `footer a #6366f1` is **4.47:1**.
  That document goes in a cert package, so it is read by people who never open the app. The source
  check cannot see it: not a Tailwind class, not under `components`/`app`.
- **Only the zinc ramp is rated**, so the logbook's enabled `text-indigo-500` note button at
  **4.47:1** is invisible to it.

Both want the RENDERED check §9 describes and nobody has written — rasterising computed colours onto
a 1×1 canvas rather than parsing them, since Chromium reports `lab()`/`oklab()`. That one check
covers hand-written CSS and non-zinc hues at once, where enumerating palettes will not.

**Then, in `BACKLOG.md` and ranked there**, three verified findings this run did not take:

1. **The logbook's ★ *"Fastest of your remembered flights"* ranks a baro-DERIVED peak against a
   device-MEASURED one** (`lib/logbook.ts:119`), which `compareMetricRows` refuses by name one file
   over with the reason written down. Not a withheld-figure leak — `lib/recents.ts:574` stores
   `null` for a non-finite peak. The larger half is that `RecentFlights.tsx:898` prints the peak
   BARE beside an apogee that carries its qualifier, and fixing that needs a `maxVelocitySource` on
   `RecentMeta`.
2. **Three of the report's jump chips scroll to sections that unmount** — `Timeline` and `Explore`
   are listed unconditionally and `Recovery` is guarded more weakly than `GroundTrack` unmounts —
   eleven lines under a comment naming that exact pattern as the tell to avoid. One predicate per
   section, shared by the chip and the section.
3. **`Readout`'s label wears `tertiary` for a role §2 assigns to `secondary`** (`ui.tsx:1374`),
   found by a verifier REFUTING a filed finding rather than confirming one. One line, AA-passing
   already, so it is role consistency rather than legibility.

## What a fifth thing to know looks like

**Two of this run's own findings were REFUTED by the adversarial verify pass, and acting on the
unrefuted form would have been wrong.** A reviewer filed that the metric grid's `?` now
out-contrasts the label it annotates; the verifier showed §2 assigns *"labels … help"* to ONE role,
so sharing a token is the specification, and that the real deviation is in the label. Another filed
that lifting the greys inverted the logbook's amber warning; the verifier showed that is true in
LIGHT only — in dark, amber-400 (11.92:1) leads zinc-400 (7.76:1) whichever value the neutral takes.
The docs were corrected to say "in light". **Send findings to be refuted, not confirmed.**

## The corpus

Attached as a second repository and symlinked, which is the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the
suite's own count — it names **9 committed fixtures and 50 corpus recordings**. A run that cannot
say those numbers did not have a corpus.

## Environment

`npx playwright install chromium` is needed every session: the image ships chromium-1194 and this
Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on purpose. It succeeds
through the proxy in about a minute. Do **not** set `PLAYWRIGHT_CHROMIUM_PATH` afterwards — plain
`npx playwright test` is what runs green. This is the standing candidate for the environment's
setup script.
