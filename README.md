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

- Reads a flight log and reports apogee, max velocity (and Mach), max acceleration,
  max Q (peak dynamic pressure), burnout, time-to-apogee, deployments, descent rates,
  and flight time.
- Reads **deployment shock** — when the logger recorded acceleration, the peak g the
  airframe felt as the apogee charge and the main fired (the snatch force that breaks
  shock cords and zippers tubes), shown on those events.
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
- Reads **landing energy** — give it your rocket's descending mass and it reports the
  kinetic energy the flight came in with (½·m·v² from the measured landing descent
  rate, in ft·lbf and joules), the figure a certification flight card and many club
  waivers ask for. Like rail-exit, it's a *measurement* of the flown flight, not a
  prediction.
- Helps you find it — for a flight with a GPS track, a north-up recovery map plots the
  ground track and reports how far and which way it landed from the pad (and the furthest
  it drifted), gives the exact landing coordinates to copy, and exports the track plus a
  landing waypoint as a **GPX** you can navigate to on a phone, handheld GPS, or in Google
  Earth. Drawn from your own GPS fixes; no map tiles are fetched, nothing leaves the browser.
- Opens up the full data — a channel explorer lets you plot anything the logger
  recorded (battery voltage, temperature, raw pressure, per-axis acceleration, …)
  alongside Debrief's own derived channels — including **Mach number** and
  **dynamic pressure** (the transonic and max-Q curves a rocket is designed around) —
  against time, or one channel against another (e.g. velocity vs altitude), with a
  second axis for mixed units and live min/max/mean/Δ/rate over the zoomed window —
  and save the current plot as a PNG or its exact data (your axes, your units) as CSV.
- Shows its work — overlay the raw (pre-filter) altitude on the cleaned line to see
  exactly what spike-removal took out, and open *Log details* for the factual read of
  the file: the logger's reported identity, sample rate, duration and recorded channels.
- Finds the *real* apogee — a short median filter removes the single-sample spike an
  ejection charge punches into a barometric trace, so a deployment pop can't fake a
  higher reading.
- Uses the device's own velocity/acceleration when it logged them, and derives them
  from altitude when it didn't — labelling which is which. Flags a **saturated
  accelerometer** — when the trace flat-tops at its peak (the sign a sensor hit its
  full-scale limit), the max acceleration is marked as possibly clipped rather than
  read as the true maximum.
- Exports a flight: copy a text summary, save it as `.txt`, save the analyzed series
  (time, altitude, velocity, acceleration, Mach, dynamic pressure) as `.csv`, or save
  the altitude chart as a PNG.
- Keeps a logbook — recent flights are remembered on your device for quick re-opening,
  sortable by date, apogee or top speed, with a ★ marking your best of the bunch. Add a
  note to any flight (motor, conditions, cert…) and it's kept as a logbook entry that
  won't be pruned. Never uploaded; clears in one tap. **Back it up** — export the whole
  logbook (flights and notes) to a file you keep, and import it to restore it on another
  machine or after a clear; the file is yours and nothing is uploaded.
- Compares several flights at once — drop multiple files (or tick two or more recent
  flights) to overlay any of their altitude, velocity, acceleration, Mach or
  dynamic-pressure curves (aligned at liftoff) with a side-by-side metrics table that
  flags the best apogee, max velocity, Mach, acceleration and max Q.
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
  you confirm them. Comma, tab, semicolon and pipe delimiters are auto-detected, along
  with European-locale exports (semicolon-separated with comma decimals) and Windows,
  Unix or classic-Mac line endings.

More named formats are being added. A new parser is a single module under
[`lib/parsers/`](lib/parsers/) that declares how to recognize a file and how to read it
into the canonical flight model — the analysis never changes.

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
