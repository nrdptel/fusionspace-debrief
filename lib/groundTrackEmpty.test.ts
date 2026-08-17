import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { importFlight } from './parsers';
import { buildFlight } from './flight/build';
import { decodeBytes } from './encoding';
import { getChannel } from './flight/types';
import { groundTrack, recoveryStats } from './gps';

/**
 * The condition `GroundTrack` shows its empty state on, pinned where the rule lives.
 *
 * `FlightReport` renders the Recovery section whenever the latitude and longitude CHANNELS exist —
 * it does not ask whether they hold a usable fix. The component then decided that, and answered by
 * returning `null`: the map, the landing bearing, the coordinates and the drift all vanished, and
 * so did the heading, leaving a flyer nothing to read and no reason for its absence.
 *
 * **No corpus file reaches it, and that is why this check is built rather than sampled.** Of the 59
 * real recordings that analyse end to end, 16 carry GPS columns and every one of them resolves a
 * track. What reaches it is a receiver's cold start, which is ordinary rather than exotic: a GPS
 * logger writes its columns from power-on and leaves them blank until it has a lock, and a flight
 * can be over before the lock arrives.
 */
const FIXTURES = path.join(__dirname, 'parsers', '__fixtures__');
const CORPUS = path.join(__dirname, 'parsers', '__corpus__');

/** A flight whose receiver has no fix for its first `blankFor` samples. Everything else about the
 *  file is ordinary — a time base, an altitude that climbs and comes back. */
function coldStartCsv(blankFor: number, totalFixes = 400): string {
  const lines = ['Time (s),Altitude (ft),Latitude,Longitude'];
  for (let i = 0; i < totalFixes; i++) {
    const t = (i * 0.1).toFixed(1);
    const alt = (i < totalFixes / 2 ? i * 15 : (totalFixes - i) * 15).toFixed(1);
    const pad = (100 + i).toString().padStart(4, '0');
    lines.push(i < blankFor ? `${t},${alt},,` : `${t},${alt},39.2${pad},-109.0${pad}`);
  }
  return lines.join('\n');
}

function channelsOf(text: string, name: string) {
  const res = importFlight({ name, text });
  if (res.kind !== 'mapping') throw new Error(`expected the generic mapper, got ${res.kind}`);
  const mappings = res.table.columns
    .filter((c) => c.role !== 'ignore')
    .map((c) => ({ index: c.index, role: c.role, unit: c.unit }));
  const flight = buildFlight({
    source: name,
    format: 'generic',
    formatLabel: 'Generic CSV',
    headers: res.table.headers,
    dataRows: res.table.dataRows,
    mappings,
    reported: res.table.reported,
  });
  return { lat: getChannel(flight, 'latitude'), lon: getChannel(flight, 'longitude') };
}

describe('a recording with GPS columns but no usable fix', () => {
  it('is reachable: the channels exist, so the section renders, and the track does not', () => {
    // 20 blank rows is more than `groundTrack`'s 16-sample origin window, which is the whole
    // mechanism — the origin is the median of that window and a median of nothing is not finite.
    const { lat, lon } = channelsOf(coldStartCsv(20), 'gps-cold-start.csv');
    expect(lat, 'the latitude column is still detected as a channel').not.toBeNull();
    expect(lon, 'and so is longitude — which is what makes the section render').not.toBeNull();
    expect(groundTrack(lat!.values as Float64Array, lon!.values as Float64Array)).toBeNull();
  });

  it('resolves normally when the lock lands inside the origin window', () => {
    // The other side of the boundary, so this pins the CONDITION rather than just its true case.
    // Without it, a change that made `groundTrack` always return null would leave the case above
    // green and delete the map from every flight.
    const { lat, lon } = channelsOf(coldStartCsv(4), 'gps-warm-start.csv');
    const track = groundTrack(lat!.values as Float64Array, lon!.values as Float64Array);
    expect(track, 'a lock inside the first 16 samples still gives a launch point').not.toBeNull();
    expect(recoveryStats(track!), 'and a track with fixes has stats').not.toBeNull();
  });

  it('has a SECOND cause, reachable only on a crop, and the card says a different sentence for it', () => {
    // `track != null && stats == null`. Unreachable on a whole-file read — a finite origin median
    // means at least one of the first 16 fixes is finite, which is enough for `recoveryStats` — but
    // `GroundTrack` passes the FILE's pad when the report is showing a stretch of one, and then the
    // origin no longer comes from these samples at all. A crop that starts and ends inside a gap in
    // the fixes lands here. Written because the card carries a distinct sentence for this branch
    // and shipping copy no check renders is how a state ends up saying the wrong thing.
    const n = 40;
    const blanks = new Float64Array(n).fill(NaN);
    const track = groundTrack(blanks, blanks, 16, { lat0: 39.2, lon0: -109.0 });
    expect(track, 'a supplied pad origin gives a track even where no fix does').not.toBeNull();
    expect(recoveryStats(track!), 'and it has no stats, because no fix in it is finite').toBeNull();
  });

  it('no real recording in the repo reaches it — measured, so the claim is not a guess', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        // `.git` is real here: the corpus arrives as a symlinked CHECKOUT of the fixtures repo,
        // not as an unpacked archive. A first version of this walk ran `importFlight` over 33 pack
        // files, hook samples and HEAD, which was most of its 14 s runtime and put git internals
        // in the denominator of a count this test reports as "real recordings".
        if (e.name === '.git' || e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (!/\.(md|json)$/i.test(e.name) && e.name !== 'VERSION') files.push(p);
      }
    };
    walk(FIXTURES);
    walk(CORPUS);

    let withGps = 0;
    const blank: string[] = [];
    for (const f of files) {
      let res;
      try {
        const bytes = new Uint8Array(readFileSync(f));
        res = importFlight({ name: path.basename(f), text: decodeBytes(bytes), bytes });
      } catch {
        continue;
      }
      // BOTH entry points, because a flyer reaches the report through either. An earlier version
      // took only `kind === 'flight'` and so measured 15 while claiming 16 — the mapper path is
      // exactly where a GPS-column file without a named parser lands, which is this branch's whole
      // subject.
      let flight;
      if (res.kind === 'flight') flight = res.flight;
      else if (res.kind === 'mapping') {
        const roles = res.table.columns.map((c) => c.role);
        if (!(roles.includes('latitude') && roles.includes('longitude'))) continue;
        try {
          flight = buildFlight({
            source: f,
            format: 'generic',
            formatLabel: 'Generic CSV',
            headers: res.table.headers,
            dataRows: res.table.dataRows,
            mappings: res.table.columns
              .filter((c) => c.role !== 'ignore')
              .map((c) => ({ index: c.index, role: c.role, unit: c.unit })),
            reported: res.table.reported,
          });
        } catch {
          continue;
        }
      } else continue;

      const lat = getChannel(flight, 'latitude');
      const lon = getChannel(flight, 'longitude');
      if (!lat || !lon) continue;
      withGps++;
      const t = groundTrack(lat.values as Float64Array, lon.values as Float64Array);
      if (!t || !recoveryStats(t)) blank.push(path.basename(f));
    }

    // **Guards on the sweep itself, because the corpus is gitignored and usually absent.** A bare
    // `> 0` passes on a public clone that found one committed fixture and looked at nothing else,
    // which turns "0 recordings reach this branch" into "no recordings were examined" without a
    // word of warning — the false all-clear this repo's manual names as its most expensive
    // failure. The committed fixtures alone carry 3 GPS recordings, so that is the floor asserted
    // when the corpus is absent; with it linked the count is 16.
    const corpusLinked = existsSync(path.join(CORPUS, 'expected.json'));
    expect(withGps, `the sweep examined too few GPS recordings to have measured anything`).toBeGreaterThanOrEqual(3);
    if (corpusLinked) {
      expect(withGps, 'with the corpus linked the sweep must reach every GPS recording in it').toBeGreaterThanOrEqual(
        16,
      );
    }
    console.log(`GPS recordings examined: ${withGps} (corpus ${corpusLinked ? "linked" : "absent"})`);
    expect(blank, "if a real recording ever reaches this branch, it belongs in the walk").toEqual([]);
  });
});
