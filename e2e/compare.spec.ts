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

  // A two-flight comparison gets a Difference column — how far apart the pair is on
  // each metric (redundant-altimeter agreement, or flight-to-flight change).
  await expect(page.getByRole('columnheader', { name: 'Diff' })).toBeVisible();
  // The apogee row shows a percentage difference between the two flights.
  const apogeeRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Apogee', exact: true }) });
  await expect(apogeeRow.getByText(/^\d+(\.\d)?%$/)).toBeVisible();

  // Switch which quantity is overlaid across the flights, including the derived
  // engineering channels (Mach, dynamic pressure).
  await expect(page.getByRole('heading', { name: /Altitude/ })).toBeVisible();
  await page.getByRole('button', { name: 'Acceleration' }).click();
  await expect(page.getByRole('heading', { name: /Acceleration \(g\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mach', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mach', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dynamic pressure', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Dynamic pressure \((kPa|psi)\)/ })).toBeVisible();

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

  // A vector (SVG) export of the overlay, for reports — one path per compared flight.
  // Overlay altitude first: both flights have a finite altitude curve, so the path
  // count is deterministic.
  await page.getByRole('button', { name: 'Altitude' }).click();
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

  await page.getByRole('button', { name: /Back to a single flight/ }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
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
