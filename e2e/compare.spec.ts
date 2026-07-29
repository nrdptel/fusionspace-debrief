import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const fixture = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The filenames listed in a ZIP's central directory — enough to prove a bundle
// packs what it should, without a ZIP library.
function zipEntryNames(buf: Buffer): string[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP archive');
  const count = buf.readUInt16LE(eocd + 8);
  let p = buf.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

// Load two different real flights, then compare them from the recents list. This
// exercises the full multi-flight path: re-parse + re-analyze each saved file,
// align at liftoff, and render the side-by-side table and overlaid charts.
test('compare two flights from the recents list', async ({ page }) => {
  await page.goto('/');

  const load = async (file: string) => {
    await page.getByLabel('Choose a flight log file').setInputFiles(fixture(file));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };

  await load('altusmetrum-telemetrum.csv');
  await load('featherweight-raven-fip.csv');

  // With two flights remembered, the logbook offers sorting and crowns a best.
  await expect(page.getByRole('button', { name: 'Apogee' })).toBeVisible();
  await page.getByRole('button', { name: 'Apogee' }).click();
  await expect(page.getByText(/marks your best/)).toBeVisible();

  await page.getByLabel('Select altusmetrum-telemetrum.csv to compare').check();
  await page.getByLabel('Select featherweight-raven-fip.csv to compare').check();
  await page.getByRole('button', { name: /Compare 2 flights/ }).click();

  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();

  // The engineering metrics are in the table too.
  await expect(page.getByRole('rowheader', { name: 'Max Mach', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Max Q', exact: true })).toBeVisible();

  // The comparison gets a Spread column — how far apart the readings are on each metric
  // (redundant-altimeter agreement, or flight-to-flight change).
  await expect(page.getByRole('columnheader', { name: 'Spread' })).toBeVisible();
  // The apogee row shows a percentage difference between the two flights.
  const apogeeRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Apogee', exact: true }) });
  await expect(apogeeRow.getByText(/^\d+(\.\d)?%$/)).toBeVisible();

  // Switch which quantity is overlaid across the flights, including the derived
  // engineering channels (Mach, dynamic pressure).
  await expect(page.getByRole('heading', { name: /Altitude/ })).toBeVisible();
  await page.getByRole('button', { name: 'Acceleration', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Acceleration \(g\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mach', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mach', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dynamic pressure', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Dynamic pressure \((kPa|psi)\)/ })).toBeVisible();

  // Any metric row orders the flight columns — a launch day is several files at once,
  // and "which went highest" shouldn't mean reading across the table by eye. The order
  // carries into the exports below, which read the same array.
  const metricsTable = page
    .locator('table')
    .filter({ has: page.getByRole('rowheader', { name: 'Apogee', exact: true }) });
  const flightColumns = async () =>
    (await metricsTable.getByRole('columnheader').allInnerTexts())
      .map((t) => t.split('\n')[0].trim())
      .filter((t) => t && !/^metric/i.test(t) && !/^spread$/i.test(t));
  const loadedOrder = await flightColumns();
  expect(loadedOrder).toHaveLength(2);
  const apogeeHeader = apogeeRow.getByRole('rowheader', { name: 'Apogee', exact: true });
  const apogeeSort = apogeeHeader.getByRole('button', { name: 'Apogee', exact: true });

  await apogeeSort.click(); // highest first
  await expect(apogeeHeader).toHaveAttribute('aria-sort', 'descending');
  const desc = await flightColumns();
  await apogeeSort.click(); // lowest first
  await expect(apogeeHeader).toHaveAttribute('aria-sort', 'ascending');
  expect(await flightColumns()).toEqual([...desc].reverse());

  // A third click (or the explicit escape) puts them back the way they loaded.
  await page.getByRole('button', { name: 'clear sort' }).click();
  expect(await flightColumns()).toEqual(loadedOrder);

  // Export the comparison — the chart data, the metrics table, and a PNG.
  const [dataCsv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save chart data' }).click(),
  ]);
  expect(dataCsv.suggestedFilename()).toMatch(/^compare-.*\.csv$/);
  const [metricsCsv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save metrics' }).click(),
  ]);
  expect(metricsCsv.suggestedFilename()).toBe('compare-metrics.csv');

  // …and as a single self-contained HTML comparison report: the cross-check, the metrics
  // matrix and the overlay charts inline, in one portable file.
  const [htmlDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .html' }).click(),
  ]);
  expect(htmlDl.suggestedFilename()).toBe('compare-debrief.html');
  const htmlStream = await htmlDl.createReadStream();
  const cmpHtml = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    htmlStream!.on('data', (c) => chunks.push(Buffer.from(c)));
    htmlStream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    htmlStream!.on('error', reject);
  });
  expect(cmpHtml.startsWith('<!doctype html>')).toBe(true);
  // The cross-check narrative. Its lede is chosen by the spread, so assert the sentence rather
  // than one of its two openings — and then assert the RIGHT opening for these two flights,
  // which are a launch day apart rather than two recordings of one flight. Reading "agree to
  // within 160% on apogee" is how this used to render, which is not English.
  expect(cmpHtml).toMatch(/If these are recordings of the same flight, the independent readings (agree to within|differ by) /);
  expect(cmpHtml, 'two flights 160% apart do not "agree to within"').toMatch(/independent readings differ by /);
  expect(cmpHtml).toContain('<svg'); // overlay chart embedded inline
  expect(cmpHtml).not.toMatch(/<script/i); // self-contained, no script or external asset

  // A vector (SVG) export of the overlay, for reports — one path per compared flight.
  // Overlay altitude first: both flights have a finite altitude curve, so the path
  // count is deterministic.
  await page.getByRole('button', { name: 'Altitude', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Altitude/ })).toBeVisible();
  const exportSvg = async () => {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save .svg' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^compare-.*\.svg$/);
    const stream = await dl.createReadStream();
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream!.on('data', (c) => chunks.push(Buffer.from(c)));
      stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream!.on('error', reject);
    });
  };
  const body = await exportSvg();
  expect(body).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect((body.match(/<path /g) ?? []).length).toBe(2); // one curve per flight
  // A report figure defaults to a light background whatever the app theme is.
  expect(body).toContain('fill="#ffffff"');
  expect(body).not.toContain('fill="#09090b"');
  // …and the flyer can flip it to dark for a slide deck.
  await page.getByRole('button', { name: /Exported figure background/ }).click();
  const darkBody = await exportSvg();
  expect(darkBody).toContain('fill="#09090b"');

  // The whole comparison as one ZIP: the cross-check write-up, the metrics table,
  // and the overlay figures — a single download instead of a handful of clicks.
  const [bundle] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save bundle' }).click(),
  ]);
  expect(bundle.suggestedFilename()).toBe('compare-debrief.zip');
  const names = zipEntryNames(await readFile(await bundle.path()));
  expect(names).toContain('compare-summary.md');
  expect(names).toContain('compare-metrics.csv');
  expect(names).toContain('compare.json');
  expect(names).toContain('compare-altitude.svg');
  expect(names).toContain('compare-velocity.svg');
  expect(names).toContain('compare-acceleration.svg');
  await expect(page.getByText(/Bundle saved/)).toBeVisible();

  // The compare view should be accessible too.
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  // Leaving a comparison built from the logbook returns to the picker on this surface,
  // with the logbook still there to build the next one from.
  await page.getByRole('button', { name: /Compare other flights/ }).click();
  await expect(page.getByRole('heading', { name: 'Compare flights' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
});

// The overlay chart must actually draw its curves. A shorter flight is NaN-padded
// out to the shared time base, which once left uPlot unable to range the y-axis —
// so the canvas came up blank while the metrics table still looked fine. Guard it
// by checking the chart canvas has real coloured (curve) pixels, not just axes.
test('the overlay chart draws the flight curves', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: /Altitude/ })).toBeVisible();
  const coloured = await page.evaluate(() => {
    const c = document.querySelector('.uplot canvas') as HTMLCanvasElement | null;
    if (!c) return 0;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 40) n++; // a saturated (curve) pixel
    }
    return n;
  });
  expect(coloured).toBeGreaterThan(500);
});

// Comparing a GPS-only flight (whose acceleration is entirely absent) against a
// barometric one, on the Acceleration channel: one series is all-NaN. The axis
// must still range off the other flight and draw its curve, not come up blank.
test('the overlay survives an all-NaN series (mixed GPS + baro)', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('featherweight-gps.csv'), fixture('altusmetrum-telemetrum.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await page.getByRole('button', { name: 'Acceleration', exact: true }).click();
  const coloured = await page.evaluate(() => {
    const c = document.querySelector('.uplot canvas') as HTMLCanvasElement | null;
    if (!c) return 0;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 40) n++;
    }
    return n;
  });
  expect(coloured).toBeGreaterThan(500);
});

// Dropping (choosing) several files at once should import each and jump straight
// into the comparison, no recents round-trip needed.
test('choosing several files at once jumps straight to a comparison', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);

  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();
});

// The cross-check rests on a hypothesis — that these are recordings of one flight — and
// the files can refute it. Where they date the flights a season apart, calling a 139%
// apogee gap an "agreement to within 139%" would dress a comparison of different flights
// as a failed reconciliation.
test('a comparison the files date apart is framed as flight-to-flight, not agreement', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    fixture('altusmetrum-telemetrum.csv'), // GPS UTC, 30 Oct 2021
    fixture('blueraven-app-lr.csv'), // logger clock, 11 May 2024
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  await expect(page.getByText('Flight to flight')).toBeVisible();
  await expect(page.getByText(/The files date these on different days/)).toBeVisible();
  // Named in the app's own date voice, not as raw stamps — and each day attributed to the
  // file that states it, which is how a flyer finds a device carrying a wrong clock.
  await expect(page.getByText(/30 Oct 2021 \(altusmetrum-telemetrum\)/).first()).toBeVisible();
  await expect(page.getByText(/11 May 2024 \(blueraven-app-lr\)/).first()).toBeVisible();
  await expect(page.getByText(/If these are recordings of the same flight/)).toHaveCount(0);
  // The reading rests on the dates alone, and says so where it is made.
  await expect(page.getByText(/a device clock is wrong/)).toBeVisible();

  // …and the saved write-up says the same thing, not the opposite.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .html' }).click(),
  ]);
  const stream = await dl.createReadStream();
  const html = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream!.on('data', (c) => chunks.push(Buffer.from(c)));
    stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream!.on('error', reject);
  });
  expect(html).toContain('Flight to flight');
  expect(html).toContain('The files date these on different days');
  expect(html).toContain('30 Oct 2021 (altusmetrum-telemetrum)');
  expect(html).toContain('a device clock is wrong');
  expect(html).not.toContain('If these are recordings of the same flight');
});

// …and where the files don't refute it, the reconciliation framing stays: two recordings
// with no stated date could be one flight, and Debrief doesn't decide that for the flyer.
test('with no stated dates the cross-check keeps its conditional framing', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('aim-xtra.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByText(/If these are recordings of the same flight/)).toBeVisible();
  await expect(page.getByText('Flight to flight')).toHaveCount(0);
});

// One decision about which readings matter, not one per surface: the choice made on a
// flight report is already made for the comparison, and the other way round.
test('the reading chooser is one choice shared by both surfaces', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('aim-xtra.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Burn time', exact: true })).toBeVisible();

  const toggle = page.locator('summary', { hasText: "Choose what's in this comparison" });
  await toggle.click();
  await page.getByRole('checkbox', { name: 'Burn time' }).uncheck();
  await expect(page.getByRole('rowheader', { name: 'Burn time', exact: true })).toHaveCount(0);
  await toggle.click();

  // …and the same reading is gone from a single flight's report, without being turned off
  // a second time there.
  await page.getByRole('button', { name: /Back to a single flight/ }).click();
  await page.getByLabel('Choose a flight log file').setInputFiles(fixture('altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await expect(page.getByText('Burn time', { exact: true })).toHaveCount(0);
  await expect(page.getByText('1 off')).toBeVisible();

  // The Markdown of the comparison follows it too.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('aim-xtra.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save bundle' }).click(),
  ]);
  const names = zipEntryNames(await readFile(await dl.path()));
  expect(names).toContain('compare-summary.md');
});

// Which readings come first is the other half of "this table is mine" — a certification
// package leads with what the certification asks for, not with what Debrief thinks matters.
// The comparison is where that has an exact meaning: one builder feeds the screen, the
// clipboard and every export, so "third from the top" is third from the top everywhere.
test('the comparison’s readings can be reordered, and the order follows into the exports', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('aim-xtra.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  const rowLabels = () => page.getByRole('rowheader').allInnerTexts();
  const before = await rowLabels();
  expect(before[0]).toContain('Apogee');

  await page.locator('summary', { hasText: "Choose what's in this comparison" }).click();
  await page.getByRole('button', { name: 'Move Max Q earlier' }).click();
  await page.getByRole('button', { name: 'Move Max Q earlier' }).click();

  const after = await rowLabels();
  expect(after.findIndex((l) => l.includes('Max Q'))).toBeLessThan(
    before.findIndex((l) => l.includes('Max Q')),
  );

  // …and the saved table is in the same order as the screen.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save metrics' }).click(),
  ]);
  const stream = await dl.createReadStream();
  const csv = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream!.on('data', (c) => chunks.push(Buffer.from(c)));
    stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream!.on('error', reject);
  });
  const csvLabels = csv
    .split('\n')
    .slice(1)
    .map((l) => l.split(',')[0].replace(/"/g, ''))
    .filter(Boolean);
  // The row headers include the flights' own names; compare the readings the two share.
  const onScreen = after.map((l) => l.split('\n')[0].trim()).filter((l) => csvLabels.includes(l));
  expect(onScreen.length).toBeGreaterThan(4);
  expect(csvLabels.filter((l) => onScreen.includes(l))).toEqual(onScreen);
});

// A control that forgets is a control that asks the same question every time. The explorer
// already remembers how a flyer set it up; the comparison's channel didn't, so someone
// comparing a season's boosts clicked past altitude on every single one.
test('the comparison remembers which channel you were looking at', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('aim-xtra.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  // Altitude by default, as before.
  await expect(page.getByRole('heading', { name: /^Altitude/ })).toBeVisible();
  await page.getByRole('button', { name: 'Velocity', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Velocity/ })).toBeVisible();

  // The next comparison opens on velocity, without being asked again.
  await page.getByRole('button', { name: /Back to a single flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Velocity/ })).toBeVisible();
});


// A launch day's folder mixes loggers Debrief auto-detects with files it doesn't. A batch
// drop can't run the column mapper — that needs an answer per file — but leaving those
// files out means starting the launch day over one file at a time and losing the comparison
// already on screen. The comparison now offers to map them, and a mapped file rejoins it.
test('a file a batch drop could not read can be mapped into the comparison it arrived with', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    fixture('altusmetrum-telemetrum.csv'),
    fixture('blueraven-app-lr.csv'),
    fixture('perfectflite-stratologger.csv'), // real, readable, but no auto-detect: it maps
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  // Offered by name, not merely reported as missing.
  const mapIt = page.getByRole('button', { name: /Map perfectflite-stratologger/ });
  await expect(mapIt).toBeVisible();
  await mapIt.click();

  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze flight' }).click();

  // Back to a comparison — now of three flights, at an address that survives a reload.
  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
  expect(page.url()).toContain('/compare?ids=');
  await expect(page.getByText('perfectflite-stratologger').first()).toBeVisible();
});


/** Release a file on the page body, the way a flyer drops one onto a comparison already on
 *  screen — this surface renders no picker in that state. */
async function dropOnWindow(page: import('@playwright/test').Page, name: string, contents: string) {
  // Returns whether the window CANCELLED each gesture, not just whether the app reacted. A
  // browser's default for a dropped file is to navigate to it, so a handler that ingests the
  // file and forgets to `preventDefault` still loses the flyer the page — and a test that only
  // checks the heading passes right through that.
  return page.evaluate(
    ([fileName, text]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], fileName, { type: 'text/csv' }));
      const fire = (type: string) => {
        const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
        document.body.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      fire('dragenter');
      return { over: fire('dragover'), drop: fire('drop') };
    },
    [name, contents] as const,
  );
}

// A launch day does not arrive in one handful. Dropping the rest of it onto a comparison that
// is already on screen used to REPLACE it — the flights you had assembled gone from the view
// and from the address that named them — and dropping a single extra file was worse, because
// one id cannot make a comparison and the whole assembly fell back to the picker. The mapper
// path on this same surface has always appended; the two halves of one gesture disagreed.
test('a drop adds to the comparison on screen instead of replacing it', async ({ page }) => {
  await page.goto('/compare');
  await page
    .getByLabel('Choose flight logs to compare')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  const idsOf = () => new URL(page.url()).searchParams.get('ids')?.split(',') ?? [];
  const first = idsOf();
  expect(first).toHaveLength(2);

  // ONE more file — the case that used to throw the comparison away entirely. It has to be a
  // real DROP: once a comparison is loaded this surface renders no file picker at all, which is
  // exactly why the window-level catch exists and why this path went unnoticed.
  const extra = await readFile(fixture('featherweight-gps.csv'), 'utf8');
  const gesture = await dropOnWindow(page, 'fwgps-extra.csv', extra);
  expect(gesture.over, 'dragover must be cancelled or the browser navigates to the raw CSV').toBe(true);
  expect(gesture.drop, 'and so must the drop').toBe(true);
  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
  const after = idsOf();
  expect(after, 'the flights already there are kept, in that order').toHaveLength(3);
  expect(after.slice(0, 2), 'the two already on screen keep their places').toEqual(first);
  expect(new Set(after).size, `no flight is named twice: ${after.join(',')}`).toBe(3);

  // The address is the comparison, so a reload has to bring the same three back.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
  expect(idsOf()).toEqual(after);

  // Re-dropping a file already in the set doesn't duplicate it.
  await dropOnWindow(page, 'fwgps-extra.csv', extra);
  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
  expect(idsOf(), 'the same file is the same flight, not a fourth column').toEqual(after);
});

// An address can name a flight this device no longer holds — a link from a club thread, cleared
// site data, a flight the logbook's prune forgot. Merging onto what the ADDRESS claimed rather
// than onto what actually loaded left those dead ids in place, where they cost a slot on every
// later drop and no screen could remove them.
test('a comparison drops the ids it could not read, instead of carrying them forever', async ({ page }) => {
  await page.goto('/compare');
  await page
    .getByLabel('Choose flight logs to compare')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  const idsOf = () => new URL(page.url()).searchParams.get('ids')?.split(',') ?? [];
  const live = idsOf();

  // One real flight, one id that reads as nothing.
  await page.goto(`/compare?ids=${live[0]},does-not-exist,${live[1]}`);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  expect(idsOf(), 'the address keeps only what it could actually read').toEqual(live);

  // …and the dead id is not still holding a slot: a drop lands beside the two that survived.
  const extra = await readFile(fixture('featherweight-gps.csv'), 'utf8');
  await dropOnWindow(page, 'fwgps-extra.csv', extra);
  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
  expect(idsOf().slice(0, 2)).toEqual(live);
});
