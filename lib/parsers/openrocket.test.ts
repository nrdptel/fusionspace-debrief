import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { looksLikeOrk, openRocketParser, orkToXml, predictionFigures, readPrediction } from './openrocket';
import { ParseGuidanceError } from './types';
import { compareReported, renderReported, REPORTED_QUANTITY } from '../flight/reported';
import type { FlightMetrics } from '../analyze/types';

const CORPUS = fileURLToPath(new URL('./__corpus__/', import.meta.url));
const ORK = `${CORPUS}openrocket/openrocket__example-simple-model-rocket__A-simple-model-rocket.ork`;

/** The ten attributes, with values whose units are internally consistent: 29.249 / 0.086
 *  is 340.1, the speed of sound, which is what proves metres per second. */
const TEN =
  'maxaltitude="50.59" maxvelocity="29.249" maxacceleration="143.649" maxmach="0.086" ' +
  'timetoapogee="3.481" flighttime="15.888" groundhitvelocity="4.681" ' +
  'launchrodvelocity="15.365" deploymentvelocity="2.646" optimumdelay="2.751"';

function design(simulations: string, rocketName = 'Test rocket'): string {
  return (
    `<?xml version='1.0' encoding='utf-8'?>\n` +
    `<openrocket version="1.10" creator="OpenRocket 24.12">` +
    `<rocket><name>${rocketName}</name></rocket>` +
    `<simulations>${simulations}</simulations>` +
    `</openrocket>`
  );
}

const oneRun = (attrs = TEN, extra = '', status = 'uptodate') =>
  design(`<simulation status="${status}"><name>Simulation 1</name><flightdata ${attrs}>${extra}</flightdata></simulation>`);

describe('OpenRocket .ork — reading a prediction', () => {
  it('reads all ten stated figures, as predicted rather than measured', () => {
    const p = readPrediction(oneRun());
    expect(p).not.toBeNull();
    expect(p!.rocket).toBe('Test rocket');
    expect(p!.creator).toBe('OpenRocket 24.12');
    expect(p!.runs).toHaveLength(1);

    const run = p!.runs[0];
    expect(run.values).toHaveLength(10);
    expect(run.values.every((v) => v.source === 'predicted')).toBe(true);
    expect(run.name).toBe('Simulation 1');
    expect(run.status).toBe('uptodate');

    const by = Object.fromEntries(run.values.map((v) => [v.metric, v.value]));
    expect(by.apogeeAltitude).toBe(50.59);
    expect(by.maxVelocity).toBe(29.249);
    expect(by.maxAcceleration).toBe(143.649);
    expect(by.maxMach).toBe(0.086);
    expect(by.timeToApogee).toBe(3.481);
    expect(by.flightTime).toBe(15.888);
    expect(by.groundHitVelocity).toBe(4.681);
    expect(by.launchRodVelocity).toBe(15.365);
    expect(by.deploymentVelocity).toBe(2.646);
    expect(by.optimumDelay).toBe(2.751);
  });

  it('classifies each figure as the quantity it actually is, not merely as some quantity', () => {
    // Written as hard-coded expectations rather than a regex over the union, because a regex
    // built from the type's own members cannot fail: `REPORTED_QUANTITY` is typed
    // `Record<…, ReportedQuantity>`, so `toMatch(/length|speed|accel|time|mach/)` is true by
    // construction and would still pass with `maxMach: 'accel'`. These pin the mapping.
    const expected: Record<string, string> = {
      apogeeAltitude: 'length',
      maxVelocity: 'speed',
      maxAcceleration: 'accel',
      maxMach: 'mach',
      timeToApogee: 'time',
      flightTime: 'time',
      groundHitVelocity: 'speed',
      launchRodVelocity: 'speed',
      deploymentVelocity: 'speed',
      optimumDelay: 'time',
    };
    const p = readPrediction(oneRun())!;
    expect(p.runs[0].values).toHaveLength(Object.keys(expected).length);
    for (const v of p.runs[0].values) {
      expect(REPORTED_QUANTITY[v.metric], `${v.metric} is a ${expected[v.metric]}`).toBe(expected[v.metric]);
    }
  });

  it('renders a time as a time and a Mach as a Mach — no quantity falls through to acceleration', () => {
    // The defect this guards: all three cross-check renderers used to write
    // `q === 'length' ? … : q === 'speed' ? … : accel`, so any unnamed quantity was divided
    // by g. `renderReported` is total, and this proves the dispatch rather than the type.
    const seen: string[] = [];
    const p = readPrediction(oneRun())!;
    for (const v of p.runs[0].values) {
      seen.push(
        renderReported(v.metric, {
          length: () => 'length',
          speed: () => 'speed',
          accel: () => 'accel',
          time: () => 'time',
          mach: () => 'mach',
        }),
      );
    }
    expect(seen.filter((s) => s === 'time')).toHaveLength(3);
    expect(seen.filter((s) => s === 'mach')).toHaveLength(1);
    expect(seen.filter((s) => s === 'accel')).toHaveLength(1);
  });

  it('says whether a run carries a saved time series, because most do not', () => {
    expect(readPrediction(oneRun())!.runs[0].hasSeries).toBe(false);
    expect(readPrediction(oneRun(TEN, '<databranch name="Sustainer"/>'))!.runs[0].hasSeries).toBe(true);
  });

  it('reads every simulation in the file, not just the first', () => {
    const two = oneRun().replace(
      '</simulations>',
      `<simulation status="loaded"><name>Simulation 2</name><flightdata ${TEN}/></simulation></simulations>`,
    );
    const p = readPrediction(two)!;
    expect(p.runs.map((r) => r.name)).toEqual(['Simulation 1', 'Simulation 2']);
    expect(p.runs.map((r) => r.status)).toEqual(['uptodate', 'loaded']);
  });

  it('carries `status` without trusting it — the format page defines no vocabulary', () => {
    // Two values are observed in the wild and the published spec defines neither, so an
    // unfamiliar one must be reported rather than treated as a reason to discard figures.
    expect(readPrediction(oneRun(TEN, '', 'something-nobody-has-published'))!.runs[0].values).toHaveLength(10);
  });

  describe('what it refuses to read', () => {
    it('drops a run missing any of the ten rather than comparing on the half it has', () => {
      const short = TEN.replace(' optimumdelay="2.751"', '');
      expect(readPrediction(oneRun(short))).toBeNull();
    });

    it('drops a run whose units are not SI, rather than publishing feet under a metre label', () => {
      // The same flight stated in feet per second: 95.96 ft/s at Mach 0.086 gives a "speed
      // of sound" of 1115.8, which is the ft/s figure and three times out of the SI band.
      const imperial = TEN.replace('maxvelocity="29.249"', 'maxvelocity="95.96"');
      expect(readPrediction(oneRun(imperial))).toBeNull();
    });

    it('keeps a genuine transonic flight, whose ratio drifts down with altitude but stays in band', () => {
      // Mach is taken at the altitude of the peak, where the air is colder — so the ratio
      // falls a few percent on a high flight. 300 m/s at Mach 1.02 is 294, still SI.
      const high = TEN.replace('maxvelocity="29.249"', 'maxvelocity="300"').replace('maxmach="0.086"', 'maxmach="1.02"');
      expect(readPrediction(oneRun(high))!.runs[0].values).toHaveLength(10);
    });

    it('reads no prediction from a design whose simulations were never run', () => {
      expect(readPrediction(design('<simulation status="notsimulated"><name>Simulation 1</name></simulation>'))).toBeNull();
    });

    it('reads no prediction from something that is not an OpenRocket file', () => {
      expect(readPrediction('<html><body>not a rocket</body></html>')).toBeNull();
    });

    it('does not let a self-closing simulation swallow the next one', () => {
      // OpenRocket writes `<simulation … />` for one that has never been run. Scanning to the
      // next `</simulation>` from it would run past the empty element and take the FOLLOWING
      // simulation's flightdata — reporting one run's figures twice under two names.
      const xml = design(
        `<simulation status="notsimulated"/>` +
          `<simulation status="uptodate"><name>Sim B</name><flightdata ${TEN}/></simulation>`,
      );
      const p = readPrediction(xml)!;
      expect(p.runs).toHaveLength(1);
      expect(p.runs[0].name).toBe('Sim B');
      expect(p.runs[0].status).toBe('uptodate');
    });
  });

  describe('whose name it reports', () => {
    it('reads the design name, not the first component that happens to have one', () => {
      // `<rocket>` opens with `<name>`, then `<subcomponents>` full of parts that each carry
      // one. An UNNAMED design writes `<name/>`, and taking the first `<name>` after
      // `<rocket` walks straight into the first stage.
      const xml =
        `<?xml version='1.0' encoding='utf-8'?><openrocket version="1.10" creator="OpenRocket 24.12">` +
        `<rocket><name/><subcomponents><stage><name>Sustainer</name></stage></subcomponents></rocket>` +
        `<simulations><simulation status="uptodate"><name>Simulation 1</name><flightdata ${TEN}/></simulation></simulations>` +
        `</openrocket>`;
      expect(readPrediction(xml)!.rocket).toBeNull();
    });

    it('reads a design name that is there', () => {
      const xml =
        `<?xml version='1.0' encoding='utf-8'?><openrocket version="1.10" creator="OpenRocket 24.12">` +
        `<rocket><name>Nike Smoke</name><subcomponents><stage><name>Sustainer</name></stage></subcomponents></rocket>` +
        `<simulations><simulation status="uptodate"><name>Simulation 1</name><flightdata ${TEN}/></simulation></simulations>` +
        `</openrocket>`;
      expect(readPrediction(xml)!.rocket).toBe('Nike Smoke');
    });
  });
});

describe('OpenRocket .ork — a prediction is not a flight', () => {
  const input = (text: string) => ({ name: 'design.ork', text, bytes: new TextEncoder().encode(text) });

  it('is recognised rather than offered to the column mapper', () => {
    expect(openRocketParser.detect(input(oneRun()))).toBe(1);
  });

  it('does not claim a file that merely happens to be XML', () => {
    expect(openRocketParser.detect(input('<?xml version="1.0"?><flights><flight/></flights>'))).toBe(0);
  });

  it('refuses a design dropped on its own, naming what it is and what it needs', () => {
    expect(() => openRocketParser.parse(input(oneRun()))).toThrow(ParseGuidanceError);
    let message = '';
    try {
      openRocketParser.parse(input(oneRun()));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('not a recording of a flight');
    expect(message).toContain('Test rocket');
    // The way forward has to be on the page, not just the refusal.
    expect(message).toMatch(/flight log/i);
  });

  const messageFor = (text: string): string => {
    try {
      openRocketParser.parse(input(text));
    } catch (e) {
      return (e as Error).message;
    }
    return 'DID NOT REFUSE';
  };

  it('says something different when the design states no simulation at all', () => {
    const bare = design('<simulation status="notsimulated"><name>Simulation 1</name></simulation>');
    const message = messageFor(bare);
    // Telling this flyer to drop their altimeter log alongside would be wrong: the file
    // they have states nothing to compare it against yet.
    expect(message).toContain('no simulation results');
    expect(message).toMatch(/Run a simulation/);
  });

  it('does NOT tell a flyer to run a simulation they have already run', () => {
    // A design whose simulations exist but could not be read — a missing figure, or units
    // that would not confirm. "Run a simulation in OpenRocket" is a dead end for this flyer:
    // they ran one, and doing it again changes nothing.
    const short = messageFor(oneRun(TEN.replace(' optimumdelay="2.751"', '')));
    expect(short).not.toMatch(/Run a simulation/);
    expect(short).toContain('not in a form Debrief can read');

    const imperial = messageFor(oneRun(TEN.replace('maxvelocity="29.249"', 'maxvelocity="95.96"')));
    expect(imperial).not.toMatch(/Run a simulation/);
    expect(imperial).toContain('units could not be confirmed');
  });

  it('names the design in every refusal, including the ones that read no prediction', () => {
    // The branch that can say least about the file is the one that most needs to identify it.
    for (const text of [
      oneRun(),
      oneRun(TEN.replace(' optimumdelay="2.751"', '')),
      design('<simulation status="notsimulated"><name>Simulation 1</name></simulation>'),
    ]) {
      expect(messageFor(text), 'every refusal names the rocket').toContain('Test rocket');
    }
  });
});

describe('OpenRocket .ork — what the cross-check may and may not say', () => {
  // A flight that flew a little higher and faster than predicted.
  const metrics = {
    apogeeAltitude: 52,
    maxVelocity: 30,
    maxAcceleration: 145,
    mach: 0.088,
    timeToApogee: 3.6,
    flightTime: 16.2,
  } as unknown as FlightMetrics;

  it('compares the six figures Debrief also measures', () => {
    const p = readPrediction(oneRun())!;
    const cmp = compareReported(p.runs[0].values, metrics);
    const compared = cmp.filter((c) => c.hasComputed).map((c) => c.reported.metric).sort();
    expect(compared).toEqual(['apogeeAltitude', 'flightTime', 'maxAcceleration', 'maxMach', 'maxVelocity', 'timeToApogee']);
  });

  it('yields NO verdict on the four it measures nothing comparable for', () => {
    const p = readPrediction(oneRun())!;
    const cmp = compareReported(p.runs[0].values, metrics);
    for (const m of ['groundHitVelocity', 'launchRodVelocity', 'deploymentVelocity', 'optimumDelay']) {
      const row = cmp.find((c) => c.reported.metric === m)!;
      expect(row.hasComputed, `${m} must not be compared against a near-enough field`).toBe(false);
      expect(row.status, `${m} must carry no verdict`).toBeNull();
    }
  });
});

describe('OpenRocket .ork — the real file', () => {
  // Guarded because the corpus is gitignored and fetched separately. THIS SUITE SKIPS IN
  // CI: `fetch-fixtures` downloads the release asset pinned in `corpus.lock.json`, and the
  // release carrying this fixture has not been cut — see the fixtures repo's own
  // `scripts/make-release-zip.sh`, which builds it. Until that release exists these cases
  // run only where a fixtures checkout is on disk. The synthetic cases above are the ones
  // that gate CI, and they cover every behaviour except the real file's byte layout.
  const present = existsSync(ORK);

  it.skipIf(!present)('opens the real archive and reads its five simulations', async () => {
    const bytes = new Uint8Array(readFileSync(ORK));
    expect(looksLikeOrk('A simple model rocket.ork', bytes)).toBe(true);

    const p = readPrediction(await orkToXml(bytes));
    expect(p).not.toBeNull();
    expect(p!.creator).toBe('OpenRocket 24.12');
    expect(p!.rocket).toBe('A simple model rocket');
    expect(p!.runs).toHaveLength(5);
    expect(p!.runs.map((r) => r.values.length)).toEqual([10, 10, 10, 10, 10]);
    expect(p!.runs.map((r) => r.hasSeries)).toEqual([true, true, true, true, true]);
  });

  it.skipIf(!present)('proves the file states SI, rather than assuming it off the spec page', async () => {
    const bytes = new Uint8Array(readFileSync(ORK));
    const p = (await orkToXml(bytes).then(readPrediction))!;
    const sound = p.runs.map((r) => {
      const by = Object.fromEntries(r.values.map((v) => [v.metric, v.value]));
      return Number((by.maxVelocity / by.maxMach).toFixed(1));
    });
    // OpenRocket's format page defines no unit for any of these attributes. This is the
    // measurement that settles it: every simulation's velocity over its own Mach is the
    // speed of sound in m/s. In ft/s these would read ~1116.
    expect(sound).toEqual([340.1, 338.7, 339.1, 339.1, 339.1]);
  });

  it.skipIf(!present)('refuses the real file as a standalone, exactly as a device summary is', async () => {
    const bytes = new Uint8Array(readFileSync(ORK));
    const text = await orkToXml(bytes);
    expect(() => openRocketParser.parse({ name: 'A simple model rocket.ork', text, bytes })).toThrow(
      /not a recording of a flight/,
    );
  });
});

describe('what a design contributes to the flight it was dropped beside', () => {
  it('hands over all ten figures when the design states ONE simulation', () => {
    const f = predictionFigures(oneRun())!;
    expect(f.rocket).toBe('Test rocket');
    expect(f.reported).toHaveLength(10);
    expect(f.reported.every((v) => v.source === 'predicted')).toBe(true);
    // The note has to say the thing a flyer cannot see: this is not a measurement.
    expect(f.notes[0]).toMatch(/simulation of a flight that had not happened yet/);
    expect(f.notes[0]).toContain('Simulation 1');
  });

  it('REFUSES to pick when a design states several, and names them', () => {
    // A `.ork` accumulates a simulation per motor — the corpus fixture holds five, whose
    // apogees run 50.59 m to 319.75 m. Nothing in a flight log says which motor flew, so
    // choosing one would be Debrief inventing the claim the cross-check exists to test.
    const two = oneRun().replace(
      '</simulations>',
      `<simulation status="uptodate"><name>Simulation 2</name><flightdata ${TEN}/></simulation></simulations>`,
    );
    const f = predictionFigures(two)!;
    expect(f.reported, 'no figures, rather than a guess').toHaveLength(0);
    expect(f.notes[0]).toContain('2 simulations');
    expect(f.notes[0]).toContain('Simulation 1');
    expect(f.notes[0]).toContain('Simulation 2');
    // A silent nothing would read as "this file has no prediction", which is false.
    expect(f.notes[0]).toMatch(/will not pick one/);
  });

  it('is nothing at all for a design that was never simulated', () => {
    expect(predictionFigures(design('<simulation status="notsimulated"><name>Simulation 1</name></simulation>'))).toBeNull();
    expect(predictionFigures('<html>not a rocket</html>')).toBeNull();
  });

  it.skipIf(!existsSync(ORK))('refuses the REAL five-simulation fixture, by name', async () => {
    const f = predictionFigures(await orkToXml(new Uint8Array(readFileSync(ORK))))!;
    expect(f.rocket).toBe('A simple model rocket');
    expect(f.reported).toHaveLength(0);
    expect(f.notes[0]).toContain('5 simulations');
    expect(f.notes[0]).toContain('Simulation 3 - too short delay');
  });
});
