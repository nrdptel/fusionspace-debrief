# Debrief

**A universal, in-browser altimeter flight-log analyzer.** Drop in a file from any logger and
read the flight — parsed entirely on your device, never uploaded.

Live at **[debrief.fusionspace.co](https://debrief.fusionspace.co)**. Part of
[Fusion Space](https://fusionspace.co).

![Thirteen readings off one flight — apogee, max velocity with its Mach number, accelerations,
burnout, coast efficiency, max Q, descent rates, flight time and battery — each with its units
and, where it matters, how it was obtained.](docs/images/readings.png)

Every reading says where it came from. `measured` means an instrument recorded it; `derived`
means Debrief worked it out and says which way that usually errs; `may be clipped` means the
sensor saturated and the true value is higher. A reading the file cannot support is **withheld
with a reason**, never printed as noise.

## What it does

**Reads what you flew, and says how it knows.** Debrief is a measurement instrument, not a
simulator — it never predicts a flight, recommends a motor, or issues a go/no-go. Every number
is a reading of your own recording. To plan a flight *before* you fly it, use a dedicated,
well-validated simulator; this is a hobby where that margin matters.

![The altitude curve with liftoff, burnout, apogee and both deployments marked on
it.](docs/images/chart.png)

**Explains itself where the number is.** Every reading whose name is a term of art opens its
full write-up in place — what it means, how it is worked out, and where it can be wrong —
without losing your place. Where a method rests on published work, it cites it.

![The apogee explanation opened over the reading, ending in a Sources line citing Pearson et al.
2015.](docs/images/explain.png)

**Works at the range.** Installable, fully usable offline once opened, and laid out for a phone
with gloves on — not a desktop squeezed.

![The same readings on a 390 px phone, one column, thumb-sized
controls.](docs/images/phone.png)

### The rest, briefly

- **Ten logger families plus any CSV.** Auto-detected, or mapped column by column with the
  mapping remembered as a reusable template. See *Supported formats* below.
- **Several recordings of one flight.** Two altimeters on one airframe are read side by side as
  independent measurements — agreement is confidence, disagreement is a flag — and never
  averaged into one number to trust on faith. Per-stage logs assemble onto one timeline.
- **Predicted versus flown.** Drop an OpenRocket design beside the flight and read the curve its
  simulator expected against the one that happened.
- **Report and export.** Choose the readings and figures you want, then save `.txt`, `.md`,
  `.html`, `.csv`, `.json`, `.gpx`, `.kml`, an SVG or PNG figure, a flight card for a club chat,
  or the lot zipped for a certification package. Every document names the build that wrote it.
- **A flight record that opens again.** One canonical file carrying every sample the logger
  recorded, which Debrief re-reads as the same flight — re-analysed by whatever the methods have
  become rather than frozen at the version that exported it.
- **A logbook on your device.** Flights you open are remembered locally, searchable, comparable,
  and exportable as a backup. Nothing is uploaded, ever.

**How every one of these numbers is worked out** — 51 method write-ups, with the caveats, the
error directions measured against a real-log corpus, and the published sources — is on the
[methods page](https://debrief.fusionspace.co/methods/). How Debrief is checked is on the
[validation page](https://debrief.fusionspace.co/validation/).

## Privacy

Your file is read in the browser with the standard File API and **never leaves your
device**. There is no backend and no upload — the whole site is static, and every byte
of parsing and analysis runs locally.

## Supported formats

- **Altus Metrum (AltOS)** — TeleMetrum, TeleMega, EasyMega, EasyMini, etc.,
  auto-detected and parsed; GPS lat/lon (on the units that log it) feeds the recovery
  view alongside the barometric altitude. The radio-telemetry CSV (keyed by `tick` /
  `ptype`) is read too — as a lossy cross-check, since it's downsampled and often cut
  off mid-descent when the signal drops.
- **PerfectFlite** — StratoLogger / StratoLoggerCF / Pnut (`.pf2` and CSV exports),
  auto-detected including the header-less native layout.
- **Eggtimer** — Classic / Quantum / Apogee flight-detail CSV (`T,Alt,VRaw,VFilt`),
  auto-detected in both the US (comma-delimited) and European (semicolon-delimited,
  comma decimals) locales; assumes the device's default feet.
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
  track drives the recovery view. The **ground-station** export of the same tracker
  (`TRACKER,DATE,TIME,GS Lat,…,TRACKER Lat,TRACKER Lon,TRACKER Alt asl,…`) is read too:
  every row holds the receiver's position beside the rocket's, so the flight is taken from
  the `TRACKER` columns, and — because that export states no elapsed time at all — the time
  base is built from its `DATE`+`TIME` wall clock. A gap in it is a gap in radio reception,
  not a gap in the flight, and Debrief says so.
- **MissileWorks RRC3** — the mDACS text export (`Time, Altitude, Pressure, Velocity,
  Temperature, Events, Voltages`), in both the US flavour (tab-delimited, feet) and the
  European one (semicolon-delimited, comma decimals, metric). The header names no unit, so
  altitude is ambiguous between feet and metres; Debrief settles it from the file's own
  barometric-pressure column, reading altitude in whichever unit matches the apogee the
  pressure drop implies — no locale flag needed.
- **Generic CSV** — any logger that can export a CSV (with or without a header row).
  Debrief guesses the columns and units — including GPS latitude/longitude — and lets
  you confirm them. With no header row at all it reads the roles from the data's own
  shape — a monotonic time base and the single rise-and-fall of an altitude curve — so
  even an unlabelled export (a headerless StratoLogger TSV, say) lands with its key
  columns already picked. Values that carry their unit in the cell — `100.5F`, `9.1V`,
  `1013hPa` — are read too, as is an altitude whose unit is fused onto the header the way
  several SRAD/Arduino flight computers write it (`AltiM` in metres, `AltiF` in feet),
  while a date or time (`2023-08-09`, `16:24:04`) is left alone. When one column names its
  unit and another doesn't, the file's unit system carries over — a feet altitude (or a
  Fahrenheit temperature) means a bare velocity column is read as ft/s, not the metric
  default. Comma, tab, semicolon and pipe delimiters are auto-detected, along
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
- **OpenRocket design** (`.ork`) — **not a flight, and Debrief will not pretend it is
  one.** A `.ork` holds a rocket design and the figures OpenRocket's own simulator
  predicted for it, so dropping one on its own is answered with what the file is and what
  it needs alongside it, rather than being pushed into the column mapper as a table of
  XML. The ten stated figures — apogee, max velocity, max acceleration, max Mach, time to
  apogee, flight time, ground-hit and launch-rod and deployment velocity, and the optimum
  delay — are read from the design's `flightdata`. The format states no units anywhere, so
  Debrief checks the one thing the file can settle on its own: a velocity over its Mach
  number is the speed of sound only if that velocity is in metres per second, and a run
  that fails it is dropped rather than published. The other nine rest on OpenRocket writing
  every one of them from a single internal SI model — strong evidence, not proof, and said
  that way round. Debrief never simulates, fits or corrects a prediction; comparing
  one against the flight you actually flew is what it is for. (Read from OpenRocket's
  published file-format page, no third-party library and no vendored engine.)

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
  carried the device's own figures. A `prediction` block appears instead — or as well —
  when an OpenRocket design was dropped beside the log: the same readings with the
  simulator's figure, Debrief's read, a **signed** `flewPct` (positive where the flight
  exceeded the prediction) and the `verdict` in words. It is a separate key because it is a
  separate kind of claim: `loggerSummary` is a second measurement of this flight, and a
  prediction is a statement about a flight that had not happened yet.
  The single-flight document also carries `gpsApogee`, `gpsApogeeTime`, `gpsAscentFixes`
  and `gpsApogeeAgreement` where the file holds a GPS altitude — the receiver's own reading
  beside the barometer's, with `agree`, `differ` or `different-peak` saying how to read the
  pair.
- **`debrief.comparison/1`** — several flights: each flight's `metrics`, the `crossCheck`
  spreads, the per-metric `differences`, and `sameFlight` — whether these could be
  recordings of one flight at all (`unknown`, or `different-flights` with the launch days
  the files state). Read the spreads through it: between recordings of one flight they are
  an agreement, and between different flights they are how far apart the flights are.

Numbers are in the units you chose — per quantity, so altitude can be in feet while speed
is in mph and acceleration in m/s² — a metric the flight doesn't have is `null`
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
