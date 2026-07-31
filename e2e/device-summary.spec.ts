import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);

// A file that carries the logger's own summary (AltimeterCloud writes a grid of
// key,value pairs ahead of the data) should surface those figures beside Debrief's
// independent read as a cross-check.
test('a logger summary is cross-checked against Debrief’s read', async ({ page }) => {
  // Build a clean rise-and-fall with a device velocity column, then state the
  // file's own peak altitude and velocity in an AltimeterCloud-style header so the
  // two reads agree.
  const t: number[] = [], alt: number[] = [], vel: number[] = [];
  for (let i = 0; i < 80; i++) {
    const ms = i * 50;
    const s = i / 40; // 0..2 over the climb window
    const a = i <= 40 ? 120 * (1 - (1 - s) ** 2) : Math.max(0, 120 - (i - 40) * 6);
    const v = i <= 40 ? 45 * Math.sin((Math.PI * i) / 40) : -18;
    t.push(ms); alt.push(a); vel.push(v);
  }
  const maxAlt = Math.max(...alt);
  const maxVel = Math.max(...vel);

  const header = [
    `Apogee meters,${maxAlt.toFixed(2)},,Max velocity up,${maxVel.toFixed(2)},Burnout time (ms),400,`,
    `Device tag,Test Unit,,Serial number,0000-0000,Max acc ascent (mG),9807,`,
    'Time(ms),Altitude(m),Velocity(m/s)',
  ];
  const data = t.map((ms, i) => `${ms},${alt[i].toFixed(3)},${vel[i].toFixed(3)}`);
  const csv = [...header, ...data].join('\n');

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'altimetercloud.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  // Confirm the auto-guessed mapping, then land on the report.
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // The cross-check panel shows the device's figures next to Debrief's, and the
  // altitude/velocity reads agree with the logger's own.
  const panel = page.getByRole('region', { name: /logger.s own summary/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Apogee')).toBeVisible();
  await expect(panel.getByText('Max velocity')).toBeVisible();
  await expect(panel.getByText(/agree/).first()).toBeVisible();
});

// The pairing has to SURVIVE. A flight goes into the logbook as it is read, one file at a
// time, while which summary belongs to which log can only be decided once the whole drop has
// been read — so the pairing happened after the save and was lost with it. Reopening the
// flight tomorrow dropped the device's own figures and the whole cross-check panel.
test('a paired device summary survives a reload and comes back with the flight', async ({ page }) => {
  const lr = readFileSync(fx('blueraven-app-lr.csv'));
  const summary = readFileSync(fx('blueraven-app.summary.csv'));

  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    { name: 'BlRv_SN0829_LR_05-11-2024.csv', mimeType: 'text/csv', buffer: lr },
    { name: 'BlRv_SN0829_summary_05-11-2024_.csv', mimeType: 'text/csv', buffer: summary },
  ]);

  const panel = page.getByRole('region', { name: /logger.s own summary/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Apogee', exact: true }) })).toContainText('4,035 ft');

  // Come back to it the way a flyer does: a fresh load of the page, then the logbook.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
  await page.getByRole('button', { name: /BlRv_SN0829_LR_05-11-2024\.csv/ }).first().click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // The device's own figures are still there — re-read from the summary the logbook kept,
  // not restored from numbers frozen at whatever version wrote them.
  const again = page.getByRole('region', { name: /logger.s own summary/i });
  await expect(again).toBeVisible();
  await expect(again.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Apogee', exact: true }) })).toContainText('4,035 ft');
  // …and so is the sentence explaining the figure it could not use.
  await expect(page.getByText(/Main chute descent rate/)).toBeVisible();

  // TWICE. Re-opening a flight saves it again, and a save REPLACES the earlier copy of the
  // same file — the mechanism that carries a logbook note forward. A pairing that did not
  // ride along with it would survive the first reopen (the report is already on screen) and
  // vanish on the second, which is the worst way to lose a thing. Checked one reopen deep
  // first and it proved nothing: the assert passed with the carry-forward removed.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
  await page.getByRole('button', { name: /BlRv_SN0829_LR_05-11-2024\.csv/ }).first().click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  const third = page.getByRole('region', { name: /logger.s own summary/i });
  await expect(third, 'the pairing survives being re-saved by its own reopen').toBeVisible();
  await expect(third.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Apogee', exact: true }) })).toContainText('4,035 ft');
});

// A backup is the only insurance against Clear, and the pairing has to be inside it. The
// export has always written `summaryText`; the IMPORT rebuilt each record field by field and
// dropped it, so a restored flight came back with Debrief's read and no cross-check panel —
// the altimeter's own figures, which are the whole point of having paired the files.
test('a paired device summary survives a backup and restore', async ({ page }) => {
  const lr = readFileSync(fx('blueraven-app-lr.csv'));
  const summary = readFileSync(fx('blueraven-app.summary.csv'));

  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    { name: 'BlRv_SN0829_LR_05-11-2024.csv', mimeType: 'text/csv', buffer: lr },
    { name: 'BlRv_SN0829_summary_05-11-2024_.csv', mimeType: 'text/csv', buffer: summary },
  ]);
  await expect(page.getByRole('region', { name: /logger.s own summary/i })).toBeVisible();

  // The pairing is attached after the drop is fully read, so wait for it to reach the store
  // rather than assuming it beat the Export click.
  const storedSummary = () =>
    page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => {
        const q = indexedDB.open('debrief');
        q.onsuccess = () => res(q.result);
      });
      const all: { summaryText?: string }[] = await new Promise((res) => {
        const q = db.transaction('recents', 'readonly').objectStore('recents').getAll();
        q.onsuccess = () => res(q.result);
      });
      return all.some((r) => typeof r.summaryText === 'string' && r.summaryText.length > 0);
    });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
  await expect.poll(storedSummary).toBe(true);

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  const backupPath = (await dl.path()) as string;
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  const paired = backup.flights.find((f: { summaryText?: string }) => f.summaryText);
  expect(paired, 'the backup file carries the summary text').toBeTruthy();

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /^Delete (all \d+|it)$/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toHaveCount(0);

  await page.locator('input[type="file"][accept*="json"]').setInputFiles(backupPath);
  await expect(page.getByText(/Restored \d+ flights?\./)).toBeVisible();
  await expect.poll(storedSummary, { message: 'the restore kept the summary, not just the log' }).toBe(true);

  // …and the cross-check panel is on the page again, re-read from the restored source.
  await page.getByRole('button', { name: /BlRv_SN0829_LR_05-11-2024\.csv/ }).first().click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  const back = page.getByRole('region', { name: /logger.s own summary/i });
  await expect(back, 'the restored flight still has the device’s own figures').toBeVisible();
  await expect(back.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Apogee', exact: true }) })).toContainText('4,035 ft');
});

// Same files, same rules, either surface. The pairing used to live inside the analyze page,
// so dropping a log and its summary on /compare produced "a device summary for X, not a
// flight record" and nothing else — the word "cross-check" appeared nowhere on the page.
test('the comparison surface pairs a device summary too', async ({ page }) => {
  await page.goto('/compare');
  await page.getByLabel('Choose flight logs to compare').setInputFiles([
    { name: 'BlRv_SN0829_LR_05-11-2024.csv', mimeType: 'text/csv', buffer: readFileSync(fx('blueraven-app-lr.csv')) },
    { name: 'BlRv_SN0829_summary_05-11-2024_.csv', mimeType: 'text/csv', buffer: readFileSync(fx('blueraven-app.summary.csv')) },
  ]);

  const note = page.getByRole('status').filter({ hasText: /logbook/ });
  await expect(note).toBeVisible();
  // It says the summary was read…
  await expect(note).toContainText(/Read the device's own summary alongside the flight/);
  // …and no longer calls it a file that was left out.
  await expect(note).not.toContainText('not a flight record');
});
