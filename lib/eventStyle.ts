import type { EventType } from './analyze/types';

// Marker colours, chosen to read on both light and dark canvases.
//
// **Every event has its OWN colour, and `lib/eventStyle.test.ts` fails if two ever share one.**
// Drogue and main were both `#0ea5e9` — the two deployments of a dual-deploy flight, drawn
// identically on every exported figure. On screen the chips carry their labels so the colour is
// decoration; in a saved SVG or PNG the marker colour is all a reader has, and "which of these
// two is the main?" is exactly the question a cert document is asked. Drogue takes purple-500,
// which is already in `COMPARE_PALETTE`, so the suite gains no new colour.
export const EVENT_COLOR: Record<EventType, string> = {
  liftoff: '#6366f1', // indigo-500
  burnout: '#f59e0b', // amber-500
  apogee: '#10b981', // emerald-500
  drogue: '#a855f7', // purple-500
  main: '#0ea5e9', // sky-500
  landing: '#71717a', // zinc-500
};
