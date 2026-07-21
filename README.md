# Debrief

A universal, in-browser altimeter flight-log analyzer. Drop in a flight file from any
logger and get one clean, correctly-analyzed flight — the headline numbers and the
curves that matter, with the real-world mess (ejection spikes, sensor noise, mixed
sample rates, units) handled.

Debrief reads and analyzes flights you have already flown. It is **not a simulator** —
it doesn't predict or estimate performance, recommend motors, or model anything you
haven't flown; every number comes from your logger's own recording. It's a **standalone
tool** that works entirely on its own. To plan or predict a flight *before* you fly it,
use a dedicated, well-validated flight simulator — this is a hobby where that margin
matters.

Live at **[debrief.fusionspace.co](https://debrief.fusionspace.co)**. Part of
[Fusion Space](https://fusionspace.co).

## What it does

- Reads a flight log and reports apogee, max velocity (and Mach), max and average
  acceleration, max Q (peak dynamic pressure), burnout, time-to-apogee, coast time,
  deployments, descent rates, and flight time.
- Reads **thrust-to-weight off the pad** — when the logger recorded acceleration, the g it
  pulled at liftoff *is* the thrust-to-weight ratio (drag is negligible at low speed), the
  "5:1 rule" rail-departure safety number — measured, not predicted, and withheld when the
  accelerometer saturated at liftoff (a railed reading would understate it).
- Reads **deployment shock** — when the logger recorded acceleration, the peak g the
  airframe felt as the apogee charge and the main fired (the snatch force that breaks
  shock cords and zippers tubes), shown on those events.
- Reads **roll & spin** — when the logger recorded a roll-rate channel (or you map one),
  the peak rate about the long axis and the total revolutions the airframe turned through,
  so a fast spin (fin misalignment, a driver of coning) stands out. A bare three-axis gyro
  is left alone — which axis is roll is logger-specific — so it keys off a labelled roll column.
- Reads **tilt at burnout** — when the logger solved for attitude (a Blue Raven, say), the
  angle off vertical at the end of thrust: a low number is a straight boost, a large one flags
  weathercocking. Taken at burnout, not the peak — the natural tip-over near apogee isn't a
  quality signal — and read straight from the logger's own tilt, not derived.
- Surfaces **battery voltage** — when the logger recorded it, the resting voltage and
  the lowest it sagged to, so a weak pack (a common cause of a charge that didn't fire)
  stands out.
- Draws altitude, velocity, and acceleration against time, with liftoff, burnout,
  apogee, main deploy, and landing marked on each.
- Reports **rail-exit velocity** — how fast the rocket was actually moving when it
  cleared the launch rail, read straight from the flown record at your rail's length
  above the pad (pick from the common 4–12 ft lengths). It's a *measurement*, not a
  prediction, and flags a clearance speed on the low side for stability.
- Shows the flight's shape at a glance — a proportional timeline breaks it into boost,
  coast and the descent legs, each with its duration and descent rate.
- Reads **coast efficiency** — after burnout, with no drag, the rocket would trade all its
  burnout speed for height (a vacuum coast of v²/2g). Comparing that to the height actually
  gained shows how much of the coast drag ate — the efficiency and the altitude drag cost
  (the bundled sample reaches 59%: drag cost it ~1,560 m). Pure energy conservation on the
  flown numbers, no model or prediction.
- Checks the **main deploy altitude** — on a dual-deploy flight the altimeter fires the main at
  a set altitude; Debrief reads off where it *actually* fired (and how far the rocket fell under
  drogue first), and against the altitude you set it tells you how close the two were. A
  *measurement* and a safety check — a main that fires well below its setting lands hard.
- Checks the **ejection delay** — for a motor-ejection flight the ideal motor delay is the
  coast time (burnout → apogee), the moment the rocket is slowest and a charge deploys most
  gently. Debrief already measures that, so it frames it as the delay to load and, given the
  printed delay you flew, reads off how far before or after apogee that charge actually fired
  (delay − coast time). A *measurement* of the flown flight, the answer to "was my delay right."
- Measures the **drag coefficient** — after burnout the only forces on the airframe are
  gravity and drag, so the coast deceleration is a direct reading of the drag the rocket
  actually had. Give it the coast mass and body diameter and it back-calculates Cd (and the
  drag area Cd·A) over the faster part of the coast, with the Mach window shown — the number
  to check your simulation's assumed Cd against. A *measurement* of the flown flight, not a
  prediction; softer (and flagged) on a logger without its own velocity.
- Measures the **parachute Cd** — under a steady main the rocket is at terminal velocity, where
  drag balances weight, so the canopy's drag coefficient (Cd = 2·m·g / ρv²A) falls out of the
  measured descent rate, given the descending mass and canopy diameter. A *measurement* of how
  the chute actually performed — check it against the rule of thumb (~0.75 flat, ~1.5 domed). On a
  dual-deploy flight the same reading is offered for the **drogue** (the fast fall to the main, in
  the thinner air aloft), flagged approximate since a small drogue may not be fully at terminal.
- Reads **landing energy** — give it your rocket's descending mass and it reports the
  kinetic energy the flight came in with (½·m·v² from the measured landing descent
  rate, in ft·lbf and joules), the figure a certification flight card and many club
  waivers ask for. Like rail-exit, it's a *measurement* of the flown flight, not a
  prediction. It also frames the landing speed as the free-fall **drop height** that reaches it
  (h = v²/2g) — exact and mass-free, the gut-feel "it came in like a drop from here" for judging
  whether a landing was too hard.
- Helps you find it — for a flight with a GPS track, a north-up recovery map plots the
  ground track and reports how far and which way it landed from the pad (and the furthest
  it drifted), gives the exact landing coordinates to copy, and exports the track plus a
  landing waypoint as a **GPX** you can navigate to on a phone, handheld GPS, or in Google
  Earth. Drawn from your own GPS fixes; no map tiles are fetched, nothing leaves the browser.
  It also reads the **wind aloft** the rocket fell through — under canopy it drifts with the air,
  so its descent drift velocity is the measured wind (speed and the direction it came from), the
  ground truth a forecast-based drift predictor only estimates — and bins that drift by altitude
  into a **wind profile**, the speed and direction in each layer so the shear with height shows
  (the slow low layers read cleanest; a sparse fast layer is dropped). And it reads how far **off vertical**
  the ascent flew — the apogee's horizontal offset from the pad (weathercocking plus ascent drift),
  a lean that costs altitude to the cosine.
- Opens up the full data — a channel explorer lets you plot anything the logger
  recorded (battery voltage, temperature, raw pressure, per-axis acceleration,
  onboard **tilt** / angle-off-vertical where the logger computes it, …)
  alongside Debrief's own derived channels — including **Mach number** and
  **dynamic pressure** (the transonic and max-Q curves a rocket is designed around) —
  against time, or one channel against another (e.g. velocity vs altitude), with a
  second axis for mixed units and live min/max/mean/Δ/rate over the zoomed window —
  and save the current plot as a PNG, a **vector SVG** (crisp at any size for a report or
  slide), or its exact data (your axes, your units) as CSV.
- Shows its work — overlay the raw (pre-filter) altitude on the cleaned line to see
  exactly what spike-removal took out, and open *Log details* for the factual read of
  the file: the logger's reported identity, sample rate, duration and recorded channels.
- Cross-checks the logger against itself — when a file carries the device's own headline
  figures (an AltimeterCloud export writes its apogee, max and burnout velocity, descent
  rate and peak acceleration into the file; a PerfectFlite/StratoLogger preamble states its
  own `Apogee: … ' AGL`),
  Debrief shows those beside its independent read as two measurements to compare: close
  agreement builds confidence, a gap is flagged for a look — never averaged together or
  hidden. A sharply-defined peak (apogee, a velocity at one instant) is held to a tight
  bar, but a windowed figure like a descent rate is judged more loosely — the same device
  can report its own descent and landing velocities ~25% apart, so a modest gap there reads
  as *consistent*, not a discrepancy. (A power-loss flight that logs no apogee is left alone.)
- Finds the *real* apogee — a short median filter removes the single-sample spike an
  ejection charge punches into a barometric trace, so a deployment pop can't fake a
  higher reading.
- Uses the device's own velocity/acceleration when it logged them, and derives them
  from altitude when it didn't — labelling which is which. For a **multi-axis logger**
  (separate accel_x/y/z body axes) it reports the **resultant magnitude** √(x²+y²+z²) —
  the true peak the airframe felt, and what the device's own summary reports — rather
  than a single body axis, which under-reads it whenever the airframe isn't perfectly
  aligned to one axis. Flags a **saturated accelerometer** — when the trace flat-tops at
  its peak (the sign a sensor hit its full-scale limit), the max acceleration is marked
  as possibly clipped rather than read as the true maximum.
- Exports a flight: copy a text summary, save it as `.txt` or a report-grade **Markdown**
  file — the headline metrics and events as tables (and, when the file carried the logger's
  own summary, the device-vs-Debrief cross-check), ready to drop into a project write-up,
  a certification document or a forum post — save the analyzed series (time, altitude,
  velocity, acceleration, Mach, dynamic pressure) as `.csv`, take the full analysis —
  metrics, events and their provenance — as structured **JSON** for a script or another
  tool, or save the altitude chart as
  a PNG or a **vector SVG** with the events marked — crisp at any size for a report. The
  vector figure exports on a light background by default (what most reports and cert
  documents want, whatever theme the app is in) with a one-tap switch to dark for a slide
  deck — the same choice on the explorer and comparison charts. Or take the lot in one
  click: **Save bundle** packs the Markdown write-up, the data `.csv`, the structured
  `.json` and the altitude, velocity and acceleration figures into a single `.zip` — the
  whole report as one download, zipped in the browser, nothing uploaded.
- Keeps a logbook — recent flights are remembered on your device for quick re-opening,
  sortable by date, apogee or top speed, with a ★ marking your best of the bunch. Add a
  note to any flight (motor, conditions, cert…) and it's kept as a logbook entry that
  won't be pruned. Never uploaded; clears in one tap. **Back it up** — export the whole
  logbook (flights and notes) to a file you keep, and import it to restore it on another
  machine or after a clear; the file is yours and nothing is uploaded.
- Compares several flights at once — drop multiple files (or tick two or more recent
  flights) to overlay any of their altitude, velocity, acceleration, Mach or
  dynamic-pressure curves (aligned at liftoff) with a side-by-side metrics table that
  flags the best apogee, max velocity, Mach, acceleration and max Q — plus a **cross-check**
  reading how closely the flights' apogee and top speed agree, so redundant altimeters (or a
  booster and its sustainer bay) read as independent measurements: close agreement builds
  confidence, a wide gap is a flag worth chasing, never a single number to trust on faith.
  Compare exactly two and the table adds a **Difference** column — the pairwise spread on
  every metric, so two altimeters on one flight show how tightly they agree, and two
  launches of one rocket show what changed.
  The overlay saves as a PNG, a **vector SVG** (crisp at any size for a report), or its
  exact data as CSV, alongside the metrics table — or **Save bundle** to take the whole
  comparison at once: a Markdown write-up carrying the cross-check and the metrics table,
  the metrics CSV, a structured `.json` (each flight's metrics, the cross-check and the
  pairwise differences) and the altitude, velocity and acceleration overlay figures, zipped
  in the browser into one `.zip` to drop into a certification package.
- Shares a flight as a link with the whole file encoded in the URL fragment — decoded in
  the recipient's browser, never uploaded.
- Makes a **flight card** — a clean, branded image of the headline numbers and the
  altitude curve, drawn in the browser, to save or copy straight into a club chat or
  forum post.
- Works at the field — installable to your home screen and, once opened online, fully
  usable offline (a service worker caches the app itself, not your flights), so you can
  read a log in the middle of the desert with no signal.

## Privacy

Your file is read in the browser with the standard File API and **never leaves your
device**. There is no backend and no upload — the whole site is static, and every byte
of parsing and analysis runs locally.

## Supported formats

- **Altus Metrum (AltOS)** — TeleMetrum, TeleMega, EasyMega, EasyMini, etc.,
  auto-detected and parsed; GPS lat/lon (on the units that log it) feeds the recovery
  view alongside the barometric altitude.
- **PerfectFlite** — StratoLogger / StratoLoggerCF / Pnut (`.pf2` and CSV exports),
  auto-detected including the header-less native layout.
- **Eggtimer** — Classic / Quantum / Apogee flight-detail CSV (`T,Alt,VRaw,VFilt`),
  auto-detected; assumes the device's default feet.
- **Featherweight Raven** — the Featherweight Interface Program (FIP) CSV export, whose
  per-channel time bases are resampled onto a common clock; altitude is from the
  barometric channel.
- **Featherweight Blue Raven** — both the low-rate `LOG_LOW` serial capture (token
  format, 50 Hz) and the phone-app low-rate CSV export; altitude is read from the
  barometric channel where present. The high-rate gyro/accel files are recognized too,
  with a pointer to use the low-rate file for the flight profile.
- **Entacore AIM** — the AIM XTRA flight computer (and the AIM BASE ground-station
  telemetry), whose per-channel time bases are resampled onto a common clock; altitude
  is derived from the barometric pressure channel.
- **Featherweight GPS** — the GPS tracker log (`UTCTIME,UNIXTIME,ALT,LAT,LON,…`),
  re-sorted onto a monotonic clock; altitude is the (coarser) GPS reading, and the lat/lon
  track drives the recovery view.
- **Generic CSV** — any logger that can export a CSV (with or without a header row).
  Debrief guesses the columns and units — including GPS latitude/longitude — and lets
  you confirm them. With no header row at all it reads the roles from the data's own
  shape — a monotonic time base and the single rise-and-fall of an altitude curve — so
  even an unlabelled export (a headerless StratoLogger TSV, say) lands with its key
  columns already picked. Values that carry their unit in the cell — `100.5F`, `9.1V`,
  `1013hPa` — are read too, while a date or time (`2023-08-09`, `16:24:04`) is left alone. Comma, tab, semicolon and pipe delimiters are auto-detected, along
  with European-locale exports (semicolon-separated with comma decimals), Windows,
  Unix or classic-Mac line endings, and **UTF-16 files** — a byte-order mark is detected
  and decoded, so a Windows export like the Missile Works RRC3 mDACS text file or Excel's
  "Unicode Text" save reads correctly instead of arriving as mojibake. Map an unfamiliar
  export once and Debrief can **remember the columns**, re-applying them to the next file
  with the same layout — kept on your device, never uploaded.
- **Excel spreadsheet** (`.xlsx`) — drop the workbook you already keep your data in and
  Debrief unzips it in the browser, reads the first sheet, and hands it to the same column
  mapper as a CSV. No conversion step, no upload — the file is opened entirely on your
  device. (Read from the published OpenXML/ZIP formats, no third-party library.)

More named formats are being added. A new parser is a single module under
[`lib/parsers/`](lib/parsers/) that declares how to recognize a file and how to read it
into the canonical flight model — the analysis never changes.

## Data exports

Every export is generated in the browser from the flight you loaded — nothing is uploaded,
and re-running an export never re-reads the file. A single flight saves as a text or
**Markdown** summary, a data `.csv` (the analysed series), vector `.svg` / `.png` figures,
a structured `.json`, or a **`.zip` bundle** of the report-grade set; a comparison saves the
same way, plus a metrics `.csv` and its own `.json`.

The `.json` is Debrief's canonical read, meant to be machine-read:

- **`debrief.flight/1`** — one flight: `units` (the system every value is expressed in),
  `metrics` (the headline numbers), `events` (each with its `provenance` — `measured`,
  `derived` or `estimated`), `warnings`, and a `loggerSummary` cross-check when the file
  carried the device's own figures.
- **`debrief.comparison/1`** — several flights: each flight's `metrics`, the `crossCheck`
  spreads, and (for a pair) the per-metric `differences`.

Numbers are in the units you chose (`ft`/`m`), a metric the flight doesn't have is `null`
rather than absent or invented, and nothing reads as more certain than it is. The builders
live in [`lib/report.ts`](lib/report.ts).

## Stack

- [Next.js](https://nextjs.org) App Router, exported as a fully static site
  (`output: 'export'`).
- [Tailwind CSS](https://tailwindcss.com) and the [Geist](https://vercel.com/font) fonts.
- [uPlot](https://github.com/leeoniya/uPlot) for the charts.
- The analysis library under [`lib/`](lib/) is pure and framework-free, with
  [Vitest](https://vitest.dev) covering the math against a synthetic flight.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # run the test suite
npm run build    # static export to ./out
```

## Deploy

Static export, hosted on Cloudflare Pages:

- **Build command:** `npm run build`
- **Output directory:** `out`

No server, no functions — it runs on the free tier with nothing on a schedule.
