import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

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
