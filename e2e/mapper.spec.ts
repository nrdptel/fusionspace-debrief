import { test, expect } from '@playwright/test';

// A headerless export (columns are just data — e.g. a PerfectFlite StratoLogger TSV)
// used to map every column to "ignore". Now the mapper guesses the essential roles
// from the data's shape, so the file is usable without hand-labelling every column.
test('a headerless CSV gets time and altitude guessed from the data', async ({ page }) => {
  const rows: string[] = [];
  for (let i = 0; i < 60; i++) {
    const t = (i * 0.1).toFixed(2);
    const alt = i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25); // rise to a single peak, then fall
    rows.push(`${t},${alt},${(9.1 - i * 0.001).toFixed(2)}`);
  }
  const csv = rows.join('\n'); // no header row at all

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'headerless.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  // Synthesised names "Column N" with roles inferred from the data shape.
  await expect(page.getByLabel(/Role for the Column 1/)).toHaveValue('time');
  await expect(page.getByLabel(/Role for the Column 2/)).toHaveValue('altitude');

  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
});
