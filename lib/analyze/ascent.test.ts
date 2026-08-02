import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RawFlight } from '../flight/types';
import { analyzeFlight } from './index';
import { importFlight } from '../parsers';
import { renderCaveat } from '../caveatUnits';

/** A record whose CLIMB is physically impossible for the height it reaches is not a flight.
 *
 *  The live instance: the raw `@ LOG_LOW` serial capture of a Blue Raven reports apogee 9 m
 *  reached 30.9 s after liftoff — 0.3 m/s average — while a second altimeter in the same airframe
 *  recorded 2,115 m. Debrief printed the 9 m as an unqualified reading and the comparison surface
 *  headlined a 177% disagreement against the board that was right. The corpus carried it as a
 *  `knownIssue`, which put the gap where a maintainer could see it and nowhere a flyer could. */

const SAID = 'does not describe a rocket flight';

/** A record that leaves the pad convincingly and then CRAWLS to its highest point.
 *
 *  The opening 0.4 s carries a real liftoff signature deliberately: the check only speaks about
 *  records where a liftoff was detected, because a record with no liftoff is somebody else's
 *  problem and already handled elsewhere. Without that leading edge a slow ramp registers no
 *  liftoff at all and the guard is never reached — which is a fair description of the shape a
 *  stuck barometer makes, and is exactly why the real corpus instance DOES trip it: that file has
 *  a clean liftoff and then a channel that does not climb.
 *
 *  `boostM` is the height reached during that opening, so the caller can build both halves of the
 *  test: a crawl to a peak barely above it, and an ordinary flight that keeps climbing. */
function crawlingRecord(peakM: number, secondsToPeak: number, boostM = Math.min(4, peakM * 0.45)): RawFlight {
  const dt = 0.05;
  const padT = 2;
  const boostT = 0.4;
  const total = padT + secondsToPeak * 2;
  const time: number[] = [];
  const alt: number[] = [];
  for (let t = 0; t <= total; t += dt) {
    time.push(t);
    const ft = t - padT;
    if (ft <= 0) alt.push(0);
    else if (ft <= boostT) alt.push(boostM * (ft / boostT) ** 2);
    else if (ft <= secondsToPeak) {
      const u = (ft - boostT) / (secondsToPeak - boostT);
      alt.push(boostM + (peakM - boostM) * u);
    } else alt.push(Math.max(0, peakM * (1 - (ft - secondsToPeak) / secondsToPeak)));
  }
  const flight: RawFlight = {
    source: 'crawl.csv',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels: [{ kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(alt) }],
    meta: {},
    notes: [],
  };
  return flight;
}

describe('a climb no rocket could have made is called out', () => {
  it('says so when the ascent is far slower than a throw to the same height', () => {
    // 9 m over 30.9 s — the corpus instance's own shape. A throw to 9 m passes it in 1.4 s.
    const a = analyzeFlight(crawlingRecord(9, 30.9));
    const w = a.warnings.find((x) => x.includes(SAID));
    expect(w, 'the contradiction is named').toBeTruthy();
    // …with BOTH numbers, in the flyer's units, so they can see which board to believe.
    expect(renderCaveat(w!, 'imperial'), 'the height, in feet').toMatch(/\d+ ft/);
    expect(renderCaveat(w!, 'metric'), 'and in metres').toMatch(/\d+ m/);
    expect(w, 'and how far out the climb is').toMatch(/\d+x slower/);
  });

  it('stays quiet on a flight whose climb is ordinary', () => {
    // A throw to 200 m takes 6.4 s; reaching it in 8 s is a real, if leisurely, small flight.
    const a = analyzeFlight(crawlingRecord(200, 8));
    expect(a.warnings.some((x) => x.includes(SAID)), 'no false alarm on a real climb').toBe(false);
  });

  it('stays quiet on a club-sized flight, which is the false positive that would matter most', () => {
    // 40 m in 2.5 s — a sub-100 m club flight, the case `MAINTAINING.md` names as a guard.
    const a = analyzeFlight(crawlingRecord(40, 2.5));
    expect(a.warnings.some((x) => x.includes(SAID))).toBe(false);
  });
});

const CORPUS = join(process.cwd(), 'lib/parsers/__corpus__');

describe('the ascent check over the real corpus', () => {
  it.skipIf(!existsSync(CORPUS))('fires on exactly the record that misparses, and on nothing else', { timeout: 300_000 }, () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(csv|txt|eeprom|rff|tsv|pf2)$/i.test(e.name)) files.push(p);
      }
    };
    walk(CORPUS);

    let analysed = 0;
    const tripped: string[] = [];
    for (const p of files) {
      let r;
      try {
        const buf = readFileSync(p);
        r = importFlight({
          name: p.split('/').pop() as string,
          text: buf.toString('utf8'),
          bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        } as never);
      } catch {
        continue;
      }
      if (r.kind !== 'flight') continue;
      let a;
      try {
        a = analyzeFlight(r.flight);
      } catch {
        continue;
      }
      analysed++;
      if (a.warnings.some((w) => w.includes(SAID))) tripped.push(p.split('/').pop() as string);
    }

    // The sweep has to have examined something — a run over zero flights would pass silently.
    expect(analysed, 'corpus flights analysed').toBeGreaterThan(30);
    // **Named, not counted.** A count of 1 would still pass if the guard moved to a different
    // file, which is the failure that matters: a false positive on a real flight is worse than
    // the defect it was added for.
    expect(tripped).toEqual(['blueraven__issuiuc-sg1.2-20231118__SG1.2-Sustainer-November-BlueRaven-Low.txt']);
  });
});
