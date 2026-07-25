import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const fixture = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The filenames listed in a ZIP's central directory — enough to prove a bundle
// packs what it should, without a ZIP library.
function zipEntryNames(buf: Buffer): string[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP archive');
  const count = buf.readUInt16LE(eocd + 8);
  let p = buf.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

// Load two different real flights, then compare them from the recents list. This
// exercises the full multi-flight path: re-parse + re-analyze each saved file,
// align at liftoff, and render the side-by-side table and overlaid charts.
test('compare two flights from the recents list', async ({ page }) => {
  await page.goto('/');

  const load = async (file: string) => {
    await page.getByLabel('Choose a flight log file').setInputFiles(fixture(file));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };

  await load('altusmetrum-telemetrum.csv');
  await load('featherweight-raven-fip.csv');

  // With two flights remembered, the logbook offers sorting and crowns a best.
  await expect(page.getByRole('button', { name: 'Apogee' })).toBeVisible();
  await page.getByRole('button', { name: 'Apogee' }).click();
  await expect(page.getByText(/marks your best/)).toBeVisible();

  await page.getByLabel('Select altusmetrum-telemetrum.csv to compare').check();
  await page.getByLabel('Select featherweight-raven-fip.csv to compare').check();
  await page.getByRole('button', { name: /Compare 2 flights/ }).click();

  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();

  // The engineering metrics are in the table too.
  await expect(page.getByRole('rowheader', { name: 'Max Mach', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Max Q', exact: true })).toBeVisible();

  // The comparison gets a Spread column — how far apart the readings are on each metric
  // (redundant-altimeter agreement, or flight-to-flight change).
  await expect(page.getByRole('columnheader', { name: 'Spread' })).toBeVisible();
  // The apogee row shows a percentage difference between the two flights.
  const apogeeRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Apogee', exact: true }) });
  await expect(apogeeRow.getByText(/^\d+(\.\d)?%$/)).toBeVisible();

  // Switch which quantity is overlaid across the flights, including the derived
  // engineering channels (Mach, dynamic pressure).
  await expect(page.getByRole('heading', { name: /Altitude/ })).toBeVisible();
  await page.getByRole('button', { name: 'Acceleration', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Acceleration \(g\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mach', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mach', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dynamic pressure', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Dynamic pressure \((kPa|psi)\)/ })).toBeVisible();

  // Any metric row orders the flight columns — a launch day is several files at once,
  // and "which went highest" shouldn't mean reading across the table by eye. The order
  // carries into the exports below, which read the same array.
  const metricsTable = page
    .locator('table')
    .filter({ has: page.getByRole('rowheader', { name: 'Apogee', exact: true }) });
  const flightColumns = async () =>
    (await metricsTable.getByRole('columnheader').allInnerTexts())
      .map((t) => t.split('\n')[0].trim())
      .filter((t) => t && !/^metric/i.test(t) && !/^spread$/i.test(t));
  const loadedOrder = await flightColumns();
  expect(loadedOrder).toHaveLength(2);
  const apogeeHeader = apogeeRow.getByRole('rowheader', { name: 'Apogee', exact: true });
  const apogeeSort = apogeeHeader.getByRole('button', { name: 'Apogee', exact: true });

  await apogeeSort.click(); // highest first
  await expect(apogeeHeader).toHaveAttribute('aria-sort', 'descending');
  const desc = await flightColumns();
  await apogeeSort.click(); // lowest first
  await expect(apogeeHeader).toHaveAttribute('aria-sort', 'ascending');
  expect(await flightColumns()).toEqual([...desc].reverse());

  // A third click (or the explicit escape) puts them back the way they loaded.
  await page.getByRole('button', { name: 'clear sort' }).click();
  expect(await flightColumns()).toEqual(loadedOrder);

  // Export the comparison — the chart data, the metrics table, and a PNG.
  const [dataCsv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save chart data' }).click(),
  ]);
  expect(dataCsv.suggestedFilename()).toMatch(/^compare-.*\.csv$/);
  const [metricsCsv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save metrics' }).click(),
  ]);
  expect(metricsCsv.suggestedFilename()).toBe('compare-metrics.csv');

  // …and as a single self-contained HTML comparison report: the cross-check, the metrics
  // matrix and the overlay charts inline, in one portable file.
  const [htmlDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .html' }).click(),
  ]);
  expect(htmlDl.suggestedFilename()).toBe('compare-debrief.html');
  const htmlStream = await htmlDl.createReadStream();
  const cmpHtml = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    htmlStream!.on('data', (c) => chunks.push(Buffer.from(c)));
    htmlStream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    htmlStream!.on('error', reject);
  });
  expect(cmpHtml.startsWith('<!doctype html>')).toBe(true);
  expect(cmpHtml).toMatch(/agree to within/); // the cross-check narrative
  expect(cmpHtml).toContain('<svg'); // overlay chart embedded inline
  expect(cmpHtml).not.toMatch(/<script/i); // self-contained, no script or external asset

  // A vector (SVG) export of the overlay, for reports — one path per compared flight.
  // Overlay altitude first: both flights have a finite altitude curve, so the path
  // count is deterministic.
  await page.getByRole('button', { name: 'Altitude', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Altitude/ })).toBeVisible();
  const exportSvg = async () => {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save .svg' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^compare-.*\.svg$/);
    const stream = await dl.createReadStream();
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream!.on('data', (c) => chunks.push(Buffer.from(c)));
      stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream!.on('error', reject);
    });
  };
  const body = await exportSvg();
  expect(body).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect((body.match(/<path /g) ?? []).length).toBe(2); // one curve per flight
  // A report figure defaults to a light background whatever the app theme is.
  expect(body).toContain('fill="#ffffff"');
  expect(body).not.toContain('fill="#09090b"');
  // …and the flyer can flip it to dark for a slide deck.
  await page.getByRole('button', { name: /Exported figure background/ }).click();
  const darkBody = await exportSvg();
  expect(darkBody).toContain('fill="#09090b"');

  // The whole comparison as one ZIP: the cross-check write-up, the metrics table,
  // and the overlay figures — a single download instead of a handful of clicks.
  const [bundle] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save bundle' }).click(),
  ]);
  expect(bundle.suggestedFilename()).toBe('compare-debrief.zip');
  const names = zipEntryNames(await readFile(await bundle.path()));
  expect(names).toContain('compare-summary.md');
  expect(names).toContain('compare-metrics.csv');
  expect(names).toContain('compare.json');
  expect(names).toContain('compare-altitude.svg');
  expect(names).toContain('compare-velocity.svg');
  expect(names).toContain('compare-acceleration.svg');
  await expect(page.getByText(/Bundle saved/)).toBeVisible();

  // The compare view should be accessible too.
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  // Leaving a comparison built from the logbook returns to the picker on this surface,
  // with the logbook still there to build the next one from.
  await page.getByRole('button', { name: /Compare other flights/ }).click();
  await expect(page.getByRole('heading', { name: 'Compare flights' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
});

// The overlay chart must actually draw its curves. A shorter flight is NaN-padded
// out to the shared time base, which once left uPlot unable to range the y-axis —
// so the canvas came up blank while the metrics table still looked fine. Guard it
// by checking the chart canvas has real coloured (curve) pixels, not just axes.
test('the overlay chart draws the flight curves', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: /Altitude/ })).toBeVisible();
  const coloured = await page.evaluate(() => {
    const c = document.querySelector('.uplot canvas') as HTMLCanvasElement | null;
    if (!c) return 0;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 40) n++; // a saturated (curve) pixel
    }
    return n;
  });
  expect(coloured).toBeGreaterThan(500);
});

// Comparing a GPS-only flight (whose acceleration is entirely absent) against a
// barometric one, on the Acceleration channel: one series is all-NaN. The axis
// must still range off the other flight and draw its curve, not come up blank.
test('the overlay survives an all-NaN series (mixed GPS + baro)', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('featherweight-gps.csv'), fixture('altusmetrum-telemetrum.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await page.getByRole('button', { name: 'Acceleration', exact: true }).click();
  const coloured = await page.evaluate(() => {
    const c = document.querySelector('.uplot canvas') as HTMLCanvasElement | null;
    if (!c) return 0;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 40) n++;
    }
    return n;
  });
  expect(coloured).toBeGreaterThan(500);
});

// Dropping (choosing) several files at once should import each and jump straight
// into the comparison, no recents round-trip needed.
test('choosing several files at once jumps straight to a comparison', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);

  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();
});

// The cross-check rests on a hypothesis — that these are recordings of one flight — and
// the files can refute it. Where they date the flights a season apart, calling a 139%
// apogee gap an "agreement to within 139%" would dress a comparison of different flights
// as a failed reconciliation.
test('a comparison the files date apart is framed as flight-to-flight, not agreement', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    fixture('altusmetrum-telemetrum.csv'), // GPS UTC, 30 Oct 2021
    fixture('blueraven-app-lr.csv'), // logger clock, 11 May 2024
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  await expect(page.getByText('Flight to flight')).toBeVisible();
  await expect(page.getByText(/These are different flights/)).toBeVisible();
  // Named in the app's own date voice, not as raw stamps.
  await expect(page.getByText(/30 Oct 2021/).first()).toBeVisible();
  await expect(page.getByText(/11 May 2024/).first()).toBeVisible();
  await expect(page.getByText(/If these are recordings of the same flight/)).toHaveCount(0);

  // …and the saved write-up says the same thing, not the opposite.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .html' }).click(),
  ]);
  const stream = await dl.createReadStream();
  const html = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream!.on('data', (c) => chunks.push(Buffer.from(c)));
    stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream!.on('error', reject);
  });
  expect(html).toContain('Flight to flight');
  expect(html).toContain('These are different flights');
  expect(html).not.toContain('If these are recordings of the same flight');
});

// …and where the files don't refute it, the reconciliation framing stays: two recordings
// with no stated date could be one flight, and Debrief doesn't decide that for the flyer.
test('with no stated dates the cross-check keeps its conditional framing', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('aim-xtra.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByText(/If these are recordings of the same flight/)).toBeVisible();
  await expect(page.getByText('Flight to flight')).toHaveCount(0);
});

// One decision about which readings matter, not one per surface: the choice made on a
// flight report is already made for the comparison, and the other way round.
test('the reading chooser is one choice shared by both surfaces', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('aim-xtra.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Burn time', exact: true })).toBeVisible();

  const toggle = page.locator('summary', { hasText: "Choose what's in this report" });
  await toggle.click();
  await page.getByRole('checkbox', { name: 'Burn time' }).uncheck();
  await expect(page.getByRole('rowheader', { name: 'Burn time', exact: true })).toHaveCount(0);
  await toggle.click();

  // …and the same reading is gone from a single flight's report, without being turned off
  // a second time there.
  await page.getByRole('button', { name: /Back to a single flight/ }).click();
  await page.getByLabel('Choose a flight log file').setInputFiles(fixture('altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await expect(page.getByText('Burn time', { exact: true })).toHaveCount(0);
  await expect(page.getByText('1 off')).toBeVisible();

  // The Markdown of the comparison follows it too.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('aim-xtra.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save bundle' }).click(),
  ]);
  const names = zipEntryNames(await readFile(await dl.path()));
  expect(names).toContain('compare-summary.md');
});

// Which readings come first is the other half of "this table is mine" — a certification
// package leads with what the certification asks for, not with what Debrief thinks matters.
// The comparison is where that has an exact meaning: one builder feeds the screen, the
// clipboard and every export, so "third from the top" is third from the top everywhere.
test('the comparison’s readings can be reordered, and the order follows into the exports', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('aim-xtra.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  const rowLabels = () => page.getByRole('rowheader').allInnerTexts();
  const before = await rowLabels();
  expect(before[0]).toContain('Apogee');

  await page.locator('summary', { hasText: "Choose what's in this report" }).click();
  await page.getByRole('button', { name: 'Move Max Q earlier' }).click();
  await page.getByRole('button', { name: 'Move Max Q earlier' }).click();

  const after = await rowLabels();
  expect(after.findIndex((l) => l.includes('Max Q'))).toBeLessThan(
    before.findIndex((l) => l.includes('Max Q')),
  );

  // …and the saved table is in the same order as the screen.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save metrics' }).click(),
  ]);
  const stream = await dl.createReadStream();
  const csv = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream!.on('data', (c) => chunks.push(Buffer.from(c)));
    stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream!.on('error', reject);
  });
  const csvLabels = csv
    .split('\n')
    .slice(1)
    .map((l) => l.split(',')[0].replace(/"/g, ''))
    .filter(Boolean);
  // The row headers include the flights' own names; compare the readings the two share.
  const onScreen = after.map((l) => l.split('\n')[0].trim()).filter((l) => csvLabels.includes(l));
  expect(onScreen.length).toBeGreaterThan(4);
  expect(csvLabels.filter((l) => onScreen.includes(l))).toEqual(onScreen);
});

// A control that forgets is a control that asks the same question every time. The explorer
// already remembers how a flyer set it up; the comparison's channel didn't, so someone
// comparing a season's boosts clicked past altitude on every single one.
test('the comparison remembers which channel you were looking at', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('aim-xtra.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  // Altitude by default, as before.
  await expect(page.getByRole('heading', { name: /^Altitude/ })).toBeVisible();
  await page.getByRole('button', { name: 'Velocity', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Velocity/ })).toBeVisible();

  // The next comparison opens on velocity, without being asked again.
  await page.getByRole('button', { name: /Back to a single flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Velocity/ })).toBeVisible();
});
