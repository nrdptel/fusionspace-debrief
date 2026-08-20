import { describe, it, expect } from 'vitest';
import { padOrigin, groundTrack, recoveryStats, compass, trackGpx, descentWind, ascentLean, windProfile, trackKml } from './gps';
import { SYNTHETIC_NOTE, SYNTHETIC_SHORT, SYNTHETIC_TAG } from './synthetic';

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
  const gpx = trackGpx('rocket & co', lat, lon, 2, true, false);

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

  it('says nothing about being made up when the flight was flown', () => {
    // The other half of the case below, and the one that makes it able to fail: a real
    // recording has to come out exactly as it did before this label existed.
    expect(gpx).not.toContain(SYNTHETIC_TAG);
    expect(gpx).not.toContain('<metadata>');
  });

  it('marks a flight Debrief made up in the names a receiver shows AND in the file’s own header', () => {
    const made = trackGpx('rocket & co', lat, lon, 2, true, true);
    // The waypoint name, because a handheld's "go to" list shows a name and nothing else — this
    // is the export somebody physically walks to.
    expect(made).toContain(`<name>${SYNTHETIC_TAG} — Landing</name>`);
    // The track name, for a viewer that lists tracks.
    expect(made).toContain(`<name>${SYNTHETIC_TAG} — rocket &amp; co</name>`);
    // The document header, ahead of every wpt and trk — GPX 1.1 schema order.
    expect(made.indexOf('<metadata>')).toBeLessThan(made.indexOf('<wpt '));
    // Verbatim: `xmlEscape` touches < > & ' " and nothing else, so the sentence survives whole.
    expect(made).toContain(SYNTHETIC_NOTE);
    // And the track description, which still says the height thing it always said.
    expect(made).toContain('Ground track only');
    expect(made).toContain(SYNTHETIC_SHORT);
    // The coordinates are untouched: the label is added, never a fix changed.
    expect((made.match(/<trkpt /g) ?? []).length).toBe(2);
    expect(made).toContain('<trkpt lat="34.100000" lon="-116.100000"/>');
  });

  it('names the instrument in the field GPX reserves for it, and the software in `creator`', () => {
    // `COMPETITION.md` row 44: GPX 1.1's `<src>` is annotated "Source of data. Included to give
    // user some idea of reliability and accuracy of data", and Debrief wrote neither it nor a
    // real `creator` — while AltosUI repeats serial and flight number on every row of its CSV.
    const named = trackGpx('rocket', lat, lon, 2, true, false, 'Featherweight Blue Raven · serial 1537');
    expect(named).toContain('<src>Featherweight Blue Raven · serial 1537</src>');
    // On BOTH records a reader can select: the track and the waypoint they navigate to.
    expect((named.match(/<src>/g) ?? []).length, 'the trk and the wpt each carry it').toBe(2);
    // Schema order — `<src>` follows `<desc>` in both `wptType` and `trkType`, and a validating
    // reader rejects it anywhere else.
    expect(named.indexOf('<desc>')).toBeLessThan(named.indexOf('<src>', named.indexOf('<desc>')));
    expect(named, 'the software says which build wrote the file').toMatch(/creator="Debrief [^"]+"/);

    // Nothing invented when the file named nothing: no empty element, which is worse than none.
    const anonymous = trackGpx('rocket', lat, lon, 2, true, false, null);
    expect(anonymous).not.toContain('<src>');
    expect(trackGpx('rocket', lat, lon, 2, true, false)).not.toContain('<src>');
  });

  it('names the last fix honestly on a record that ends in the air, made up or not', () => {
    // The landing claim and the made-up claim are independent, and a file can need both.
    const air = trackGpx('r', lat, lon, 2, false, true);
    expect(air).toContain(`<name>${SYNTHETIC_TAG} — Last fix (record ends in the air)</name>`);
    expect(air).not.toContain('>Landing<');
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

/**
 * **The fix quality, in the fields GPX built for it.**
 *
 * Nothing here parses either export as XML: `DOMParser`, `fast-xml`, `xml2js` and `xmllint` have
 * zero hits across the tree. Order is checked by `indexOf` in a few places already — the `<desc>`
 * before `<src>` case above is the same `wptType` sequence — so this is not the first order
 * assertion in the file, which the first draft of this comment claimed. What is new is checking a
 * SEQUENCE rather than a pair: `wptType` declares nineteen children in a fixed xsd `sequence`, and
 * a validating reader rejects a document whose children are out of order while a lax one opens it
 * fine. Two pairwise `indexOf`s do not establish that, and adding one per pair does not scale.
 *
 * This does not validate the schema; it checks the one property that can silently break, by pulling
 * the child tag names out of each element and asserting they are a SUBSEQUENCE of the declared
 * sequence. No parser dependency for a repo with five runtime ones.
 */
describe('trackGpx — how good each fix was', () => {
  /** `wptType`'s declared child sequence, from gpx.xsd. `trkpt` is declared `type="wptType"`. */
  const WPT_SEQUENCE = [
    'ele', 'time', 'magvar', 'geoidheight', 'name', 'cmt', 'desc', 'src', 'link', 'sym', 'type',
    'fix', 'sat', 'hdop', 'vdop', 'pdop', 'ageofdgpsdata', 'dgpsid', 'extensions',
  ];
  /** The child tag names of every OPEN `<tag …>…</tag>` in document order.
   *
   *  `[^>]*[^/]>` and not `[^>]*>`: the second also matches the SELF-CLOSING `<trkpt …/>` this code
   *  emits where a file states no quality, and the lazy body then runs on to the NEXT point's
   *  `</trkpt>` — swallowing a point and attributing its children to the wrong one. Invisible in a
   *  document that is all-open or all-closed, which every corpus file happens to be. Found by the
   *  pre-push review, and the mixed case is asserted below so it stays found. */
  const childrenOf = (xml: string, tag: string): string[][] =>
    [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*[^/]>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) =>
      [...m[1].matchAll(/<([a-z]+)>/g)].map((c) => c[1]),
    );
  const isSubsequence = (got: string[], of: string[]) => {
    let at = -1;
    return got.every((g) => {
      const i = of.indexOf(g);
      if (i <= at) return false;
      at = i;
      return true;
    });
  };

  const lat = Float64Array.from([34.1, NaN, 34.2]);
  const lon = Float64Array.from([-116.1, NaN, -116.2]);
  const hdop = Float64Array.from([0.8, NaN, 1.15]);
  const satellites = Float64Array.from([9, 7, 11]);
  /** A stated grade on every sample — without one nothing is written at all, which is its own
   *  case below. `3` is `gradeValue('3d')`. */
  const fixGrade = Float64Array.from([3, 3, 3]);

  it('rates its own subsequence check before trusting it', () => {
    // A checker that cannot fail is worse than none — the rule §9 states about compliance
    // commands, applied here first.
    expect(isSubsequence(['sat', 'hdop'], WPT_SEQUENCE)).toBe(true);
    expect(isSubsequence(['hdop', 'sat'], WPT_SEQUENCE)).toBe(false);
    expect(isSubsequence(['name', 'src', 'sat', 'hdop'], WPT_SEQUENCE)).toBe(true);
    expect(isSubsequence(['sat', 'sat'], WPT_SEQUENCE)).toBe(false);
  });

  it('writes sat before hdop, in the schema’s order, on every point that has them', () => {
    const gpx = trackGpx('r', lat, lon, 2, true, false, 'TeleMetrum 2098', { hdop, satellites, fixGrade });
    const points = childrenOf(gpx, 'trkpt');
    expect(points).toEqual([['sat', 'hdop'], ['sat', 'hdop']]);
    for (const p of points) expect(isSubsequence(p, WPT_SEQUENCE), p.join(',')).toBe(true);
    // The waypoint carries the same two, AFTER the `<src>` it already ended with.
    const wpt = childrenOf(gpx, 'wpt')[0];
    expect(wpt).toEqual(['name', 'src', 'sat', 'hdop']);
    expect(isSubsequence(wpt, WPT_SEQUENCE)).toBe(true);
    // The values are the file's own, and a dilution keeps two decimals while a satellite count is
    // a count.
    expect(gpx).toContain('<sat>9</sat>');
    expect(gpx).toContain('<hdop>0.80</hdop>');
    expect(gpx).toContain('<hdop>1.15</hdop>');
  });

  it('writes nothing where the file states nothing, and stays byte-identical without quality', () => {
    // The whole no-quality path: a recording with no columns exports exactly what it did before
    // this existed, self-closing `<trkpt>` included. This is what lets the corpus digest and every
    // existing assertion stand.
    expect(trackGpx('r', lat, lon, 2, true, false, null, {})).toBe(trackGpx('r', lat, lon, 2, true, false, null));
    expect(trackGpx('r', lat, lon, 2, true, false, null, { hdop: undefined, fixGrade })).toContain(
      '<trkpt lat="34.100000" lon="-116.100000"/>',
    );
    // …and per POINT: the second kept fix has a satellite count and no dilution, so it gets one
    // child, not an empty `<hdop/>`.
    const partial = trackGpx('r', lat, lon, 2, true, false, null, { hdop: Float64Array.from([0.8, NaN, NaN]), satellites, fixGrade });
    expect(childrenOf(partial, 'trkpt')).toEqual([['sat', 'hdop'], ['sat']]);
    // **A MIXED document**, which is what the reader above has to survive: one open point and one
    // self-closing, in that order. No corpus file is mixed, so nothing else would ever produce it.
    const mixed = trackGpx('r', lat, lon, 2, true, false, null, {
      satellites: Float64Array.from([9, NaN, NaN]),
      fixGrade,
    });
    expect((mixed.match(/<trkpt [^>]*\/>/g) ?? []).length).toBe(1);
    expect(childrenOf(mixed, 'trkpt')).toEqual([['sat']]);
    expect(partial).not.toContain('<hdop></hdop>');
    expect(partial).not.toContain('<hdop>NaN</hdop>');
  });

  it('says nothing about a fix Debrief cannot say WAS a fix', () => {
    // The blanking of bad positions rides on `applySatelliteFixQuality`, which returns early
    // without a `satellites` channel — a role a flyer on the COLUMN MAPPER may simply not have
    // mapped. On the one corpus track that arrives that way, mapping the dilution alone exports
    // 25,322 positions of which 12,501 sit on rows whose own satellite count says fewer than
    // three. So the export asks for the grade itself rather than trusting that somebody upstream
    // removed the bad rows.
    expect(trackGpx('r', lat, lon, 2, true, false, null, { hdop, satellites })).toBe(
      trackGpx('r', lat, lon, 2, true, false, null),
    );
    // …and per SAMPLE: `gradeFromValue` returns null for anything that is not 3, 2 or 0, which is
    // what a file that states nothing writes. The middle sample here is a gap anyway; the third
    // states no grade and so states no quality either.
    const partly = trackGpx('r', lat, lon, 2, true, false, null, {
      hdop,
      satellites,
      fixGrade: Float64Array.from([3, 3, NaN]),
    });
    expect(childrenOf(partly, 'trkpt')).toEqual([['sat', 'hdop']]);
    expect((partly.match(/<trkpt [^>]*\/>/g) ?? []).length).toBe(1);
    expect(childrenOf(partly, 'wpt')).toEqual([['name']]);
  });

  it('does not write a <fix>, because Debrief derives that grade on almost every file', () => {
    // GPX annotates `fix` as the type of fix the RECEIVER reported. Debrief's own channel label on
    // 25,391 of the 27,624 kept corpus positions is "Fix (from satellite count)" — a grade it
    // worked out. A derived grade in the receiver's own field is an inference laundered into a
    // schema slot, and the file outlives the app. Asserted so a future slice has to argue with it.
    const gpx = trackGpx('r', lat, lon, 2, true, false, null, { hdop, satellites, fixGrade });
    expect(gpx).not.toContain('<fix>');
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
    const kml = trackKml('flight', lat, lon, alt, 2, true, false, null);
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
    const kml = trackKml('flight', lat, lon, undefined, -1, true, false, null);
    expect(kml).toContain('-116.957100,34.495200,0.0');
    expect(kml).not.toContain('Landing');
  });

  it('skips fixes the receiver never made, and escapes the name', () => {
    const gappy = Float64Array.from([34.4949, NaN, 34.4958]);
    const kml = trackKml('a & b', gappy, lon, alt, -1, true, false, null);
    expect(kml).toContain('<name>a &amp; b</name>');
    expect(kml.match(/,34\./g)?.length).toBe(2);
  });

  it('does not put a fix whose height was withheld on the ground', () => {
    // A two-dimensional fix: the position is real, the height is an assumption Debrief refuses to
    // publish, so `altitudeM[i]` is NaN while lat and lon are finite. KML's `relativeToGround`
    // reads a `0` there as ON THE SURFACE, so this used to draw the airframe dragging along the
    // terrain mid-flight and then jumping back up. Latent until a sample existed that could reach
    // it — every corpus recording carrying a position is locked throughout.
    const withheld = Float64Array.from([100, NaN, 300]);
    const kml = trackKml('t', lat, lon, withheld, -1, true, false, null);
    const points = kml.match(/<coordinates>([^<]*)<\/coordinates>/g) ?? [];
    const line = points[points.length - 1];
    expect(line, 'the two fixes with a height are drawn').toContain('100.0');
    expect(line).toContain('300.0');
    expect((line.match(/,0\.0(?=[ <])/g) ?? []).length, 'and the withheld one is not put at 0').toBe(0);
    expect((line.match(/ /g) ?? []).length, 'two points, not three').toBe(1);
  });

  it('says nothing about being made up when the flight was flown', () => {
    const kml = trackKml('flight', lat, lon, alt, 2, true, false, null, 'the barometer drew the height');
    expect(kml).not.toContain(SYNTHETIC_TAG);
    // The altitude note still gets the description to itself, exactly as before.
    expect(kml).toContain('<description>the barometer drew the height</description>');
  });

  it('marks a made-up flight on every name Google Earth draws, and in one description', () => {
    const kml = trackKml('flight', lat, lon, alt, 2, true, true, null, 'the barometer drew the height');
    // Three names: the document, the landing placemark, and the track placemark. Each is a label
    // Earth writes on the sidebar or on the ground, and each is a place a reader might look.
    expect((kml.match(new RegExp(`<name>${SYNTHETIC_TAG} — `, 'g')) ?? []).length).toBe(3);
    expect(kml).toContain(`<name>${SYNTHETIC_TAG} — Landing</name>`);
    // ONE description element, carrying both sentences — KML allows one per feature and a second
    // would be dropped by a strict reader without saying so.
    expect((kml.match(/<description>/g) ?? []).length).toBe(1);
    expect(kml).toContain(`<description>${SYNTHETIC_NOTE} the barometer drew the height</description>`);
    // The trajectory itself is untouched.
    expect(kml).toContain('-116.957100,34.495200,812.3');
  });

  it('names the instrument in the field KML reserves for it, where Earth shows it', () => {
    // `<ExtendedData>` is what Google Earth puts in the balloon by default — the field a consumer
    // parses, rather than a label baked into a name the way AltosUI does it.
    const named = trackKml('flight', lat, lon, alt, 2, true, false, 'Altus Metrum TeleMetrum · serial 2098 · flight 12');
    expect(named).toContain('<Data name="Recorded by"><value>Altus Metrum TeleMetrum · serial 2098 · flight 12</value></Data>');
    expect(named, 'and which build wrote it').toMatch(/<Data name="Written by"><value>Debrief [^<]+<\/value><\/Data>/);
    // Inside the Document and ahead of its features, which is where AbstractFeatureType's own
    // sequence puts it.
    expect(named.indexOf('<ExtendedData>')).toBeGreaterThan(named.indexOf('<Document>'));
    expect(named.indexOf('<ExtendedData>')).toBeLessThan(named.indexOf('<Placemark>'));
    // Escaped like every other value that reaches the file.
    expect(trackKml('f', lat, lon, alt, 2, true, false, 'a & b <x>')).toContain('a &amp; b &lt;x&gt;');
    // And absent entirely when the file named nothing.
    expect(trackKml('f', lat, lon, alt, 2, true, false, null)).not.toContain('<ExtendedData>');
  });

  it('still carries the claim when there is no altitude note to carry it beside', () => {
    // The description used to exist only when an altitude note did, so the made-up sentence had
    // to be able to open it on its own — a flight with no GPS altitude to disagree about is the
    // common case, not the exception.
    const kml = trackKml('flight', lat, lon, alt, 2, true, true, null);
    expect(kml).toContain(`<description>${SYNTHETIC_NOTE}</description>`);
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

    const wholeStats = recoveryStats(groundTrack(lat, lon)!)!;
    const cropLat = lat.slice(120);
    const cropLon = lon.slice(120);
    // Without the file's pad the crop's own first fixes become the reference…
    const naive = recoveryStats(groundTrack(cropLat, cropLon)!)!;
    expect(naive.landingDistance).toBeLessThan(wholeStats.landingDistance * 0.9);
    // …and with it, the crop reads exactly what the whole file reads.
    const fixed = recoveryStats(groundTrack(cropLat, cropLon, 16, pad)!)!;
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

describe('an exported track says which instrument drew which part of it', () => {
  const lat = Float64Array.from([40.1, 40.2, 40.3]);
  const lon = Float64Array.from([-88.1, -88.2, -88.3]);
  const alt = Float64Array.from([0, 500, 0]);

  it('a KML names the two instruments behind its geometry', () => {
    // The defect this closes: the file drew a 3D trajectory whose horizontal came from the
    // receiver and whose vertical came from the barometer, and said nothing at all. Measured over
    // the corpus, nine flights carry both altitudes and they differ by 197-1,771 m on average.
    const kml = trackKml('flight', lat, lon, alt, 2, true, false, null, 'Positions are the GPS receiver’s. Heights are the barometer’s.');
    expect(kml, 'the note reaches the file').toContain('<description>');
    expect(kml).toContain('Heights are the barometer');
    // Inside the Document, so Google Earth shows it against the whole track rather than a point.
    expect(kml.indexOf('<description>'), 'the note sits in the Document').toBeGreaterThan(kml.indexOf('<Document>'));
    expect(kml.indexOf('<description>')).toBeLessThan(kml.indexOf('<Placemark>'));
  });

  it('a KML written without a note is unchanged, so nothing claims a provenance it was not given', () => {
    const kml = trackKml('flight', lat, lon, alt, 2, true, false, null);
    expect(kml).not.toContain('<description>');
  });

  it('the note is escaped like every other value that reaches the file', () => {
    const kml = trackKml('flight', lat, lon, alt, 2, true, false, null, 'baro & GPS <not> merged');
    expect(kml).toContain('baro &amp; GPS &lt;not&gt; merged');
    expect(kml, 'no raw angle bracket from the note').not.toContain('<not>');
  });

  it('a GPX says it carries no height, and why', () => {
    // The two geospatial exports of one flight used to disagree in silence about whether the
    // track had a height. GPX elevation means height above the ELLIPSOID and Debrief's height is
    // above the pad, so writing one would put a correct number under a label meaning something
    // else. The refusal is stated rather than left to be noticed.
    const gpx = trackGpx('flight', lat, lon, 2, true, false);
    expect(gpx, 'still no elevation element').not.toContain('<ele>');
    expect(gpx, 'and it says so').toContain('<desc>');
    expect(gpx).toContain('above the ellipsoid');
  });
});
