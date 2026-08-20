# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | Measure it, do not read this line: `git fetch --prune origin && git log --oneline origin/main \| head -3`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. At the end of this run both said **`edbb66c`** — four merged pull requests, zero gap. |
| **Sev-1 inherited** | None. The baseline gate was green before anything was touched: unit **99 files / 1,491 tests WITH the corpus** (151 in `lib/parsers/corpus.test.ts`), build clean, e2e **365 passed**. |
| **Sev-1 fixed** | **Rail-exit velocity was published on records that do not contain a rail — 6 of the 21 corpus flights that produced one.** `#219`. |
| **Sev-1 found, REPRODUCED, and NOT fixed** | **A log that starts mid-boost has an already-climbed altitude subtracted from every height, apogee included — up to −4.6% against the file's own ground truth.** The obvious fix was written and the corpus refused it. Full numbers and the refutation are in `BACKLOG.md`; read them before scoping. |
| **D — capability** | D12 slices 2, 4 and **5** shipped. Slice 1 refused twice, parked. Slice 3 next, and its roadmap model is wrong — the correction is under it. **The *done when* is not pinnable yet**; see below. |
| **P — product & craft** | P1 audit rows **13** and **9** shipped this run, on top of 12 and 8. Rows 5(part), 7, 10, 11, 14–21 open. |

## What shipped, in order

1. **`#218` — §2's `control` border reaches WCAG 1.4.11, in BOTH repos.** It rendered **1.48:1** light
   and **1.70:1** dark against the 3:1 a control boundary owes, on every input, select and secondary
   button. `zinc-500` is the first value on the ramp clearing both.
2. **`#219` — the rail-exit Sev-1.** Two guards, neither with a tuned constant.
3. **`#220` — D12 slice 5**: `<sat>` and `<hdop>` in the GPX, in schema order, and deliberately no
   `<fix>`.
4. **`#221` — P1 audit row 9**: eleven touch floors moved from a viewport query to a pointer query.
5. **Sibling `fusionspace-loft#197`** — the same `DESIGN.md` §2 change plus its seven control sites,
   because that file is binding in both and a change to one is a change to both in the same run.

## The four things this run learned that cost the most to learn

**1. Raising a resting value inverts everything that was tuned against the old one.** The border
change looked at hovers and stopped. A pre-push review found the SELECTED state had gone *weaker*
than the unselected one on three surfaces in both themes, `ChipButton`'s accent tone had never been
converted at all, one dark hover was left behind, `NumberField`'s refusal became a hue-only change,
and one input lost its focus indicator to the same arithmetic. **Check states, not just hovers.**

**2. A census that skips by VALUE hides an element that wears the wrong value.** The first border
census skipped `hairline`'s shades by shade, so an operable control wearing a decorative shade was
silently exempt — which is `SectionNav`'s jump chip at 1.22:1 — and it rated `zinc` only, so a hued
control border was invisible. There are two censuses now, and the second starts from the TAG.

**3. Narrowing a desktop browser is not a phone.** `e2e/analyze.spec.ts`'s two-altimeter walk
measured the 44 px floor with a comment saying that floor *"comes from a `pointer: coarse` rule"* —
and set only the viewport. What it actually measured was the width query at the call site. The two
agreed at 390 px and disagreed on every other device. **Every touch sweep in this repo sets 390 px;
a tablet is coarse AND wide, and nothing was measuring one until this run.**

**4. Two agent findings did not reproduce, and checking cost minutes.** A competitive probe reported
the GPX welds **12,931 samples / 125.0 s / 5,758 m** into a straight line on the 121 km flight;
measured, that file has **25,322 fixes and zero gaps**. And a "20 `download(` call sites in 10 files,
6 through the registry" figure is really **18 in 8, with ONE through the registry**. Both had already
been written into this repo's own documents before being measured.

## D12 slice 3 — the roadmap's model for it is wrong, as slice 5's was

`ROADMAP.md` says the Featherweight `>40`/`>32`/`>24` dB-Hz columns are three disjoint bands. Measured
this run across all five Featherweight files: the committed fixture `featherweight-gps.csv` is
**cumulative** (`sum > #SATS` on 478 of 490 rows, monotone on 490/490), the tracker logs are
**disjoint**, and the sum invariant fails on **18 rows across two files — every one of them a
`FIX == 0` row**. So the bands are disjoint only where there IS a fix, which is a per-ROW property
the roadmap states per FILE.

**The safe slice is the `>40` bin alone**: it means the same thing under both conventions, it is
tokenised nowhere today (both parsers stop at `#SATS`), and it is a real diagnostic rather than a
constant — its zero-rate runs **0.0% to 94.8%** across the five files and **92.1% below a quarter of
apogee against 22.4% above** on one of them, which is ground multipath clearing as the rocket climbs.
It needs the same no-fix guard slice 2 applied to the dilution columns: **4 rows of the committed
ground-station fixture read `>40 = 1` with `#TOT = 0` and `FIX = 0`**, and that fixture is the only
Featherweight bin file fork CI sees.

## D12's *done when* cannot be pinned as written — one increment, and it comes first

It asks for "a check [that] enumerates those sinks from the same registry the exporters are
registered in". **The registry exists** — `KEPT_DOCUMENTS` at `lib/documents.ts:95`, six entries,
already enumerated by three test files — **but `lib/documents.ts:32` excludes `.gpx` and `.kml` by
name**, and there are **18 `download(` call sites across 8 files of which exactly ONE routes through
it**. Until the two track exports are in a registry, that check can only be a hand-kept list.

## Environment, measured this run

- **Both repos attached**, plus the sibling `nrdptel/fusionspace-loft` added mid-run with `add_repo`
  and cloned to `/home/user/fusionspace-loft`, because `DESIGN.md` is binding in both.
  `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__` and the corpus suite named its
  fixtures — **157 tests in `lib/parsers/corpus.test.ts`** at the end of the run, 151 at the start.
- **`npx playwright install chromium` was needed again** (image ships 1194, this Playwright wants
  1228). About a minute through the proxy. Then plain `npx playwright test` with **no** browser
  variable. **This is paid every session and belongs in the environment's setup script.**
- **Git identity arrived as the harness vendor's default** and was reset per-repo before the first
  commit, in BOTH repos.
- **The clone is SHALLOW**, so any commit count or file history is a window, not the record.
- CI fires on `pull_request` and on push to `main`, not on a push to a working branch. `frontend`
  takes ~4 min, `e2e` ~7 min.
- **The GitHub MCP server appends an attribution footer to a PR body**, and the update path strips
  it — verified on all four. Read every body back after posting.
- **Only ~2 subagents run concurrently here** (4 CPUs; the cap is `min(16, cpus − 2)`), so a
  nine-agent fan-out takes about 50 minutes. Dispatch it first and ship while it runs.
- **ONE gate at a time really does mean across repos.** Running the sibling's sharded e2e while this
  repo's suite was going turned one offline test red (`net::ERR_INTERNET_DISCONNECTED`); alone it is
  60/60. Four cores is the whole budget.
- **A gitignored `*.test.ts` probe still runs in `npm test`.** Two of them inflated a count to
  101 files / 1,497 tests when the honest number was 99 / 1,495. Delete probes before quoting a gate.

## Next, in order

1. **Put `.gpx` and `.kml` into a registry** so D12's *done when* becomes pinnable at all. One
   increment, and everything else in D12 is measured against it.
2. **D12 slice 3 — the `>40` bin alone**, scoped above with the numbers and the guard it needs.
3. **The pad-baseline Sev-1 in `BACKLOG.md`.** It is REPRODUCED and the obvious fix is REFUSED with
   the numbers, so the next run starts from a real measurement instead of a hunch. The honest fix
   needs the flight model to carry whether an altitude column is already AGL — that is milestone
   shaped, and it is the strongest candidate for a new D-track entry.
4. **P1 rows 16 and 15.** Row 16 is three hand-rolled text inputs in three geometries; row 15 is the
   third border role, which the border work turned from a style question into a contrast one —
   `SectionNav` is the last `gap` in either census, at 1.22:1 resting and 2.62:1 for its
   you-are-here state.
5. **The report is 10.5 screens tall on a phone** (8,895 px at 390 × 844, zero horizontal overflow).
   That is P4's after-list and `ON-6`'s actual subject: a vertical layout, not a floor.
