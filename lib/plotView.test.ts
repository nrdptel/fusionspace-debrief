import { describe, it, expect } from 'vitest';
import { resolveView, viewId, type PlotView } from './plotView';

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
