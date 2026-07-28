import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// A deep, user-simulated audit of the compare feature: realistic multi-flight
// sessions exercising the table, the mixed-source (baro) marking, every overlay
// channel, the exports, the units toggle, the cap+note, and the recents path.

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);

test('a rocketeer compares two flights end to end', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  // Drop two real flights at once. aim-xtra has a BARO-derived velocity while
  // TeleMetrum logs it on the device — a genuine mixed-source comparison.
  await page.getByLabel('Choose a flight log file').setInputFiles([fx('aim-xtra.csv'), fx('altusmetrum-telemetrum.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  // The side-by-side table with both flights and the headline rows.
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Max velocity', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Max Q', exact: true })).toBeVisible();

  // Mixed velocity sources → the baro flight is marked, with an explaining note.
  await expect(page.getByText(/\(baro\)/).first()).toBeVisible();
  await expect(page.getByText(/differentiated out of the altitude rather than logged/)).toBeVisible();
  // …and the cross-check itself says which way a mixed measured/derived spread is wrong.
  // On every corpus pair that carries both, the derived peak reads HIGH, so the spread
  // overstates the disagreement — calling it "the looser bound" pointed the other way.
  await expect(page.getByText(/mix a value the device measured with one differentiated out of an/)).toBeVisible();
  await expect(page.getByText(/overstates the disagreement rather than bounding it/)).toBeVisible();

  // Every overlay channel renders and titles itself correctly.
  const channel = async (button: string, heading: RegExp | string) => {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  };
  await channel('Velocity', /Velocity \(ft\/s\)/);
  await channel('Acceleration', /Acceleration \(g\)/);
  await channel('Mach', 'Mach');
  await channel('Dynamic pressure', /Dynamic pressure \((psi|kPa)\)/);
  await channel('Altitude', /Altitude \(ft\)/);

  // Units toggle relabels the comparison.
  const units = page.getByRole('button', { name: /Units:/ });
  await expect(units).toContainText('feet');
  await units.click();
  await expect(units).toContainText('meters');
  await expect(page.getByRole('heading', { name: /Altitude \(m\)/ })).toBeVisible();

  // All three exports fire a download.
  for (const [name, re] of [
    ['Save .png', /^compare-.*\.png$/],
    ['Save chart data', /^compare-.*\.csv$/],
    ['Save metrics', /^compare-metrics\.csv$/],
  ] as const) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
    expect(dl.suggestedFilename()).toMatch(re);
  }

  // The chart-data CSV is complete — every overlaid channel for every flight, not just
  // the one on screen — so its header carries Altitude AND Velocity AND Mach columns.
  const [dataDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save chart data', exact: true }).click(),
  ]);
  const stream = await dataDl.createReadStream();
  const header = (await new Promise<string>((resolve) => {
    let buf = '';
    stream!.on('data', (c) => (buf += c));
    stream!.on('end', () => resolve(buf.split('\n')[0]));
  }));
  expect(header).toMatch(/Altitude/);
  expect(header).toMatch(/Velocity/);
  expect(header).toMatch(/Mach/);

  // Back returns to the start.
  await page.getByRole('button', { name: /Back to a single flight/ }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
});

test('an optional comparison label reflects on-screen and rides into the bundle', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  await page.getByText('Label this comparison (optional)').click();
  await page.getByLabel('Label', { exact: true }).fill('Nimbus IV — booster vs sustainer');
  await page.getByLabel('Notes', { exact: true }).fill('Two bays, one flight.');
  // It reflects at the top of the comparison.
  await expect(page.getByRole('heading', { name: 'Nimbus IV — booster vs sustainer' })).toBeVisible();

  // …and the bundle (which carries it in the Markdown/JSON) still builds.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save bundle' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/compare-debrief\.zip$/);
});

test('two device-velocity flights show no baro marking', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  // Both log velocity on-device → no "(baro)" tag, no explaining note, and no
  // mixed-source caveat on the cross-check.
  await expect(page.getByText(/derived from altitude rather than logged/)).toHaveCount(0);
  await expect(page.getByText(/mix a measured value with one derived from altitude/)).toHaveCount(0);
});

test('dropping more than six flights caps at six with a note', async ({ page }) => {
  await page.goto('/');
  // Seven auto-detecting files (repeats are fine — distinct compare entries).
  await page.getByLabel('Choose a flight log file').setInputFiles([
    fx('aim-xtra.csv'),
    fx('altusmetrum-telemetrum.csv'),
    fx('featherweight-raven-fip.csv'),
    fx('perfectflite-pnut.pf2'),
    fx('blueraven-app-lr.csv'),
    fx('aim-xtra.csv'),
    fx('altusmetrum-telemetrum.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 6 flights' })).toBeVisible();
  await expect(page.getByText(/Showing 6 of 7 files/)).toBeVisible();
});

test('comparing three flights from the recents list', async ({ page }) => {
  await page.goto('/');
  const load = async (file: string) => {
    await page.getByLabel('Choose a flight log file').setInputFiles(fx(file));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };
  await load('altusmetrum-telemetrum.csv');
  await load('featherweight-raven-fip.csv');
  await load('aim-xtra.csv');

  await page.getByRole('checkbox', { name: 'Select altusmetrum-telemetrum.csv to compare' }).check();
  await page.getByRole('checkbox', { name: 'Select featherweight-raven-fip.csv to compare' }).check();
  await page.getByRole('checkbox', { name: 'Select aim-xtra.csv to compare' }).check();
  await page.getByRole('button', { name: /Compare 3 flights/ }).click();

  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
  // Three flight columns + the metric label column + the spread = 5 column headers.
  await expect(page.locator('thead th')).toHaveCount(5);
  // The spread is the full range across all three, not a pairwise difference — the
  // number that matters when a flyer flies triple redundancy.
  await expect(page.getByRole('columnheader', { name: 'Spread' })).toBeVisible();
  const apogeeRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Apogee', exact: true }) });
  await expect(apogeeRow.getByText(/^\d+(\.\d)?%$/)).toBeVisible();
});

// A launch day's folder mixes loggers Debrief auto-detects with files it can't batch-read:
// one that needs the column mapper, a Blue Raven's high-rate half, a device summary. Those
// used to be dropped on the floor without a word, leaving the flyer to count flights to
// notice one was missing.
test('a batch drop says which files it left out, and why', async ({ page }) => {
  await page.goto('/');
  const asBuffer = (f: string) => ({ name: f, mimeType: 'text/csv', buffer: readFileSync(fx(f)) });
  await page.getByLabel('Choose a flight log file').setInputFiles([
    asBuffer('altusmetrum-telemetrum.csv'),
    asBuffer('featherweight-raven-fip.csv'),
    // Needs the column mapper — a plain time/height CSV with no logger signature.
    { name: 'mystery.csv', mimeType: 'text/csv', buffer: Buffer.from('t,h,spd\n0,0,0\n0.1,5,50\n0.2,12,80\n0.3,6,-10') },
  ]);

  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  // Named, and offered: a file that only needs its columns mapped is not a failure, and
  // used to be reported as one — the flyer was told to go and open it on its own, losing
  // the comparison they had. It is a button now, and mapping it brings the file back here.
  await expect(page.getByText(/isn’t a format Debrief recognizes/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Map mystery/ })).toBeVisible();
});

test('a batch drop still says which files it cannot use at all, and why', async ({ page }) => {
  await page.goto('/');
  const asBuffer = (f: string) => ({ name: f, mimeType: 'text/csv', buffer: readFileSync(fx(f)) });
  await page.getByLabel('Choose a flight log file').setInputFiles([
    asBuffer('altusmetrum-telemetrum.csv'),
    asBuffer('featherweight-raven-fip.csv'),
    // Not a flight log at all — no mapping can rescue this one, so it is reported.
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('remember to buy more shear pins\n') },
  ]);

  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  const note = page.getByText(/left out of this comparison/);
  await expect(note).toBeVisible();
  await expect(note).toContainText('notes.txt');
});

// The same drop, but only ONE file turns out to be readable: there is no comparison to
// carry the note, so the single report has to carry it instead. Before, the flyer got a
// report for one file and silence about the other two.
test('a batch that yields one flight still says what it left out', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    { name: 'altusmetrum-telemetrum.csv', mimeType: 'text/csv', buffer: readFileSync(fx('altusmetrum-telemetrum.csv')) },
    { name: 'mystery.csv', mimeType: 'text/csv', buffer: Buffer.from('t,h,spd\n0,0,0\n0.1,5,50\n0.2,12,80\n0.3,6,-10') },
    { name: 'notes.csv', mimeType: 'text/csv', buffer: Buffer.from('this file is not a flight log at all\n') },
  ]);

  // One readable flight → the report, not the comparison.
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  const note = page.getByText(/single report rather than a comparison/);
  await expect(note).toBeVisible();
  await expect(note).toContainText('Only one of those 3 files');
  await expect(note).toContainText('mystery.csv');
  await expect(note).toContainText('notes.csv');
});

// A Featherweight app writes a log and a summary side by side, and a flyer drops both. The
// summary isn't a flight, but it holds the device's OWN figures for the flight in the log —
// so the pair should read as one flight with a cross-check, not one flight and one rejected
// file. (Before, the summary was skipped with its figures buried in a note.)
test('a log dropped with its device summary reads as one flight plus a cross-check', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    { name: 'BlRv_SN0829_LR_05-11-2024.csv', mimeType: 'text/csv', buffer: readFileSync(fx('blueraven-app-lr.csv')) },
    { name: 'BlRv_SN0829_summary_05-11-2024_.csv', mimeType: 'text/csv', buffer: readFileSync(fx('blueraven-app.summary.csv')) },
  ]);

  // One flight, and the note says what the second file contributed.
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText(/Read the device's own summary alongside the flight/)).toBeVisible();

  // The device's figures sit beside Debrief's own read, with the agreement stated.
  const table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Logger' }) });
  await expect(table).toBeVisible();
  const apogee = table.getByRole('row').filter({ hasText: 'Apogee' });
  await expect(apogee).toContainText('4,035 ft'); // what the device wrote
  await expect(apogee).toContainText('4,036 ft'); // what Debrief read
  await expect(apogee).toContainText(/agree/);
  await expect(table.getByRole('row').filter({ hasText: 'Max velocity' })).toContainText('700 ft/s');
});

// The ordinary Blue Raven drop. Featherweight's own software writes the summary, the low-rate
// log and the high-rate log out side by side, so a flyer who selects the folder drops all
// three at once — and the high-rate half is refused by design. Two things are then true: one
// file was left out, and one file WAS read and put four figures in the report. The note used
// to pick whichever branch fired first and discard the other, so this drop said the high-rate
// file was left out and never mentioned the summary, while the summary's figures sat in the
// cross-check panel further down the same page.
test('a drop of all three Blue Raven files says what was left out AND what was read', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    { name: 'BlRv_SN0829_LR_05-11-2024.csv', mimeType: 'text/csv', buffer: readFileSync(fx('blueraven-app-lr.csv')) },
    { name: 'BlRv_SN0829_HR_05-11-2024.csv', mimeType: 'text/csv', buffer: readFileSync(fx('blueraven-app-hr.csv')) },
    { name: 'BlRv_SN0829_summary_05-11-2024_.csv', mimeType: 'text/csv', buffer: readFileSync(fx('blueraven-app.summary.csv')) },
  ]);

  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  // Filtered on wording BOTH the old and new notes share, so a failure names the missing
  // content rather than a missing element.
  const note = page.getByRole('status').filter({ hasText: /single report rather than a comparison/ });

  // What was left out, and the logger's own guidance for why — kept, not flattened.
  await expect(note).toContainText('BlRv_SN0829_HR_05-11-2024.csv');
  await expect(note).toContainText('high-rate file');
  // …and what was read. This is the half that was being discarded.
  await expect(note).toContainText(/Read the device's own summary alongside the flight/);

  // "Could be read as a flight" is the wrong verb once a non-flight file has contributed:
  // the summary WAS read. It is a flight RECORD that the other files are not.
  await expect(note).toContainText('Only one of those 3 files is a flight record');

  // And the figures it contributed are really there.
  const table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Logger' }) });
  await expect(table.getByRole('row').filter({ hasText: 'Apogee' })).toContainText('4,035 ft');
});

// Ranking by a metric answers "which went highest". A launch day also has orders no metric
// produces — booster then sustainer, flight 1 to 6 — so a column can be moved by hand, and
// the order carries into the chart legend and every export because they read one array.
test('a comparison column can be moved into a deliberate order', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    fx('aim-xtra.csv'),
    fx('altusmetrum-telemetrum.csv'),
    fx('featherweight-raven-fip.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();

  const names = () => page.locator('thead th').filter({ has: page.locator('span.font-mono') }).allInnerTexts();
  const before = await names();
  expect(before[0]).toContain('aim-xtra');

  // Move the first flight one place right; the first two swap.
  await page.getByRole('button', { name: 'Move aim-xtra left' }).isDisabled();
  await page.getByRole('button', { name: 'Move aim-xtra right' }).click();
  const after = await names();
  expect(after[0]).toContain('altusmetrum-telemetrum');
  expect(after[1]).toContain('aim-xtra');

  // The chart legend follows the same order, since both read one array.
  const legend = await page.locator('.u-legend').first().innerText();
  expect(legend.indexOf('altusmetrum')).toBeLessThan(legend.indexOf('aim-xtra'));

  // Ordering by a metric takes over, and the way back is offered.
  await page.getByRole('button', { name: /^Apogee/ }).first().click();
  await expect(page.getByRole('button', { name: 'clear sort' })).toBeVisible();
  await page.getByRole('button', { name: 'clear sort' }).click();
  expect((await names())[0]).toContain('aim-xtra');
});

// The launch day belongs on a launch day's comparison: increment by increment the date the
// file states reached the report, the exports and the logbook, and the comparison was the one
// surface left showing only file names.
test('a comparison labels each column with the launch day the file states', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    { name: 'blueraven-may.csv', mimeType: 'text/csv', buffer: readFileSync(fx('blueraven-app-lr.csv')) },
    { name: 'telemetrum-oct.csv', mimeType: 'text/csv', buffer: readFileSync(fx('altusmetrum-telemetrum.csv')) },
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  // A Blue Raven states its own clock; an AltOS log states a GPS's UTC. Both, labelled.
  const header = page.locator('thead');
  await expect(header).toContainText('11 May 2024, 14:09 (logger clock)');
  await expect(header).toContainText('30 Oct 2021, 20:07 UTC');

  // And it rides into the comparison's Markdown.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save metrics', exact: true }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/compare-metrics\.csv$/);
});
