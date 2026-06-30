import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Audit, pass 2: deeper edges — drag-and-drop, recents remove/clear, preference
// persistence across reload, the mapper's duplicate-role warning, accessibility
// on the report, a mobile viewport, and the remaining small controls.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function eggtimerCsv(): string {
  const lines = ['T,Alt,VRaw,VFilt'];
  let tms = 0;
  const push = (alt: number, v: number) => {
    lines.push(`${tms},${alt.toFixed(0)},${v.toFixed(1)},${v.toFixed(1)}`);
    tms += 100;
  };
  for (let i = 0; i < 20; i++) push(0, 0);
  for (let i = 0; i < 30; i++) push((i / 30) ** 0.5 * 300, 200 * (1 - i / 30));
  for (let i = 0; i < 80; i++) push(Math.max(0, 300 - i * 4), -20);
  return lines.join('\n');
}

test('a dropped file is read just like a chosen one', async ({ page }) => {
  await page.goto('/');
  const dt = await page.evaluateHandle((data) => {
    const d = new DataTransfer();
    d.items.add(new File([data], 'dropped.csv', { type: 'text/csv' }));
    return d;
  }, eggtimerCsv());
  await page.locator('[aria-label="Flight log drop zone"]').dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
});

test('recent flights can be removed individually and cleared', async ({ page }) => {
  await page.goto('/');
  const load = async (name: string) => {
    await page.getByLabel('Choose a flight log file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };
  await load('flight-a.csv');
  await load('flight-b.csv');

  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove flight-a.csv from recent flights' }).click();
  await expect(page.getByText('flight-a.csv', { exact: true })).toHaveCount(0);
  await expect(page.getByText('flight-b.csv', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /tap to confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toHaveCount(0);
});

test('a flight can be annotated with a logbook note (and cleared)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({ name: 'cert.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();

  // Add a note.
  await page.getByRole('button', { name: 'Add note for cert.csv' }).click();
  await page.getByRole('textbox', { name: 'Note for cert.csv' }).fill('H128, L1 cert, windy');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('H128, L1 cert, windy')).toBeVisible();
  // The affordance now reads "Edit", confirming the note stuck.
  await expect(page.getByRole('button', { name: 'Edit note for cert.csv' })).toBeVisible();

  // Clicking the note re-opens it for editing; clearing it removes the note.
  await page.getByText('H128, L1 cert, windy').click();
  await expect(page.getByRole('textbox', { name: 'Note for cert.csv' })).toHaveValue('H128, L1 cert, windy');
  await page.getByRole('textbox', { name: 'Note for cert.csv' }).fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('H128, L1 cert, windy')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add note for cert.csv' })).toBeVisible();
});

test('theme choice survives a reload', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByRole('button', { name: /Color theme/ });
  await btn.click(); // Light
  await btn.click(); // Dark
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.className)).toContain('dark');
});

test('units choice survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await page.getByRole('button', { name: /Units:/ }).click();
  await expect(page.getByRole('button', { name: /Units:/ })).toContainText('meters');
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Units:/ })).toContainText('meters');
});

test('the mapper warns when a role is mapped to two columns', async ({ page }) => {
  await page.goto('/');
  const csv = ['time,altitude,height', '0,0,0', '0.1,5,5', '0.2,12,12', '0.3,20,20', '0.4,12,12'].join('\n');
  await page.getByLabel('Choose a flight log file').setInputFiles({ name: 'dup.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();

  const rows = page.locator('tbody tr');
  await rows.nth(0).locator('select').first().selectOption({ label: 'Time' });
  await rows.nth(1).locator('select').first().selectOption({ label: 'Altitude' });
  await rows.nth(2).locator('select').first().selectOption({ label: 'Altitude' });
  await expect(page.getByText(/mapped to more than one column/)).toBeVisible();
});

test('the report page has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('the report renders on a phone viewport without spilling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  // Wait for the report itself — not "Apogee" text, which also appears in the
  // always-present methodology section and would match during loading.
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.locator('.uplot canvas').first()).toBeVisible();
  // The page itself shouldn't scroll horizontally (inner tables may, in their own boxes).
  const spills = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(spills).toBe(false);
});

test('the landing page names the loggers it recognizes', async ({ page }) => {
  await page.goto('/');
  const formats = page.getByRole('region', { name: 'Recognized loggers' });
  await expect(formats).toBeVisible();
  await expect(formats.getByText('Altus Metrum (AltOS)')).toBeVisible();
  await expect(formats.getByText('Eggtimer')).toBeVisible();
  await expect(formats.getByText(/any logger that exports a CSV/)).toBeVisible();
});

test('the intro expander and Ko-fi link behave', async ({ page }) => {
  await page.goto('/');
  await page.getByText('How to use this').click();
  await expect(page.getByText(/reads each into one clean flight/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tip' })).toHaveAttribute('href', /ko-fi\.com/);
});

test('an unreadable share link reports an error on a cold load', async ({ page }) => {
  // Must be a fresh document load (a fragment-only navigation wouldn't re-run the
  // decode effect), which is exactly how a recipient opens a share link.
  await page.goto('/#f=not-a-real-payload');
  await expect(page.getByText(/couldn.?t be read/i)).toBeVisible();
});
