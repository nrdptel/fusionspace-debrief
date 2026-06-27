import { describe, it, expect } from 'vitest';
import { groundTrack, recoveryStats, compass } from './gps';

describe('groundTrack', () => {
  it('projects lat/lon to metres about the pad, with east/north signs right', () => {
    // Pad at (34, -116). One degree of latitude ≈ 111.32 km; longitude scaled by cos(34°).
    const lat = Float64Array.from([34, 34, 34.001]); // pad, pad, ~111 m north
    const lon = Float64Array.from([-116, -115.999, -116]); // pad, ~92 m east, pad
    const t = groundTrack(lat, lon, 1)!; // pad reference = first sample only
    expect(t.lat0).toBeCloseTo(34, 6);
    expect(t.north[2]).toBeCloseTo(111.32, 0); // 0.001° lat
    expect(t.east[1]).toBeGreaterThan(80); // 0.001° lon × cos(34°) ≈ 92 m, east is +
    expect(t.east[1]).toBeLessThan(100);
  });

  it('carries NaN through a missing fix', () => {
    const t = groundTrack(Float64Array.from([34, NaN, 34]), Float64Array.from([-116, -116, NaN]), 1)!;
    expect(Number.isNaN(t.east[1])).toBe(true);
    expect(Number.isNaN(t.north[2])).toBe(true);
  });

  it('returns null without a usable pad fix', () => {
    expect(groundTrack(new Float64Array(0), new Float64Array(0))).toBeNull();
    expect(groundTrack(Float64Array.from([NaN]), Float64Array.from([NaN]))).toBeNull();
  });
});

describe('recoveryStats', () => {
  it('measures max drift and the landing distance/bearing (last fix)', () => {
    // East/north metres: out to 300 m east at apogee, lands 200 m NE of the pad.
    const track = {
      east: Float64Array.from([0, 300, 200]),
      north: Float64Array.from([0, 0, 200]),
      lat0: 0,
      lon0: 0,
    };
    const s = recoveryStats(track)!;
    expect(s.maxDrift).toBeCloseTo(300, 6);
    expect(s.landingDistance).toBeCloseTo(Math.hypot(200, 200), 6);
    expect(s.landingBearing).toBeCloseTo(45, 6); // NE
  });

  it('uses the last VALID fix as the landing point and ignores gaps', () => {
    const track = { east: Float64Array.from([0, 100, NaN]), north: Float64Array.from([0, 0, NaN]), lat0: 0, lon0: 0 };
    const s = recoveryStats(track)!;
    expect(s.landingEast).toBe(100);
    expect(s.landingBearing).toBeCloseTo(90, 6); // due east
  });

  it('returns null when no fix is valid', () => {
    expect(recoveryStats({ east: Float64Array.from([NaN]), north: Float64Array.from([NaN]), lat0: 0, lon0: 0 })).toBeNull();
  });
});

describe('compass', () => {
  it('maps bearings to 8-point labels and wraps', () => {
    expect(compass(0)).toBe('N');
    expect(compass(90)).toBe('E');
    expect(compass(180)).toBe('S');
    expect(compass(270)).toBe('W');
    expect(compass(45)).toBe('NE');
    expect(compass(360)).toBe('N');
    expect(compass(-90)).toBe('W');
  });
});
