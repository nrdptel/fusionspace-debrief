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
    ['empty.csv', Buffer.from(''), /no contents at all/],
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
    // …and WHICH file it was. §5 requires an error to name the file that failed; on a launch
    // day's drop "that file" is one of eight and the flyer cannot act on it.
    // …and WHICH file it was, wherever the file is handled. §5 requires an error to name what
    // failed; on a launch day's drop "that file" is one of eight and cannot be acted on. The two
    // surfaces answer differently and both are right: an unreadable file gets `ErrorState` on the
    // analyze page, and one with no columns of numbers gets the mapper's own "Debrief read
    // <name> but found no columns of numbers in it". This asserts the fact, not the surface.
    await expect(page.getByText(name).first(), `${name} must be named where it is handled`).toBeVisible();
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

// The launch date the mapper could never carry. A hand-mapped CSV lost the one thing that
// makes a logbook a logbook rather than a recents list — so this drives the whole way
// through: the columns are recognised, the mapper shows what it read before you commit,
// and the flight lands in the logbook under the day it flew.
test('a mapped CSV carries its launch date through to the logbook', async ({ page }) => {
  const rows = ['Year,Month,Day,Time,Seconds,Alt (ft)'];
  for (let i = 0; i < 60; i++) {
    const alt = i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25);
    rows.push(`2024,5,11,14:09:44,${(i * 0.1).toFixed(2)},${alt}`);
  }

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'srad-with-date.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });

  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await expect(page.getByLabel('Role for the Year column')).toHaveValue('year');
  await expect(page.getByLabel('Role for the Month column')).toHaveValue('month');
  await expect(page.getByLabel('Role for the Day column')).toHaveValue('day');
  await expect(page.getByLabel('Role for the Time column')).toHaveValue('timeOfDay');
  await expect(page.getByLabel('Role for the Seconds column')).toHaveValue('time');
  // Read back on the spot — the one mapped value that never shows up in the flight's numbers.
  await expect(page.getByTestId('mapper-flown-at')).toContainText('11 May 2024, 14:09 (logger clock)');

  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('11 May 2024, 14:09 (logger clock)').first()).toBeVisible();
});

// Point the roles at columns that don't hold a date and the mapper says so, rather than
// letting a flyer find out by looking for a launch day that never arrived.
test('the mapper says when the date columns state no date it can read', async ({ page }) => {
  const rows = ['Year,Month,Day,Seconds,Alt (ft)'];
  for (let i = 0; i < 60; i++) {
    const alt = i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25);
    rows.push(`0,0,0,${(i * 0.1).toFixed(2)},${alt}`); // a GPS that never locked
  }

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'no-lock.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });

  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await expect(page.getByTestId('mapper-flown-at')).toContainText("don't state a date Debrief can read");
  // It is not a blocker: the flight still analyses.
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
});
