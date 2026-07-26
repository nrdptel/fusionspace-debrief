// Remember how a flyer set the explorer up. The tenth flight of a season is looked at the
// same way as the ninth — the same channels, against the same axis — and rebuilding that
// view on every file (and every reload) is the kind of forgetting a mature tool doesn't do:
// OpenRocket's plot dialog and AltosUI both keep the series you enabled.
//
// Kept on this device only, like the rest of Debrief's state, and never a hard requirement:
// a saved view is applied only where the new flight actually has those channels.

const KEY = 'debrief.plotView';
const COMPARE_KEY = 'debrief.compareChannel';

/**
 * Which channel the comparison chart was last showing. Same reasoning as the explorer's
 * saved view, one surface over: a flyer who compares boosts looks at velocity every time,
 * and having to click past altitude on every comparison is the tool forgetting something it
 * was just told. Stored as a plain string and validated by the caller, since the set of
 * channels belongs to the comparison, not here.
 */
export function loadCompareChannel(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(COMPARE_KEY);
  } catch {
    return null;
  }
}

export function saveCompareChannel(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COMPARE_KEY, key);
  } catch {
    /* storage blocked — the choice still applies to this view */
  }
}

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

// Built-in views. The named views above are all flyer-made, which means a first-time visitor
// opens the explorer on a single channel and builds from scratch — the gap against
// OpenRocket, whose plot dialog ships quick-select preset configurations so a new user gets a
// useful plot before knowing what to ask for.
//
// These name only Debrief's own derived channels, never a recorded one: a recorded channel is
// stored by its logger's label, and "Batt(V)" on one device is "Battery" on the next, so a
// built-in written against labels would be right for one logger and silently wrong for the
// rest. How often each is actually available, measured over the 34 analysable corpus flights:
// altitude, raw altitude and velocity on 34; Mach and dynamic pressure on 30 (both withheld
// when the velocity is judged impossible); measured acceleration on 16.
//
// A built-in is offered only where the flight has EVERY channel it names. A view that quietly
// drops half its series is a different view under the same name: "Speed & acceleration"
// plotting velocity alone on a baro-only log promises two readings and shows one.
//
// The names also have to stay clear of the chart's zoom row, which frames a time window
// ('Flight', 'Boost', 'Ascent', 'Descent') a few centimetres away. A view says WHICH channels,
// the zoom says WHEN; one word must not mean both.

export interface BuiltinView extends PlotPreset {
  /** Why a flyer would open this one — the chip's tooltip. */
  about: string;
}

export const BUILTIN_VIEWS: readonly BuiltinView[] = [
  {
    name: 'Altitude & speed',
    y: ['d-altitude', 'd-velocity'],
    x: 'time',
    about: 'How high and how fast, against time — the plot of the whole flight',
  },
  {
    name: 'Speed & acceleration',
    y: ['d-velocity', 'd-acceleration'],
    x: 'time',
    about: 'Speed against measured acceleration — what the motor did, and when it stopped',
  },
  {
    name: 'Mach & max-Q',
    y: ['d-mach', 'd-q'],
    x: 'time',
    about: 'Mach number and dynamic pressure — the transonic region and the peak air load',
  },
  {
    name: 'Raw vs cleaned',
    y: ['d-altitude-raw', 'd-altitude'],
    x: 'time',
    about: 'The altitude as recorded under the altitude Debrief reads — exactly what spike removal took out',
  },
];

/**
 * The built-in views this flight can actually show, in order.
 *
 * Two rules, both about not misleading: a view appears only when every channel it names is
 * present, and a flyer's own saved view of the same name wins — re-saving a name is how you
 * replace a built-in, not how you end up with two chips reading the same word.
 */
export function builtinViews(
  channels: { key: string; label: string }[],
  saved: PlotPreset[] = [],
): BuiltinView[] {
  const taken = new Set(saved.map((p) => p.name.trim().toLowerCase()));
  return BUILTIN_VIEWS.filter(
    (v) => !taken.has(v.name.toLowerCase()) && resolveView(v, channels).length === v.y.length,
  );
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
