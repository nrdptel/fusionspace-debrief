import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveView,
  viewId,
  loadPresets,
  savePreset,
  deletePreset,
  MAX_PRESETS,
  MAX_PRESET_NAME,
  BUILTIN_VIEWS,
  builtinViews,
  loadHiddenEvents,
  saveHiddenEvents,
  type PlotView,
} from './plotView';

describe('remembering the explorer view', () => {
  const derived = { key: 'd-velocity', label: 'Velocity' };
  const recorded = { key: 'r-3', label: 'Batt_Volts' };

  it('identifies a derived channel by its stable key', () => {
    expect(viewId(derived)).toBe('d-velocity');
  });

  it('identifies a recorded channel by its label, since its key is a column index', () => {
    // 'r-3' is the fourth column of *this* file — it means something else in every other
    // logger's export, so restoring by key would plot an unrelated channel.
    expect(viewId(recorded)).toBe('l:Batt_Volts');
  });

  it('restores the channels a flight actually has, in the saved order', () => {
    const view: PlotView = { y: ['d-velocity', 'l:Batt_Volts', 'd-altitude'], x: 'time' };
    const channels = [{ key: 'd-altitude', label: 'Altitude (AGL)' }, derived, { key: 'r-7', label: 'Batt_Volts' }];
    // The battery column moved from index 3 to 7 in this file; the label finds it anyway.
    expect(resolveView(view, channels)).toEqual(['d-velocity', 'r-7', 'd-altitude']);
  });

  it('drops what this flight doesn’t have rather than guessing', () => {
    const view: PlotView = { y: ['d-velocity', 'l:Tilt_Angle_(deg)'], x: 'time' };
    const channels = [{ key: 'd-altitude', label: 'Altitude (AGL)' }, derived];
    expect(resolveView(view, channels)).toEqual(['d-velocity']);
  });

  it('returns nothing for no saved view, so the caller falls back to its default', () => {
    expect(resolveView(null, [derived])).toEqual([]);
    expect(resolveView({ y: [], x: 'time' }, [derived])).toEqual([]);
  });

  it('never restores the same channel twice', () => {
    const view: PlotView = { y: ['d-velocity', 'd-velocity'], x: 'time' };
    expect(resolveView(view, [derived])).toEqual(['d-velocity']);
  });
});

// The preset store talks to localStorage, and these tests run without a DOM. A Map-backed
// stand-in exercises the real code path (including its JSON validation) without pulling a
// whole DOM implementation in as a dependency for one file.
function stubStorage(): void {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
}

describe('named views', () => {
  beforeEach(stubStorage);

  it('keeps a view under a name and reads it back', () => {
    savePreset('Boost check', { y: ['d-velocity', 'd-mach'], x: 'time' });
    savePreset('Airframe', { y: ['l:Battery'], x: 'time' });
    expect(loadPresets().map((p) => p.name)).toEqual(['Boost check', 'Airframe']);
    expect(loadPresets()[0].y).toEqual(['d-velocity', 'd-mach']);
  });

  it('re-saving a name updates that view rather than duplicating it', () => {
    savePreset('Boost check', { y: ['d-velocity'], x: 'time' });
    savePreset('boost CHECK', { y: ['d-mach'], x: 'd-velocity' });
    const all = loadPresets();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('boost CHECK');
    expect(all[0]).toMatchObject({ y: ['d-mach'], x: 'd-velocity' });
  });

  it('drops the oldest once the cap is reached, and forgets on request', () => {
    for (let i = 1; i <= MAX_PRESETS + 2; i++) savePreset(`view ${i}`, { y: ['d-velocity'], x: 'time' });
    const names = loadPresets().map((p) => p.name);
    expect(names).toHaveLength(MAX_PRESETS);
    expect(names[0]).toBe('view 3'); // the first two fell off
    deletePreset('view 5');
    expect(loadPresets().map((p) => p.name)).not.toContain('view 5');
  });

  it('refuses a nameless or empty view, and trims a long name', () => {
    savePreset('   ', { y: ['d-velocity'], x: 'time' });
    savePreset('Named', { y: [], x: 'time' });
    expect(loadPresets()).toEqual([]);
    savePreset('x'.repeat(MAX_PRESET_NAME + 10), { y: ['d-velocity'], x: 'time' });
    expect(loadPresets()[0].name).toHaveLength(MAX_PRESET_NAME);
  });

  it('survives junk in storage', () => {
    window.localStorage.setItem('debrief.plotPresets', '{"not":"an array"}');
    expect(loadPresets()).toEqual([]);
    window.localStorage.setItem('debrief.plotPresets', '[{"name":"ok","y":["d-velocity"]},{"y":["no name"]}]');
    expect(loadPresets().map((p) => p.name)).toEqual(['ok']);
    expect(loadPresets()[0].x).toBe('time');
  });
});

// The channel sets the corpus actually produces: every analysable flight has altitude, raw
// altitude and velocity; 30 of 34 add Mach and dynamic pressure; 16 of 34 add a measured
// acceleration. A baro-only logger is the case a built-in must not overreach on.
const BARO_ONLY = [
  { key: 'd-altitude', label: 'Altitude (AGL)' },
  { key: 'd-altitude-raw', label: 'Altitude (raw)' },
  { key: 'd-velocity', label: 'Velocity' },
];
const WITH_AIR = [...BARO_ONLY, { key: 'd-mach', label: 'Mach' }, { key: 'd-q', label: 'Dynamic pressure' }];
const EVERYTHING = [...WITH_AIR, { key: 'd-acceleration', label: 'Acceleration' }];

describe('built-in views', () => {
  it('offers every one on a flight that has every channel', () => {
    expect(builtinViews(EVERYTHING).map((v) => v.name)).toEqual(BUILTIN_VIEWS.map((v) => v.name));
  });

  it('withholds a view rather than plotting half of it', () => {
    // "Speed & acceleration" names both. A baro-only flight has the first, so a forgiving
    // resolve would hand back a one-series plot under a name that promises two. Same for the
    // Mach/max-Q pair on a flight where the velocity was judged impossible.
    expect(builtinViews(BARO_ONLY).map((v) => v.name)).toEqual(['Altitude & speed', 'Raw vs cleaned']);
    expect(builtinViews(WITH_AIR).map((v) => v.name)).not.toContain('Speed & acceleration');
    expect(builtinViews(WITH_AIR).map((v) => v.name)).toContain('Mach & max-Q');
  });

  it('offers nothing when the flight has no derived channels at all', () => {
    expect(builtinViews([{ key: 'r-0', label: 'Batt_Volts' }])).toEqual([]);
  });

  it("lets a flyer's own view of the same name replace the built-in", () => {
    const mine = { name: ' mach & MAX-q ', y: ['d-altitude'], x: 'time' };
    const names = builtinViews(EVERYTHING, [mine]).map((v) => v.name);
    expect(names).not.toContain('Mach & max-Q');
    expect(names).toContain('Altitude & speed');
  });

  it('names only channels with stable keys, so no built-in depends on a logger label', () => {
    // A recorded channel is stored as `l:<label>`, and one logger's "Batt(V)" is another's
    // "Battery" — a built-in written against a label would be right on one device and
    // silently wrong on the next.
    for (const v of BUILTIN_VIEWS) {
      for (const id of v.y) expect(id.startsWith('d-')).toBe(true);
      expect(v.y.length).toBeGreaterThanOrEqual(2);
      expect(new Set(v.y).size).toBe(v.y.length);
      expect(v.about.length).toBeGreaterThan(0);
    }
    expect(new Set(BUILTIN_VIEWS.map((v) => v.name.toLowerCase())).size).toBe(BUILTIN_VIEWS.length);
  });

  it('resolves through the same path a saved view does', () => {
    const boost = BUILTIN_VIEWS.find((v) => v.name === 'Speed & acceleration')!;
    expect(resolveView(boost, EVERYTHING)).toEqual(['d-velocity', 'd-acceleration']);
  });
});

// A view names WHICH channels to plot; the chart's zoom row names WHEN to look. They sit a
// few centimetres apart on the same screen, so a word cannot mean both — the first draft
// called the velocity/acceleration view "Boost", which is already the zoom preset that frames
// liftoff to burnout, and the page ended up with two different buttons reading "Boost".
// (The zoom labels are built in components/FlightReport.tsx.)
const ZOOM_LABELS = ['Flight', 'Boost', 'Ascent', 'Descent', 'Full record'];

describe('built-in view names', () => {
  it('do not collide with the chart’s zoom windows', () => {
    const zoom = new Set(ZOOM_LABELS.map((l) => l.toLowerCase()));
    for (const v of BUILTIN_VIEWS) expect(zoom.has(v.name.toLowerCase())).toBe(false);
  });

  it('stay short enough to read as a chip', () => {
    for (const v of BUILTIN_VIEWS) expect(v.name.length).toBeLessThanOrEqual(MAX_PRESET_NAME);
  });
});

describe('which events are called out on the plot', () => {
  beforeEach(stubStorage);

  it('shows everything by default, so nothing has to be opted into', () => {
    expect(loadHiddenEvents()).toEqual([]);
  });

  it('remembers what was hidden, without duplicates', () => {
    saveHiddenEvents(['burnout', 'drogue', 'burnout']);
    expect(loadHiddenEvents().sort()).toEqual(['burnout', 'drogue']);
  });

  it('survives junk in storage rather than losing the plot', () => {
    window.localStorage.setItem('debrief.hiddenEvents', '"not an array"');
    expect(loadHiddenEvents()).toEqual([]);
    window.localStorage.setItem('debrief.hiddenEvents', '["apogee", 7, null]');
    expect(loadHiddenEvents()).toEqual(['apogee']);
  });
});
