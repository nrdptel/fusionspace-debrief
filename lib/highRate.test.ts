import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { flightTimeOrigin, highRateStream } from './parsers/blueraven';
import { importFlight } from './parsers';
import { halvesOfOneDownload, readHighRateOnto } from './highRate';
import type { RawFlight } from './flight/types';

const CORPUS = 'lib/parsers/__corpus__/blueraven/';

/** The four corpus downloads that carry both halves as app CSVs, high-rate half first.
 *
 *  The fifth high-rate file in the corpus — `…SG1.2-Sustainer-November-BlueRaven-High.txt` — is
 *  the serial `@ LOG_HIR` capture, whose columns are unlabelled positional tokens. It is
 *  deliberately NOT read (see `highRateStream`), and the refusal test below covers it. */
const PAIRS: [hr: string, lr: string, group: string][] = [
  [
    'blueraven__trf-lemiv-l3__BlRv_SN1537_HR_04-12-2025_12_45_49.csv',
    'blueraven__trf-lemiv-l3__BlRv_SN1537_LR_04-12-2025_12_45_49.csv',
    'trf-lemiv-l3',
  ],
  [
    'blueraven__trf-f1machbuster-jan10__BLRVN87-bckup HR_01-10-2026_14_55_30.csv',
    'blueraven__trf-f1machbuster-jan10__BLRVN87-bckup LR_01-10-2026_14_55_30.csv',
    'trf-f1machbuster-jan10',
  ],
  [
    'blueraven__trf-f1machbuster-jan18__BlRv_159F1cm HR_01-18-2026_10_48_41.csv',
    'blueraven__trf-f1machbuster-jan18__BlRv_159F1cm LR_01-18-2026_10_48_41.csv',
    'trf-f1machbuster-jan18',
  ],
  [
    'blueraven__reddit-meraki2-121km__BlueRaven-HighRate.csv',
    'blueraven__reddit-meraki2-121km__BlueRaven-LR.csv',
    'reddit-meraki2-121km',
  ],
];

const present = existsSync(CORPUS + PAIRS[0][0]);
const read = (name: string) => readFileSync(CORPUS + name, 'utf8');

/** The raw peak of one column, straight out of the file, with no parsing in between — so the
 *  assertion below compares against the FILE rather than against another copy of this code. */
function rawPeak(text: string, column: string, withinS?: [number, number]): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const head = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const ci = head.indexOf(column.toLowerCase());
  const ti = head.findIndex((h) => h.includes('flight_time'));
  let peak = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const v = Number(cells[ci]);
    if (!Number.isFinite(v)) continue;
    if (withinS) {
      const t = Number(cells[ti]);
      if (!Number.isFinite(t) || t < withinS[0] || t > withinS[1]) continue;
    }
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  return peak;
}

function flightOf(name: string): RawFlight {
  const r = importFlight({ name, text: read(name) });
  if (r.kind !== 'flight') throw new Error(`${name} did not parse as a flight`);
  return r.flight;
}

describe('a Blue Raven high-rate file is the other half of one flight', () => {
  it.skipIf(!present)('the standalone refusal survives, in today’s words, on every high-rate file', () => {
    // The whole slice is about a stream being read BESIDE its flight. Dropping one alone is still
    // not a flight — it has no altitude — and must still say exactly what it said before.
    const alone = [
      ...PAIRS.map(([hr]) => hr),
      'blueraven__issuiuc-sg1.2-20231118__SG1.2-Sustainer-November-BlueRaven-High.txt',
    ];
    for (const name of alone) {
      if (!existsSync(CORPUS + name)) continue;
      expect(() => importFlight({ name, text: read(name) }), name).toThrow(
        'This is the Blue Raven high-rate file (gyro, acceleration and attitude only). Drop the low-rate file instead for altitude and the flight profile.',
      );
    }
  }, 120_000);

  it.skipIf(!present)('reads onto the low-rate flight’s own clock, with nothing aligned or estimated', () => {
    for (const [hrName, lrName, group] of PAIRS) {
      const stream = highRateStream(read(hrName));
      expect(stream, group).not.toBeNull();
      const flight = flightOf(lrName);
      const before = flight.channels.length;
      const origin = flightTimeOrigin(read(lrName))!;
      const merged = readHighRateOnto(flight, stream!, origin);

      // Every stream channel arrived, and every one is exactly as long as the flight's own clock —
      // `buildPlotChannels` silently drops a channel whose length disagrees, so a ragged array
      // would make this whole feature invisible rather than wrong.
      expect(merged.channels.length, group).toBe(before + stream!.channels.length);
      for (const c of merged.channels) expect(c.values.length, `${group} ${c.label}`).toBe(merged.time.length);

      // The two halves share the `Flight_Time` column, so once the flight's own re-basing is
      // undone the stream opens where the flight does — within the sample phase of a 500 Hz
      // stream against a 50 Hz one (0.062–0.108 s measured). If this ever exceeds one low-rate
      // sample the premise that nothing needs estimating has stopped holding, and this goes red.
      expect(Math.abs(stream!.time[0] - origin - flight.time[0]), group).toBeLessThan(0.15);
      expect(stream!.rateHz, group).toBeGreaterThan(400);
    }
  }, 120_000);

  it.skipIf(!present)('keeps the board’s own peak on every channel, where a resample loses most of it', () => {
    // The assertion this slice turns on. Measured before it was written: linear resampling onto
    // the 50 Hz clock loses 69.0% of `f1machbuster-jan18`'s Accel_Z peak, 61.6% of `lemiv`'s and
    // 42.1% of `f1machbuster-jan10`'s Gyro_X. Falsified by replacing the extremum in
    // `ontoFlightClock` with the sample nearest the instant, which turns this red on all four.
    const G = 9.80665;
    for (const [hrName, lrName, group] of PAIRS) {
      const stream = highRateStream(read(hrName))!;
      const flight = flightOf(lrName);
      const merged = readHighRateOnto(flight, stream, flightTimeOrigin(read(lrName))!);
      // Only over the stretch the flight's own record covers: a stream that runs past the end of
      // its low-rate log (jan10 does, by 20 s) has samples at instants the flight has no place for,
      // and they are dropped rather than drawn at a time they did not happen.
      const span: [number, number] = [flight.time[0], flight.time[flight.time.length - 1]];
      const text = read(hrName);
      for (const [column, label, scale] of [
        ['Gyro_X', 'Gyro X', 1],
        ['Gyro_Y', 'Gyro Y', 1],
        ['Gyro_Z', 'Gyro Z', 1],
        ['Accel_X', 'Accel X', G],
        ['Accel_Y', 'Accel Y', G],
        ['Accel_Z', 'Accel Z', G],
      ] as [string, string, number][]) {
        const channel = merged.channels.find((c) => c.label === label);
        expect(channel, `${group} ${label}`).toBeDefined();
        let kept = 0;
        for (const v of channel!.values) if (Number.isFinite(v) && Math.abs(v) > kept) kept = Math.abs(v);
        const raw = rawPeak(text, column, span) * scale;
        // Exactly the file's own peak, not merely close to it: every plotted point IS a recorded
        // sample, so the largest of them is the largest recorded. Tolerance is float noise only.
        expect(kept, `${group} ${label}`).toBeCloseTo(raw, 6);
      }
    }
  }, 120_000);

  it.skipIf(!present)('offers the stream to the channel explorer by name, not as an r-N passthrough', async () => {
    // The check that this reaches a FLYER rather than only the model. `buildPlotChannels` drops
    // any channel whose length disagrees with the flight clock and any that is all-NaN, both
    // silently — so a merge that looked right in the model could reach no surface at all.
    const { buildPlotChannels } = await import('./explore');
    const { analyzeFlight } = await import('./analyze');
    const [hrName, lrName, group] = PAIRS[0];
    const stream = highRateStream(read(hrName))!;
    const merged = readHighRateOnto(flightOf(lrName), stream, flightTimeOrigin(read(lrName))!);
    const offered = buildPlotChannels(merged, analyzeFlight(merged).series);
    for (const label of ['Gyro X', 'Gyro Y', 'Gyro Z', 'Accel X', 'Accel Y', 'Accel Z', 'Quat 1']) {
      expect(
        offered.some((c) => c.label === label),
        `${group}: the explorer does not offer ${label}`,
      ).toBe(true);
    }
    // And the flight without its other half offers none of them — so the test above is measuring
    // the merge rather than something the low-rate file already carried.
    const alone = buildPlotChannels(flightOf(lrName), analyzeFlight(flightOf(lrName)).series);
    expect(alone.some((c) => c.label === 'Gyro X')).toBe(false);
  }, 120_000);

  it.skipIf(!present)('flags a railed sensor rather than reading its rail as a measurement', () => {
    // Every corpus download rails at least one gyro axis, at 2,291.5–2,294.1 deg/s. The SAFETY
    // invariant requires a saturated sensor be flagged; a peak read off a rail is a floor.
    for (const [hrName, , group] of PAIRS) {
      const stream = highRateStream(read(hrName))!;
      expect(stream.saturated.length, `${group} — expected a railed gyro axis`).toBeGreaterThan(0);
      const lrName = PAIRS.find(([h]) => h === hrName)![1];
      const merged = readHighRateOnto(flightOf(lrName), stream, flightTimeOrigin(read(lrName))!);
      expect(merged.notes.some((n) => n.includes('RAILED')), group).toBe(true);
      // …and it names which channel, because "a sensor railed" a flyer cannot act on.
      for (const label of stream.saturated) {
        expect(merged.notes.some((n) => n.includes(label)), `${group} ${label}`).toBe(true);
      }
    }
  }, 120_000);

  it.skipIf(!present)('pairs the two halves of a real download by name, and refuses two different flights', () => {
    for (const [hr, lr, group] of PAIRS) {
      expect(halvesOfOneDownload(hr, lr), group).toBe(true);
    }
    // The trap this key exists for: "lr" and "hr" sit INSIDE the names these files actually have —
    // `BlRv` contains "lR", `BLRVN87` contains "LRV" — so a substring test pairs a file with itself.
    expect(halvesOfOneDownload(PAIRS[0][0], PAIRS[0][0])).toBe(false);
    expect(halvesOfOneDownload(PAIRS[1][1], PAIRS[1][1])).toBe(false);
    // Two different flights from one launch day must not collapse: same rocket, different second.
    expect(
      halvesOfOneDownload('BlRv_SN1537_HR_04-12-2025_12_45_49.csv', 'BlRv_SN1537_LR_04-12-2025_13_20_02.csv'),
    ).toBe(false);
    // And the two halves of one flight pair whatever else is in the name.
    expect(halvesOfOneDownload('BlueRaven-HighRate.csv', 'BlueRaven-LR.csv')).toBe(true);
  });
});
