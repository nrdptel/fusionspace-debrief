import { test, expect } from '@playwright/test';
import path from 'node:path';

// The whole pipeline in a real browser: load a flight, parse + analyze it
// client-side, and render the report with headline numbers.

test('the sample flight analyzes into a report', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  // The report replaces the drop zone; the back-link confirms we're in it.
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  // Headline metric rendered.
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  // The max-Q tile (derived from the atmosphere model) shows up too.
  await expect(page.getByText('Max Q', { exact: true })).toBeVisible();

  // The "Log details" panel expands to the factual read of the file.
  await page.getByText('Log details', { exact: true }).click();
  await expect(page.getByText('Sample rate', { exact: true })).toBeVisible();
  await expect(page.getByText('Channels recorded', { exact: true })).toBeVisible();

  // Entering a liftoff mass yields a motor estimate and a link to the Motor Finder.
  await expect(page.getByRole('heading', { name: 'Motor estimate' })).toBeVisible();
  await page.getByLabel('Liftoff mass').fill('500');
  await expect(page.getByText('Total impulse', { exact: true })).toBeVisible();
  await expect(page.getByText('Motor class', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /motor on the Motor Finder/ })).toBeVisible();
});

test('uploading a file through the input analyzes it', async ({ page }) => {
  await page.goto('/');
  const sample = path.join(__dirname, '../public/samples/sample-altusmetrum.csv');
  await page.getByLabel('Choose a flight log file').setInputFiles(sample);

  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // Back to the drop zone resets cleanly.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
});

test('the channel explorer overlays channels and plots any axis', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // The raw (pre-filter) altitude is offered alongside the cleaned one.
  await expect(page.getByLabel('X axis channel').locator('option', { hasText: 'Altitude (raw)' })).toHaveCount(1);

  // The derived engineering channels (Mach, dynamic pressure) are offered too.
  await expect(page.getByLabel('X axis channel').locator('option', { hasText: 'Mach' })).toHaveCount(1);
  await expect(page.getByLabel('X axis channel').locator('option', { hasText: 'Dynamic pressure' })).toHaveCount(1);

  // The live stats panel populates for the full flight before any zoom.
  await expect(page.getByText('Across the whole flight')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'mean' })).toBeVisible();

  // Drag across the explorer chart (the last uPlot on the page) to zoom — the
  // zoom must HOLD and the stats must switch to the selected window. (Regression
  // guard: a chart that re-inits on the view update would snap straight back.)
  const chart = page.locator('.uplot').last();
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.locator('canvas').first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 12 });
    await page.mouse.up();
  }
  await expect(page.getByText('In the selected window')).toBeVisible();

  // Overlay a second channel — velocity's unit differs from altitude's, so it
  // lands on a second (right) axis. This exercises the dual-axis uPlot path.
  await page.getByLabel('Add a channel to the plot').selectOption({ label: 'Velocity' });
  await expect(page.getByText(/Right axis:/)).toBeVisible();
  await expect(page.locator('.uplot canvas').first()).toBeVisible();

  // Put a channel on the X axis (not time) — the path note appears and the Δ/rate
  // columns (meaningless off a time axis) are hidden.
  await page.getByLabel('X axis channel').selectOption({ label: 'Altitude (AGL)' });
  await expect(page.getByText(/Plotting against another channel/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'rate' })).toHaveCount(0);

  // Export what's plotted — the explorer's own CSV (distinct from the report's).
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle(/Save the plotted data/).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/-explore\.csv$/);

  expect(errors).toEqual([]);
});

test('the printed flight card keeps the numbers and drops the interactive chrome', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // There's a way to print it.
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();

  await page.emulateMedia({ media: 'print' });

  // The headline numbers and events survive onto the card.
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
  await expect(page.getByText('Debrief · Flight Report')).toBeVisible();
  await expect(page.getByText(/debrief\.fusionspace\.co · analyzed/)).toBeVisible();

  // The interactive chrome is gone: the toolbar, the channel explorer, the
  // site header/footer, and the "analyze another" link.
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeHidden();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeHidden();

  await page.emulateMedia({ media: 'screen' });
});
