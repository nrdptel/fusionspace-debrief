import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The logbook backup/restore round-trip: export the remembered flights (and their
// notes) to a file, clear the device, then import the file back and prove the
// flight — note and all — returns. Everything stays on-device; the "file" never
// leaves the browser except as a download the user keeps.

/** `peak` is the apogee in the file's own units — the parameter exists so two flights can be
 *  told apart by their numbers rather than by their file names. */
function eggtimerCsv(peak = 300): string {
  const lines = ['T,Alt,VRaw,VFilt'];
  let tms = 0;
  const push = (alt: number, v: number) => {
    lines.push(`${tms},${alt.toFixed(0)},${v.toFixed(1)},${v.toFixed(1)}`);
    tms += 100;
  };
  for (let i = 0; i < 20; i++) push(0, 0);
  for (let i = 0; i < 30; i++) push((i / 30) ** 0.5 * peak, 200 * (1 - i / 30));
  for (let i = 0; i < 80; i++) push(Math.max(0, peak - i * (peak / 75)), -20);
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

  // …and a report label and notes, which are kept with the flight rather than with the view.
  // The export has always written them; the IMPORT rebuilt each record field by field and
  // silently left them behind, so a restore came back without the two things on that screen
  // the flyer had actually typed — and said "Restored 1 flight." while doing it.
  await page.getByText('cert.csv', { exact: true }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await page.getByRole('group').filter({ hasText: 'Label this report' }).locator('summary').click();
  await page.locator('#report-label').fill('Nimbus IV · L1 cert');
  await page.locator('#report-notes').fill('Gusty, 12 kt crosswind.');
  await page.getByRole('button', { name: /Analyze another flight/ }).click();

  // The caption is written to IndexedDB by a fired-and-forgotten `saveCaption`, and the notes
  // field is only flushed by the blur the click above happens to fire — so WAIT for the write
  // rather than assuming it beat the export. Re-reading the input Playwright just typed into
  // proves nothing about the app at all; this polls the store the export actually reads.
  const storedCaption = () =>
    page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => {
        const q = indexedDB.open('debrief');
        q.onsuccess = () => res(q.result);
      });
      const all: { caption?: { label: string; notes: string } }[] = await new Promise((res) => {
        const q = db.transaction('recents', 'readonly').objectStore('recents').getAll();
        q.onsuccess = () => res(q.result);
      });
      return all[0]?.caption ?? null;
    });
  await expect.poll(storedCaption).toEqual({ label: 'Nimbus IV · L1 cert', notes: 'Gusty, 12 kt crosswind.' });

  // Export the logbook to a file.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('debrief-logbook.json');
  const backupPath = await dl.path();

  // What the backup FILE holds, read off disk — the half of the round trip that no amount of
  // in-page polling can establish, and the input to the import being tested below.
  const backup = JSON.parse(readFileSync(backupPath as string, 'utf8'));
  expect(backup.flights[0].caption).toEqual({ label: 'Nimbus IV · L1 cert', notes: 'Gusty, 12 kt crosswind.' });
  expect(backup.flights[0].summaryText, 'this flight was dropped without a device summary').toBeUndefined();

  // Wipe the device.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /^Delete (all \d+|it)$/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toHaveCount(0);

  // The empty state still offers a restore; importing the backup brings it back.
  await expect(page.getByRole('button', { name: 'Restore it' })).toBeVisible();
  await jsonInput(page).setInputFiles(backupPath);

  await expect(page.getByText('Restored 1 flight.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
  await expect(page.getByText('cert.csv', { exact: true })).toBeVisible();
  await expect(page.getByText('H128, L1 cert')).toBeVisible();

  // …and the restored flight still carries what the flyer typed onto the report. Checked in the
  // store as well as on screen: the store is what a later reopen and every export read from.
  await expect.poll(storedCaption).toEqual({ label: 'Nimbus IV · L1 cert', notes: 'Gusty, 12 kt crosswind.' });
  await page.getByText('cert.csv', { exact: true }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await page.getByRole('group').filter({ hasText: 'Label this report' }).locator('summary').click();
  await expect(page.locator('#report-label'), 'the report label survived the round trip').toHaveValue('Nimbus IV · L1 cert');
  await expect(page.locator('#report-notes'), 'and so did the notes').toHaveValue('Gusty, 12 kt crosswind.');
});

// Clear is the only irreversible control in the app, and its confirm used to be a SECOND CLICK
// ON THE SAME BUTTON in the same place — so a double-click destroyed a season of launch days,
// every note, every report label and every hand-made column mapping, with no undo and nothing
// said about what was going.
test('a double-click cannot clear the logbook, and the confirm says what it would take', async ({ page }) => {
  await page.goto('/');
  for (const name of ['one.csv', 'two.csv']) {
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  await page.getByRole('button', { name: 'Add note for two.csv' }).click();
  await page.getByRole('textbox', { name: 'Note for two.csv' }).fill('L1 cert, keep');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('L1 cert, keep')).toBeVisible();

  const rows = page.getByRole('list', { name: 'Your flights' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);

  // Double-click the trigger. The confirm is a different control in a different place, so the
  // second click cannot reach it — here it lands back on the trigger, which is a disclosure and
  // simply closes again. Either way nothing is deleted, which is the whole point.
  await page.getByRole('button', { name: 'Clear', exact: true }).dblclick();

  // A RELOAD is what settles "nothing was deleted": the clear would be an async IndexedDB
  // write, so a count read straight after the double-click can see the old list and pass
  // against the very bug this names.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Your flights' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('L1 cert, keep')).toBeVisible();

  // Now open it deliberately. What it would take is stated, including the noted flight.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  const confirm = page.getByRole('alert').filter({ hasText: 'Delete all 2 flights' });
  await expect(confirm).toBeVisible();
  await expect(confirm, 'the noted flight is called out, because Clear takes it too').toContainText(
    'One of them has a note',
  );
  await expect(confirm).toContainText('cannot be undone');
  // …and the backup is offered as the way out, rather than left to be known about.
  await expect(confirm.getByRole('button', { name: 'Save a backup first' })).toBeVisible();
  // The safe control has focus, not the destructive one.
  await expect(confirm.getByRole('button', { name: 'Keep them' })).toBeFocused();

  // The offered way out says what it actually wrote. `exportLogbook` swallows a storage failure
  // and still hands back a well-formed envelope with an empty flights array, so "a download
  // fired" was never evidence that the backup held anything — and this panel makes that file the
  // sanctioned safety net for the app's only irreversible action.
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    confirm.getByRole('button', { name: 'Save a backup first' }).click(),
  ]);
  expect(backup.suggestedFilename()).toBe('debrief-logbook.json');
  await expect(confirm, 'the panel names the count the file actually holds').toContainText(
    'Saved debrief-logbook.json — 2 flights in it.',
  );
  await expect(page.getByRole('list', { name: 'Your flights' }).getByRole('listitem'), 'saving a backup deletes nothing').toHaveCount(2);

  // Escape closes it and hands focus back to the trigger — a Cancel that unmounts itself drops
  // focus to the body and costs a keyboard flyer the whole page in tab stops.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert').filter({ hasText: 'Delete all 2' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeFocused();

  // …and the deliberate path still works.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Delete all 2' }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toHaveCount(0);
});

// The panel states a count and names the noted flights, so it must not go on standing over a
// list that has changed underneath it — and it must not survive the list emptying, or a RESTORE
// brings the armed red panel back with the flights it would delete.
test('the clear-confirm disarms when the logbook it describes changes', async ({ page }) => {
  await page.goto('/');
  for (const name of ['one.csv', 'two.csv', 'three.csv']) {
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Delete all 3 flights' })).toBeVisible();

  // Remove a row while it is open: the sentence would otherwise rewrite itself mid-read.
  await page.getByRole('button', { name: 'Remove one.csv from recent flights' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /Delete all \d+ flights/ }),
    'the confirm disarms rather than restating itself about a different list',
  ).toHaveCount(0);

  // …and it does not come back with a restore. Empty the list, then bring it back.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  const backupPath = await dl.path();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /^Delete all 2$/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toHaveCount(0);

  await jsonInput(page).setInputFiles(backupPath);
  await expect(page.getByText(/Restored 2 flights\./)).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: /Delete all/ }),
    'a restore must not bring back an armed delete',
  ).toHaveCount(0);
});

// A season's logbook is exactly the table a flyer pastes into the club spreadsheet or a cert
// document, and it was the one table in the app you could not get out of it. The report's
// readings, the sample table and the comparison have each shared `copyTable` for this; the
// backup file is a restore file, not a season anyone can read.
test('the logbook copies out as a table, in the order and selection on screen', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  // Four, because that is where the search box earns its place — and dropped highest-first ON
  // PURPOSE, so the logbook's own order (most recent first) and the apogee sort disagree.
  // Otherwise "copies what is on screen" cannot fail.
  for (const [name, peak] of [['high.csv', 1200], ['mid.csv', 800], ['small.csv', 500], ['low.csv', 300]] as const) {
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv(peak)) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  await page.getByRole('button', { name: 'Add note for high.csv' }).click();
  await page.getByRole('textbox', { name: 'Note for high.csv' }).fill('J450, cert attempt');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Poll the CLIPBOARD, not the confirmation. The message from an earlier copy is still on
  // screen when the next one is clicked, so asserting it passes instantly and the read that
  // follows returns the previous copy — the same trap as asserting a heading that was already
  // there.
  //
  // …and EMPTY it first, rather than polling for content the last copy might already satisfy.
  // The first version waited for "high.csv" on line 1, which is true of the sorted copy AND of
  // the narrowed one that follows it — so when the write lost the race the poll passed on the
  // stale five-line clipboard and the length assert failed. Flaky at the tail of a full suite,
  // for a reason that had nothing to do with the code under test. Waiting for "anything at all"
  // cannot be satisfied by the previous copy, whatever it held.
  const clip = async () => (await page.evaluate(() => navigator.clipboard.readText())).trim().split('\n');
  const copyAnd = async (expected: string) => {
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.getByRole('button', { name: 'Copy table' }).click();
    await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).trim().length).toBeGreaterThan(0);
    const lines = await clip();
    expect(lines[1] ?? '', 'the copy that just landed, not the one before it').toContain(expected);
    return lines;
  };

  const lines = await copyAnd('low.csv');
  expect(lines[0].split('\t')[0], 'a header a spreadsheet lands in cells').toBe('Flight');
  expect(lines).toHaveLength(5);
  expect(lines[1], 'the logbook opens most-recent-first, and copies that way').toContain('low.csv');
  expect(lines[4]).toContain('high.csv');
  expect(lines[4], 'the note the flyer typed comes with it').toContain('J450, cert attempt');
  expect(lines[1].split('\t')).toHaveLength(6);

  // What is copied is what is ON SCREEN. Sorting by apogee reverses these, so a copy that
  // ignored the sort would come back in the other order.
  await page.getByRole('button', { name: 'Apogee' }).click();
  await expect(page.getByRole('button', { name: 'Apogee' })).toHaveAttribute('aria-pressed', 'true');
  const sorted = await copyAnd('high.csv');
  expect(sorted.slice(1).map((l) => l.split('\t')[0])).toEqual(['high.csv', 'mid.csv', 'small.csv', 'low.csv']);

  // …and so does the search: a narrowed list copies narrowed.
  await page.getByRole('searchbox', { name: 'Search your flights' }).fill('high');
  const filtered = await copyAnd('high.csv');
  expect(filtered, 'a header and the one flight the flyer had narrowed to').toHaveLength(2);
  await expect(page.getByText(/Copied 1 flight/)).toBeVisible();
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

// The logbook keeps a bounded window of un-noted flights — every entry holds the whole file
// text, so it has to be bounded. What it never did was SAY so: dropping 15 flights left 12,
// and the three that went were named nowhere. A launch day is six files, so the third launch
// day quietly ate the first, and a flyer found out by counting, weeks later.
test('the logbook says what it keeps, and names what it forgot', async ({ page }) => {
  await page.goto('/');
  const drop = async (i: number) => {
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name: `flight-${String(i).padStart(2, '0')}.csv`, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };

  await drop(1);
  await drop(2);
  // The window is stated before it bites, where the flyer decides what to keep — not only
  // afterwards, in the past tense, at the foot of the list.
  await expect(page.getByRole('heading', { name: /Recent flights/ })).toContainText('2/12 un-noted');

  // Noting a flight is the escape hatch, and it frees the slot as well as keeping the flight.
  await page.locator('button[title*="Add a note"]').last().click();
  await page.locator('input[type="text"], textarea').last().fill('J350 · cert L2');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Recent flights/ })).toContainText('1/12 un-noted');

  // Fill the window and push past it.
  for (let i = 3; i <= 14; i++) await drop(i);
  await expect(page.getByRole('heading', { name: /Recent flights/ })).toContainText('12/12 un-noted');

  // What went is named, with the one action that would have kept it.
  const notice = page.getByRole('status').filter({ hasText: 'forgotten' }).first();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/flight-\d\d\.csv/);
  await expect(notice).toContainText(/add a .*note to a flight and it stays for good/i);

  // The noted flight survived all of it — the escape hatch has to actually work, or naming
  // the rule is just a nicer way to lose the same flight.
  await expect(page.getByText('J350 · cert L2')).toBeVisible();

  // And the notice is dismissable: it reports one event, it is not a permanent banner.
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'forgotten' })).toHaveCount(0);
});

// The report lived only in React state, so all seven in-app links on that screen — Analyze
// and Compare in the header, "Read the methods →", and Methods/Validation/Privacy in the
// footer — destroyed it, and Back landed on an empty drop zone. `?open=<id>` already restored
// a flight; the mount effect deleted it from the URL immediately after reading it, which is
// exactly what left the report without an address.
test('a report has an address, so a link out and Back comes back to it', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'addressed.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('open')).not.toBeNull();

  // Out through an ordinary in-app link, and back.
  await page.getByRole('link', { name: /Read the methods/ }).click();
  // Wait on the ADDRESS, not on a heading. The report screen renders its own "Where the numbers
  // come from" card (components/MethodsPointer.tsx), so asserting that heading passed the instant
  // the click landed — before the navigation had happened at all — and the `goBack()` below then
  // unwound the wrong entry and left the page on `/` (or on `about:blank`). It failed roughly one
  // run in three under CI's single worker, was diagnosed as re-analysis outrunning the deadline,
  // and was papered over with a 20 s timeout and CI's one retry.
  await page.waitForURL(/\/methods\/?(?:[?#]|$)/);
  await expect(page.getByRole('heading', { level: 1, name: 'Where the numbers come from' })).toBeVisible();
  await page.goBack();
  // Coming back to a flight PARSES AND ANALYSES it again, which a navigation never used to do
  // because the report used to evaporate — so the wait is generous on purpose. It is NOT what
  // used to fail here: see the note on `waitForURL` above.
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });

  // A refresh too — an address you cannot reload is not one.
  await page.reload();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });

  // And leaving the report deliberately gives the address up, so a reload after "Analyze
  // another flight" doesn't drag the old flight back.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  expect(new URL(page.url()).searchParams.get('open')).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Flight log drop zone')).toBeVisible();
});

// A logbook id is an address: `/?open=<id>` is a report's and `/compare?ids=a,b` names a
// comparison's flights. `saveRecent` used to mint a fresh id every time, and a save is what
// REOPENING a flight does — so clicking a logbook row silently broke every comparison
// permalink that named it, and /compare fell back to the empty picker without a word.
test('reopening a flight keeps its id, so a comparison permalink still resolves', async ({ page }) => {
  await page.goto('/');
  for (const name of ['one.csv', 'two.csv']) {
    await page.getByLabel('Choose a flight log file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  const idsOf = () =>
    page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => {
        const q = indexedDB.open('debrief');
        q.onsuccess = () => res(q.result);
      });
      const all: { id: string; name: string }[] = await new Promise((res) => {
        const q = db.transaction('recents', 'readonly').objectStore('recents').getAll();
        q.onsuccess = () => res(q.result);
      });
      return all.sort((a, b) => a.name.localeCompare(b.name)).map((r) => r.id);
    });

  const before = await idsOf();
  expect(before).toHaveLength(2);
  const permalink = `/compare?ids=${before.join(',')}`;

  // Reopen the first flight — which is all that clicking its logbook row does.
  await page.goto(`/?open=${before[0]}`);
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  expect(await idsOf(), 'a reopen must not re-address the flight').toEqual(before);

  // The permalink taken before the reopen still resolves to the comparison.
  await page.goto(permalink);
  await expect(page.getByText(/Comparing 2 flights/)).toBeVisible();
});

// Plenty of loggers write every export under one fixed name, so a launch day arrives as six
// files all called `data.csv`. The logbook keyed a flight on its file name, so the second one
// REPLACED the first: the earlier entry deleted outright, its id handed to the newer flight —
// and that id is what `/?open=<id>` and every `/compare?ids=…` resolve through, so a row the
// flyer clicked gave back numbers that were never its own.
test('two flights that share a file name are two flights, not one', async ({ page }) => {
  await page.goto('/');
  for (const peak of [300, 1200]) {
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv(peak)) });
    await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }

  const stored = () =>
    page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => {
        const q = indexedDB.open('debrief');
        q.onsuccess = () => res(q.result);
      });
      const all: { id: string; name: string; apogeeM: number | null; addedAt: number }[] = await new Promise((res) => {
        const q = db.transaction('recents', 'readonly').objectStore('recents').getAll();
        q.onsuccess = () => res(q.result);
      });
      return all
        .sort((a, b) => a.addedAt - b.addedAt)
        .map((r) => ({ id: r.id, name: r.name, apogeeM: r.apogeeM, addedAt: r.addedAt }));
    });

  const entries = await stored();
  expect(entries.map((e) => e.name), 'both were dropped under the one name').toEqual(['data.csv', 'data.csv']);
  expect(new Set(entries.map((e) => e.id)).size, 'each flight keeps its own address').toBe(2);
  expect(entries[0].apogeeM).toBeLessThan(entries[1].apogeeM as number);

  const rows = page.getByRole('list', { name: 'Your flights' }).getByRole('listitem');
  await expect(rows, 'both flights are in the logbook').toHaveCount(2);

  // The three controls on a row named the flight by file name alone, which left a screen
  // reader two identically-named buttons that open different flights.
  const labels = await rows.getByRole('checkbox').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  );
  expect(new Set(labels).size, `both rows offer the same control: ${JSON.stringify(labels)}`).toBe(2);

  // …and the first flight's address still gives back the first flight.
  //
  // Reopening SAVES — a replace in place is what keeps a logbook id stable — and that save is
  // fired after the report is on screen rather than awaited before it. So wait for the write
  // to LAND before reading the store: "nothing was deleted, nothing was rewritten" asserted
  // against a store the reopen has not touched yet is satisfied by any behaviour at all.
  // `addedAt` is stamped on every save, so a bumped one is the reopen's own write arriving.
  await page.goto(`/?open=${entries[0].id}`);
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await expect
    .poll(async () => (await stored()).find((e) => e.id === entries[0].id)?.addedAt ?? 0)
    .toBeGreaterThan(entries[0].addedAt);

  const after = await stored();
  expect(after, 'a reopen must not delete the other flight').toHaveLength(2);
  expect(
    after.find((r) => r.id === entries[0].id)?.apogeeM,
    'a reopen must not rewrite the flight it opened',
  ).toBeCloseTo(entries[0].apogeeM as number, 3);
});

// The report has an address, so a link out and Back comes back to the flight — and the label
// and notes, the only things on that screen a flyer actually TYPED, were the two that didn't
// come with it. They ride into every text, Markdown, HTML and JSON export and the printed
// card, so losing them costs a cert write-up its title.
test('the label and notes a flyer types stay with the flight', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'captioned.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('open')).not.toBeNull();

  await page.getByRole('group').filter({ hasText: 'Label this report' }).locator('summary').click();
  await page.locator('#report-label').fill('Nimbus IV · J450 · L2 attempt');
  await page.locator('#report-notes').fill('Gusty, 12 kt crosswind.');
  // The panel says they are kept — the copy and the behaviour have to agree.
  await expect(page.getByText(/Kept with this flight on this device/)).toBeVisible();

  const openPanel = async () => {
    await page.getByRole('group').filter({ hasText: 'Label this report' }).locator('summary').click();
  };

  // Out through an in-app link and back.
  await page.getByRole('link', { name: /Read the methods/ }).click();
  // Wait on the ADDRESS, not on a heading. The report screen renders its own "Where the numbers
  // come from" card (components/MethodsPointer.tsx), so asserting that heading passed the instant
  // the click landed — before the navigation had happened at all — and the `goBack()` below then
  // unwound the wrong entry and left the page on `/` (or on `about:blank`). It failed roughly one
  // run in three under CI's single worker, was diagnosed as re-analysis outrunning the deadline,
  // and was papered over with a 20 s timeout and CI's one retry.
  await page.waitForURL(/\/methods\/?(?:[?#]|$)/);
  await expect(page.getByRole('heading', { level: 1, name: 'Where the numbers come from' })).toBeVisible();
  await page.goBack();
  // Coming back to a flight PARSES AND ANALYSES it again, which a navigation never used to do
  // because the report used to evaporate — so the wait is generous on purpose. It is NOT what
  // used to fail here: see the note on `waitForURL` above.
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });
  await openPanel();
  await expect(page.locator('#report-label')).toHaveValue('Nimbus IV · J450 · L2 attempt');

  // …and a full reload, which re-saves the flight on the way in. `saveRecent` rebuilds the
  // record, so the caption has to be inherited there the way the note and the device summary
  // already are, or reopening wipes it — the second time, not the first.
  await page.reload();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });
  await openPanel();
  await expect(page.locator('#report-label')).toHaveValue('Nimbus IV · J450 · L2 attempt');
  await expect(page.locator('#report-notes')).toHaveValue('Gusty, 12 kt crosswind.');

  // A different flight starts clean — a caption belongs to its flight, not to the device.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('heading', { name: /Flight report for other/ })).toBeVisible();
  await openPanel();
  await expect(page.locator('#report-label')).toHaveValue('');
});


// A flyer who opened flight 2 of a launch day and then went away comes back to flight 2. The
// reload path is covered in analyze.spec.ts; this is the other way back in — out of the
// logbook, which re-parses the file from its stored text and has to find the stretch again.
test('the logbook comes back to the stretch the flyer chose, not to Debrief’s own read', async ({ page }) => {
  const rows: string[] = ['Time (s),Altitude (m)'];
  let t = 0;
  const push = (a: number) => {
    rows.push(`${t.toFixed(1)},${a.toFixed(1)}`);
    t += 0.1;
  };
  for (const apogee of [300, 1200]) {
    const climb = Math.round(Math.sqrt((2 * apogee) / 9.80665) / 0.1);
    const fall = Math.round(apogee / 15 / 0.1);
    for (let i = 0; i < 20; i++) push(0);
    for (let i = 0; i <= climb; i++) push(apogee * Math.sin((Math.PI / 2) * (i / climb)));
    for (let i = 1; i <= fall; i++) push(Math.max(0, apogee * (1 - i / fall)));
    for (let i = 0; i < 20; i++) push(0);
  }
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'two-flights.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await page
    .getByRole('region', { name: '2 flights in this file' })
    .getByRole('button', { name: /Flight 2/ })
    .click();
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700); // the write is fire-and-forget, like the caption's

  // Leave the flight entirely, then open it again from the logbook.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
  await page.getByRole('button', { name: /two-flights\.csv/ }).first().click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-reading="Apogee"]')).toContainText(/3,9\d\d ft|4,0\d\d ft/);
});

// The app's ONLY irreversible action, audited armed, in both schemes.
//
// Its twin on the privacy page has had this since a hand-run audit caught that control's first
// contrast failure (white on amber-600, 3.19:1) with nothing guarding it. This panel had no such
// case, and on 2026-08-02 it changed treatment — off a hand-rolled red box onto `Card
// tone="danger"`, which is a different fill, a different border and a different body size. A
// colour change on a destructive confirm is exactly the regression class that audit exists for,
// so the two confirms are now guarded the same way rather than one of them being guarded because
// it happened to break once.
for (const scheme of ['light', 'dark'] as const) {
  test(`the clear-confirm passes an accessibility audit while it is armed (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name: 'audited.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    const confirm = page.getByRole('alert').filter({ hasText: 'Delete' });
    await expect(confirm).toBeVisible();
    // Assert the panel is actually up before auditing it — an audit of a page whose confirm never
    // opened passes for the wrong reason, which is the failure mode this whole file guards against.
    await expect(confirm.getByRole('button', { name: 'Keep them' })).toBeFocused();

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

// `DESIGN.md` §5's loading and error states on the logbook. Checked against the BUILT ARTIFACT
// because that is where the consequence lives: every route is a static export, so whatever the
// logbook renders with an empty `recents` is baked into `out/index.html`, and until the bundle
// hydrates and IndexedDB answers that is what a flyer with a full logbook sees. The source shows
// the race plainly enough (`useState<RecentMeta[]>([])` with an async effect); what the static
// export adds is that it is on EVERY cold load rather than a flicker.
test('the prerendered page does not tell a returning flyer their logbook is empty', async ({ request }) => {
  // Fetched, not visited: this is the HTML before a single line of JS has run, which is exactly
  // what a cold load paints first.
  for (const route of ['/', '/compare/']) {
    const res = await request.get(route);
    expect(res.ok(), `${route} served`).toBe(true);
    const html = await res.text();
    // Asserted on the empty state's CONTROL, not on its prose. The first version of this test
    // matched two exact sentences that are also written out in the component and in five comment
    // blocks, so adding a full stop to one of them would have turned it green with the defect
    // fully restored. A control is what the flyer can act on and what the state is FOR.
    expect(html, `${route} must not offer to restore a backup before it has looked`).not.toContain(
      '>Restore it<',
    );
    expect(html, `${route} says it is looking, exactly once`).toMatch(
      /Looking for flights remembered on this device|Checking this device for remembered flights/,
    );
    const marks =
      (html.match(/Looking for flights remembered on this device/g) ?? []).length +
      (html.match(/Checking this device for remembered flights/g) ?? []).length;
    expect(marks, `${route} says it once, not once per surface`).toBe(1);
  }
});

test('the logbook resolves out of loading into the flights it actually holds', async ({ page }) => {
  // The transition the change is named for. Without this, `setStatus('loading')` unconditionally
  // would pass every other assertion here — the prerendered page would look right and the app
  // would simply never show a logbook again.
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'cert.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  // The flight is listed, and nothing is still claiming to be looking for it.
  await expect(page.getByText('cert.csv').first()).toBeVisible();
  await expect(page.getByText(/Looking for flights remembered on this device/)).toHaveCount(0);
  // …and a reload, which is where the prerendered empty state used to be shown to this flyer,
  // lands on their flight rather than on an offer to restore a backup.
  await page.reload();
  await expect(page.getByText('cert.csv').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore it' })).toHaveCount(0);
});

test('a browser that refuses storage says so, instead of promising to remember', async ({ page }) => {
  // The refusal `listRecents` used to swallow: with no IndexedDB the read throws, and the old
  // code returned [] — indistinguishable from a flyer who has never opened a flight, so the
  // surface offered "flights you open are remembered here on this device" to someone for whom
  // that had just stopped being true.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined });
  });
  await page.goto('/');
  await expect(page.getByText(/won.t let Debrief read or keep a logbook/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore it' })).toHaveCount(0);
  // And the analysis still works — the refusal is about keeping, not about reading a file.
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'cert.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
});
