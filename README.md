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
- Draws altitude, velocity, and acceleration against time, with liftoff, burnout,
  apogee, main deploy, and landing marked on each.
- Shows the flight's shape at a glance — a proportional timeline breaks it into boost,
  coast and the descent legs, each with its duration and descent rate.
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
  from altitude when it didn't — labelling which is which.
- Exports a flight: copy a text summary, save it as `.txt`, save the analyzed series
  (time, altitude, velocity, acceleration, Mach, dynamic pressure) as `.csv`, or save
  the altitude chart as a PNG.
- Keeps a logbook — recent flights are remembered on your device for quick re-opening,
  sortable by date, apogee or top speed, with a ★ marking your best of the bunch. Never
  uploaded; clears in one tap.
- Compares several flights at once — drop multiple files (or tick two or more recent
  flights) to overlay any of their altitude, velocity, acceleration, Mach or
  dynamic-pressure curves (aligned at liftoff) with a side-by-side metrics table that
  flags the best apogee, max velocity, Mach, acceleration and max Q.
- Shares a flight as a link with the whole file encoded in the URL fragment — decoded in
  the recipient's browser, never uploaded.

## Privacy

Your file is read in the browser with the standard File API and **never leaves your
device**. There is no backend and no upload — the whole site is static, and every byte
of parsing and analysis runs locally.

## Supported formats

- **Altus Metrum (AltOS)** — TeleMetrum, TeleMega, EasyMega, EasyMini, etc.,
  auto-detected and parsed.
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
- **Generic CSV** — any logger that can export a CSV (with or without a header row).
  Debrief guesses the columns and units and lets you confirm them.

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
