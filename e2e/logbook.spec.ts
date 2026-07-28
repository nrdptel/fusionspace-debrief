import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// The logbook backup/restore round-trip: export the remembered flights (and their
// notes) to a file, clear the device, then import the file back and prove the
// flight — note and all — returns. Everything stays on-device; the "file" never
// leaves the browser except as a download the user keeps.

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

const jsonInput = (page: import('@playwright/test').Page) =>
  page.locator('input[type="file"][accept*="json"]');

test('a logbook can be exported and restored on a cleared device', async ({ page }) => {
  await page.goto('/');

  // Remember a flight and give it a note so the export carries more than a name.
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'cert.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();

  await page.getByRole('button', { name: 'Add note for cert.csv' }).click();
  await page.getByRole('textbox', { name: 'Note for cert.csv' }).fill('H128, L1 cert');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('H128, L1 cert')).toBeVisible();

  // Export the logbook to a file.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('debrief-logbook.json');
  const backupPath = await dl.path();

  // Wipe the device.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /tap to confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toHaveCount(0);

  // The empty state still offers a restore; importing the backup brings it back.
  await expect(page.getByRole('button', { name: 'Restore it' })).toBeVisible();
  await jsonInput(page).setInputFiles(backupPath);

  await expect(page.getByText('Restored 1 flight.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
  await expect(page.getByText('cert.csv', { exact: true })).toBeVisible();
  await expect(page.getByText('H128, L1 cert')).toBeVisible();
});

test('importing a file that is not a logbook reports it cleanly', async ({ page }) => {
  await page.goto('/');
  // Get a non-empty list so the header Import button is shown.
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();

  await jsonInput(page).setInputFiles({
    name: 'random.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByText(/No flights found in that file/)).toBeVisible();
  // The existing flight is untouched.
  await expect(page.getByText('a.csv', { exact: true })).toBeVisible();
});

// A season fills the logbook, and sorting alone stops finding a flight: what a flyer
// remembers is the airframe, the launch or the motor. The search covers the file name, the
// logger it came off, and the note they wrote — so it has to reach all three.
test('the logbook can be searched by name, logger and note', async ({ page }) => {
  await page.goto('/');
  // Four flights, which is where the search box earns its place.
  for (const name of ['nike-smoke.csv', 'raven-l3.csv', 'pad-test.csv', 'cert-flight.csv']) {
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  const rows = page.getByRole('list', { name: 'Your flights' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);

  // A note is part of what's searched, so put a motor on one flight.
  await page.getByRole('button', { name: 'Add note for raven-l3.csv' }).click();
  await page.getByRole('textbox', { name: 'Note for raven-l3.csv' }).fill('M1297 red, windy');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const search = page.getByRole('searchbox', { name: 'Search your flights' });
  await search.fill('nike');
  await expect(rows).toHaveCount(1);
  await expect(page.getByText('1 of 4')).toBeVisible();

  // The motor from the note finds its flight, and so does the logger name.
  await search.fill('m1297');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('raven-l3.csv');
  await search.fill('eggtimer');
  await expect(rows).toHaveCount(4);

  // Every term has to match, in any order.
  await search.fill('windy raven');
  await expect(rows).toHaveCount(1);
  await search.fill('windy nike');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText(/No flight here matches/)).toBeVisible();

  // And the way back is offered, not just implied.
  await page.getByRole('button', { name: 'Show all 4' }).click();
  await expect(rows).toHaveCount(4);
  await expect(search).toHaveValue('');
});

// A flight's own date, where the file states it: on the report, in the export, and as the
// launch day in the logbook — which can then be sorted and searched by it.
test('a flight that states when it flew says so, and the logbook keeps it', async ({ page }) => {
  // A real Blue Raven app export: Year,Month,Day + a Time column, and no zone stated
  // anywhere, so the date is the device's own clock.
  const fx = path.join(__dirname, '../lib/parsers/__fixtures__/blueraven-app-lr.csv');
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'blueraven-may.csv', mimeType: 'text/csv', buffer: readFileSync(fx) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // The report says when it flew, labelled as the logger's own clock — never re-projected
  // into this browser's zone.
  await expect(page.getByText(/Flew 11 May 2024, 14:09 \(logger clock\)/)).toBeVisible();

  // And it rides into the text export.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .txt' }).click(),
  ]);
  const stream = await dl.createReadStream();
  const txt = await new Promise<string>((res) => {
    let s = '';
    stream!.on('data', (c) => (s += c));
    stream!.on('end', () => res(s));
  });
  expect(txt).toContain('Flew 11 May 2024, 14:09 (logger clock)');

  // The logbook row shows the launch day rather than when the file was opened.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  const row = page.getByRole('list', { name: 'Your flights' }).getByRole('listitem').first();
  await expect(row).toContainText('11 May 2024');
  await expect(row).not.toContainText('just now');
});

// The logbook used to hold the file and not the answer. A flight Debrief doesn't
// auto-detect is only a flight because the flyer said which column was which — and that
// mapping was thrown away on the way in, so reopening the flight asked for it all over
// again, and a comparison built from logbook ids skipped it outright. The mapping is stored
// with the flight now, and this walks both paths.
test('a hand-mapped flight reopens as itself, and can join a comparison by id', async ({ page }) => {
  const rows = ['Seconds,Height,Volts'];
  for (let i = 0; i < 60; i++) {
    const alt = i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25);
    rows.push(`${(i * 0.1).toFixed(2)},${alt},${(9.1 - i * 0.001).toFixed(2)}`);
  }

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'srad-custom.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  // Map it by hand, including a role the guess wouldn't make.
  await page.getByLabel('Role for the Height column').selectOption('altitude');
  await page.getByLabel('Role for the Volts column').selectOption('voltage');
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // Drop in a second flight so there is something to compare against, then reopen the
  // mapped one from the logbook: it must come back as the flight, not as the mapper.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();

  await page.getByRole('button', { name: /srad-custom/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // …and it joins a comparison named by logbook id, which is the path that used to drop it.
  await page.goto('/compare');
  await page.getByRole('checkbox', { name: /srad-custom/ }).check();
  await page.getByRole('checkbox', { name: /altusmetrum-telemetrum/ }).check();
  await page.getByRole('button', { name: /Compare/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByText(/needs its columns mapped/)).toHaveCount(0);
});

// Four recordings of one flight share a long prefix, which is exactly the case the compare
// surface exists for — and at a 390 px viewport the logbook's name cell is 188 px, so a
// single truncated line painted the identical string for all four. You cannot tick the
// flight you meant from a list of four rows that read the same.
test('a phone can tell two similarly-named flights apart in the logbook', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const names = [
    'mercury__altimetercloud-lilnuke4alt-1784__1784.csv',
    'mercury__altimetercloud-lilnuke4alt-1785__1785.csv',
  ];
  for (const name of names) {
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  const rows = page.getByRole('list', { name: 'Your flights' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);

  // The distinguishing part of the name has to be inside the box that is actually painted,
  // not merely present in the DOM: measure what fits, the way the screen does.
  // The row carries several monospace spans (the name, then figures); the name is the first.
  const nameSpans = [];
  for (let i = 0; i < 2; i++) nameSpans.push(rows.nth(i).locator('span.font-mono').first());
  const visible = await Promise.all(
    nameSpans.map((loc) =>
      loc.evaluate((e) => {
      const cs = getComputedStyle(e);
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const lines: string[] = [];
      let line = '';
      for (const ch of e.textContent || '') {
        if (cv.measureText(line + ch).width > e.clientWidth && line) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
      if (line) lines.push(line);
        const shown = Math.max(1, Math.round(e.clientHeight / parseFloat(cs.lineHeight || '20')));
        return lines.slice(0, shown).join('');
      }),
    ),
  );
  expect(visible).toHaveLength(2);
  expect(new Set(visible).size, `both rows read the same on a phone: ${JSON.stringify(visible)}`).toBe(2);
});
