import { test, expect } from '@playwright/test';
import path from 'node:path';

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

test('a remembered column mapping is re-applied to the next file with the same layout', async ({ page }) => {
  const headerless = (seed: number) =>
    Array.from({ length: 60 }, (_, i) => {
      const alt = i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25);
      return `${(i * 0.1).toFixed(2)},${alt},${(9.1 - i * 0.001 + seed).toFixed(2)}`;
    }).join('\n');

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'logger-a.csv', mimeType: 'text/csv', buffer: Buffer.from(headerless(0)) });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();

  // Set a role the shape sniffer wouldn't, then remember the mapping.
  await page.getByLabel('Role for the Column 3 column').selectOption('voltage');
  await page.getByRole('button', { name: 'Remember these columns' }).click();
  await expect(page.getByRole('button', { name: /Columns remembered/ })).toBeVisible();

  // A different file with the same headerless layout comes back already mapped.
  await page.getByRole('button', { name: 'Choose a different file' }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'logger-b.csv', mimeType: 'text/csv', buffer: Buffer.from(headerless(0.2)) });
  await expect(page.getByText('Applied your saved column mapping')).toBeVisible();
  await expect(page.getByLabel('Role for the Column 3 column')).toHaveValue('voltage');
});

// An .xlsx spreadsheet is unzipped in the browser and its first sheet flattened
// to a table, so a flyer who keeps data in Excel can drop it straight in.
test('an .xlsx spreadsheet drops in and maps its columns', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/sample-spreadsheet.xlsx'));

  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  // Header row read from the sheet's shared strings, roles inferred from the names.
  await expect(page.getByLabel(/Role for the Time \(s\)/)).toHaveValue('time');
  await expect(page.getByLabel(/Role for the Altitude \(ft\)/)).toHaveValue('altitude');
  await expect(page.getByLabel(/Role for the Velocity \(ft\/s\)/)).toHaveValue('velocity');

  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
});

// A corrupt .xlsx must fail with a message the flyer can act on, not a generic line.
test('a broken .xlsx explains what went wrong', async ({ page }) => {
  await page.goto('/');
  // ZIP magic so it's taken as an .xlsx, then garbage — no central directory.
  const broken = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('not a real workbook'.repeat(4))]);
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'broken.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: broken });
  await expect(page.getByText(/not a readable ZIP archive/i)).toBeVisible();
});
