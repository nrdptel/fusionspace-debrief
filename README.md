# Debrief

A universal, in-browser altimeter flight-log analyzer. Drop in a flight file from any
logger and get one clean, correctly-analyzed flight — the headline numbers and the
curves that matter, with the real-world mess (ejection spikes, sensor noise, mixed
sample rates, units) handled.

Live at **[debrief.fusionspace.co](https://debrief.fusionspace.co)**. Part of
[Fusion Space](https://fusionspace.co), alongside the
[HPR Motor Finder](https://motor.fusionspace.co).

## What it does

- Reads a flight log and reports apogee, max velocity (and Mach), max acceleration,
  burnout, time-to-apogee, deployments, descent rates, and flight time.
- Draws altitude, velocity, and acceleration against time, with liftoff, burnout,
  apogee, main deploy, and landing marked on each.
- Finds the *real* apogee — a short median filter removes the single-sample spike an
  ejection charge punches into a barometric trace, so a deployment pop can't fake a
  higher reading.
- Uses the device's own velocity/acceleration when it logged them, and derives them
  from altitude when it didn't — labelling which is which.
- Exports a flight: copy a text summary, save it as `.txt`, or save the altitude chart
  as a PNG. Recent flights are remembered on your device for quick re-opening.

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
