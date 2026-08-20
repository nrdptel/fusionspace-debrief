# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | Measure it, do not read this line: `git fetch --prune origin && git log --oneline origin/main \| head -3`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Sev-1 inherited** | None. The baseline gate was green before anything was touched: unit **99 files / 1,491 tests WITH the corpus** (151 in `lib/parsers/corpus.test.ts`), build clean, e2e **365 passed**. |
| **Sev-1 found and FIXED** | **The rail-exit velocity was published on records that do not contain a rail — 6 of the 21 corpus flights that produced one.** Reproduced, fixed, pinned by four corpus asserts where rail exit previously had none. Numbers in `ROADMAP.md`'s Sev-1 section. |
| **D — capability** | D12 slices 2 and 4 shipped previously; slice 1 is refused twice and parked at the back. **Slice 5's shape is settled by measurement and it is NOT what `ROADMAP.md` says — read below before building it.** |
| **P — product & craft** | P1 audit row 13 SHIPPED — §2's `control` border reaches WCAG 1.4.11 in both themes, in BOTH repos. Rows 5, 7, 9, 10, 11, 14–21 remain open, four of them with line numbers this run re-measured. |

## The Sev-1, and why the HANDOFF that described it was wrong in a way that mattered

**A rail-exit velocity is a measurement of the rail, and on 6 of 21 flights there was no rail in the
record.** Five published a speed their own acceleration could not produce over 2.438 m from rest —
`kairos` 32.64 against 20.16, `intrepid2` 57.90 against 38.19, `jan18` 71.08 against 54.97, `sg1.2`
28.90 against 22.58, `jan10` 61.28 against 52.55. The sixth clears the whole rail inside ONE 0.300 s
sample and returns `velocity[liftoffIndex]` unchanged.

**The previous handoff called it "the integral starts at the detected liftoff sample rather than at
the pad". That is false for all three flights it named** — the accelerometer detector fired on each,
at the FIRST sample in the record above 2 g, so there is no earlier at-rest sample to move to. It
also under-counted: **5 flights break the bound, not 3.** The numbers it quoted were right to
0.1 m/s and the mechanism was not, which is the expensive kind of wrong: a fix written to it would
have missed two flights and repaired none.

**The transferable part is what was refused.** Two tells looked right and are not:

- **Re-anchoring at the pad** trapezoids straight across a 0.630 s and 0.570 s sampling hole that
  spans the whole rail phase, giving 7.28 and 8.17 m/s. It swaps a visibly impossible number for a
  plausible fabricated one.
- **Refusing when the anchor's ALTITUDE is past the rail** separates the corpus cleanly and is still
  wrong: `sg1.1-Booster` reads **3.45 m** at a moment its velocity says **1.12 m/s** — a rocket
  standing still under a noisy barometer. Near-pad altitude is the exact trace `lib/rail.ts`'s own
  header says is unusable.

What shipped instead is two guards with no tuned constant in either: the rail cleared inside the
first sample after the anchor, and a reading above `√(2·(a_peak − g)·L)` from the flight's own trace.

## D12 slice 5 — its shape is settled, and it is NOT the one in the roadmap

`ROADMAP.md` says the slice is `<sat>`, `<hdop>` and `<fix>` in the GPX plus KML `ExtendedData`.
**Measured this run, three of those four are wrong:**

- **`<fix>` must NOT be written.** GPX annotates it as what the RECEIVER reported. Debrief's own
  channel label on **25,391 of 27,624 points (91.9%)** is literally *"Fix (from satellite count)"* —
  a value it derived. Only 2,233 points (3 Featherweight files) carry a fix read off a real column.
  Writing a derived grade into the receiver's own field launders an inference into a schema slot, and
  it is unrecoverable once the file leaves the device.
- **`<fix>` would also be a constant** on 11 of 12 files: 27,240 of 27,624 points would write `3d`,
  and every one of the 384 two-dimensional points is ONE flight downloaded twice — both derived.
  None of the three committed fixtures reaches the state, so fork CI could not assert it.
- **The KML half needs a geometry rewrite.** Debrief writes ONE `<LineString>`; per-point quality
  needs `gx:Track` or N Placemarks, and `e2e/analyze.spec.ts:3128` and `lib/gps.test.ts:280` both
  assert an exact placemark count of 3.
- **`<hdop>` is the slice.** **22,199 of 27,624 kept positions (80.4%) across 5 corpus files carry a
  finite hdop, and it VARIES** — 0.70–3.10 on SG1.2, 0.80–2.30 on irec2023. The committed fixture
  `lib/parsers/__fixtures__/altusmetrum-telemetrum.csv` carries it on all 421 kept positions, so fork
  CI without the corpus exercises the new path. `components/GroundTrack.tsx:110` already declares
  `hdop?` and `FlightReport.tsx` already passes it, so no prop threading.
- **GPX 1.1 `wptType` child ORDER**, from the schema: `ele, time, magvar, geoidheight, name, cmt,
  desc, src, link, sym, type, fix, sat, hdop, vdop, pdop, ageofdgpsdata, dgpsid, extensions`. The
  `<wpt>` today ends at `<src>` (position 8) and hdop is 14, so new children append and nothing
  moves. **No test anywhere parses the GPX or KML as XML** — 0 hits for `DOMParser|fast-xml|xml2js|
  xmllint` — so the slice must bring its own order assertion.
- **`HANDOFF.md`'s own "25,471 trackpoints" was not reproducible**: it is **27,624**, and no subset
  of the 12 track-carrying files explains the difference. Its other two numbers reproduce exactly.

## D12's *done when* cannot be pinned as written, and that is one increment's work

It asks for "a check [that] enumerates those sinks from the same registry the exporters are
registered in". **The registry exists** — `KEPT_DOCUMENTS` at `lib/documents.ts:95`, six entries,
already enumerated by three test files — **but `lib/documents.ts:32` excludes `.gpx` and `.kml` by
name**, and measured across the tree there are **20 `download(` call sites in 10 files, of which 6
route through the registry and 14 do not.** Until the two track exports are in a registry the check
can only be a hand-kept list. Worth doing before the milestone's last slice, not after.

## P1 — what this run moved, and what the audit list still gets wrong

Row 13 shipped: `control` is `border-zinc-500` in both themes, in both repos. The transferable part
is not the value:

**Raising a resting border inverts everything that was tuned against the old one.** The first cut
looked at hovers and stopped; the pre-push review found the selected state had gone WEAKER than the
unselected one on three surfaces in both themes, `ChipButton`'s accent tone had never been converted
at all, one dark hover was left behind, `NumberField`'s refusal became a hue-only change, and one
input lost its focus indicator to the same arithmetic. Check states, not just hovers.

**And the census that was supposed to catch all of it had a hole**: it skipped `hairline`'s shades by
SHADE, so an operable control wearing a decorative shade was silently exempt, and it rated `zinc`
only. There are two censuses now — one over neutral borders, one starting from the TAG over every
operable element, every hue.

§9's counts are unmoved by any of it — radius **0** · card treatments **3** · off-scale spacing
**0** · half-steps **41** · off-scale type **1** · inverted files **10 of 51** · `./ui` adopters
**40 of 51** — because a border colour is on none of those greps.

## Environment, measured this run

- **Both repos attached**, plus the sibling `nrdptel/fusionspace-loft` added mid-run with `add_repo`
  and cloned to `/home/user/fusionspace-loft`, because `DESIGN.md` is binding in both and a change to
  one is a change to both in the same run. `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`
  and the corpus suite named its fixtures — **155 tests in `lib/parsers/corpus.test.ts`** after this
  run's four additions, 151 before.
- **`npx playwright install chromium` was needed again** (image ships 1194, this Playwright wants
  1228). It succeeds through the proxy in about a minute. Then plain `npx playwright test` with **no**
  browser variable set. **This is paid every session and belongs in the environment's setup script.**
- **Git identity arrived as the harness vendor's default** and was reset per-repo before the first
  commit, in BOTH repos.
- **The clone is SHALLOW**, so any commit count or file history is a window, not the record.
- CI fires on `pull_request` and on push to `main` — **not** on a push to a working branch. The
  `frontend` job takes ~4 min and `e2e` ~6 min.
- **The harness pinned a vendor-named branch and the owner explicitly authorised overriding it**, so
  work ships on `feature/…` branches, which is what the zero-trace invariant and the branch-naming
  rule both require.
- **The GitHub MCP server appends an attribution footer to a PR body** and the update path strips it —
  verified again on `#218`. Read every body back after posting.
- **Only ~2 subagents run concurrently here** (4 CPUs; the cap is `min(16, cpus − 2)`), so a nine-agent
  fan-out takes about 50 minutes. Dispatch it first and ship while it runs.
- **A gitignored `*.test.ts` probe still runs in `npm test`.** Two of them inflated the count to
  101 files / 1,497 tests; the honest number was 99 / 1,495. Delete probes before quoting a gate.

## Next, in order

1. **D12 slice 5 — the `<hdop>` half only**, scoped above with the numbers and the schema order.
   Bring an XML-order assertion; nothing in the repo parses either file as XML today.
2. **Put `.gpx` and `.kml` into a registry** so D12's *done when* becomes pinnable at all.
3. **The `padBaseline` finding in `BACKLOG.md`** is the strongest unreproduced Sev-1 candidate: a log
   starting mid-boost has an already-climbed altitude subtracted from every height, reported at
   **−39.5 m / −5.1%** on `the-gardener`. `padDataLikely` detects the condition and only warns, which
   is what decides its severity — reproduce before scoping.
4. **P1 rows 16 and 9** — three hand-rolled text inputs in three geometries, and fifteen touch floors
   keyed to viewport width rather than pointer type (the audit row names four of the fifteen).
