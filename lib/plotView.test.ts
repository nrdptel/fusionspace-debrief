import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveView,
  viewId,
  loadPresets,
  savePreset,
  deletePreset,
  MAX_PRESETS,
  MAX_PRESET_NAME,
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
