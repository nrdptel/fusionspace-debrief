import { describe, it, expect } from 'vitest';
import type { RawFlight } from './flight/types';
import { analyzeFlight } from './analyze';
import { analyzedDataCsv, summaryText, summaryMarkdown, summaryHtml, analysisJson, compareMarkdown, compareHtml, compareJson, compareMetricRows, compareHasClippedAccel } from './report';
import { buildComparison, type CompareInput } from './compare';

function tinyFlight(): RawFlight {
  const dt = 0.05;
  const time: number[] = [];
  const alt: number[] = [];
  for (let t = 0; t <= 40; t += dt) {
    time.push(t);
    // pad, rise to ~300 m, descend
    const ft = t - 2;
    let h = 0;
    if (ft > 0 && ft <= 16) h = 300 * (1 - (1 - ft / 16) ** 2);
    else if (ft > 16) h = Math.max(0, 300 - 15 * (ft - 16));
    alt.push(h);
  }
  return {
    source: 'tiny.csv',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels: [{ kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(alt) }],
    meta: {},
    notes: [],
  };
}

/** The same flight with a measured axial channel, so the acceleration column and the
 *  acceleration metrics exist at all. The boost ramps 40 → 80 m/s² rather than sitting
 *  flat, so the boost average is a different number from the peak and an assert on one
 *  cannot pass on the other's value. */
function accelFlight(): RawFlight {
  const f = tinyFlight();
  const n = f.time.length;
  const acc = Float64Array.from({ length: n }, (_, i) => (i > 40 && i < 80 ? 40 + (40 * (i - 40)) / 40 : 0));
  return { ...f, channels: [...f.channels, { kind: 'accelAxial', label: 'acc', unit: 'm/s2', values: acc }] };
}

describe('report exports', () => {
  const flight = tinyFlight();
  const analysis = analyzeFlight(flight);
  const accelFlight_ = accelFlight();

  it('analyzedDataCsv leads with the derived columns and one row per sample', () => {
    const csv = analyzedDataCsv(flight, analysis, 'imperial');
    const lines = csv.split('\n');
    // This baro flight has no measured acceleration, so that column is omitted (its trace
    // is differentiation noise) — the derived columns are altitude, velocity, mach, Q.
    expect(lines[0]).toMatch(
      /^time \(s\),altitude \(ft AGL\),velocity \(ft\/s\),mach,dynamic pressure \(psi\)/,
    );
    expect(lines[0]).not.toContain('acceleration (g)');
    expect(lines.length).toBe(flight.time.length + 1);
    expect(lines[1].split(',')[0]).toBe('0.000');
  });

  it('drops mach and dynamic pressure from the data CSV when the speed was withheld', () => {
    // Both are derived from the velocity, so they go the same way it does. The screen, the
    // explorer and the comparison overlay all withhold them on an impossible speed; this
    // writer computed them anyway, so the one artefact a flyer pastes into a spreadsheet was
    // the one place the withheld figure came back. Ten of the corpus's 46 flights are in that
    // state, and their CSVs stated Mach 362.4 down to a perfectly believable 1.3.
    const n = flight.time.length;
    // A velocity channel with an impossible stretch — enough samples to survive spike filtering.
    const vel = Float64Array.from({ length: n }, (_, i) => (i > 100 && i < 140 ? 9000 : 50));
    const wild: RawFlight = { ...flight, channels: [...flight.channels, { kind: 'velocity', label: 'v', unit: 'm/s', values: vel }] };
    const wildAnalysis = analyzeFlight(wild);
    expect(wildAnalysis.series.velocityImplausible, 'the fixture really does get its speed withheld').toBe(true);
    expect(wildAnalysis.metrics.mach, 'the screen withholds Mach').toBeNull();

    const csv = analyzedDataCsv(wild, wildAnalysis, 'metric');
    const header = csv.split('\n')[0];
    expect(header, 'no mach column').not.toContain('mach');
    expect(header, 'no dynamic-pressure column').not.toContain('dynamic pressure');
    // The velocity column stays, exactly as its trace stays on screen, so a mis-scaled
    // column can still be seen and diagnosed.
    expect(header).toContain('velocity');

    // And a flight whose speed stands keeps both columns.
    expect(analyzedDataCsv(flight, analysis, 'metric').split('\n')[0]).toContain('mach');
  });

  it('includes the acceleration column when the logger measured it, in the chosen unit', () => {
    const a = analyzeFlight(accelFlight_);
    expect(analyzedDataCsv(accelFlight_, a, 'imperial').split('\n')[0]).toContain('acceleration (g)');

    // The column follows the per-quantity choice like every other one — a bundle whose
    // .json says m/s² and whose .csv says g is one flight carried in two units.
    const csv = analyzedDataCsv(accelFlight_, a, { length: 'm', speed: 'm/s', accel: 'm/s²', temp: '°C', pressure: 'kPa' });
    const cols = csv.split('\n')[0].split(',');
    const at = cols.indexOf('acceleration (m/s²)');
    expect(at, 'the header names the chosen unit').toBeGreaterThan(-1);
    // …and the numbers underneath it moved with the label, rather than staying in g.
    const peak = Math.max(...csv.split('\n').slice(1).map((r) => Number(r.split(',')[at]) || 0));
    expect(peak).toBeGreaterThan(50); // ~80 m/s²; it would read ~8 if still in g
  });

  it('switches CSV units with the system', () => {
    const header = analyzedDataCsv(flight, analysis, 'metric').split('\n')[0];
    expect(header).toContain('altitude (m AGL)');
    expect(header).toContain('dynamic pressure (kPa)');
  });

  it('carries every recorded channel the logger captured, not just the derived curves', () => {
    // A flight that also logged battery voltage and temperature: both must ride into the
    // data export as their own columns, in the displayed units, alongside the derived six.
    const n = flight.time.length;
    const volts = Float64Array.from({ length: n }, (_, i) => 9.1 - i * 0.0002);
    const tempC = Float64Array.from({ length: n }, () => 20);
    const rich = {
      ...flight,
      channels: [
        ...flight.channels,
        { kind: 'voltage' as const, label: 'Battery', unit: 'V', values: volts },
        { kind: 'temperature' as const, label: 'Temp', unit: '°C', values: tempC },
      ],
    };
    const csv = analyzedDataCsv(rich, analyzeFlight(rich), 'imperial');
    const header = csv.split('\n')[0];
    expect(header).toContain('Battery (V)');
    expect(header).toContain('Temp (°F)'); // temperature converts to the imperial system
    // The battery column carries real values, not blanks.
    const cols = header.split(',');
    const battCol = cols.findIndex((c) => c.includes('Battery'));
    const firstRow = csv.split('\n')[1].split(',');
    expect(Number(firstRow[battCol])).toBeGreaterThan(9);
  });

  it('summaryText carries provenance and a hedge', () => {
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000);
    expect(txt).toContain('Apogee');
    expect(txt).toMatch(/not gospel/i);
    expect(txt).toMatch(/Analyzed/);
  });

  it('summaryMarkdown renders balanced metric and event tables', () => {
    const md = summaryMarkdown(flight, analysis, 'imperial', 1_700_000_000_000);
    expect(md).toContain('# Debrief — flight report');
    expect(md).toContain('| Metric | Value |');
    expect(md).toMatch(/\| Apogee \| [\d,]+ ft \|/);
    expect(md).toContain('## Events');
    expect(md).toContain('| Event | Time | Altitude | Speed | Shock |');
    expect(md).toMatch(/Made with \[Debrief\]\(https:\/\/debrief\.fusionspace\.co\)/);
    // Every table row has the same column count as its header (a broken table would
    // have a stray or missing pipe): the metric table is 2-wide, the events table 5-wide.
    const bars = (s: string) => (s.match(/\|/g) ?? []).length;
    const rows = md.split('\n');
    const tableRows = rows.filter((l) => l.startsWith('| ') && !l.includes('---'));
    expect(tableRows.length).toBeGreaterThan(3);
    expect(tableRows.every((l) => bars(l) === bars('| a | b |') || bars(l) === bars('| a | b | c | d | e |'))).toBe(true);
  });

  it('withholds the event speeds in every export when the velocity was judged unusable', () => {
    // The headline already withholds an unusable velocity; the event tables read the same
    // trace sample by sample, so they have to withhold it too — an export that prints the
    // refused figure beside burnout hands it back with the refusal hidden.
    const bad = { ...analysis, series: { ...analysis.series, velocityImplausible: true } };
    const speeds = (s: string) => s.match(/[\d,]+(?:\.\d+)? (?:ft\/s|m\/s)/g) ?? [];
    // Just the events block of each export — the part that reads the trace per sample.
    const block = (s: string, from: RegExp, to: RegExp) => {
      const i = s.search(from);
      const rest = i < 0 ? '' : s.slice(i + (s.match(from)?.[0].length ?? 0));
      const j = rest.search(to);
      return j < 0 ? rest : rest.slice(0, j);
    };
    for (const [name, render, events] of [
      ['text', summaryText, (s: string) => block(s, /^Events$/m, /\n\s*\n/)],
      ['markdown', summaryMarkdown, (s: string) => block(s, /^## Events$/m, /\n#/)],
      ['html', summaryHtml, (s: string) => block(s, /<h2>Events<\/h2>/, /<\/table>/)],
    ] as const) {
      // The same block does carry speeds when the velocity is usable — so an empty result
      // below is the withholding, not a selector that matches nothing.
      expect(speeds(events(render(flight, analysis, 'imperial', 0))).length, name).toBeGreaterThan(0);
      expect(speeds(events(render(flight, bad, 'imperial', 0))), name).toEqual([]);
    }
    for (const e of JSON.parse(analysisJson(flight, bad, 'imperial', 0)).events) {
      expect(e.speed).toBeNull();
    }
  });

  it('summaryHtml is a self-contained report — no external asset, script, or fetch', () => {
    const html = summaryHtml(flight, analysis, 'imperial', 1_700_000_000_000, { label: 'My flight' }, undefined, [
      { title: 'Altitude', svg: '<svg data-fig="alt"></svg>' },
    ]);
    // A complete, titled HTML document with the headline numbers.
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>');
    expect(html).toMatch(/<th>Apogee<\/th><td>[\d,]+ ft<\/td>/);
    expect(html).toContain('My flight');
    // The passed figure is embedded inline.
    expect(html).toContain('<svg data-fig="alt"></svg>');
    // Self-contained and privacy-safe: no script, no external stylesheet/asset, no fetch;
    // the only link is Debrief's own footer credit.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/(src|href)="http(?!s:\/\/debrief\.fusionspace\.co)/i);
    // HTML-escapes user-controlled text so a rocket name can't inject markup.
    const evil = summaryHtml({ ...flight, source: '<img src=x onerror=alert(1)>' }, analysis, 'imperial');
    expect(evil).not.toContain('<img src=x');
    expect(evil).toContain('&lt;img src=x');
  });

  it('carries the deployment shock in the exported summary', () => {
    // The analysis puts the deployment snatch force on the apogee/main events; a report a
    // flyer hands in should show it (it sizes the recovery hardware), not just the screen.
    const base = analyzeFlight(flight);
    const withShock = {
      ...base,
      events: base.events.map((e) => (e.type === 'apogee' ? { ...e, peakAccel: 400 } : e)), // ~41 g
    };
    const txt = summaryText(flight, withShock, 'imperial', 1_700_000_000_000);
    expect(txt).toMatch(/\d+ g shock/);
    const md = summaryMarkdown(flight, withShock, 'imperial', 1_700_000_000_000);
    // The five-column events row (label carries "(derived)") ends with the shock cell.
    const apogeeEventRow = md.split('\n').find((l) => /^\| Apogee[^|]*\|.*\| [\d.]+ g \|$/.test(l));
    expect(apogeeEventRow).toBeTruthy();
  });

  it('carries landing energy into the exports when a descending mass is supplied', () => {
    // ½·m·v² off the measured landing descent rate — the cert-card figure. 1.2 kg.
    // The fixture resolves no deployment, so its touchdown speed is the whole-descent
    // average; the energy reads off whichever of the two the record supports.
    const recovery = { descendingMassKg: 1.2 };
    const rate = (analysis.metrics.mainDescentRate ?? analysis.metrics.wholeDescentRate)!;
    const expectedJ = 0.5 * 1.2 * rate * rate;

    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery);
    expect(txt).toMatch(/Landing energy\s+[\d.]+ ft·lbf \(at [\d.]+ oz descending\)/);

    const md = summaryMarkdown(flight, analysis, 'metric', 1_700_000_000_000, undefined, recovery);
    expect(md).toMatch(/\| Landing energy \| \d+ J \(at \d+ g descending\) \|/);

    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery));
    expect(doc.recovery.landingEnergyJoules).toBeCloseTo(expectedJ, 0);
    expect(doc.recovery.landingEnergyFtLbf).toBeCloseTo(expectedJ / 1.3558179483, 0);
    expect(doc.recovery.descendingMass).toEqual({ value: expect.any(Number), unit: 'oz' });
  });

  it('omits landing energy when no descending mass is given', () => {
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000);
    expect(txt).not.toMatch(/Landing energy/);
    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000));
    expect(doc.recovery).toBeUndefined();
  });

  it('carries the main-deploy verification into the exports when a set altitude is supplied', () => {
    // Measured firing 492 ft AGL (150 m); flyer set 500 ft (152.4 m) → within slop, on the mark.
    const recovery = { mainDeploy: { setM: 152.4, actualM: 150 } };
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery);
    expect(txt).toMatch(/Main deploy check\s+fired at [\d,]+ ft, set [\d,]+ ft — on the mark/);

    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery));
    expect(doc.recovery.mainDeploy).toMatchObject({ setAltitude: 500, verdict: 'on' });

    // A firing well below the set altitude reads "low" (the hard-landing side).
    const low = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, undefined, { mainDeploy: { setM: 300, actualM: 150 } });
    expect(low).toMatch(/Main deploy check\s+.*— [\d,]+ ft low/);
  });

  it('carries the ejection-delay verification into the exports when a flown delay is supplied', () => {
    // Ideal coast 4.2 s; flew a 3 s delay → fires ~1.2 s before apogee (the riskier side).
    const recovery = { ejectionDelay: { printedS: 3, coastS: 4.2 } };
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery);
    expect(txt).toMatch(/Ejection check\s+flew 3 s, ideal 4\.2 s — fires 1\.2 s before apogee/);

    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery));
    expect(doc.recovery.ejectionDelay).toMatchObject({ flownSeconds: 3, idealSeconds: 4.2, verdict: 'before' });
  });

  it('includes a device cross-check section when the file carried its own summary', () => {
    const withReported: RawFlight = {
      ...flight,
      reported: [
        { metric: 'apogeeAltitude', label: 'Apogee', value: 300, source: 'device' },
        { metric: 'maxVelocity', label: 'Max velocity', value: 9999, source: 'device' }, // deliberately off
      ],
    };
    const a = analyzeFlight(withReported);
    const md = summaryMarkdown(withReported, a, 'metric');
    expect(md).toContain("Logger’s own summary (cross-check)");
    expect(md).toContain('| Reading | Logger | Debrief | Agreement |');
    expect(md).toMatch(/\| Apogee \|.*\| agree/); // ~300 m computed vs 300 reported
    expect(md).toMatch(/\| Max velocity \|.*\| differ/); // 9999 m/s can't match

    const txt = summaryText(withReported, a, 'metric');
    expect(txt).toContain('Logger’s own summary (cross-check)');

    // A flight with no reported summary omits the section entirely.
    expect(summaryMarkdown(flight, analysis, 'metric')).not.toContain('cross-check');
  });

  it('carries the GPS recording, and how to read it, into the structured document', () => {
    // A cross-check that isn't in the export isn't finished: a consumer archiving the
    // document would otherwise lose the second independent recording entirely, and one
    // reading only the numbers could not tell corroboration from coincidence.
    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000));
    // This synthetic flight has no GPS, so the keys are present and null — a consumer
    // reads a key it knows rather than guessing whether it was omitted.
    expect(doc.metrics).toHaveProperty('gpsApogee', null);
    expect(doc.metrics).toHaveProperty('gpsApogeeTime', null);
    expect(doc.metrics).toHaveProperty('gpsAscentFixes', null);
    expect(doc.metrics).toHaveProperty('gpsApogeeAgreement', null);
  });

  it('analysisJson is valid JSON carrying units, metrics, events and provenance', () => {
    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000));
    expect(doc.schema).toBe('debrief.flight/1');
    expect(doc.analyzedAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(doc.units.length).toBe('ft');
    expect(doc.units.speed).toBe('ft/s');
    // Apogee is ~300 m → ~984 ft, a finite number in the chosen units.
    expect(typeof doc.metrics.apogee).toBe('number');
    expect(doc.metrics.apogee).toBeGreaterThan(900);
    // A metric the flight lacks is null, not absent or invented.
    expect(doc.metrics.peakRollRate).toBeNull();
    expect(doc.metrics.tiltAtBurnoutDeg).toBeNull();
    // Events carry provenance so nothing reads as more certain than it is.
    expect(Array.isArray(doc.events)).toBe(true);
    expect(doc.events.some((e: { type: string }) => e.type === 'apogee')).toBe(true);
    expect(doc.events.every((e: { provenance?: string }) => typeof e.provenance === 'string')).toBe(true);
    expect(doc.disclaimer).toMatch(/not gospel/i);
    // No logger summary on this flight → the section is omitted.
    expect(doc.loggerSummary).toBeUndefined();
  });

  it('analysisJson switches units and includes the logger cross-check when present', () => {
    const metricDoc = JSON.parse(analysisJson(flight, analysis, 'metric'));
    expect(metricDoc.units.length).toBe('m');
    expect(metricDoc.analyzedAt).toBeNull(); // no timestamp passed

    const withReported: RawFlight = {
      ...flight,
      reported: [{ metric: 'apogeeAltitude', label: 'Apogee', value: 300, source: 'device' }],
    };
    const doc = JSON.parse(analysisJson(withReported, analyzeFlight(withReported), 'metric'));
    expect(Array.isArray(doc.loggerSummary)).toBe(true);
    expect(doc.loggerSummary[0].metric).toBe('apogeeAltitude');
    expect(doc.loggerSummary[0].logger).toBeCloseTo(300, 0);
    expect(typeof doc.loggerSummary[0].agreementPct).toBe('number');
  });

  // Both named systems declare acceleration in g, so every other JSON test here agrees with
  // the export no matter what it converts to. The unit is chosen per quantity, though, and a
  // flyer who picks m/s² gets a number a script reads as m/s² — this holds the declared unit
  // and the emitted magnitude side by side so they cannot drift apart again.
  it('analysisJson emits acceleration in the unit it declares, whichever was chosen', () => {
    const a = analyzeFlight(accelFlight_);
    const si = a.metrics.maxAcceleration;
    expect(Number.isFinite(si)).toBe(true); // the asserts below are worthless on a null
    // A ramped boost, so the average is genuinely below the peak — a flat pulse makes
    // avgBoost === max and the second assert passes on the first one's number.
    expect(a.metrics.avgBoostAcceleration).toBeLessThan(si - 1);

    const base = { length: 'm', speed: 'm/s', temp: '°C', pressure: 'kPa' } as const;
    // The factor from SI to each unit, so a wrong conversion cannot pass by coincidence,
    // and the tolerance is exactly the last decimal the export writes in that unit —
    // not a fixed epsilon that the rounding alone could consume.
    for (const [unit, perMs2, step] of [
      ['g', 1 / 9.80665, 0.01],
      ['m/s²', 1, 0.1],
      ['ft/s²', 1 / 0.3048, 0.1],
    ] as const) {
      const doc = JSON.parse(analysisJson(accelFlight_, a, { ...base, accel: unit }));
      expect(doc.units.acceleration).toBe(unit);
      expect(Math.abs(doc.metrics.maxAcceleration - si * perMs2)).toBeLessThan(step);
      expect(Math.abs(doc.metrics.avgBoostAcceleration - a.metrics.avgBoostAcceleration! * perMs2)).toBeLessThan(step);
    }

    // Every acceleration-valued key at once, rather than the two named above: read the
    // document twice and require each to sit in the ratio between the two units, or to be
    // absent from both. That covers maxDeceleration and an event's peak shock — which no
    // named assert reaches on every fixture — and fails if a new one arrives unconverted.
    const inG = JSON.parse(analysisJson(accelFlight_, a, { ...base, accel: 'g' }));
    const inMs2 = JSON.parse(analysisJson(accelFlight_, a, { ...base, accel: 'm/s²' }));
    const accelKeys = ['maxAcceleration', 'avgBoostAcceleration', 'maxDeceleration'] as const;
    for (const k of accelKeys) {
      if (inG.metrics[k] == null) {
        expect(inMs2.metrics[k]).toBeNull();
        continue;
      }
      expect(inMs2.metrics[k] / inG.metrics[k]).toBeCloseTo(9.80665, 1);
    }
    for (let i = 0; i < inG.events.length; i++) {
      const g = inG.events[i].peakAcceleration;
      if (g == null || Math.abs(g) < 0.5) continue; // a ratio on near-zero is all rounding
      expect(inMs2.events[i].peakAcceleration / g).toBeCloseTo(9.80665, 1);
    }

    // And the comparison export, which declares its units from the same helper.
    const cmp = buildComparison([{ id: 'a', name: 'a.csv', formatLabel: 'Test', analysis: a }] satisfies CompareInput[]);
    const doc = JSON.parse(compareJson(cmp, { ...base, accel: 'ft/s²' }));
    expect(doc.units.acceleration).toBe('ft/s²');
    expect(Math.abs(doc.flights[0].metrics.maxAcceleration - si / 0.3048)).toBeLessThan(0.1);
  });

  it('carries an optional report label and notes into the text, Markdown and JSON exports', () => {
    const meta = { label: 'Nimbus IV · J450 · Flight 3', notes: 'Gusty; drogue at apogee.\nMain a touch low.' };
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, meta);
    expect(txt).toContain('Nimbus IV · J450 · Flight 3');
    expect(txt).toContain('Gusty; drogue at apogee.');

    const md = summaryMarkdown(flight, analysis, 'imperial', 1_700_000_000_000, meta);
    expect(md).toContain('## Nimbus IV · J450 · Flight 3');
    expect(md).toContain('> Gusty; drogue at apogee.'); // notes render as a blockquote
    expect(md).toContain('> Main a touch low.'); // a multi-line note stays one quote

    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000, meta));
    expect(doc.label).toBe('Nimbus IV · J450 · Flight 3');
    expect(doc.notes).toContain('Gusty');
  });

  it('adds nothing when the label and notes are blank or whitespace', () => {
    const blank = { label: '   ', notes: '' };
    expect(summaryText(flight, analysis, 'imperial', 1, blank)).toBe(summaryText(flight, analysis, 'imperial', 1));
    expect(summaryMarkdown(flight, analysis, 'imperial', 1, blank)).toBe(summaryMarkdown(flight, analysis, 'imperial', 1));
    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1, blank));
    expect(doc.label).toBeUndefined();
    expect(doc.notes).toBeUndefined();
  });
});

describe('comparison report', () => {
  // Two flights of the same rocket, real ascents with slightly different apogees —
  // the redundant-altimeter case the cross-check is written for.
  const input = (id: string, peak: number): CompareInput => {
    const f = tinyFlight();
    f.source = `${id}.csv`;
    // Scale the ramp to a distinct apogee so the two disagree a little.
    const alt = Float64Array.from(f.channels[0].values, (h) => (h * peak) / 300);
    return {
      id,
      name: `${id}.csv`,
      formatLabel: 'Test',
      analysis: analyzeFlight({ ...f, channels: [{ ...f.channels[0], values: alt }] }),
    };
  };
  const comparison = buildComparison([input('a', 300), input('b', 315)]);

  it('compareMetricRows crowns the single best finite value and gives a pairwise spread', () => {
    const rows = compareMetricRows(comparison.flights, 'metric');
    const apogee = rows.find((r) => r.label === 'Apogee')!;
    expect(apogee.cells).toHaveLength(2);
    expect(apogee.best).toBe(1); // flight 'b' peaks higher
    // Apogees ~300 vs ~315 → spread ≈ 15/307.5 ≈ 4.9%.
    expect(apogee.spreadPct).toBeGreaterThan(3);
    expect(apogee.spreadPct).toBeLessThan(7);
  });

  it('compares when the main fired, and only when some flight recorded it', () => {
    // The redundant-altimeter question the comparison could not answer: two bays agreeing
    // on apogee and still firing seconds apart. The deploy time existed on each flight's
    // own timeline, where lining two of them up meant doing the arithmetic by hand.
    const withMain = comparison.flights.map((f, i) => ({
      ...f,
      metrics: { ...f.metrics, mainDeployTime: 92.8 + i * 27.8 },
    }));
    const rows = compareMetricRows(withMain, 'metric');
    const labels = rows.map((r) => r.label);
    const main = rows.find((r) => r.label === 'Main deploy at')!;
    expect(main, 'the row exists when a flight recorded a main deploy').toBeTruthy();
    expect(main.values).toEqual([92.8, 120.6]);
    // Rows read roughly in flight order, so it sits with the main descent it precedes
    // rather than after the flight totals.
    expect(labels.indexOf('Main deploy at')).toBe(labels.indexOf('Main descent') - 1);

    // And it stays off the table entirely for a fleet of logs that never detected one,
    // rather than adding a column of dashes.
    const without = compareMetricRows(
      comparison.flights.map((f) => ({ ...f, metrics: { ...f.metrics, mainDeployTime: null } })),
      'metric',
    );
    expect(without.map((r) => r.label)).not.toContain('Main deploy at');
  });

  it('carries the raw figures beside the formatted cells, in flight order', () => {
    // What the table sorts its flight columns by — the same numbers the cells format,
    // so the on-screen order can't disagree with the values shown.
    const rows = compareMetricRows(comparison.flights, 'metric');
    const apogee = rows.find((r) => r.label === 'Apogee')!;
    expect(apogee.values).toHaveLength(2);
    expect(apogee.values[0]).toBeLessThan(apogee.values[1]); // 'a' ~300 m, 'b' ~315 m
    expect(apogee.values[0]).toBeGreaterThan(250);
    // A metric no flight recorded reads NaN rather than 0, so it sorts to the end
    // instead of pretending to be the lowest.
    const tilt = rows.find((r) => r.label === 'Tilt at burnout');
    expect(tilt).toBeUndefined();
    const drogue = rows.find((r) => r.label === 'Drogue descent')!;
    expect(drogue.values.every((v) => Number.isNaN(v) || Number.isFinite(v))).toBe(true);
  });

  it('reports the full range as the spread once there are three recordings', () => {
    // Two altimeters agreeing means nothing if the third is well out, so the spread is
    // (highest − lowest) over their mean, not a pairwise difference.
    const three = buildComparison([input('a', 300), input('b', 315), input('c', 330)]);
    const apogee = compareMetricRows(three.flights, 'metric').find((r) => r.label === 'Apogee')!;
    // Apogees ~300/315/330 → range 30 over a mean of ~315 ≈ 9.5%.
    expect(apogee.spreadPct).toBeGreaterThan(7);
    expect(apogee.spreadPct).toBeLessThan(12);
  });

  it('reports no spread when only one flight recorded the figure', () => {
    const one = buildComparison([input('a', 300)]);
    expect(compareMetricRows(one.flights, 'metric')[0].spreadPct).toBeNull();
  });

  it('tags a clipped max acceleration and withholds the highest-g crown', () => {
    const [a, b] = comparison.flights;
    const clip = (f: typeof a, maxA: number, clipped: boolean) =>
      ({ ...f, metrics: { ...f.metrics, maxAcceleration: maxA, accelerationSource: 'device' as const, accelClipped: clipped } }) as typeof a;
    const flights = [clip(a, 157, true), clip(b, 304, false)];
    expect(compareHasClippedAccel(flights)).toBe(true);
    const acc = compareMetricRows(flights, 'metric').find((r) => r.label === 'Max acceleration')!;
    // The saturated cell is tagged; the clean one isn't…
    expect(acc.cells[0]).toMatch(/\(clipped\)/);
    expect(acc.cells[1]).not.toMatch(/\(clipped\)/);
    // …and no flight is crowned "highest", because a floor can't settle which pulled most g.
    expect(acc.best).toBe(-1);

    // With neither clipped, the higher value is crowned as usual.
    const clean = [clip(a, 157, false), clip(b, 304, false)];
    expect(compareHasClippedAccel(clean)).toBe(false);
    expect(compareMetricRows(clean, 'metric').find((r) => r.label === 'Max acceleration')!.best).toBe(1);
  });

  it('compareMarkdown carries the cross-check and a metrics table with a spread column', () => {
    const md = compareMarkdown(comparison, 'imperial');
    expect(md).toContain('# Debrief — flight comparison');
    expect(md).toContain('## Cross-check');
    expect(md).toMatch(/agree to within [\d.]+% on apogee/);
    expect(md).toContain('## Metrics');
    expect(md).toContain('| Spread |');
    // Header + every body row share the same column count (2 flights + Spread → 5 pipes).
    const bars = (s: string) => (s.match(/\|/g) ?? []).length;
    const tableRows = md.split('\n').filter((l) => l.startsWith('| ') && !l.includes('---'));
    expect(tableRows.length).toBeGreaterThan(3);
    expect(tableRows.every((l) => bars(l) === 5)).toBe(true);
    // The apogee row's difference is a percentage.
    expect(md).toMatch(/\| Apogee \|[^\n]*\| \d+(\.\d)?% \|/);
    expect(md).toMatch(/Made with \[Debrief\]/);
  });

  it('emphasizes the best flight in the Markdown table', () => {
    const md = compareMarkdown(comparison, 'metric');
    // The higher apogee is bolded; the lower is not.
    expect(md).toMatch(/\| Apogee \|[^|]*\| \*\*[^*]+\*\* \|/);
  });

  it('compareHtml is a self-contained comparison report with the cross-check, metrics and inline charts', () => {
    const html = compareHtml(comparison, 'imperial', undefined, { label: 'Booster vs sustainer' }, [
      { title: 'Altitude', svg: '<svg data-fig="alt"></svg>' },
    ]);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Booster vs sustainer');
    expect(html).toContain('Cross-check');
    expect(html).toMatch(/agree to within [\d.]+% on apogee/);
    expect(html).toContain('<th>Spread</th>');
    expect(html).toContain('<svg data-fig="alt"></svg>'); // the overlay figure inline
    // Self-contained and privacy-safe.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/(src|href)="http(?!s:\/\/debrief\.fusionspace\.co)/i);
  });

  it('states in the JSON whether these could be recordings of one flight', () => {
    // `debrief.comparison/1` is a contract, and a consumer reading `crossCheck` as an
    // agreement between recordings of one flight would be wrong wherever the files date
    // them apart. The numbers alone cannot say so, and the disclaimer follows the verdict.
    const open = JSON.parse(compareJson(comparison, 'imperial'));
    expect(open.sameFlight).toEqual({ verdict: 'unknown' });
    expect(open.disclaimer).toContain('A cross-check of the recordings, never a verdict');

    const dated = buildComparison([
      { ...input('a', 300), flownAt: { stamp: '2021-10-30T20:07', zone: 'UTC' as const } },
      { ...input('b', 315), flownAt: { stamp: '2024-05-11T14:09', zone: 'logger' as const } },
    ]);
    const doc = JSON.parse(compareJson(dated, 'imperial'));
    expect(doc.sameFlight.verdict).toBe('different-flights');
    expect(doc.sameFlight.refutedBy).toBe('stated-dates');
    expect(doc.sameFlight.statedDays).toEqual(['2021-10-30', '2024-05-11']);
    // Which file states which day: the verdict rests on the dates alone, so a consumer
    // needs to be able to find the device carrying a wrong clock, not just be told one
    // might exist. The caveat rides along for the same reason.
    // The raw file names, matching `flights[].name`, so a consumer can join the two.
    expect(doc.sameFlight.statedBy).toEqual([
      { day: '2021-10-30', names: ['a.csv'] },
      { day: '2024-05-11', names: ['b.csv'] },
    ]);
    expect(doc.sameFlight.caveat).toContain('a device clock is wrong');
    expect(doc.disclaimer).toContain('date these on different days');
    // The spreads are still there — correctly introduced, not withheld.
    expect(doc.crossCheck.length).toBeGreaterThan(0);
  });

  it('carries an optional label and notes into the comparison Markdown and JSON', () => {
    const meta = { label: 'Nimbus IV — booster vs sustainer', notes: 'Two bays, one flight.' };
    const md = compareMarkdown(comparison, 'imperial', undefined, meta);
    expect(md).toContain('## Nimbus IV — booster vs sustainer');
    expect(md).toContain('> Two bays, one flight.');
    const doc = JSON.parse(compareJson(comparison, 'imperial', undefined, meta));
    expect(doc.label).toBe('Nimbus IV — booster vs sustainer');
    expect(doc.notes).toBe('Two bays, one flight.');
    // Blank meta leaves both exports byte-for-byte as they were.
    const blank = { label: ' ', notes: '' };
    expect(compareMarkdown(comparison, 'imperial', undefined, blank)).toBe(compareMarkdown(comparison, 'imperial'));
    expect(JSON.parse(compareJson(comparison, 'imperial', undefined, blank)).label).toBeUndefined();
  });

  it('compareJson carries each flight, the cross-check and the pairwise differences', () => {
    const doc = JSON.parse(compareJson(comparison, 'imperial'));
    expect(doc.schema).toBe('debrief.comparison/1');
    expect(doc.units.length).toBe('ft');
    expect(doc.flights).toHaveLength(2);
    expect(typeof doc.flights[0].metrics.apogee).toBe('number');
    expect(doc.crossCheck.some((c: { metric: string }) => c.metric === 'apogee')).toBe(true);
    // A two-flight comparison carries per-metric spreads.
    const apoDiff = doc.differences.find((d: { metric: string }) => d.metric === 'Apogee');
    expect(apoDiff.spreadPct).toBeGreaterThan(0);
  });

  it('compareJson omits pairwise differences for a non-pair comparison', () => {
    const three = buildComparison([input('a', 300), input('b', 315), input('c', 330)]);
    expect(JSON.parse(compareJson(three, 'metric')).differences).toBeUndefined();
  });
});
