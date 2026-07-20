import { test, expect } from '@playwright/test';

// A UTF-16 export — the Missile Works RRC3 mDACS text file, Excel's "Unicode Text"
// save — must be decoded from its byte-order mark, not read as UTF-8. Read as UTF-8
// the header is mojibake with a NUL in every other byte, so every column maps to
// "ignore" and the file is unusable. Build one in memory and prove the mapper reads
// real column roles from it.
test('a UTF-16LE CSV export decodes from its BOM and maps its columns', async ({ page }) => {
  const csv =
    'Time,Altitude,Pressure,Velocity\n' +
    Array.from({ length: 30 }, (_, i) => {
      const alt = i < 15 ? i * 20 : Math.max(0, 300 - (i - 15) * 20);
      return `${(i * 0.1).toFixed(1)},${alt},${(1013 - alt * 0.12).toFixed(1)},${i < 15 ? 60 : -20}`;
    }).join('\n');
  const buffer = Buffer.from('﻿' + csv, 'utf16le'); // UTF-16 little-endian, with BOM

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'rrc3-unicode.csv', mimeType: 'text/csv', buffer });

  // Decoded correctly → the generic mapper with roles inferred from the real headers.
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await expect(page.getByLabel(/Role for the Time\b/)).toHaveValue('time');
  await expect(page.getByLabel(/Role for the Altitude/)).toHaveValue('altitude');
  await expect(page.getByLabel(/Role for the Velocity/)).toHaveValue('velocity');

  // …and it analyses through to a full report.
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
});
