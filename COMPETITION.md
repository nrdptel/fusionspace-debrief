# Debrief — Competitive Ledger

**The purpose of this file is to make "belong in that company" a tracked gap instead of a mood.**

`MAINTAINING.md` sets the bar as "Debrief has to feel like it belongs in that company" and the
done-check asks each run to benchmark one surface against a mature tool. Until this file existed, that
benchmark went into a chat report nobody read and nothing accumulated. Now it lands here, one row at a
time, and the rows are where `ROADMAP.md` milestones come from.

## How to use it

1. **Every run adds or resolves at least one row.** The done-check requires it. A run that benchmarks
   a surface and files nothing here did not benchmark it.
2. **A row is a claim until verified.** Rows marked `UNVERIFIED` are leads, not facts. Verify against
   the tool's own documentation, a real device, or a real log before you build against one — and
   change the marker when you do, with what you checked. Vendor tools change with firmware, and a
   capability misremembered is an expensive thing to build against.
3. **`Verdict` is a decision, and decisions are cheap to reverse but expensive to re-derive.** Use:
   - `GAP` — they have it, we want it, it is not yet on the roadmap.
   - `QUEUED` — on `ROADMAP.md`, with the milestone named.
   - `HAVE` — we do this, at least as well. Say what proves it.
   - `BETTER` — we do it better. Say what proves it, because this is the claim that matters and the
     one most easily kidded about.
   - `REJECT` — deliberately not doing it. **Say why**, in one line. A rejection without a reason gets
     re-litigated every run.
4. **A `GAP` that survives two runs should become a milestone or a `REJECT`.** Standing gaps with no
   decision are how a competitive analysis turns into decoration.
5. **Format support is the one place to be maximally aggressive.** North Star #1 is "ingest anything".
   A `GAP` that is "we cannot read this vendor's file" is worth more than most feature rows, and the
   corpus is how it gets proven. Read published formats and specifications; never copy licensed code.

## The field

Debrief's competition is mostly **the software that ships with the altimeter a flyer already owns** —
which means the flyer already has it, it already reads their file, and it is free. Beating that
requires being better at something specific, not merely existing.

| Tool | What it is | Why it matters here |
|---|---|---|
| **Featherweight Interface Program** | Featherweight's desktop app for Blue Raven and Featherweight GPS | The benchmark for high-rate data and orientation. Blue Raven logs far more than altitude. |
| **AltusMetrum AltosUI** | Open-source desktop app for TeleMega / TeleMetrum / EasyMini | The benchmark for depth and honesty; open format, well documented, and a corpus source. |
| **Fluctus Control Center** | Vendor software for Fluctus flight computers | `UNVERIFIED` in detail — verify capability and format before building against this row. |
| **Eggtimer / PerfectFlite / Jolly Logic** | Vendor apps and utilities for widely-owned altimeters | Breadth of ownership. Whatever a beginner's first altimeter is, Debrief should read it. |
| **Excel / Google Sheets** | What flyers actually fall back to | The real incumbent. Anything Debrief cannot do, a flyer does in a spreadsheet — badly, but they do it. |
| **OpenRocket / RockSim** | Design and simulation | Not competitors, but the other half of the flyer's workflow: predicted versus flown is the comparison they want. Loft is the sibling that closes it. |

---

## Ledger

Newest first. `file:line` or a route where ours lives, so the comparison is reproducible.

| # | Tool | Capability | Where ours is | Verdict | Note |
|---|---|---|---|---|---|
| 1 | All vendor apps | **Shaped like an application** — a window with panes, not one scrolling document | `app/page.tsx` plus `components/Analyzer.tsx`; the analysis is one long page | `QUEUED` | P2 — Surfaces as routes. The largest structural reason Debrief reads as a page rather than a tool. |
| 2 | All vendor apps | **One consistent visual language**, because one team built one app | 50 components, **no shared primitive layer at all** — zero cross-component imports, 12+ card treatments, `text-xs` used 212× against `text-sm` 82× | `QUEUED` | P1 — One design system, adopted. Measured 2026-07-30. This is the most concrete instance of "assembled rather than designed" in either repo. |
| 3 | Featherweight | **High-rate data** — Blue Raven records far more per second than a baro-only altimeter, and the tool presents it without choking | Ingestion handles large logs; `UNVERIFIED` whether the ceiling and the plotting hold at Blue Raven's real rate | `GAP` | Verify with a real high-rate log first; the measurement is the increment. Decimation must never silently change a reported peak. |
| 4 | Featherweight | **3-axis orientation / attitude through the flight** — roll, angle off vertical, and what the rocket was actually doing | Nothing | `GAP` | High value and genuinely deep. Only honest where the log carries the channels; must degrade to "this board did not record it" rather than estimating. |
| 5 | AltosUI | **Reads its vendor's format completely**, including raw `.eeprom` | Shipped — D2, pinned by the raw `.eeprom` case | `HAVE` | Verified against the board's own software's interpretation, which is the standard to hold for every new format. |
| 6 | AltosUI · Featherweight | **The logger's own reported summary shown beside the derived one** | `components/DeviceSummary.tsx`, rendered by `components/FlightReport.tsx` on any flight whose file carries a summary | `HAVE` | **RESOLVED 2026-07-31 — the row was stale, not the feature.** It said "present it to the flyer, not just the test suite"; a Reading / Logger / Debrief / Agreement table has been on the report the whole time, and `e2e/device-summary.spec.ts` walks it. It also does more than state both figures: it judges agreement as *agree / consistent / differ* with the percentage, and carries a case a naive diff would call a disagreement — an accelerometer at rest reading 1 g, which Debrief reports as the force the airframe felt and the device subtracts, labelled "agree · exactly 1 g apart". Checked before writing this row rather than assumed. **Widened 2026-07-31:** it now also carries the board's own APOGEE and MAIN deployment shocks, which no barometric trace can recover — Debrief measures the same quantity on 19 of the 36 corpus flights that analyse, and on the rest the row says the reading is not comparable rather than going blank. |
| 7 | All vendor apps | **Reads only its own vendor's files** | Many formats into one model, plus a column mapper for any CSV | `BETTER` | The core structural advantage. Nothing else in the field reads a rival's file, and a flyer with two brands of altimeter has no other option. Under-sold outside the app. |
| 8 | FIP · AltosUI · DataCap | **Requires an install, often Windows-only** | Browser, offline, installable, no account, nothing uploaded | `BETTER` | Also a privacy claim a vendor cannot make: the file never leaves the device. `/privacy` says so; the landing surface does not. **Narrowed 2026-07-31:** not true of *all* vendor apps any more — Featherweight UI ships on iOS/iPadOS/macOS, so a Blue Raven owner already has a vendor app on the phone in their pocket. Verified on the App Store listing. |
| 9 | AltosUI · vendor apps generally | **Several recordings of one flight, reconciled and cross-checked** | Shipped — D3; stitching is D4, in progress | `BETTER` | **The claim was "nothing else does this" and that is refuted — narrowed 2026-07-31.** wFIP 2.0 loads several Featherweight device files onto one graph, booster-plus-sustainer among its own examples, so the OVERLAY is not unique. What survives is narrower and still real: reconciliation across *rival vendors'* files, with the disagreement shown rather than blended, and a refusal when the records cannot be aligned. Still `BETTER` against AltosUI, which has no multi-flight comparison at any version (absent from the v1.9.22.2 manual and from release notes 0.7.1–1.9.19). Say which tool the claim is against before it goes on a landing page. |
| 10 | Excel | **The flyer can compute whatever they want** | Fixed set of derived readings | `REJECT` as stated | A formula box would betray the provenance-first invariant — an unvalidated user expression cannot be labelled measured, derived or estimated. The right answer is depth (D7): more readings that are *checked*, each with its method. Say this rather than re-deciding it. |
| 11 | Excel | **Plots exactly what the flyer wants, in their colours, exported anywhere** | `reportProfile.ts` and `plotView.ts` carry order and hidden figures; `COMPARE_PALETTE` is hardcoded and caps at 6 | `QUEUED` | D5. The reason flyers still open a spreadsheet after using a vendor tool. |
| 12 | OpenRocket / RockSim / **Loft** | **Predicted versus flown, side by side** | Nothing | `GAP` | Debrief holds the flight, Loft holds the prediction, and the flyer wants the overlay. Needs a decision about coupling — `MAINTAINING.md` says keep the tools distinct, so this is an import of a prediction, never a shared runtime. Owner-level; flag it rather than assume it. **This row used to say "the most valuable capability neither side of the suite has", which read as nobody having it. Corrected 2026-07-31:** see row 16 — an altimeter-side tool ships it today, so this is a deficit rather than an opening, and waiting costs more than the row implied. |
| 13 | Vendor apps | **Firmware-aware parsing** — the app knows which firmware wrote the file and reads it accordingly | D2 reads the file the card actually holds | `HAVE` | Hold this standard for each new format: read it the way the board's own software reads it, and prove it against the board's reported summary. |
| 14 | All | **A flyer can find the tool at all** | `README.md` (27 KB, text-only), no changelog, no release visible in the UI | `QUEUED` | P5 — Ready for the public. Being better than the vendor app is worth nothing to someone who never finds it. |
| 15 | Featherweight (wFIP 2.0) | **Several device logs on one time-synced graph** — Blue Raven, Blue Jay, GPS Tracker and legacy Raven files loaded together; the release thread's worked example is a booster and a sustainer | `/compare` overlays recordings; `lib/stitch.ts` aligns per-stage logs and has no surface yet (D4) | `GAP` | **Amends row 9.** `UNVERIFIED` on the one point that decides how much it costs us: whether wFIP time-ALIGNS the files onto one clock or merely shares an axis. D4's differentiator is the alignment and the honest refusal, not the overlay — so verify this before claiming either. Sources reached were search snippets of TRF threads 190953/191414 plus the vendor's own one-line note; the forum returns 403 and the vendor's own host 503 through this proxy. |
| 16 | Featherweight (wFIP 2.0) | **Predicted versus flown inside the altimeter tool** — loads OpenRocket simulation files and overlays them on the flown traces | Nothing | `GAP` | Filed separately from row 12 rather than folded in, because row 12 implied nobody had it. `UNVERIFIED` — TRF snippets only. |
| 17 | AltosUI | **The flyer controls the smoothing of baro-derived speed and acceleration**, from a `Configure Graph` tab that sits permanently beside the plot | Fixed Hampel window (`lib/analyze/index.ts`), explained on `/methods`, adjustable nowhere | `GAP` | Verified in the v1.9.22.2 manual and the 1.8.3 release notes. Read with row 10: a user-tuned filter that MOVES a reported peak would breach the provenance invariant, so if this is ever built it exposes sensitivity — it never re-labels a measured peak. |
| 18 | Featherweight UI (phone app) | **The post-flight surface is a phone at the range** — BLE download of a flight summary on landing, then the full log, with a configurable graph | P4 not started; `/` is a desktop page rescaled | `GAP` | Narrows row 8. The newest Featherweight hardware is not a Windows install; it is already on the flyer's phone before they leave the field. |
| 19 | MissileWorks mDACS | **The chart's visible items decide what the CSV export contains** | `lib/reportProfile.ts` deliberately refuses this: hiding a reading trims the *report*, never the data exports — `analyzedDataCsv` takes no profile and `compareJson` no hidden/order argument | `BETTER`, and the evidence is a competitor doing it the other way | **Verified from the vendor manual on 2026-07-31**, read directly rather than from a summary: *"This utility allows you to export the captured Flight Data to a secondary file using a standard Excel .CSV format. **The items specifically displayed in the chart are the items that are included in the export.** Time, Altitude and Pressure are always exported by default."* (<https://www.apogeerockets.com/downloads/PDFs/mDACS-usb-io-user-manual.pdf>, *Flight Data Export*). So an mDACS CSV is a picture of one screen, and two flyers who arranged their charts differently export different columns from the same flight. That is exactly the failure `reportProfile.ts` names — trimming a report is a presentation choice, trimming a data export is a broken file — and this is a shipped, widely-owned tool doing it. **Cite this rather than re-arguing the rule next run.** Same manual, same read: no colour customisation anywhere (zero occurrences of colour/color), and printing covers only the settings and legend sheets, not the chart — so mDACS has no image or chart-print output at all, which bounds how much of D5's remaining scope is competitively urgent. |
| 20 | Featherweight FIP · AltosUI · mDACS · Sheets | **Which FIGURES a saved document carries is the flyer's choice, and the same choice on every surface** | `components/FigureChooser.tsx`, shared by the single-flight report and the comparison; both exports read one `documentFigures` list | `HAVE` | Added 2026-07-31 with D5's first slice. The comparison used to ignore the choice and export a hardcoded altitude/velocity/acceleration, so the two surfaces disagreed about what the flyer had asked for and the Mach and dynamic-pressure overlays could not reach a document at all. **Closed out 2026-07-31, later the same run.** When this row was written, order and colour were still `GAP` against a spreadsheet and it said so. Both shipped with the rest of D5: `FigureChooser` carries `onMove` as well as `onColor`, so the flyer sets which figures a document holds, in what order, and in what colour — on the single-flight report and on the comparison, through one control and one stored choice. Colour is per **channel** on the report (`debrief.report.figureColors`) and per **flight** on the comparison (`debrief.compare.colors`), which is not an inconsistency: a report compares channels of one flight, a comparison compares flights on one channel, so the thing a colour has to stay attached to differs. The e2e assertions read the **saved SVG** rather than the swatch, because a colour that only changes the picker is exactly the bug worth catching. |

---

## Standing conclusion — where Debrief actually wins

Keep this honest and current; it is what the landing surface and the README should say, and right now
they do not say it.

1. **It reads every board, not just the one that made it** — including any CSV, through the column
   mapper.
2. **It puts several recordings of one flight side by side** — *including files from different
   manufacturers* — and shows where they disagree instead of averaging them away. The cross-vendor
   part is what is unique; overlaying several of its OWN files is something Featherweight's tool now
   does too (row 15), so do not publish the older, broader claim.
3. **Nothing is uploaded, nothing is installed, nothing is paid for**, and it works at the range with
   no signal.

Where it loses today: no orientation or high-rate depth to match Featherweight's own tool, no
predicted-versus-flown overlay (which an altimeter-side tool now ships — row 16), report export is
thinner than a spreadsheet, and no phone-first post-flight surface to match the one a Blue Raven owner
already carries (row 18). And, the one a flyer sees first, **it is shaped like a long page rather than
an application** — though as of 2026-07-31 it does at least have one shared set of primitives and a
test that keeps them, which is P1 in progress.
