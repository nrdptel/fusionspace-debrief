import { test, expect } from '@playwright/test';
import path from 'node:path';

// A broad audit of the features that the focused specs (analyze/compare) don't
// already cover: the column-mapper path, theme + units controls, the share
// round-trip, the report's export buttons, error handling, and the static pages.

const sample = path.join(__dirname, '../public/samples/sample-altusmetrum.csv');

// A plain CSV no named parser recognises, so it lands in the column mapper. A
// short pad, a climb to ~100 m, then a descent — enough for a real analysis.
function genericCsv(): string {
  const lines = ['time,altitude'];
  let t = 0;
  const push = (alt: number) => {
    lines.push(`${t.toFixed(2)},${alt.toFixed(2)}`);
    t += 0.1;
  };
  for (let i = 0; i < 20; i++) push(0); // 2 s on the pad
  for (let i = 0; i < 40; i++) push((i / 40) ** 0.5 * 100); // climb to 100 m
  for (let i = 0; i < 80; i++) push(Math.max(0, 100 - i * 1.25)); // descend
  return lines.join('\n');
}

// A tiny Eggtimer-Classic CSV: auto-detects (so a share link decodes straight to
// a report) and is small enough to fit in a share URL.
function eggtimerCsv(): string {
  const lines = ['T,Alt,VRaw,VFilt'];
  let tms = 0;
  const push = (alt: number, v: number) => {
    lines.push(`${tms},${alt.toFixed(0)},${v.toFixed(1)},${v.toFixed(1)}`);
    tms += 100;
  };
  for (let i = 0; i < 20; i++) push(0, 0); // 2 s on the pad
  for (let i = 0; i < 30; i++) push((i / 30) ** 0.5 * 300, 200 * (1 - i / 30)); // climb to ~300 ft
  for (let i = 0; i < 80; i++) push(Math.max(0, 300 - i * 4), -20); // descend
  return lines.join('\n');
}

test('header, drop zone and privacy promise render', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Debrief', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Color theme/ })).toBeVisible();
});

test('theme toggle cycles System → Light → Dark on <html>', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByRole('button', { name: /Color theme/ });
  const cls = () => page.evaluate(() => document.documentElement.className);
  await btn.click(); // → Light
  expect(await cls()).toContain('light');
  await btn.click(); // → Dark
  expect(await cls()).toContain('dark');
  await btn.click(); // → System (neither class)
  const c = await cls();
  expect(c.includes('light') || c.includes('dark')).toBe(false);
});

test('units toggle flips the report and rides in the URL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  const units = page.getByRole('button', { name: /Units:/ });
  const before = await units.textContent();
  await units.click();
  await expect(units).not.toHaveText(before ?? '');
  await expect(page).toHaveURL(/[?&]u=(m|ft)/);
});

test('a generic CSV goes through the column mapper to a report', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'mystery-logger.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(genericCsv()),
  });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  const analyze = page.getByRole('button', { name: 'Analyze flight' });
  await expect(analyze).toBeEnabled(); // time + altitude were guessed
  await analyze.click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test('the column mapper can be cancelled back to the drop zone', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'mystery2.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(genericCsv()),
  });
  await page.getByRole('button', { name: 'Choose a different file' }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
});

test('an empty file reports a friendly error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'empty.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('   \n  \n'),
  });
  await expect(page.getByText(/empty/i)).toBeVisible();
});

test('the report export buttons work (txt, csv, png) and copy confirms', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(sample);
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // Scope by title — the report toolbar and the explorer both have "Save .csv"/
  // "Save .png" buttons; the titles are unique to the report's.
  for (const [title, ext] of [
    ['Download the summary as a text file', /\.txt$/],
    ['Download the analyzed series (time, altitude, velocity, acceleration) as CSV', /-debrief\.csv$/],
    ['Save the altitude chart as a PNG', /-altitude\.png$/],
  ] as const) {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle(title, { exact: true }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(ext);
  }

  await page.getByRole('button', { name: 'Copy summary' }).click();
  await expect(page.getByRole('button', { name: 'Copied ✓' })).toBeVisible();
});

test('a flight too large to share says so instead of failing', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  // The bundled sample is ~850 KB — far past what fits in a URL fragment.
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.getByText(/too large to share/i)).toBeVisible();
});

test('share link round-trips a small flight through the URL fragment', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'tiny-eggtimer.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(eggtimerCsv()),
  });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.getByText(/Link copied/)).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/#/);

  // Open the link fresh — it must decode in-browser back into a report.
  await page.goto(url);
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test('zoom presets reframe the charts without error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Zoom to')).toBeVisible();
  for (const name of ['Boost', 'Ascent', 'Descent', 'Full']) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.count()) await b.first().click();
  }
  expect(errors).toEqual([]);
});

test('privacy page loads and the footer has no Motor Finder link', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(page.getByText(/never uploaded/i).first()).toBeVisible();

  // Footer family links present; the cross-tool Motor Finder link is gone.
  await expect(page.getByRole('link', { name: /Source on GitHub/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Motor Finder' })).toHaveCount(0);
  await page.getByRole('link', { name: '← Back to Debrief' }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
});
