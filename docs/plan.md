# Debrief — product & build plan

This is the plan for the first real version. `docs/design-notes.md` covers the look,
voice, and constraints; this covers the product and the engineering.

## The core promise

One file in → one clean, correctly-analyzed flight out. The hard part isn't drawing a
chart; it's getting the *right* numbers out of messy real data, and being honest about
the rest. That's where the care goes.

## What a flight tells you

Headline numbers, the things people actually read off and report:

- **Apogee** (max altitude AGL) — the real apogee, not an ejection-charge spike.
- **Max velocity**, with Mach if we can establish it.
- **Max acceleration** (g), and max deceleration.
- **Burnout** altitude, velocity, and time; **motor burn time**.
- **Time to apogee**, **coast time**.
- **Descent rates** per phase (drogue, main), and **total time to ground**.
- **Liftoff** time and launch-site baseline (ground pressure/temp where logged).

The curves that matter, with events marked on them:

- **Altitude vs time** — the primary plot.
- **Velocity vs time** and **acceleration vs time**.
- A secondary view or two where they earn their place (e.g. velocity vs altitude).
- Event markers: liftoff, burnout, apogee, each deployment, landing — each one
  annotated and nudgeable if the auto-detection is off.

## The analysis pipeline (what "correctly-analyzed" means)

Every altimeter is different, so analysis runs on a **canonical flight model** —
time plus named channels (altitude, velocity, acceleration, pressure, temperature,
voltage, …), each with units and provenance — that every parser produces. The pipeline:

1. **Baseline.** Average the pre-launch baro to set ground level; altitude is AGL from
   there. Convert pressure→altitude when only pressure is logged.
2. **Liftoff detection** — accel threshold when accel is logged, otherwise sustained
   altitude rise.
3. **Smoothing** sized to the actual sample rate (handles mixed/variable rates), so a
   velocity derived from noisy baro isn't garbage. Where the logger records its own
   accel/velocity, prefer and fuse it rather than re-deriving.
4. **Burnout** — end of thrust from the accel sign change (or the inflection in a
   baro-only flight).
5. **Apogee** — found from the velocity zero-crossing, **robust to ejection spikes**: a
   pressure pop at deployment can throw a false altitude peak, and naive "max altitude"
   gets it wrong. This is the headline example of doing it right.
6. **Deployments** — drogue/main from descent-rate changes and pressure-spike
   signatures.
7. **Descent rates** per phase; **landing** detection; total time.

Each step is explained in "Where the numbers come from," with its assumptions and where
it can be fooled — and where auto-detection is uncertain, the user can drag an event
marker to correct it. Show the work; don't print a number you don't trust.

## Formats — how parsing is structured

A **parser registry**. Each parser declares a `detect()` (by extension, header
signature, and column names) and a `parse()` that returns the canonical flight model.
Adding a logger = adding one module; nothing else changes. Detection runs the
registry and falls back to the generic importer.

The universal escape hatch is a **generic CSV importer with interactive column mapping
and a unit picker** — point it at the time / altitude / accel columns, set units, done.
This alone covers "any logger that can export a CSV," which is the Excel-wrangling pain
the tool exists to kill. On top of that, a handful of named formats get
auto-detected and parsed with zero configuration.

Proposed first named formats (rationale below, and the exact priority is the main thing
I want your read on):

- **Generic CSV** — universal, highest leverage.
- **Eggtimer** (Quantum / Apogee / Quark) — very common, plain CSV, well documented.
- **PerfectFlite StratoLogger** — ubiquitous baro altimeter.
- **Featherweight Blue Raven / Raven** — rich data (baro + accel + IMU), good test of
  the multi-channel model.
- **Altus Metrum** (TeleMetrum / EasyMega / EasyMini) — open hardware, documented CSV,
  baro + accel.

## Sharing & saving — within the privacy promise

The file never leaves the device, so "share" can't mean "upload."

- **URL** holds the *view* (units, visible curves, smoothing, selected events) — not the
  data. Shareable, refresh-safe, exactly like the Motor Finder.
- **Recent flights** remembered per device (IndexedDB for the data, small and private).
- **Export** for sharing a result: a chart image, a one-page printable report, and a
  copy-as-text summary.
- **Optional share-by-link** (worth your opinion): encode a whole flight into the URL's
  `#fragment`, compressed. The fragment never goes to a server, so a second browser can
  open the link and decode the flight entirely client-side — a real shareable link that
  still never uploads anything. Works for reasonably sized flights; offered explicitly,
  not automatic. It's very on-brand, but it's a bigger build, so I'd slot it after v1.

## Stack

Match the family: **Next.js (App Router) with static export** (`output: 'export'`),
**Tailwind**, **Geist + Geist Mono**, Cloudflare Pages. This reuses the exact theme
toggle, footer, palette, and brand chrome, so Debrief is visually identical family by
default. The analyzer is one client route; the shell stays static.

- **Charts:** uPlot — tiny, canvas-based, and fast with the thousands of samples a
  flight log carries. Wrapped behind a small chart component so it's swappable.
- **Parsing:** a focused CSV reader and per-format parsers, kept dependency-light. All
  in a `lib/` that's pure and unit-testable, independent of the UI.
- **Brand assets:** vendor copies of the wordmark/mark/icon from the hub so the marks
  match exactly.

## Build order

1. Project scaffold: Next static export, Tailwind, fonts, theme toggle, header/footer
   chrome, brand assets, privacy line. A recognizably-Fusion-Space empty shell.
2. Canonical flight model + parser registry + generic CSV importer with column mapping.
   Drop a file, see it parsed.
3. Analysis pipeline (baseline → liftoff → smoothing → burnout → apogee → deployments →
   landing) with the headline numbers.
4. Charts with event markers; unit toggle; URL view-state.
5. One or two named-format parsers to prove the registry.
6. "How to read this" + "Where the numbers come from"; export/report; polish.
7. Deploy config for Pages.

I'll commit at each step and check in rather than disappear into a big drop.
