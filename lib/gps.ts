// Turn a flight's GPS latitude/longitude track into a local, metres-on-the-ground
// picture relative to the launch pad — the basis for the recovery (walkback) view.
// A small-area equirectangular projection is plenty here: a hobby flight drifts a
// few hundred metres, where the flat-earth error is millimetres.

import { SYNTHETIC_NOTE, SYNTHETIC_SHORT, syntheticHeader } from './synthetic';
import { buildLine } from './buildInfo';

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

/**
 * Project lat/lon onto east/north metres about a pad reference taken from the first `baseN`
 * valid samples — the rocket sitting on the rail.
 *
 * `origin` overrides that, and it is not optional in spirit: every reading downstream of this
 * is measured FROM the pad — how far the rocket landed from it, which way to walk, how far it
 * leaned off vertical — so a reference taken from the opening fixes of a STRETCH is a pad in
 * mid-air. Cropping a real corpus Featherweight GPS record to apogee-onward moved the walk-back
 * from 3,866 ft on a bearing of 208° SW to 4,676 ft on 127° SE: 81° and 810 ft wrong, on the one
 * surface a flyer physically acts on. The caller that knows the whole file passes its origin.
 */
export function padOrigin(lat: Float64Array, lon: Float64Array, baseN = 16): { lat0: number; lon0: number } | null {
  const n = Math.min(lat.length, lon.length);
  if (n === 0) return null;
  const lat0 = median(lat, 0, Math.min(n, baseN));
  const lon0 = median(lon, 0, Math.min(n, baseN));
  return Number.isFinite(lat0) && Number.isFinite(lon0) ? { lat0, lon0 } : null;
}

export function groundTrack(
  lat: Float64Array,
  lon: Float64Array,
  baseN = 16,
  origin?: { lat0: number; lon0: number },
): GroundTrack | null {
  const n = Math.min(lat.length, lon.length);
  if (n === 0) return null;
  const lat0 = origin && Number.isFinite(origin.lat0) ? origin.lat0 : median(lat, 0, Math.min(n, baseN));
  const lon0 = origin && Number.isFinite(origin.lon0) ? origin.lon0 : median(lon, 0, Math.min(n, baseN));
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

/** What the `<trk><desc>` says about the height this file does NOT carry. Extracted so the
 *  synthetic claim can be prefixed to it without restating it. */
const GPX_TRACK_DESC =
  'Ground track only — where the rocket was, not how high. GPX elevation means height above the ' +
  'ellipsoid, and the height Debrief measured is above the pad; the KML export carries the ' +
  'trajectory and names the instrument that drew it.';

/** A GPX 1.1 document for the flight: the ground track as a <trk>, plus a
 *  <wpt> at the last fix so a phone/handheld can navigate straight to it.
 *  Lat/lon only (the recovery walk is on the ground); gaps in the fix are skipped.
 *
 *  `landed` says whether that last fix is a landing. On a record that stops in the air it
 *  is not: a log that ends at apogee still has a last fix, and it sits directly over the
 *  pad — a waypoint called "Landing" there sends a flyer to walk ten feet for a rocket that
 *  was 3,548 ft up. The point is still worth exporting, under the name it has earned.
 *
 *  `synthetic` says the flight is one Debrief MADE UP — `ROADMAP.md`'s D10, and this is the
 *  sink where an unlabelled coordinate does the most damage: a GPX is the one export whose
 *  whole purpose is to be walked to. Both booleans are required with no default, because on a
 *  file that says where to go the safe-looking default is the defect value.
 *
 *  **The claim lands in three places, each for a different reader**, on the per-record rule
 *  `lib/synthetic.ts#PROVENANCE_COLUMN` records: `<metadata><desc>` for a viewer that lists the
 *  file, the `<trk>` and `<wpt>` NAMES for a handheld that shows nothing but a name in its
 *  waypoint list, and the track `<desc>` for a reader who opens the track's properties. Only the
 *  names travel into a receiver, which is why the tag rather than the sentence goes there. */
export function trackGpx(
  name: string,
  lat: Float64Array,
  lon: Float64Array,
  landingIndex: number,
  landed: boolean,
  synthetic: boolean,
  /** Which instrument recorded these fixes, as the file stated it — `lib/logInfo.ts#recordedBy`.
   *  Written into `<src>`, the field GPX 1.1 reserves for exactly this and annotates *"Source of
   *  data. Included to give user some idea of reliability and accuracy of data"*. Absent when the
   *  file named nothing, in which case no element is written rather than an empty one. */
  recordedBy?: string | null,
): string {
  const n = Math.min(lat.length, lon.length);
  const fix = (v: number) => v.toFixed(6);
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(lat[i]) || !Number.isFinite(lon[i])) continue;
    pts.push(`      <trkpt lat="${fix(lat[i])}" lon="${fix(lon[i])}"/>`);
  }
  const wptName = syntheticHeader(landed ? 'Landing' : 'Last fix (record ends in the air)', synthetic);
  // `<src>` sits after `<desc>` in both `wptType` and `trkType`'s sequence — schema order, and a
  // GPX reader that validates will reject it anywhere else.
  const src = recordedBy ? `    <src>${xmlEscape(recordedBy)}</src>\n` : '';
  const wpt =
    landingIndex >= 0 && landingIndex < n && Number.isFinite(lat[landingIndex]) && Number.isFinite(lon[landingIndex])
      ? `  <wpt lat="${fix(lat[landingIndex])}" lon="${fix(lon[landingIndex])}">\n    <name>${xmlEscape(wptName)}</name>\n${src}  </wpt>\n`
      : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    // The schema's own annotation on `creator`: "You must include the name or URL of the software
    // that created your GPX document." A bare product name is the least a reader can act on, and
    // every other Debrief export carries the build it came from.
    `<gpx version="1.1" creator="${xmlEscape(buildLine())}" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    // GPX 1.1 puts `<metadata>` first, ahead of every `<wpt>` and `<trk>` — schema order, not
    // preference.
    (synthetic ? `  <metadata>\n    <desc>${xmlEscape(SYNTHETIC_NOTE)}</desc>\n  </metadata>\n` : '') +
    wpt +
    `  <trk>\n    <name>${xmlEscape(syntheticHeader(name, synthetic))}</name>\n` +
    // Deliberately no `<ele>`. GPX defines elevation as metres above the WGS-84 ellipsoid, and the
    // height Debrief has for these fixes is barometric height above the PAD — writing it into an
    // `<ele>` would put a correct number under a label that means something else, which is how a
    // reader gets a wrong answer from an honest file. The KML carries the trajectory instead, and
    // says there what drew it. This `<desc>` exists so the two exports of one flight do not
    // silently disagree about whether the track has a height.
    `    <desc>${xmlEscape(synthetic ? `${SYNTHETIC_SHORT} ${GPX_TRACK_DESC}` : GPX_TRACK_DESC)}</desc>\n` +
    src +
    `    <trkseg>\n` +
    pts.join('\n') +
    '\n    </trkseg>\n  </trk>\n</gpx>\n'
  );
}

/**
 * The flight as KML, for Google Earth — the one thing a GPX track can't give you.
 *
 * GPX carries where the rocket went on the ground; KML carries where it went, full stop.
 * With the altitude beside each fix and `altitudeMode=relativeToGround`, Google Earth draws
 * the actual trajectory in the air over the actual field, and `extrude` drops a wall to the
 * ground under it so the drift reads at a glance. AltosUI has offered this for years and it
 * is the obvious thing to hand someone helping you walk a rocket down, or to put in a cert
 * package beside the numbers.
 *
 * Written from the published KML 2.2 schema (OGC 07-147r2): a `LineString` takes
 * `lon,lat,alt` triples — that order, which is the reverse of how every other part of this
 * app says it — and altitudes in metres. Heights are AGL, which is what
 * `relativeToGround` means, so no geoid or pad elevation has to be invented.
 */
export function trackKml(
  name: string,
  lat: Float64Array,
  lon: Float64Array,
  altitudeM: Float64Array | undefined,
  landingIndex: number,
  /** Whether the last fix is a landing — see `trackGpx`. */
  landed: boolean,
  /** Whether this is a flight Debrief MADE UP — see `trackGpx`. Google Earth shows a document's
   *  name and each placemark's name in its sidebar and on the ground, and shows a description
   *  only when something is clicked, so the tag goes on all three names and the sentence goes in
   *  the document description beside the altitude note. */
  synthetic: boolean,
  /** Which instrument recorded these fixes, as the file stated it — written into
   *  `<ExtendedData>`, which Google Earth shows in the placemark balloon by default and which is
   *  the KML 2.2 analogue of GPX's `<src>`. AltosUI puts the same fact in its `<Document><name>`;
   *  `ExtendedData` is the field a consumer parses rather than a label it renders. */
  recordedBy: string | null | undefined,
  /** What drew the HEIGHT of each fix, in the flyer's words. The geometry in this file is
   *  measured by two independent instruments — the receiver put each fix on the map, the
   *  barometer put it at a height — and a document that shows a trajectory without saying so is
   *  the one thing `MAINTAINING.md` forbids outright: a number with its provenance stripped off.
   *
   *  It matters here more than it looks. Measured over the corpus, the nine flights carrying both
   *  a barometric and a GPS altitude disagree by **197–1,771 m on average** and by up to 2,949 m,
   *  because they are not the same quantity: the barometer reads height above the pad and a
   *  receiver reads height above the ellipsoid. Debrief draws the barometric one, which is both
   *  the better vertical measurement and the one `relativeToGround` actually means — but a reader
   *  opening this in Google Earth beside a GPS altitude column has no way to know that without
   *  being told. */
  altitudeNote?: string,
): string {
  const n = Math.min(lat.length, lon.length);
  const coords: string[] = [];
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(lat[i]) || !Number.isFinite(lon[i])) continue;
    const h = altitudeM && Number.isFinite(altitudeM[i]) ? Math.max(0, altitudeM[i]) : 0;
    coords.push(`${lon[i].toFixed(6)},${lat[i].toFixed(6)},${h.toFixed(1)}`);
  }
  const placemarkName = syntheticHeader(landed ? 'Landing' : 'Last fix (record ends in the air)', synthetic);
  const placemark =
    landingIndex >= 0 && landingIndex < n && Number.isFinite(lat[landingIndex]) && Number.isFinite(lon[landingIndex])
      ? `    <Placemark>\n      <name>${xmlEscape(placemarkName)}</name>\n      <Point><coordinates>${lon[landingIndex].toFixed(6)},${lat[landingIndex].toFixed(6)},0</coordinates></Point>\n    </Placemark>\n`
      : '';
  // One `<description>`, built from what there is to say: the made-up claim first, because it
  // qualifies everything after it, then the altitude note. Joined rather than written twice —
  // KML allows one description per feature, and a second element would be dropped silently by
  // whichever reader parses strictly.
  const description = [synthetic ? SYNTHETIC_NOTE : null, altitudeNote].filter(Boolean).join(' ');
  // `<ExtendedData>` comes after the Document's own descriptive elements and before its features,
  // which is where `AbstractFeatureType`'s sequence puts it.
  const extended = recordedBy
    ? `    <ExtendedData>\n      <Data name="Recorded by"><value>${xmlEscape(recordedBy)}</value></Data>\n` +
      `      <Data name="Written by"><value>${xmlEscape(buildLine())}</value></Data>\n    </ExtendedData>\n`
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2">\n' +
    '  <Document>\n' +
    `    <name>${xmlEscape(syntheticHeader(name, synthetic))}</name>\n` +
    (description ? `    <description>${xmlEscape(description)}</description>\n` : '') +
    extended +
    '    <Style id="track">\n' +
    '      <LineStyle><color>ff5e63e0</color><width>2</width></LineStyle>\n' +
    '      <PolyStyle><color>335e63e0</color></PolyStyle>\n' +
    '    </Style>\n' +
    placemark +
    '    <Placemark>\n' +
    `      <name>${xmlEscape(syntheticHeader(name, synthetic))}</name>\n` +
    '      <styleUrl>#track</styleUrl>\n' +
    '      <LineString>\n' +
    '        <extrude>1</extrude>\n' +
    '        <tessellate>1</tessellate>\n' +
    '        <altitudeMode>relativeToGround</altitudeMode>\n' +
    `        <coordinates>${coords.join(' ')}</coordinates>\n` +
    '      </LineString>\n' +
    '    </Placemark>\n' +
    '  </Document>\n' +
    '</kml>\n'
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
