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

// Named views. Remembering the *last* view covers "open every flight the way I read the last
// one"; a flyer checking several distinct things across a season wants them by name — the
// boost, the deployments, the airframe's health — which is what OpenRocket's plot
// configurations and AltosUI's saved graphs give you. Kept on this device like everything
// else, and applied the same forgiving way: a preset names channels, and only the ones this
// flight actually has are restored.

const PRESETS_KEY = 'debrief.plotPresets';

/** Enough for a season's worth of habits without letting the strip run away. */
export const MAX_PRESETS = 8;
/** Long enough to be descriptive, short enough to stay a chip. */
export const MAX_PRESET_NAME = 24;

export interface PlotPreset extends PlotView {
  name: string;
}

function readPresets(): PlotPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is PlotPreset => {
        if (!p || typeof p !== 'object') return false;
        const q = p as { name?: unknown; y?: unknown; x?: unknown };
        return (
          typeof q.name === 'string' &&
          q.name.trim().length > 0 &&
          Array.isArray(q.y) &&
          q.y.every((v) => typeof v === 'string')
        );
      })
      .map((p) => ({ name: p.name.slice(0, MAX_PRESET_NAME), y: p.y, x: typeof p.x === 'string' ? p.x : 'time' }))
      .slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

export function loadPresets(): PlotPreset[] {
  return readPresets();
}

/** Store a view under a name, replacing one of the same name (trimmed, case-insensitive) so
 *  re-saving is how you update a preset. Oldest is dropped once the cap is reached. */
export function savePreset(name: string, view: PlotView): PlotPreset[] {
  const clean = name.trim().slice(0, MAX_PRESET_NAME);
  if (!clean || view.y.length === 0) return readPresets();
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const kept = readPresets().filter((p) => !same(p.name, clean));
  const next = [...kept, { name: clean, y: [...view.y], x: view.x }].slice(-MAX_PRESETS);
  return writePresets(next);
}

export function deletePreset(name: string): PlotPreset[] {
  return writePresets(readPresets().filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase()));
}

function writePresets(next: PlotPreset[]): PlotPreset[] {
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — the presets still apply to this session */
  }
  return next;
}
