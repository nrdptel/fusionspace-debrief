import { describe, it, expect } from 'vitest';
import { groundTrack, recoveryStats, compass, trackGpx, descentWind } from './gps';

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
    expect(s.landingIndex).toBe(1); // the last finite fix, not the trailing NaN
    expect(s.landingBearing).toBeCloseTo(90, 6); // due east
  });

  it('returns null when no fix is valid', () => {
    expect(recoveryStats({ east: Float64Array.from([NaN]), north: Float64Array.from([NaN]), lat0: 0, lon0: 0 })).toBeNull();
  });
});

describe('trackGpx', () => {
  const lat = Float64Array.from([34.1, NaN, 34.2]);
  const lon = Float64Array.from([-116.1, NaN, -116.2]);
  const gpx = trackGpx('rocket & co', lat, lon, 2);

  it('emits a valid GPX with a Landing waypoint and skips gaps', () => {
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<wpt lat="34.200000" lon="-116.200000">');
    expect(gpx).toContain('<name>Landing</name>');
    // Two finite trackpoints; the NaN sample is dropped.
    expect((gpx.match(/<trkpt /g) ?? []).length).toBe(2);
    expect(gpx).toContain('<trkpt lat="34.100000" lon="-116.100000"/>');
  });

  it('escapes XML in the track name', () => {
    expect(gpx).toContain('<name>rocket &amp; co</name>');
  });
});

describe('descentWind', () => {
  it('reads the wind from a steady drift over the descent window', () => {
    // Over 10 s the rocket drifts 100 m due east → 10 m/s, and since it drifts
    // toward the east, the wind is FROM the west (270°).
    const track = {
      east: Float64Array.from([0, 0, 50, 100]),
      north: Float64Array.from([0, 0, 0, 0]),
      lat0: 0,
      lon0: 0,
    };
    const time = Float64Array.from([0, 5, 10, 15]); // descent window: index 1 → 3 (10 s)
    const w = descentWind(track, time, 1, 3)!;
    expect(w.speed).toBeCloseTo(10, 6);
    expect(w.fromBearing).toBeCloseTo(270, 6); // drifts east ⇒ wind from the west
  });

  it('returns null for negligible drift or a degenerate window', () => {
    const calm = { east: Float64Array.from([0, 1, 0]), north: Float64Array.from([0, 0, 1]), lat0: 0, lon0: 0 };
    expect(descentWind(calm, Float64Array.from([0, 5, 10]), 0, 2)).toBeNull(); // < 5 m drift
    const track = { east: Float64Array.from([0, 100]), north: Float64Array.from([0, 0]), lat0: 0, lon0: 0 };
    expect(descentWind(track, Float64Array.from([0, 0]), 0, 1)).toBeNull(); // zero elapsed time
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
