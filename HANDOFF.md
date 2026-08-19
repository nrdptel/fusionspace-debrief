# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | Measure it, do not read this line: `git fetch --prune origin && git log --oneline origin/main \| head -3`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Sev-1 inherited** | **The max-Q one is FIXED** — see below. The baseline gate was green before anything was touched: unit **98 files / 1,485 tests WITH the corpus**, and no open pull requests on either repo. |
| **Sev-1 found** | **The rail-exit integral starts at the DETECTED LIFTOFF SAMPLE rather than at the pad — REPRODUCED, and the sweep's own framing of it was wrong.** Three corpus flights report a rail-exit speed their own measured acceleration cannot produce over 2.438 m: `intrepid2` 57.9 m/s against a 38.8 m/s bound, `kairos` 32.6 against 21.3, `sg1.2` 28.9 against 23.6. The sweep's "up to 4.5× high / suppresses the caution on 3 of 21" is an ARTEFACT of comparing against an integral anchored at the record's first sample, which pad noise eats — that comparison makes `kairos` a 1.1 g rail exit, i.e. a rocket that cannot lift off. Full numbers and the trap are in `BACKLOG.md`. |
| **D — capability** | D12 slices 2 and 4 shipped previously. **Slice 3's stated model is REFUTED — read the entry below before building it.** Slice 5 is scoped in detail below. |
| **P — product & craft** | P1 is IN PROGRESS. The largest measured divergence is not on its audit list: **seven hand-rolled `<select>` in five geometries across four flyer-facing surfaces, and `DESIGN.md` §5 has no word for a select at all.** |

## The Sev-1 that was inherited, and why the THIRD attempt was the small one

**Max-Q is `½ρv²`, so the height the air was read at is half the reading** — and the atmosphere was
built from the raw barometric trace hundreds of lines before the ascent bounds existed. The analysis
held two heights for one instant. On `f1machbuster-jan10`: **482.5 m printed, −93.5 m read**.

Two earlier attempts were built and refused by the corpus. Both aimed at the peak SAMPLE. The
distinction they missed, and the transferable part: **the trace is smoothly wrong, not spikily
wrong**, so withholding on the peak sample just watches the peak migrate one sample sideways to a
neighbour the bands do not catch — where the stated height was 11.4 m on a rocket doing Mach 1.9.
Fixing the *cause* — read the air at the height the analysis will state — is smaller than any of the
guards, and it needed no new withholding at all.

**Exactly 4 of 39 analysed flights move, one metric each, and the error runs BOTH ways.** That
last part is what makes it a correction rather than a tuning: `jan18`'s barometer over-reads, so its
air was too THIN and its load case went **up** 83.8 → 89.0 kPa, while `jan10` went down 254.3 →
240.9 and the two irec2023 recordings down 212.5 → 206.7 and 205.1 → 199.8.

## The technique that made the blast radius provable, and it is worth reusing

The corpus digest snapshot says a flight "analyses differently" and nothing more, so **8 flights
moved and 4 readings did** — with no way to tell which was which. Hashing **each digest component
separately** (metrics, events, warnings, and every series key on its own) before and after, across
all 50 analysable flights, turned that into: 4 flights moved `metrics`, 4 moved only
`airDensity`/`speedOfSoundProfile`, and **no event, no warning and no other series moved anywhere**.

That is a ten-minute probe and it is the difference between regenerating a snapshot on faith and
knowing what is in it. Any change to the analysis core should do this before touching
`corpus-digests.json`.

## Two things measured and REFUSED this run, with the numbers, so they are not re-derived

- **The GPS altitude is not a usable cross-source floor**, which is what `BACKLOG.md` had proposed.
  A recording earns the right to stand in for another only where the two agree on the stretch the
  first is sound. Median gap against its own barometer over the uncontradicted ascent: **174.8 m on
  `endurance` (band 85 m), 105.3 m on `intrepid2` (32), 235.9 m on `sg1.2` (63), 572.6 m on `sg1.1`
  (30), 560.8 m over 3,488 samples on `irec_2023_telemega` (250)** — whose GPS also puts apogee at
  8,854 m against its barometer's 8,317 m. The only two that agree (`kairos`, both exports) have no
  contradicted ascent sample to place. **It was implemented before it was refused, and the corpus
  caught the consequence**: with the running-maximum floor switched off for a cross-source
  candidate, five burnout heights read 0, 9, 6, 456 and 579 m against barometric 488, 103, 360,
  1,012 and 1,536 — a lagging receiver replacing a sound barometer.
- **An agreement gate for that is written down and NOT shipped**, because measured today it fires on
  zero real files. Both decisions are in `ROADMAP.md` under *Decisions taken without the owner*.

## D12 slice 3 — its stated model is REFUTED. Read this before building it.

`ROADMAP.md` says the Featherweight `>40`/`>32`/`>24` dB-Hz columns are "three disjoint bands
summing to at most the tracked total". **That is true of the jan10 corpus log and FALSE of this
repo's own committed fixture**, where the same three headers are *cumulative thresholds*:
`>40 <= >32 <= >24 <= #SATS` on 490/490 rows, sum > #SATS on 478/490, and `>32` exceeds `>24` on 0
(against 127 on jan10). Two firmware generations share identical headers — 2021 tracker exports are
cumulative, 2025/2026 tracker and ground-station exports are disjoint.

This matters more than it looks: the cumulative file is the **committed fixture**, which is the only
Featherweight bin file fork CI sees without the corpus. Shipping the disjoint model publishes a
wrong breakdown there and the gate goes green on it.

**The smallest safe slice is the `>40` bin alone** — it means the same thing under both conventions
(the vendor's Blue "full accuracy available" band) and is a real diagnostic: it reads 0 on 383 of
`lemiv`'s 404 rows. Also measured: the bin columns are **never tokenised** in either parser variant
(not parse-and-drop, unlike slice 2's DOP columns), and the ground station carries **held-over bins
on no-fix rows** — 14 of 14 rows where the bins exceed `#TOT` are `FIX == 0`, the same defect shape
slice 2 fixed for DOP. Never reuse the `satellites` kind; `lib/flight/types.ts:37-40` already
records why.

## D12 slice 5 — scoped, and its KML half is a wrong premise

`trackGpx` emits `<trkpt lat lon/>` self-closing with zero children; the landing `<wpt>` carries only
`<name>` and `<src>`. **25,471 corpus trackpoints would gain a `<fix>`, 22,199 an hdop/vdop, and 384
points across two files are 2D** — the ones the field exists for.

- **GPX 1.1 `wptType` child ORDER** (from the published schema): `ele, time, magvar, geoidheight,
  name, cmt, desc, src, link, sym, type, fix, sat, hdop, vdop, pdop, ageofdgpsdata, dgpsid,
  extensions`. New children land AFTER `<src>`. `trkpt` uses the same type.
- **`<fix>` is enumerated `none|2d|3d|dgps|pps`** and Debrief's `FixGrade` maps directly — but
  `gradeFromSatellites` and `gradeFromFixColumn` both return `'3d'` when the file says NOTHING, so
  write nothing where `gradeFromValue` returns null. A defaulted `3d` is an invented quality claim.
- **The three Featherweight GPS files carry NO `satellites` channel** — their column is "Satellites
  tracked", deliberately kind `other`. A `/sat/i` fallback would publish 16–19 satellites on rows
  the receiver called no fix.
- **KML per-point ExtendedData does not exist for the geometry Debrief writes** (one `LineString`).
  It needs `gx:Track` — a geometry rewrite — or N Placemarks, which breaks
  `e2e/analyze.spec.ts:3128`'s exact count of 3. **GPX-only is the slice; say why in the commit.**
- **No test anywhere parses the GPX or KML as XML** (`DOMParser|fast-xml|xml2js|xmllint` → 0 hits),
  so the slice must bring its own order assertion. Keep the no-quality path byte-identical and
  `lib/gps.test.ts:69,97` stay green.

## P1 — the audit list is stale in three places, all measured this run

§9 itself is honest: radius 0 · card treatments 3 · off-scale spacing 0 · half-steps 41 · off-scale
type 1 · inverted files 10 of 51 · `./ui` adopters 40 of 51 — every number matches what `ROADMAP.md`
records. Everything below is drift the ratchet structurally cannot see.

- **Row 10 is overstated**: `CompareView`'s transposed table now sorts, and two of the remaining
  three would REGRESS if converted.
- **Row 11's prescribed primitive is refuted** by the code; its real defect is a **sixth chip
  geometry at `py-0.5`**, which the row does not name.
- **Four of the five open rows have moved line numbers.**
- **The largest divergence is not on the list at all**: seven hand-rolled `<select>` across five
  geometries on four flyer-facing surfaces. `DESIGN.md` §5 has no word for a select, so this is a
  vocabulary gap before it is a conversion — the same shape that produced `Popover`.

## Environment, measured this run

- **Both repos attached.** `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__` and the
  corpus suite named its fixtures — **151 tests in `lib/parsers/corpus.test.ts` alone**.
- **`npx playwright install chromium` was needed again** (image ships 1194, this Playwright wants
  1228). It succeeds through the proxy in about a minute. Then plain `npx playwright test` with
  **no** browser variable set. This is paid every session and belongs in the environment's setup
  script — saying so is the fix.
- **Git identity arrived as the harness vendor's default** and was reset per-repo before the first
  commit, in BOTH repos.
- **The clone is SHALLOW**, so any commit count or file history is a window, not the record.
- CI fires on `pull_request` and on push to `main` — **not** on a push to a working branch.
- **The harness pinned a vendor-named branch.** The owner explicitly authorised overriding it, so
  work ships on `feature/…` branches, which is what `MAINTAINING.md`'s zero-trace invariant and its
  branch-naming rule both require.

## Next, in order

1. **Verify the rail-exit claim.** It is the only Sev-1 candidate outstanding and it is a
   launch-safety reading. `lib/rail.ts:63` integrates from `liftoffIndex + 1`; the fallback detector
   fires at 3 m, which is longer than a 2.438 m rail. Reproduce it on the corpus before scoping —
   the accelerometer-based detector fires at ignition and may make the fallback path rare.
2. **P1 — the `<select>` vocabulary gap.** `DESIGN.md` moves first, then the component, then the
   seven call sites. This is the biggest single thing a flyer meets that the design system has no
   answer for.
3. **D12 slice 5** — the GPX quality fields, scoped above.
4. **D12 slice 3** — the `>40` bin, and correct the milestone's refuted model in the same commit.
