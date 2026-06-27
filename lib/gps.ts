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

export interface RecoveryStats {
  /** Greatest horizontal distance from the pad over the whole flight, metres. */
  maxDrift: number;
  /** Landing point relative to the pad (last valid fix), metres. */
  landingEast: number;
  landingNorth: number;
  /** Straight-line distance from the pad to the landing point, metres. */
  landingDistance: number;
  /** Compass bearing pad → landing, degrees clockwise from north [0, 360). */
  landingBearing: number;
}

/** The 8-point compass label for a bearing in degrees. */
export function compass(bearing: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/** Recovery numbers from an east/north track: how far it drifted and where it
 *  came down relative to the pad. Returns null if there's no usable fix. */
export function recoveryStats(track: GroundTrack): RecoveryStats | null {
  const { east, north } = track;
  let maxDrift = 0;
  let landingEast = NaN;
  let landingNorth = NaN;
  let any = false;
  for (let i = 0; i < east.length; i++) {
    const e = east[i];
    const no = north[i];
    if (!Number.isFinite(e) || !Number.isFinite(no)) continue;
    any = true;
    const d = Math.hypot(e, no);
    if (d > maxDrift) maxDrift = d;
    landingEast = e; // last valid fix wins → the resting place
    landingNorth = no;
  }
  if (!any) return null;
  const landingDistance = Math.hypot(landingEast, landingNorth);
  // atan2(east, north) gives clockwise-from-north, which is the compass convention.
  let landingBearing = (Math.atan2(landingEast, landingNorth) * 180) / Math.PI;
  if (landingBearing < 0) landingBearing += 360;
  return { maxDrift, landingEast, landingNorth, landingDistance, landingBearing };
}
