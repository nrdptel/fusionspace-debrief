// Turn a flight's GPS latitude/longitude track into a local, metres-on-the-ground
// picture relative to the launch pad — the basis for the recovery (walkback) view.
// A small-area equirectangular projection is plenty here: a hobby flight drifts a
// few hundred metres, where the flat-earth error is millimetres.

const M_PER_DEG_LAT = 111320; // metres per degree of latitude (near enough everywhere)

export interface GroundTrack {
  /** Metres east of the pad at each sample (NaN where the fix was missing). */
  east: Float64Array;
  /** Metres north of the pad at each sample. */
  north: Float64Array;
  /** Pad reference, decimal degrees. */
  lat0: number;
  lon0: number;
}

/** Median of the finite values in [from, to). */
function median(values: Float64Array, from: number, to: number): number {
  const arr: number[] = [];
  for (let i = from; i < to; i++) if (Number.isFinite(values[i])) arr.push(values[i]);
  if (arr.length === 0) return NaN;
  arr.sort((a, b) => a - b);
  return arr[arr.length >> 1];
}

/** Project lat/lon onto east/north metres about a pad reference taken from the
 *  first `baseN` valid samples (the rocket sitting on the rail). */
export function groundTrack(lat: Float64Array, lon: Float64Array, baseN = 16): GroundTrack | null {
  const n = Math.min(lat.length, lon.length);
  if (n === 0) return null;
  const lat0 = median(lat, 0, Math.min(n, baseN));
  const lon0 = median(lon, 0, Math.min(n, baseN));
  if (!Number.isFinite(lat0) || !Number.isFinite(lon0)) return null;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const east = new Float64Array(n);
  const north = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const la = lat[i];
    const lo = lon[i];
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      east[i] = NaN;
      north[i] = NaN;
      continue;
    }
    east[i] = (lo - lon0) * mPerDegLon;
    north[i] = (la - lat0) * M_PER_DEG_LAT;
  }
  return { east, north, lat0, lon0 };
}

export interface AscentLean {
  /** Horizontal distance from the pad to the apogee point, metres. */
  downrange: number;
  /** Average flight-path angle off vertical from the pad to apogee, degrees. */
  angleDeg: number;
  /** Compass bearing the flight leaned toward, degrees clockwise from north. */
  towardBearing: number;
}

/**
 * How far off vertical the flight actually went — the horizontal offset of the
 * apogee point from the pad, and the average angle off vertical to reach it.
 * A measurement of the flown ascent (weathercocking into the wind, plus the wind
 * drift during the slow coast near apogee); a steeply leaning flight loses
 * altitude to the cosine and drifts further. Returns null without a usable apogee
 * fix or when the offset is in the GPS noise (essentially vertical).
 */
export function ascentLean(track: GroundTrack, apogeeIndex: number, apogeeAltitude: number): AscentLean | null {
  const { east, north } = track;
  const n = Math.min(east.length, north.length);
  if (!(apogeeAltitude > 0) || apogeeIndex < 0 || apogeeIndex >= n) return null;
  // The exact apogee sample may be a gap, so take the nearest valid fix to it.
  let idx = -1;
  for (let r = 0; r < 30 && idx < 0; r++) {
    for (const i of [apogeeIndex - r, apogeeIndex + r]) {
      if (i >= 0 && i < n && Number.isFinite(east[i]) && Number.isFinite(north[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return null;
  const downrange = Math.hypot(east[idx], north[idx]);
  if (downrange < 5) return null; // within the GPS noise — call it vertical
  let toward = (Math.atan2(east[idx], north[idx]) * 180) / Math.PI;
  if (toward < 0) toward += 360;
  return { downrange, angleDeg: (Math.atan2(downrange, apogeeAltitude) * 180) / Math.PI, towardBearing: toward };
}

export interface RecoveryStats {
  /** Greatest horizontal distance from the pad over the whole flight, metres. */
  maxDrift: number;
  /** Landing point relative to the pad (last valid fix), metres. */
  landingEast: number;
  landingNorth: number;
  /** Sample index of the last valid fix (so the caller can read its lat/lon). */
  landingIndex: number;
  /** Straight-line distance from the pad to the landing point, metres. */
  landingDistance: number;
  /** Compass bearing pad → landing, degrees clockwise from north [0, 360). */
  landingBearing: number;
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** A GPX 1.1 document for the flight: the ground track as a <trk>, plus a
 *  <wpt> at the landing point so a phone/handheld can navigate straight to it.
 *  Lat/lon only (the recovery walk is on the ground); gaps in the fix are skipped. */
export function trackGpx(name: string, lat: Float64Array, lon: Float64Array, landingIndex: number): string {
  const n = Math.min(lat.length, lon.length);
  const fix = (v: number) => v.toFixed(6);
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(lat[i]) || !Number.isFinite(lon[i])) continue;
    pts.push(`      <trkpt lat="${fix(lat[i])}" lon="${fix(lon[i])}"/>`);
  }
  const wpt =
    landingIndex >= 0 && landingIndex < n && Number.isFinite(lat[landingIndex]) && Number.isFinite(lon[landingIndex])
      ? `  <wpt lat="${fix(lat[landingIndex])}" lon="${fix(lon[landingIndex])}">\n    <name>Landing</name>\n  </wpt>\n`
      : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="Debrief" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    wpt +
    `  <trk>\n    <name>${xmlEscape(name)}</name>\n    <trkseg>\n` +
    pts.join('\n') +
    '\n    </trkseg>\n  </trk>\n</gpx>\n'
  );
}

/** The 8-point compass label for a bearing in degrees. */
export function compass(bearing: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

export interface DescentWind {
  /** Average horizontal drift speed over the descent, m/s (≈ the wind speed). */
  speed: number;
  /** Compass bearing the wind blew FROM, degrees clockwise from north [0, 360). */
  fromBearing: number;
}

/**
 * The wind the rocket actually fell through, measured — under canopy it drifts
 * with the air, so its mean horizontal velocity over the descent IS the wind.
 * Net horizontal displacement across the descent window divided by the elapsed
 * time, so a steady wind reads cleanly and brief GPS jitter averages out. This is
 * a reading of the conditions aloft on the day, not a forecast or a prediction.
 * Returns null when the window is too short, lacks fixes, or barely drifted.
 */
export function descentWind(
  track: GroundTrack,
  time: Float64Array,
  fromIndex: number,
  toIndex: number,
): DescentWind | null {
  const { east, north } = track;
  const n = Math.min(east.length, north.length, time.length);
  const lo = Math.max(0, fromIndex);
  const hi = Math.min(n - 1, toIndex);
  if (hi - lo < 2) return null;
  // First and last valid fixes within the window.
  let a = -1;
  let b = -1;
  for (let i = lo; i <= hi; i++)
    if (Number.isFinite(east[i]) && Number.isFinite(north[i]) && Number.isFinite(time[i])) {
      a = i;
      break;
    }
  for (let i = hi; i >= lo; i--)
    if (Number.isFinite(east[i]) && Number.isFinite(north[i]) && Number.isFinite(time[i])) {
      b = i;
      break;
    }
  if (a < 0 || b <= a) return null;
  const dt = time[b] - time[a];
  const dist = Math.hypot(east[b] - east[a], north[b] - north[a]);
  // Below a few metres the drift is in the GPS noise — call it calm, not a number.
  if (!(dt > 0) || dist < 5) return null;
  // Drift heads TOWARD this bearing; meteorological wind comes FROM the reciprocal.
  let toward = (Math.atan2(east[b] - east[a], north[b] - north[a]) * 180) / Math.PI;
  if (toward < 0) toward += 360;
  return { speed: dist / dt, fromBearing: (toward + 180) % 360 };
}

export interface WindLayer {
  /** Altitude band this layer covers (m AGL), low and high edges. */
  altLoM: number;
  altHiM: number;
  /** Mean horizontal drift speed across the band, m/s (≈ the wind at that height). */
  speed: number;
  /** Compass bearing the wind blew FROM, degrees clockwise from north [0, 360). */
  fromBearing: number;
  /** How many GPS fixes the band was averaged over — its reliability. */
  fixes: number;
}

/** Below this many fixes (or this little time) in a band, the drift is too sparse
 *  to read a wind from — the band is skipped rather than reported from noise. */
const WIND_LAYER_MIN_FIXES = 4;
const WIND_LAYER_MIN_DT = 3; // s

/**
 * The wind profile the rocket fell through — the descent drift binned by altitude,
 * so the wind (and how it shears with height) reads off layer by layer, not just as
 * one average. Under canopy the rocket drifts with the air, so the mean horizontal
 * velocity across each altitude band IS the wind at that height. A measurement of
 * the day's conditions aloft at this exact spot, not a forecast. The slow main-phase
 * (low) layers read cleanest; a fast drogue layer with too few fixes is dropped.
 * Returns the qualifying layers ordered high → low (empty if none qualify).
 */
export function windProfile(
  track: GroundTrack,
  time: Float64Array,
  altitude: Float64Array,
  fromIndex: number,
  toIndex: number,
  apogeeAltitudeM: number,
): WindLayer[] {
  const { east, north } = track;
  const n = Math.min(east.length, north.length, time.length, altitude.length);
  const lo = Math.max(0, fromIndex);
  const hi = Math.min(n - 1, toIndex);
  if (hi - lo < 2 || !(apogeeAltitudeM > 0)) return [];
  // ~5 bands across the flight, but never thinner than 150 m (a band has to span
  // enough descent to gather fixes). A low flight just gets fewer, taller bands.
  const bandH = Math.max(150, apogeeAltitudeM / 5);
  const nBands = Math.max(1, Math.ceil(apogeeAltitudeM / bandH));
  const layers: WindLayer[] = [];
  for (let b = nBands - 1; b >= 0; b--) {
    const altLo = b * bandH;
    const altHi = (b + 1) * bandH;
    // First and last valid fix that fall in this altitude band during the descent.
    let a = -1;
    let z = -1;
    let fixes = 0;
    for (let i = lo; i <= hi; i++) {
      if (!Number.isFinite(east[i]) || !Number.isFinite(north[i]) || !Number.isFinite(time[i])) continue;
      const alt = altitude[i];
      if (!Number.isFinite(alt) || alt < altLo || alt >= altHi) continue;
      if (a < 0) a = i;
      z = i;
      fixes++;
    }
    if (a < 0 || z <= a || fixes < WIND_LAYER_MIN_FIXES) continue;
    const dt = time[z] - time[a];
    if (!(dt >= WIND_LAYER_MIN_DT)) continue;
    const dist = Math.hypot(east[z] - east[a], north[z] - north[a]);
    let toward = (Math.atan2(east[z] - east[a], north[z] - north[a]) * 180) / Math.PI;
    if (toward < 0) toward += 360;
    layers.push({ altLoM: altLo, altHiM: altHi, speed: dist / dt, fromBearing: (toward + 180) % 360, fixes });
  }
  return layers;
}

/** Recovery numbers from an east/north track: how far it drifted and where it
 *  came down relative to the pad. Returns null if there's no usable fix. */
export function recoveryStats(track: GroundTrack): RecoveryStats | null {
  const { east, north } = track;
  let maxDrift = 0;
  let landingEast = NaN;
  let landingNorth = NaN;
  let landingIndex = -1;
  for (let i = 0; i < east.length; i++) {
    const e = east[i];
    const no = north[i];
    if (!Number.isFinite(e) || !Number.isFinite(no)) continue;
    const d = Math.hypot(e, no);
    if (d > maxDrift) maxDrift = d;
    landingEast = e; // last valid fix wins → the resting place
    landingNorth = no;
    landingIndex = i;
  }
  if (landingIndex < 0) return null;
  const landingDistance = Math.hypot(landingEast, landingNorth);
  // atan2(east, north) gives clockwise-from-north, which is the compass convention.
  let landingBearing = (Math.atan2(landingEast, landingNorth) * 180) / Math.PI;
  if (landingBearing < 0) landingBearing += 360;
  return { maxDrift, landingEast, landingNorth, landingIndex, landingDistance, landingBearing };
}
