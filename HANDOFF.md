# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **Pending re-check at the time of writing.** Work lands on `claude/ultracode-maintenance-h5n564` (a harness-pinned branch name this run could not choose) and reaches production only through a pull request into `main`. Re-measure before believing any of it: `git fetch --prune origin`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Sev-1** | **None inherited.** The baseline gate was green before anything was touched — unit 1354/1354 with the corpus attached (9 committed fixtures, 50 corpus recordings), build clean, e2e 321 passed. |
| **D — capability** | **D10 slices 5f and 5g SHIPPED.** The comparison is now one table builder, and it no longer contradicts itself. `SINKS` **26 → 27**, `labelled` **11 → 12**, `todo` **10** (a new sink was found in the same breath as one was closed). |
| **P — product & craft** | **Not yet started this run at the time of this refresh.** The next P slice is scoped and measured — see *Pick this up first*. |

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

**The P-track slice, scoped and measured this run but not built.** `DESIGN.md` §9's compliance
block — the thing P1's *done when* is written against — has holes that were measured rather than
guessed:

- **§9's contrast block names two checks and NEITHER EXISTS.** `e2e/contrast.spec.ts` is not in the
  tree (`ls` says so), and no test titled *"class half of the dark variant"* exists anywhere
  (`grep -rn` over `lib/` and `e2e/` returns nothing). §9's own words: *"A compliance command that
  cannot fail is worse than none, because a session runs it, sees the target, and moves on."*
- **The inverted-type count never measures a ROUTE.** The ratchet reads `components` only. Adding
  `app/**/*.tsx` finds two real ones — `app/validation/page.tsx` (1/0) and `app/privacy/page.tsx`
  (4/3) — confirmed by re-running the loop this run, exactly as §9 predicted.
- **Two counts read COMMENTS as code.** `invertedTypeFiles` and `uiAdopters` both grep raw text.
  Live today: `components/ui.tsx:267-271` carries `text-sm` twice and `text-xs` once inside one
  docblock, and those count toward that file's totals.
- **Three ratchet regexes are narrower than §9's own greps** — radius names a single value where §9
  subtracts a sanctioned set, and spacing and type have no arbitrary-value (`[13px]`, `[0.9rem]`)
  branch. Note honestly: widening them moves **no count today** (measured: radius 0, spacing 0,
  type 1). It is a guard against the next drift, not a discovery, and should be reported as such.

**Then, in `BACKLOG.md` and ranked there:** the comparison's cross-check panel states an agreement
figure over a flight nobody flew, above the row that says so; the logbook's ★ *"Fastest"* ranks a
baro-derived peak against a device-measured one while the comparison refuses that exact crown by
name; and three of the report's jump chips scroll to sections that unmount, eleven lines under a
comment naming that pattern as the tell to avoid.

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
