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

// A raw binary download straight off the device — an AltOS .eeprom, an Entacore .bin —
// reaches the mapper as one column of nothing. Telling the flyer to "set a time column"
// there is an instruction they can't follow, so it gets its own honest empty state.
test('a file with no columns of numbers says so instead of asking for a mapping', async ({ page }) => {
  await page.goto('/');
  // Binary noise with no delimiters and no numeric columns, as a native log reads.
  const blob = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37) % 251));
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'flight.eeprom', mimeType: 'application/octet-stream', buffer: blob });

  await expect(page.getByRole('heading', { name: /no flight data in this file/i })).toBeVisible();
  // Says what Debrief does read, and what to do about it.
  await expect(page.getByText(/text export/i)).toBeVisible();
  await expect(page.getByText(/export or save-as CSV/i)).toBeVisible();
  // No mapping UI to fight with, and a way onward.
  await expect(page.getByRole('button', { name: 'Analyze flight' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose a different file' })).toBeVisible();
});

// The degenerate inputs a real flyer produces by accident: a zero-byte download, a header
// with no rows, a binary file renamed .csv, a note to self. Each has to say what happened
// rather than fail silently or throw — and none of them may take the page down.
test('every unreadable file says what is wrong, and nothing throws', async ({ page }) => {
  const cases: [string, Buffer, RegExp][] = [
    ['empty.csv', Buffer.from(''), /That file is empty/],
    ['header-only.csv', Buffer.from('time,altitude\n'), /no flight data in this file/i],
    ['binary.csv', Buffer.from([0x00, 0xff, 0x10, 0x42, 0x00, 0x99, 0x7f]), /no flight data in this file/i],
    ['prose.txt', Buffer.from('Dear log,\n\nIt flew nicely.\n'), /no flight data in this file/i],
  ];

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  for (const [name, buffer, expected] of cases) {
    await page.goto('/');
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name, mimeType: name.endsWith('.txt') ? 'text/plain' : 'text/csv', buffer });
    await expect(page.getByText(expected), `${name} must say what is wrong`).toBeVisible();
  }

  // A single row of numbers is readable — it just can't be auto-detected, so it goes to the
  // mapper rather than being rejected.
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'one-row.csv', mimeType: 'text/csv', buffer: Buffer.from('time,altitude\n0,0\n') });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();

  expect(errors, 'no unreadable file may throw').toEqual([]);
});
