# Debrief — design notes

These are the notes I'm building Debrief from: what Fusion Space is, the rules the
existing tools follow, and how Debrief should follow them. The goal is that someone who
knows the Motor Finder opens Debrief and never doubts it's the same project by the same
hand.

## What Fusion Space is

Free, polished, careful tools for the high-power rocketry hobby. The hub
(fusionspace.co) says it plainly: tools that are "careful about the data, free to use,
and made to be genuinely useful at the bench." Personal, non-commercial, not affiliated
with any vendor or manufacturer. One person's projects, made well.

There are two sites today:

- **fusionspace.co** — the hub. A wordmark, a mark, a one-line promise, a grid of
  projects, a quiet footer. That's it.
- **motor.fusionspace.co** — the HPR Motor Finder. A dense, fast, client-side tool for
  finding motor stock and pricing across vendors.

## The look

The two sites share one design system, and Debrief uses it as-is.

- **Stack (inferred):** Next.js (App Router, static export), Tailwind, Geist + Geist
  Mono fonts, deployed on Cloudflare Pages. The theme is toggled by adding `dark` /
  `light` to `<html>`, with an inline script in `<head>` that reads the saved choice
  before first paint so there's no flash.
- **Palette:** zinc neutrals end to end. Light is `bg-white` / `text-zinc-900`; dark is
  `bg-zinc-950` / `text-zinc-100`. Borders are `zinc-200` / `zinc-800`, muted text is
  `zinc-500`/`zinc-600` → `zinc-400`.
- **Accent:** indigo (`indigo-600` light, `indigo-400` dark) for links and the one
  primary button. Used sparingly.
- **Semantic colors, also sparing:** emerald = good / confirmed, amber = caution /
  stale / approximate, sky = info / API, red = error. Always as soft tinted
  badges (`bg-emerald-500/10`, a thin matching border), never loud.
- **Shape:** rounded corners (`md`/`lg`/`xl`), thin borders, cards that are
  `bg-white dark:bg-zinc-900/40` and pick up an indigo border on hover. A single faint
  indigo blur glow behind the hero on the hub. Generous whitespace.
- **Type:** `font-semibold tracking-tight` headings, comfortable `leading-relaxed`
  body, `font-mono` for anything machine-ish (designations, URLs, values, code).
- **Chrome:** a header with the brand mark on the left and a theme toggle (`◐` glyph,
  cycles System → Light → Dark, remembered per device) on the right. A thin `border-b`
  under it. A quiet footer with nav links and a disclaimer.
- **Width:** centered, `max-w-5xl`–`max-w-6xl`, `px-4 md:px-6`, `py-8 md:py-10`.

## The voice

Plain, precise, and honest. It explains rather than sells. It never overclaims, and it
is upfront about the limits of its own data. A few things it does consistently:

- A collapsible **"How to use this site"** at the top for newcomers, out of the way for
  everyone else.
- A **"Where the numbers come from"** section that explains, in calm detail, exactly how
  every number is derived and where it can be wrong. This is the heart of the voice —
  e.g. for the Motor Finder, on specific impulse: "we hide it when the underlying grain
  weight looks wrong rather than print a number we don't trust." That instinct — show
  your work, and say nothing you don't trust — is the thing to copy.
- **Best-effort disclaimers** stated without hedging or apology: "Stock and price data
  are best-effort, often stale, and not authoritative — always confirm on the vendor's
  own page before purchasing."
- The footer line: "Personal, non-commercial projects — not affiliated with any
  rocketry vendor or manufacturer. Built for the hobby rocketry community."

No marketing adjectives, no exclamation, no filler. Em dashes for asides. Lowercase,
technical examples in mono.

## The engineering philosophy

- **Everything the visitor does happens in their browser.** The Motor Finder pays for
  its server work on a schedule (scraping) and ships a static snapshot; per-visitor
  there is no backend. Filtering, sorting, planning — all client-side and instant.
- **State lives in the URL.** Every filter and view is in the query string, so any view
  is shareable and survives a refresh. Per-device preferences (theme, watchlist, saved
  rockets) live in `localStorage` — no accounts, ever.
- **Transparency is a feature, not a footnote.** The methodology section is long and
  specific on purpose.
- **Restraint.** Dense where density helps the user; calm everywhere else.

## How Debrief follows all of this

**What Debrief is:** a universal, in-browser altimeter flight-log analyzer. Drop in a
flight file from any logger and get one clean, correctly-analyzed flight — the headline
numbers and the curves that matter — with the real-world mess (ejection spikes, sensor
noise, mixed sample rates, units) handled gracefully. Today every altimeter brand ships
its own software, often Windows-only, and people end up hand-wrangling CSVs in Excel.
Debrief replaces that.

It fits the family by construction:

- **100% client-side and static.** The file is parsed in the browser and never leaves
  the device. There is no backend and no per-visitor server work — it sits on Pages' free
  tier and needs nothing on a schedule. This is the hard line.
- **The privacy promise is stated plainly**, the way the Motor Finder states its
  data disclaimer — your file is read in this browser and never uploaded.
- **Same chrome, same voice.** Brand mark, theme toggle, footer disclaimer, links back
  to the hub and the Motor Finder, a GitHub link. A "How to read this" intro and a
  "Where the numbers come from" section that explains every derived number and every
  auto-detected event, and says where it can be wrong.
- **State in the URL** for view settings (units, which curves, smoothing, selected
  events); the flight data itself stays local. Recent flights remembered per device.

What "correctly-analyzed" means, and the format and sharing decisions, are in
`docs/plan.md`.
