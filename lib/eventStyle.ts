import type { EventType } from './analyze/types';

// Marker colours, chosen to read on both light and dark canvases.
export const EVENT_COLOR: Record<EventType, string> = {
  liftoff: '#6366f1', // indigo-500
  burnout: '#f59e0b', // amber-500
  apogee: '#10b981', // emerald-500
  drogue: '#0ea5e9', // sky-500
  main: '#0ea5e9', // sky-500
  landing: '#71717a', // zinc-500
};
