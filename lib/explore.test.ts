import { describe, it, expect } from 'vitest';
import { buildPlotChannels, planAxes, windowStats, exploreCsv } from './explore';
import { withheldReason } from './readings';
import type { RawFlight } from './flight/types';
import type { FlightSeries } from './analyze/types';

const series: FlightSeries = {
  time: Float64Array.from([0, 1, 2]),
  altitude: Float64Array.from([0, 50, 100]),
  altitudeRaw: Float64Array.from([0, 50, 100]),
  velocity: Float64Array.from([0, 40, 0]),
  acceleration: Float64Array.from([0, 9.80665, -9.80665]),
  axialAccel: Float64Array.from([0, 9.80665, -9.80665]),
  velocitySource: 'baro',
  accelerationSource: 'device',
  altitudeSource: 'baro',
  speedOfSound: 340,
  speedOfSoundProfile: Float64Array.from([340, 339, 338]),
  airDensity: Float64Array.from([1.2, 1.2, 1.2]),
};

const flight: RawFlight = {
  source: 'f.csv',
  format: 'test',
  formatLabel: 'Test',
  time: series.time,
  channels: [
    { kind: 'voltage', label: 'Batt', unit: 'V', values: Float64Array.from([7.4, 7.3, 7.2]) },
    { kind: 'temperature', label: 'Temp', unit: 'C', values: Float64Array.from([20, 21, 22]) },
    { kind: 'other', label: 'Empty', unit: 'x', values: Float64Array.from([NaN, NaN, NaN]) },
  ],
  meta: {},
  notes: [],
};

describe('buildPlotChannels', () => {
  const channels = buildPlotChannels(flight, series);

  it('lists the derived channels (incl. raw altitude) first, then recorded ones', () => {
    expect(channels.slice(0, 4).map((c) => c.key)).toEqual([
      'd-altitude',
      'd-altitude-raw',
      'd-velocity',
      'd-acceleration',
    ]);
    expect(channels.slice(0, 4).every((c) => c.group === 'Debrief')).toBe(true);
    expect(channels.find((c) => c.label === 'Batt')?.group).toBe('Recorded');
  });

  it('skips a channel the file declared but never filled', () => {
    expect(channels.some((c) => c.label === 'Empty')).toBe(false);
  });

  it('offers the acceleration channel only when it was measured, not derived from baro', () => {
    // A baro-derived acceleration is a noise-dominated second derivative (its peak is
    // withheld too), so the trace isn't offered — the velocity channel still is.
    const baro = buildPlotChannels(flight, { ...series, accelerationSource: 'baro' });
    expect(baro.some((c) => c.key === 'd-acceleration')).toBe(false);
    expect(baro.some((c) => c.key === 'd-velocity')).toBe(true);
  });

  it('derives Mach (velocity ÷ the local speed of sound) and dynamic pressure (½ρv²)', () => {
    const mach = channels.find((c) => c.key === 'd-mach')!;
    expect(mach.group).toBe('Debrief');
    // Against the per-sample speed of sound (340, 339, 338), not a single ground value.
    expect(Array.from(mach.values)).toEqual([0 / 340, 40 / 339, 0 / 338]);
    expect(mach.unitLabel('imperial')).toBe(''); // unitless

    const q = channels.find((c) => c.key === 'd-q')!;
    expect(Array.from(q.values)).toEqual([0, 0.5 * 1.2 * 40 * 40, 0]); // stored raw (Pa)
    expect(q.unitLabel('metric')).toBe('kPa');
    expect(q.unitLabel('imperial')).toBe('psi');
    expect(q.toDisplay(1000, 'metric')).toBeCloseTo(1, 6); // 1000 Pa → 1 kPa
  });

  it('withholds the Mach and dynamic-pressure curves when the velocity was impossible', () => {
    // Same flight, but the analysis judged the velocity physically impossible: the
    // velocity trace still shows for diagnosis, but Debrief won't derive Mach or max-Q
    // curves from it — matching the withheld headlines.
    const flagged = buildPlotChannels(flight, { ...series, velocityUnusable: true });
    expect(flagged.some((c) => c.key === 'd-velocity')).toBe(true);
    expect(flagged.some((c) => c.key === 'd-mach')).toBe(false);
    expect(flagged.some((c) => c.key === 'd-q')).toBe(false);
  });

  // The trace staying is the decision above and it is right. What was wrong is that the STATS
  // TABLE beside it published a `max` off that trace with nothing attached — on a panel whose
  // own comment calls those "the numbers a cert document quotes", behind a "Copy these stats"
  // button. Measured across the corpus: eight flights whose peak speed the report withholds,
  // and the explorer reported a max for every one of them. Two are the dangerous shape — the
  // `gap` withholdings read 497.0 and 1,908.9 m/s, entirely plausible figures a flyer would
  // paste into a write-up — where the `implausible` ones (119,419.7 m/s on one eggtimer file)
  // are self-evidently diagnostic and are exactly why the trace is kept.
  describe('a statistic taken off a withheld speed carries the refusal with it', () => {
    it('caveats the velocity channel, and says why when the reason is available', () => {
      const withReason = buildPlotChannels(flight, { ...series, velocityUnusable: true }, {
        maxVelocityWithheld: 'gap',
      });
      const v = withReason.find((c) => c.key === 'd-velocity')!;
      expect(v.caveat).toBeTruthy();
      expect(v.caveat).toContain('withheld');
      // The reason, in the same words the headline uses — not a second vocabulary.
      expect(v.caveat).toContain(withheldReason('gap'));
    });

    it('still refuses, in shorter words, when the caller has no metrics to give', () => {
      const v = buildPlotChannels(flight, { ...series, velocityUnusable: true }).find(
        (c) => c.key === 'd-velocity',
      )!;
      expect(v.caveat).toContain('withheld');
    });

    it('says nothing on a flight whose peak speed Debrief stands behind', () => {
      const v = buildPlotChannels(flight, series, { maxVelocityWithheld: null }).find(
        (c) => c.key === 'd-velocity',
      )!;
      expect(v.caveat).toBeUndefined();
      // And no other channel picks one up by accident.
      expect(buildPlotChannels(flight, series).every((c) => c.caveat === undefined)).toBe(true);
    });

    it('caveats on the metrics alone, so a withheld peak cannot slip through on a clean series', () => {
      // `velocityUnusable` and `maxVelocityWithheld` are set in different places; a flight can
      // reach here with the reason on the metrics and the flag not mirrored onto the series.
      const v = buildPlotChannels(flight, series, { maxVelocityWithheld: 'implausible' }).find(
        (c) => c.key === 'd-velocity',
      )!;
      expect(v.caveat).toContain(withheldReason('implausible'));
    });
  });

  /** The same argument, one channel over — and it took until 2026-08-13 to be applied there.
   *  The max of the ALTITUDE is the apogee, so a stats table that publishes it bare publishes an
   *  apogee the grid, the print card and every export qualify. Only the velocity had a caveat. */
  describe('a statistic taken off a qualified apogee carries the qualification with it', () => {
    const altitudeChannels = (m?: Parameters<typeof buildPlotChannels>[2]) =>
      buildPlotChannels(flight, series, m).filter((c) => c.key.startsWith('d-altitude'));

    it('caveats BOTH altitude channels when the log ends at its own peak', () => {
      // Both, because a reader overlaying the cleaned line with the raw one reads the same
      // apogee off either, and the per-column copy takes one channel on its own.
      const chans = altitudeChannels({ maxVelocityWithheld: null, apogeeIsFloor: true });
      expect(chans.length).toBe(2);
      for (const c of chans) {
        expect(c.caveat, `${c.key} says the number is a bound`).toBeTruthy();
        expect(c.caveat).toContain('at least this high');
      }
    });

    it('says the other thing when Debrief has disowned the channel', () => {
      const chans = altitudeChannels({ maxVelocityWithheld: null, altitudeUnproven: true });
      for (const c of chans) expect(c.caveat).toContain('unproven');
    });

    it('says nothing on an ordinary flight, or when the caller brought no metrics', () => {
      // The half that makes the two above able to fail. A caveat on every flight is a caveat
      // nobody reads.
      for (const c of altitudeChannels({ maxVelocityWithheld: null })) expect(c.caveat).toBeUndefined();
      for (const c of altitudeChannels()) expect(c.caveat).toBeUndefined();
    });

    it('does not put the apogee’s qualification on any other channel', () => {
      // `caveat` is per channel; a floor apogee says nothing about the battery trace.
      const all = buildPlotChannels(flight, series, { maxVelocityWithheld: null, apogeeIsFloor: true });
      const others = all.filter((c) => !c.key.startsWith('d-altitude'));
      expect(others.length).toBeGreaterThan(0);
      for (const c of others) expect(c.caveat).toBeUndefined();
    });
  });

  /** And one channel further over again, found 2026-08-13 by the surface audit that followed the
   *  saturated-accelerometer sample. The max of the ACCELERATION trace is the peak the grid tags
   *  "may be clipped", the comparison tags "(clipped)" and the analysis warns about outright — and
   *  this table published it bare into `Copy these stats` and the `.csv` beside it, on the one
   *  channel that sample exists to qualify. */
  describe('a statistic taken off a railed accelerometer carries the qualification with it', () => {
    const accel = (m?: Parameters<typeof buildPlotChannels>[2]) =>
      buildPlotChannels(flight, series, m).find((c) => c.key === 'd-acceleration');

    it('caveats the acceleration channel when the sensor railed', () => {
      const c = accel({ maxVelocityWithheld: null, accelClipped: true, maxAcceleration: 157 });
      expect(c, 'the channel is offered at all on a device-measured trace').toBeTruthy();
      expect(c!.caveat, 'the statistic says the peak is not one to quote').toBeTruthy();
      expect(c!.caveat).toContain('clipped');
      // BOTH statistics the table publishes off this channel, because `windowStats` prints a
      // `mean` beside the `max` and a flyer who zooms to the burn is reading exactly the boost
      // average this change declared a floor. A caveat that named only the peak left the other
      // one bare on the same row.
      expect(c!.caveat, 'names the peak').toContain('true peak is higher');
      expect(c!.caveat, 'and the mean beside it').toContain('mean over a railed stretch is a floor');
      // Hedged to the same degree as the detector behind it — the tile says "may be clipped", so
      // this must not assert the rail as settled fact.
      expect(c!.caveat, 'no more certain than the heuristic').toMatch(/reads as|looks to/);
    });

    it('says nothing on an unrailed trace, or when the caller brought no metrics', () => {
      // The half that lets the case above fail. A caveat on every flight is a caveat nobody reads.
      expect(accel({ maxVelocityWithheld: null, accelClipped: false, maxAcceleration: 157 })!.caveat).toBeUndefined();
      expect(accel()!.caveat).toBeUndefined();
    });

    it('needs a peak before it qualifies one', () => {
      // The same edge the grid and the comparison share, through the one predicate: a clip flag
      // on a channel that produced no maximum has nothing to qualify.
      expect(accel({ maxVelocityWithheld: null, accelClipped: true, maxAcceleration: NaN })!.caveat).toBeUndefined();
    });

    it('does not put the accelerometer’s qualification on any other channel', () => {
      const all = buildPlotChannels(flight, series, {
        maxVelocityWithheld: null,
        accelClipped: true,
        maxAcceleration: 157,
      });
      const others = all.filter((c) => c.key !== 'd-acceleration');
      expect(others.length).toBeGreaterThan(0);
      for (const c of others) expect(c.caveat, `${c.key} is not about the accelerometer`).toBeUndefined();
    });
  });

  it('converts known units by the unit system and leaves native units alone', () => {
    const alt = channels.find((c) => c.key === 'd-altitude')!;
    expect(alt.toDisplay(100, 'imperial')).toBeCloseTo(328.084, 1);
    expect(alt.unitLabel('imperial')).toBe('ft');
    expect(alt.unitLabel('metric')).toBe('m');

    const accel = channels.find((c) => c.key === 'd-acceleration')!;
    expect(accel.toDisplay(9.80665, 'imperial')).toBeCloseTo(1, 3); // m/s² → g
    expect(accel.unitLabel('imperial')).toBe('g');

    const batt = channels.find((c) => c.label === 'Batt')!;
    expect(batt.toDisplay(7.4, 'imperial')).toBe(7.4); // native unit, no conversion
    expect(batt.unitLabel('imperial')).toBe('V');
  });
});

describe('planAxes', () => {
  it('puts the first distinct unit left and the second right', () => {
    expect(planAxes(['ft', 'ft', 'V'])).toEqual({ leftUnit: 'ft', rightUnit: 'V' });
  });
  it('leaves the right axis empty when everything shares a unit', () => {
    expect(planAxes(['ft', 'ft'])).toEqual({ leftUnit: 'ft', rightUnit: undefined });
  });
  it('ignores a third distinct unit (nowhere to put it)', () => {
    expect(planAxes(['ft', 'V', 'g'])).toEqual({ leftUnit: 'ft', rightUnit: 'V' });
  });
});

describe('windowStats', () => {
  const x = Float64Array.from([0, 1, 2, 3, 4]);
  const y = Float64Array.from([0, 10, 20, 30, 40]);

  it('summarizes the samples whose x falls in range', () => {
    const s = windowStats(x, y, 1, 3)!;
    expect(s.count).toBe(3);
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
    expect(s.mean).toBe(20);
    expect(s.delta).toBe(20); // y[3] - y[1]
    expect(s.rate).toBe(10); // 20 / (3 - 1)
  });

  it('ignores NaN y values and returns null for an empty window', () => {
    const yn = Float64Array.from([NaN, 10, NaN, 30, 40]);
    // Window [0,0]: only x=0, whose y is NaN → no finite samples → null.
    expect(windowStats(x, yn, 0, 0)).toBeNull();
    // Window [0,2]: x=0 (NaN, skipped), 1 (10), 2 (NaN, skipped) → one sample.
    const s = windowStats(x, yn, 0, 2)!;
    expect(s.count).toBe(1);
    expect(s.mean).toBe(10);
  });

  // The defect these pin: a mean over sample INDEX is not the mean over a stretch of flight
  // once the cadence changes, and this panel was still printing the index mean months after
  // the analyzer stopped. See `windowStats`'s own comment for the corpus measurement.
  describe('the mean is weighted by time, not by sample', () => {
    // Two seconds at 20, then one 8-second interval falling to 0. The four SAMPLES average
    // 15; the ten seconds of flight average 12, because the long interval is most of the
    // window and spends it below 20.
    const t = Float64Array.from([0, 1, 2, 10]);
    const v = Float64Array.from([20, 20, 20, 0]);

    it('weights each interval by its duration, not each sample equally', () => {
      const s = windowStats(t, v, 0, 10, t)!;
      expect(s.count).toBe(4);
      // Trapezoid: (20+20)/2·1 + (20+20)/2·1 + (20+0)/2·8 = 20 + 20 + 80 = 120 over 10 s.
      expect(s.mean).toBeCloseTo(12, 10);
      // The old, unweighted answer — asserted explicitly so a revert cannot pass quietly.
      expect(s.mean).not.toBeCloseTo(15, 1);
    });

    it('falls back to the sample mean with no time base at all', () => {
      const s = windowStats(t, v, 0, 10)!;
      expect(s.mean).toBe(15);
    });

    it('weights only samples adjacent in the record, so a scattered selection invents no duration', () => {
      // x is a channel rather than the clock, and the window skips sample 1. Samples 0 and 2
      // are 2 s apart on the clock but are NOT adjacent in the record, so no interval spans
      // them: the only weighted interval is 2→3. Bridging 0→2 would carry sample 0's value
      // across a stretch the flyer did not select and answer 33.3 instead.
      const tc = Float64Array.from([0, 1, 2, 3]);
      const vc = Float64Array.from([100, 555, 0, 0]);
      const xc = Float64Array.from([5, 99, 5, 5]);
      const s = windowStats(xc, vc, 0, 6, tc)!;
      expect(s.count).toBe(3);
      expect(s.mean).toBe(0);
    });

    it('falls back to the sample mean when the window holds one sample', () => {
      // The one-sample window has no interval at all, so there is nothing to weight by.
      const s = windowStats(t, v, 0, 0, t)!;
      expect(s.count).toBe(1);
      expect(s.mean).toBe(20);
    });

    it('costs a dropped sample its own two gaps, not the whole leg', () => {
      // The analyzer's `timeMean` weights an interval with ONE finite end at that end rather
      // than discarding it, so a sensor dropout does not delete its own duration from the
      // denominator. This must agree with it case for case: an earlier draft skipped any
      // interval touching a NaN, which removed both of the dropout's intervals and read
      // 31.25 where `timeMean` reads 29 — an ordinary dropout, not a contrived one.
      const td = Float64Array.from([0, 1, 2, 3, 10]);
      const vd = Float64Array.from([0, 10, NaN, 30, 40]);
      const s = windowStats(td, vd, -Infinity, Infinity, td)!;
      // 5·1 + 10·1 + 30·1 + 35·7 = 290 over 10 s.
      expect(s.mean).toBeCloseTo(29, 10);
      // The dropped sample is still absent from the sample statistics.
      expect(s.count).toBe(4);
    });

    it('skips an interval whose clock runs backwards rather than weighting it negatively', () => {
      // A defensive branch: a negative duration would subtract weight, and two of them can
      // cancel the divisor. Weighted forward-only this reads 33.3; counting the backward
      // step it reads 0.
      const tb = Float64Array.from([0, 1, 3, 2]);
      const vb = Float64Array.from([0, 0, 100, 100]);
      const s = windowStats(tb, vb, -Infinity, Infinity, tb)!;
      expect(s.mean).toBeCloseTo(100 / 3, 10);
    });
  });
});

describe('exploreCsv', () => {
  it('emits the X column then each Y series, with quoted headers and blank gaps', () => {
    const csv = exploreCsv(
      { label: 'Time', unit: 's', values: Float64Array.from([0, 1, 2]) },
      [
        { label: 'Altitude (AGL)', unit: 'ft', values: Float64Array.from([0, 100, NaN]) },
        { label: 'Batt', unit: 'V', values: Float64Array.from([7.4, 7.3, 7.2]) },
      ],
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"Time (s)","Altitude (AGL) (ft)","Batt (V)"');
    expect(lines[1]).toBe('0,0,7.4');
    expect(lines[3]).toBe('2,,7.2'); // NaN altitude → blank cell
  });

  it('stops at the shortest column', () => {
    const csv = exploreCsv(
      { label: 't', unit: 's', values: Float64Array.from([0, 1, 2, 3]) },
      [{ label: 'y', unit: '', values: Float64Array.from([0, 1]) }],
    );
    expect(csv.split('\n')).toHaveLength(1 + 2); // header + 2 rows
  });

  it('defangs a formula-injected channel label (it arrives via the file/share link)', () => {
    const csv = exploreCsv(
      { label: 'Time', unit: 's', values: Float64Array.from([0, 1]) },
      [{ label: '=HYPERLINK("http://evil")', unit: '', values: Float64Array.from([1, 2]) }],
    );
    // The header is quoted and prefixed with ' so a spreadsheet reads it as text.
    expect(csv.split('\n')[0]).toBe('"Time (s)","\'=HYPERLINK(""http://evil"")"');
  });
});

/**
 * `exploreCsv` has TWO call sites of opposite shape, and D10's sink audit named them as two rows
 * because they need two different answers to one question: `ChannelExplorer` writes one FLIGHT's
 * channels, so the flight is constant down the file; `CompareView`'s `compare-data.csv` writes one
 * column per flight per channel on a shared clock, so the flight varies ACROSS the file and a row
 * is an instant several flights share.
 *
 * So the claim goes on both axes a flight can vary along — the column header, and a leading
 * `Provenance` column — and these cases assert each is on the axis that carries it.
 */
describe('exploreCsv — a flight Debrief made up', () => {
  const t = { label: 'Time', unit: 's', values: Float64Array.from([0, 1]) };
  const col = (label: string, synthetic?: boolean) => ({
    label,
    unit: 'ft',
    values: Float64Array.from([10, 20]),
    synthetic,
  });

  it('marks one made-up flight in every column header and in a Provenance cell on every row', () => {
    // The explorer's shape: every column is the same made-up flight, x included.
    const lines = exploreCsv({ ...t, synthetic: true }, [col('Altitude', true), col('Velocity', true)]).split('\n');
    expect(lines[0]).toBe(
      '"Provenance","SYNTHETIC — Time (s)","SYNTHETIC — Altitude (ft)","SYNTHETIC — Velocity (ft)"',
    );
    // Every DATA row, because select-the-block-and-paste is the gesture a data CSV exists for and
    // it leaves the header behind — the same reason `lib/report.ts`'s data CSV is per-row.
    expect(lines.slice(1).filter((l) => !l.startsWith('"SYNTHETIC — made up by Debrief, not flown",'))).toEqual([]);
    expect(lines).toHaveLength(3);
  });

  it('marks only the made-up columns when a comparison mixes them with recordings', () => {
    // The comparison's shape. The shared time base is NOT tagged: it belongs to no one flight, and
    // tagging it would say the recording's own timestamps were made up.
    const lines = exploreCsv(t, [col('demo — altitude', true), col('pnut — altitude', false)]).split('\n');
    expect(lines[0]).toBe(
      '"Provenance","Time (s)","SYNTHETIC — demo — altitude (ft)","pnut — altitude (ft)"',
    );
    // The row-level cell points at the headers rather than claiming the whole file is made up,
    // which on this set would be false about the column beside it.
    expect(lines[1]).toBe(
      '"SYNTHETIC — some of these columns are flights Debrief made up, not flown; each one is tagged in its own column header",0,10,10',
    );
  });

  it('leaves a comparison of recordings byte-identical to what it wrote before the claim existed', () => {
    // The other direction, and the one that stops the column becoming noise: a file with nothing
    // to say is not reshaped for a demonstration's sake. Asserted against the literal text rather
    // than against a second call, so a bug that adds the column everywhere cannot pass both ways.
    const csv = exploreCsv(t, [col('pnut — altitude', false), col('raven — altitude', undefined)]);
    expect(csv).toBe('"Time (s)","pnut — altitude (ft)","raven — altitude (ft)"\n0,10,10\n1,20,20');
  });

  it('says "some of these columns" when every FLIGHT is made up but the shared clock is not', () => {
    // A comparison of two demonstrations. The clock is left untagged by `CompareView` because a
    // liftoff-aligned time base is nobody's recording — so "some of these columns" is what is
    // literally true of the file, and the whole-file sentence would not be. The counting rule
    // gives that for free rather than needing a case of its own.
    const lines = exploreCsv(t, [col('demoA — altitude', true), col('demoB — altitude', true)]).split('\n');
    expect(lines[0]).toBe('"Provenance","Time (s)","SYNTHETIC — demoA — altitude (ft)","SYNTHETIC — demoB — altitude (ft)"');
    expect(lines[1].startsWith('"SYNTHETIC — some of these columns')).toBe(true);
  });

  it('counts the x column like any other, so one flight\'s whole file says so outright', () => {
    // The explorer tags x as well, because there every column IS the one flight. Asserted through
    // the degenerate call rather than through the UI: `ChannelExplorer` renders nothing with no
    // channel selected, so this pins the COUNTING RULE — every column made up ⇒ the whole-file
    // sentence — not a state a flyer can reach. Said plainly because the first version of this
    // case claimed the latter, and a test whose stated reason is false is the shape this repo
    // keeps having to correct.
    const lines = exploreCsv({ ...t, synthetic: true }, []).split('\n');
    expect(lines[0]).toBe('"Provenance","SYNTHETIC — Time (s)"');
    expect(lines[1]).toBe('"SYNTHETIC — made up by Debrief, not flown",0');
  });

  it('still defangs a formula-injected label on a made-up column', () => {
    // **The tag is applied AFTER the guard, and it has to be.** `formulaGuard` inspects the first
    // character only, so tagging first hides a leading `=` from it and the guard silently stops
    // covering exactly the columns this slice added. Found by the pre-push review; the untagged
    // case above could never have caught it.
    const csv = exploreCsv(t, [{ label: '=HYPERLINK("http://evil")', unit: '', values: Float64Array.from([1, 2]), synthetic: true }]);
    expect(csv.split('\n')[0]).toBe('"Provenance","Time (s)","SYNTHETIC — \'=HYPERLINK(""http://evil"")"');
  });
});
