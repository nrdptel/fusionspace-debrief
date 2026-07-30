import { describe, it, expect } from 'vitest';
import { padOrigin, groundTrack, recoveryStats, compass, trackGpx, descentWind, ascentLean, windProfile, trackKml } from './gps';

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

describe('windProfile', () => {
  // A 1000 m descent (apogee → ground): the air above 500 m drifts the rocket
  // east (wind from the west), below 500 m it drifts north (wind from the south).
  // Bands are apogee/5 = 200 m; 21 fixes at 1 Hz give every band ≥ 4 fixes.
  const n = 21;
  const alt = Float64Array.from({ length: n }, (_, i) => 1000 - 50 * i);
  const time = Float64Array.from({ length: n }, (_, i) => i);
  const east = Float64Array.from({ length: n }, (_, i) => 10 * Math.min(i, 10)); // east drift up high
  const north = Float64Array.from({ length: n }, (_, i) => (i <= 10 ? 0 : 10 * (i - 10))); // north drift down low
  const track = { east, north, lat0: 0, lon0: 0 };

  it('bins the descent drift into wind layers, high → low, with the shear', () => {
    const layers = windProfile(track, time, alt, 0, n - 1, 1000);
    expect(layers.length).toBe(5);
    // Ordered top band first.
    expect(layers[0].altHiM).toBe(1000);
    expect(layers[layers.length - 1].altLoM).toBe(0);
    // The top layer drifts east ⇒ wind from the west; the bottom drifts north ⇒ from the south.
    expect(compass(layers[0].fromBearing)).toBe('W');
    expect(compass(layers[layers.length - 1].fromBearing)).toBe('S');
    expect(layers[0].speed).toBeCloseTo(10, 0);
    expect(layers[0].fixes).toBeGreaterThanOrEqual(4);
  });

  it('skips a band with too few fixes rather than reading noise', () => {
    // Only two valid fixes in the whole window → no band qualifies.
    const sparseT = Float64Array.from([0, 100]);
    const sparseA = Float64Array.from([900, 100]);
    const sparseTrack = { east: Float64Array.from([0, 80]), north: Float64Array.from([0, 0]), lat0: 0, lon0: 0 };
    expect(windProfile(sparseTrack, sparseT, sparseA, 0, 1, 1000)).toEqual([]);
  });
});

describe('ascentLean', () => {
  it('measures the off-vertical angle and direction at apogee', () => {
    // Apogee 100 m due east of the pad at 1000 m up → atan(100/1000) ≈ 5.71° toward E.
    const track = { east: Float64Array.from([0, 50, 100]), north: Float64Array.from([0, 0, 0]), lat0: 0, lon0: 0 };
    const lean = ascentLean(track, 2, 1000)!;
    expect(lean.downrange).toBeCloseTo(100, 6);
    expect(lean.angleDeg).toBeCloseTo(5.71, 1);
    expect(compass(lean.towardBearing)).toBe('E');
  });

  it('falls back to the nearest valid fix when the apogee sample is a gap', () => {
    const track = { east: Float64Array.from([0, 80, NaN]), north: Float64Array.from([0, 0, NaN]), lat0: 0, lon0: 0 };
    const lean = ascentLean(track, 2, 1000)!; // apogee index 2 is NaN → use index 1
    expect(lean.downrange).toBeCloseTo(80, 6);
  });

  it('returns null for an essentially vertical flight or a bad apogee', () => {
    const track = { east: Float64Array.from([0, 1, 2]), north: Float64Array.from([0, 1, 1]), lat0: 0, lon0: 0 };
    expect(ascentLean(track, 2, 1000)).toBeNull(); // < 5 m offset
    expect(ascentLean(track, 2, 0)).toBeNull(); // no altitude
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

describe('trackKml — the flight in Google Earth', () => {
  const lat = Float64Array.from([34.4949, 34.4952, 34.4958]);
  const lon = Float64Array.from([-116.9577, -116.9571, -116.9564]);
  const alt = Float64Array.from([0, 812.3, 5]);

  it('writes lon,lat,alt triples — the order KML wants, not the one the app says', () => {
    // The one thing that is easy to get wrong and impossible to see afterwards: KML is
    // longitude first, which is the reverse of every other coordinate in this codebase.
    // A swapped pair puts a Mojave launch in the Indian Ocean and still opens fine.
    const kml = trackKml('flight', lat, lon, alt, 2);
    expect(kml).toContain('-116.957700,34.494900,0.0');
    expect(kml).toContain('-116.957100,34.495200,812.3');
    expect(kml).toContain('<altitudeMode>relativeToGround</altitudeMode>');
    expect(kml).toContain('<extrude>1</extrude>');
    // Well-formed enough to be a document, with the landing marked.
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml).toContain('<name>Landing</name>');
    expect(kml.trimEnd().endsWith('</kml>')).toBe(true);
  });

  it('flattens a flight with no altitude channel rather than refusing one', () => {
    const kml = trackKml('flight', lat, lon, undefined, -1);
    expect(kml).toContain('-116.957100,34.495200,0.0');
    expect(kml).not.toContain('Landing');
  });

  it('skips fixes the receiver never made, and escapes the name', () => {
    const gappy = Float64Array.from([34.4949, NaN, 34.4958]);
    const kml = trackKml('a & b', gappy, lon, alt, -1);
    expect(kml).toContain('<name>a &amp; b</name>');
    expect(kml.match(/,34\./g)?.length).toBe(2);
  });
});

describe('the pad a recovery reading is measured from', () => {
  it('is the file’s, not the stretch’s, when a flyer reads part of a record', () => {
    // Every reading on the recovery card is measured FROM the pad — how far the rocket landed
    // from it, which way to walk, how far it leaned off vertical. Taking that reference from
    // the opening fixes of a CROP puts the pad in mid-air. Measured on a real corpus
    // Featherweight GPS record, cropping to apogee-onward moved the walk-back from 3,866 ft on
    // a bearing of 208° SW to 4,676 ft on 127° SE — 81° and 810 ft wrong, on the one surface a
    // flyer physically acts on.
    const n = 200;
    const lat = new Float64Array(n);
    const lon = new Float64Array(n);
    // Straight up from the pad, then drifting north-east under canopy.
    for (let i = 0; i < n; i++) {
      const drift = Math.max(0, i - 100) / 100;
      lat[i] = 34 + drift * 0.01;
      lon[i] = -117 + drift * 0.01;
    }
    const pad = padOrigin(lat, lon)!;
    expect(pad.lat0).toBeCloseTo(34, 6);

    const wholeStats = recoveryStats(groundTrack(lat, lon)!, n - 1);
    const cropLat = lat.slice(120);
    const cropLon = lon.slice(120);
    // Without the file's pad the crop's own first fixes become the reference…
    const naive = recoveryStats(groundTrack(cropLat, cropLon)!, cropLat.length - 1);
    expect(naive.landingDistance).toBeLessThan(wholeStats.landingDistance * 0.9);
    // …and with it, the crop reads exactly what the whole file reads.
    const fixed = recoveryStats(groundTrack(cropLat, cropLon, 16, pad)!, cropLat.length - 1);
    expect(fixed.landingDistance).toBeCloseTo(wholeStats.landingDistance, 6);
    expect(fixed.landingBearing).toBeCloseTo(wholeStats.landingBearing, 6);
    expect(fixed.maxDrift).toBeCloseTo(wholeStats.maxDrift, 6);
  });

  it('falls back to the stretch when the file has no origin to give', () => {
    const lat = Float64Array.from([34, 34.001, 34.002]);
    const lon = Float64Array.from([-117, -117.001, -117.002]);
    expect(padOrigin(Float64Array.from([NaN, NaN]), Float64Array.from([NaN, NaN]))).toBeNull();
    // A non-finite origin is ignored rather than poisoning the projection.
    const t = groundTrack(lat, lon, 1, { lat0: Number.NaN, lon0: Number.NaN })!;
    expect(t.lat0).toBeCloseTo(34, 6);
  });
});
