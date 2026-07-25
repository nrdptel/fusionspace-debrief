// Remember how a flyer set the explorer up. The tenth flight of a season is looked at the
// same way as the ninth — the same channels, against the same axis — and rebuilding that
// view on every file (and every reload) is the kind of forgetting a mature tool doesn't do:
// OpenRocket's plot dialog and AltosUI both keep the series you enabled.
//
// Kept on this device only, like the rest of Debrief's state, and never a hard requirement:
// a saved view is applied only where the new flight actually has those channels.

const KEY = 'debrief.plotView';

export interface PlotView {
  /** Channel identifiers, in plot order. */
  y: string[];
  /** The x-axis channel identifier ('time' for the usual case). */
  x: string;
}

/**
 * A channel's identifier for storage. Debrief's own derived channels have stable keys
 * ('d-velocity'), but a recorded channel's key is its index in the file — 'r-3' means
 * something different in every logger's export, so those are stored by label instead. That
 * way "I always want the battery voltage" survives moving between loggers, and nothing
 * restores the wrong column.
 */
export function viewId(channel: { key: string; label: string }): string {
  return channel.key.startsWith('d-') ? channel.key : `l:${channel.label}`;
}

/** Which of `channels` a saved view names, in the view's own order. */
export function resolveView(view: PlotView | null, channels: { key: string; label: string }[]): string[] {
  if (!view) return [];
  const byId = new Map(channels.map((c) => [viewId(c), c.key]));
  const out: string[] = [];
  for (const id of view.y) {
    const key = byId.get(id);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

export function loadPlotView(): PlotView | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const { y, x } = parsed as { y?: unknown; x?: unknown };
    if (!Array.isArray(y) || !y.every((v) => typeof v === 'string')) return null;
    return { y: y as string[], x: typeof x === 'string' ? x : 'time' };
  } catch {
    return null;
  }
}

export function savePlotView(view: PlotView): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    /* a private window with storage blocked — the view still applies to this session */
  }
}
