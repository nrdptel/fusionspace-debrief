import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

// The filenames listed in a ZIP's central directory — enough to prove the bundle
// packs what it should, without a ZIP library. Scans back for the end-of-central-
// directory record, then walks the central headers.
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

// The whole pipeline in a real browser: load a flight, parse + analyze it
// client-side, and render the report with headline numbers.

test('the sample flight analyzes into a report', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  // The report replaces the drop zone; the back-link confirms we're in it.
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  // Headline metric rendered.
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  // The max-Q tile (derived from the atmosphere model) shows up too, with the
  // design-point altitude it occurred at.
  await expect(page.getByText('Max Q', { exact: true })).toBeVisible();
  await expect(page.getByText(/^at /).first()).toBeVisible(); // e.g. "at 1,420 ft"

  // The Max velocity tile carries its provenance, like Max acceleration — the
  // sample logs its own velocity, so it reads "measured", never an unlabelled peak.
  // Addressed by the reading it holds rather than by walking up from its label: the label is
  // its own element now (it carries a link to the definition beside it), so "the parent of
  // the text" is the label row, not the tile. A structural hop like that breaks whenever the
  // markup gains a level, which is exactly what happened.
  const maxVelTile = page.locator('[data-reading="Max velocity"]');
  await expect(maxVelTile).toContainText(/measured|derived/);

  // The flight timeline breaks the flight into its phases (the chips are list
  // items, distinct from the "Boost" zoom-preset button).
  await expect(page.getByRole('heading', { name: 'Flight timeline' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Boost' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Coast' })).toBeVisible();

  // The "Log details" panel expands to the factual read of the file.
  await page.getByText('Log details', { exact: true }).click();
  await expect(page.getByText('Sample rate', { exact: true })).toBeVisible();
  await expect(page.getByText('Channels recorded', { exact: true })).toBeVisible();
});

test('uploading a file through the input analyzes it', async ({ page }) => {
  await page.goto('/');
  const sample = path.join(__dirname, '../public/samples/sample-altusmetrum.csv');
  await page.getByLabel('Choose a flight log file').setInputFiles(sample);

  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // Back to the drop zone resets cleanly.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
});

test('the channel explorer overlays channels and plots any axis', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // The raw (pre-filter) altitude is offered alongside the cleaned one.
  await expect(page.getByLabel('X axis channel').locator('option', { hasText: 'Altitude (raw)' })).toHaveCount(1);

  // The derived engineering channels (Mach, dynamic pressure) are offered too.
  await expect(page.getByLabel('X axis channel').locator('option', { hasText: 'Mach' })).toHaveCount(1);
  await expect(page.getByLabel('X axis channel').locator('option', { hasText: 'Dynamic pressure' })).toHaveCount(1);

  // The live stats panel populates for the full flight before any zoom.
  await expect(page.getByText('Across the whole flight')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'mean' })).toBeVisible();

  // Drag across the explorer chart (the last uPlot on the page) to zoom — the
  // zoom must HOLD and the stats must switch to the selected window. (Regression
  // guard: a chart that re-inits on the view update would snap straight back.)
  const chart = page.locator('.uplot').last();
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.locator('canvas').first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 12 });
    await page.mouse.up();
  }
  await expect(page.getByText('In the selected window')).toBeVisible();

  // Overlay a second channel — velocity's unit differs from altitude's, so it
  // lands on a second (right) axis. This exercises the dual-axis uPlot path.
  await page.getByLabel('Add a channel to the plot').selectOption({ label: 'Velocity' });
  await expect(page.getByText(/Right axis:/)).toBeVisible();
  await expect(page.locator('.uplot canvas').first()).toBeVisible();

  // Both axes are taken now, so a third unit has nowhere to go. It stays in the menu and
  // says so: the list used to FILTER those out, and on a Blue Raven it dropped from eleven
  // entries to five with Mach, dynamic pressure, battery, temperature and tilt simply gone —
  // under a panel whose own line is "Plot any channel your logger recorded".
  const add = page.getByLabel('Add a channel to the plot');
  const blocked = add.locator('option[disabled]');
  expect(await blocked.count(), 'the third-unit channels are still listed').toBeGreaterThan(0);
  await expect(blocked.first()).toContainText(/needs a third axis/);
  // …and the ones that CAN go on are still enabled, so this is a reason, not a lockout.
  const free = add.locator('option:not([disabled])');
  expect(await free.count(), 'same-unit channels remain addable').toBeGreaterThan(1);

  // Put a channel on the X axis (not time) — the path note appears and the Δ/rate
  // columns (meaningless off a time axis) are hidden.
  await page.getByLabel('X axis channel').selectOption({ label: 'Altitude (AGL)' });
  await expect(page.getByText(/Plotting against another channel/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'rate' })).toHaveCount(0);

  // Export what's plotted — the explorer's own CSV (distinct from the report's).
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle(/Save the plotted data/).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/-explore\.csv$/);

  expect(errors).toEqual([]);
});

test('the report exports as one ZIP bundle of summary, data and figures', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  const [bundle] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save bundle' }).click(),
  ]);
  expect(bundle.suggestedFilename()).toMatch(/-debrief\.zip$/);

  const file = await bundle.path();
  const names = zipEntryNames(await readFile(file));
  // The write-up, the analyzed table, the structured JSON, and the headline figures.
  expect(names.some((n) => n.endsWith('-summary.md'))).toBe(true);
  expect(names.some((n) => n.endsWith('-data.csv'))).toBe(true);
  expect(names.some((n) => n.endsWith('-debrief.json'))).toBe(true);
  expect(names.some((n) => n.endsWith('-altitude.svg'))).toBe(true);
  expect(names.some((n) => n.endsWith('-velocity.svg'))).toBe(true);
  expect(names.some((n) => n.endsWith('-acceleration.svg'))).toBe(true);

  // The status line confirms the archive was built locally.
  await expect(page.getByText(/Bundle saved/)).toBeVisible();

  // The structured JSON export downloads on its own and parses to the canonical read.
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .json' }).click(),
  ]);
  expect(json.suggestedFilename()).toMatch(/-debrief\.json$/);
  const stream = await json.createReadStream();
  const text = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream!.on('data', (c) => chunks.push(Buffer.from(c)));
    stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream!.on('error', reject);
  });
  const doc = JSON.parse(text);
  expect(doc.schema).toBe('debrief.flight/1');
  expect(typeof doc.metrics.apogee).toBe('number');
  expect(doc.events.some((e: { type: string }) => e.type === 'apogee')).toBe(true);
});

test('an optional report label and notes reflect on-screen and ride into the exports', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // Open the optional caption disclosure and fill it.
  await page.getByText('Label this report (optional)').click();
  await page.getByLabel('Label', { exact: true }).fill('Nimbus IV · J450 · Flight 3');
  await page.getByLabel('Notes', { exact: true }).fill('Gusty crosswind; drogue at apogee.');

  // It reflects in the report itself (the heading and a notes paragraph, distinct from
  // the textarea that still holds the same text).
  await expect(page.getByRole('heading', { name: 'Nimbus IV · J450 · Flight 3' })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: 'Gusty crosswind; drogue at apogee.' })).toBeVisible();

  // …and rides into the Markdown export.
  const [md] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .md' }).click(),
  ]);
  const stream = await md.createReadStream();
  const text = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream!.on('data', (c) => chunks.push(Buffer.from(c)));
    stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream!.on('error', reject);
  });
  expect(text).toContain('## Nimbus IV · J450 · Flight 3');
  expect(text).toContain('Gusty crosswind');

  // …and the self-contained HTML report carries the same numbers, with the charts inline
  // and nothing to fetch — one file to open, print or archive.
  const [htmlDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .html' }).click(),
  ]);
  expect(htmlDl.suggestedFilename()).toMatch(/-debrief\.html$/);
  const htmlStream = await htmlDl.createReadStream();
  const html = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    htmlStream!.on('data', (c) => chunks.push(Buffer.from(c)));
    htmlStream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    htmlStream!.on('error', reject);
  });
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain('Nimbus IV · J450 · Flight 3');
  expect(html).toContain('<svg'); // charts embedded inline as vector
  expect(html).not.toMatch(/<script/i); // self-contained, no script or external asset
});

test('the printed flight card keeps the numbers and drops the interactive chrome', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // There's a way to print it.
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();

  await page.emulateMedia({ media: 'print' });

  // The headline numbers and events survive onto the card.
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
  await expect(page.getByText('Debrief · Flight Report')).toBeVisible();
  await expect(page.getByText(/debrief\.fusionspace\.co · analyzed/)).toBeVisible();

  // The interactive chrome is gone: the toolbar, the channel explorer, the
  // site header/footer, and the "analyze another" link.
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeHidden();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeHidden();

  await page.emulateMedia({ media: 'screen' });
});

// A measurement instrument has to show the measurements. AltosUI has a data tab and Excel
// is one; reading an exact value off a plot is guesswork. The table is virtualised, so a
// long log stays responsive — only the rows on screen are in the DOM.
test('the explorer shows the samples behind the plot, in the chosen units', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // The disclosure, not the phrase in the page's own how-to copy.
  await page.locator('summary').filter({ hasText: 'Show the samples' }).click();
  await expect(page.getByRole('heading', { name: /Every sample/i })).toBeVisible();

  const table = page.locator('table').last();
  // Headers name the channel and the unit in force.
  await expect(table.locator('thead')).toContainText('Time');
  await expect(table.locator('thead')).toContainText('ft');

  // Thousands of samples, but only a screenful is rendered.
  const count = await page.getByText(/[\d,]+ rows · exact values/).innerText();
  const rows = Number(count.match(/([\d,]+) rows/)![1].replace(/,/g, ''));
  expect(rows).toBeGreaterThan(1000);
  const rendered = await table.locator('tbody tr').count();
  expect(rendered).toBeLessThan(60);

  // Scrolling reaches different samples rather than re-rendering the same ones.
  const firstBefore = await table.locator('tbody tr').nth(1).innerText();
  await page.locator('div.overflow-auto').last().evaluate((el) => el.scrollTo(0, 3000));
  await expect(async () => {
    expect(await table.locator('tbody tr').nth(1).innerText()).not.toBe(firstBefore);
  }).toPass();

  // The unit choice reaches the table like every other number.
  await page.locator('summary').filter({ hasText: 'per quantity' }).click();
  await page.locator('details select').nth(0).selectOption('m');
  await expect(table.locator('thead')).toContainText('m');
});

// A season's tenth flight is read the same way as its ninth. The explorer used to forget
// the configured view on every new flight and every reload — the "controls that forget"
// failure. OpenRocket's plot dialog and AltosUI both keep the series you enabled.
test('the explorer remembers how you set it up', async ({ page }) => {
  const chart = () => page.locator('[aria-label^="Line chart of"]').first();
  const open = async () => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample flight' }).click();
    await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  };

  await open();
  await expect(chart()).toHaveAttribute('aria-label', /Altitude \(AGL\) against Time/);

  // Configure it: overlay a second channel.
  await page.getByLabel('Add a channel to the plot').selectOption({ label: 'Velocity' });
  await expect(chart()).toHaveAttribute('aria-label', /Altitude \(AGL\), Velocity against Time/);

  // A fresh visit opens on the same view.
  await open();
  await expect(chart()).toHaveAttribute('aria-label', /Altitude \(AGL\), Velocity against Time/);
});

// Built-in views: the gap against OpenRocket, whose plot dialog ships quick-select preset
// configurations. Debrief's named views were all flyer-made, so a first-time visitor opened
// the explorer on one channel and built from scratch. These are here on the first visit — and
// only where the flight has every channel the view names.
test('the explorer opens with built-in views, and withholds one the flight cannot show', async ({ page }) => {
  const chart = () => page.locator('[aria-label^="Line chart of"]').first();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // There on the first visit, with nothing saved.
  await expect(page.getByRole('button', { name: 'Altitude & speed', exact: true })).toBeVisible();

  // Each one plots what its name says. The sample is a TeleMetrum: it has a measured
  // acceleration, so all four are offered.
  await page.getByRole('button', { name: 'Mach & max-Q', exact: true }).click();
  await expect(chart()).toHaveAttribute('aria-label', /Mach, Dynamic pressure against Time/);
  await page.getByRole('button', { name: 'Speed & acceleration', exact: true }).click();
  await expect(chart()).toHaveAttribute('aria-label', /Velocity, Acceleration against Time/);
  await page.getByRole('button', { name: 'Raw vs cleaned', exact: true }).click();
  await expect(chart()).toHaveAttribute('aria-label', /Altitude \(raw\), Altitude \(AGL\) against Time/);

  // A PNut is barometric only. "Speed & acceleration" names an acceleration it does not have,
  // so it is not offered at all rather than shown as a one-series plot under a name that
  // promises two.
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/perfectflite-pnut.pf2'));
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Altitude & speed', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speed & acceleration', exact: true })).toHaveCount(0);
});

// Named views: OpenRocket keeps several plot configurations and AltosUI saved graphs, and a
// flyer checking the same few things on every flight of a season wants them by name rather
// than rebuilt each time. Kept on this device, and applied wherever the flight has those
// channels.
test('the explorer keeps named views and applies them to the next flight', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // Build a view: add a second channel to the plot, then name it.
  await page.getByLabel('Add a channel to the plot').selectOption({ label: 'Velocity' });
  await expect(page.getByRole('button', { name: 'Remove Velocity from the plot' })).toBeVisible();
  await page.getByRole('button', { name: '+ Save this view' }).click();
  await page.getByLabel('Name for this view').fill('Boost check');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Exact: the delete button beside it is named "Forget the Boost check view", which a
  // substring match would also claim.
  const chip = page.getByRole('button', { name: 'Boost check', exact: true });
  await expect(chip).toBeVisible();

  // Change the plot, then bring the named view back.
  await page.getByRole('button', { name: 'Remove Velocity from the plot' }).click();
  await expect(page.getByRole('button', { name: 'Remove Velocity from the plot' })).toHaveCount(0);
  await chip.click();
  await expect(page.getByRole('button', { name: 'Remove Velocity from the plot' })).toBeVisible();

  // It survives a reload and a different flight, which is the point of naming it. The
  // comment said "a different flight" long before the test did one — it reloaded and
  // re-loaded the same sample. Now that a report has an address the reload brings this
  // flight back on its own, so the second half can be what it always claimed: a genuinely
  // different log, dropped over the top.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Boost check', exact: true })).toBeVisible();
  // Back to the drop zone first — the report screen has no file input of its own, which is
  // exactly what increment 4's window-level drop was for.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/featherweight-raven-fip.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for featherweight-raven-fip/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Boost check', exact: true })).toBeVisible();

  // And it can be forgotten.
  await page.getByRole('button', { name: 'Forget the Boost check view' }).click();
  await expect(page.getByRole('button', { name: 'Boost check', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Save this view' })).toBeVisible();
});

// Reading the numbers at an event is what a spreadsheet makes you hunt for — scrolling to the
// right row out of tens of thousands. The events are already known, so the sample table can
// be jumped to one.
test('the sample table jumps to a flight event', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Show the samples' }).click();

  const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: /time/i }) }).last();
  await expect(table).toBeVisible();
  // The row jumped to is highlighted, so read the landed sample's x value from it — the
  // rendered slice is virtualized, and its spacer rows are not samples.
  const landedAt = async () =>
    Number(await table.locator('tbody tr[class*="indigo"]').first().locator('td').first().innerText());

  await page.getByRole('button', { name: 'Apogee', exact: true }).click();
  await expect(table.locator('tbody tr[class*="indigo"]')).toHaveCount(1);
  const atApogee = await landedAt();
  expect(atApogee).toBeGreaterThan(1); // seconds into the flight, not the first sample

  // And to a different event, earlier in the flight — which is the point of jumping.
  await page.getByRole('button', { name: 'Liftoff', exact: true }).click();
  await expect.poll(landedAt).toBeLessThan(atApogee);
});

// A second, independent recording of the same altitude — the receiver's, beside the
// barometer's. Two sensors that fail in completely different ways, so where they agree
// that is corroboration; where they don't, the gap is the finding. Shown, never merged.
test('a GPS altitude is carried as a second recording and cross-checks apogee', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  const gps = page.getByRole('region', { name: 'The GPS recording' });
  await expect(gps).toBeVisible();
  // Both readings, stated: the receiver's and the barometer's, with the spread named.
  await expect(gps.getByRole('cell', { name: /9,459 ft/ })).toBeVisible();
  await expect(gps.getByRole('cell', { name: /9,322 ft/ })).toBeVisible();
  await expect(gps.getByText(/agree · \+1\.5%/)).toBeVisible();
  // …and how much of a recording it is, so the reader can weigh it.
  await expect(gps.getByText(/three-dimensional fixes on the way up/)).toBeVisible();

  // The channel itself is plottable against the barometric line, not just summarised.
  await expect(page.getByLabel('X axis channel').locator('option', { hasText: 'altitude (GPS)' })).toHaveCount(1);

  // …and the saved report carries it, or the document says less than the screen it came
  // from — which is exactly what a certification package can't afford.
  const [md] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .md' }).click(),
  ]);
  const stream = await md.createReadStream();
  const text = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream!.on('data', (c) => chunks.push(Buffer.from(c)));
    stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream!.on('error', reject);
  });
  expect(text).toContain('## The GPS recording (cross-check)');
  expect(text).toMatch(/\| Apogee \| 9,459 ft \| 9,322 ft \| agree/);

  // …and the structured document carries it as data, with how to read the pair.
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .json' }).click(),
  ]);
  const jstream = await json.createReadStream();
  const jtext = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    jstream!.on('data', (c) => chunks.push(Buffer.from(c)));
    jstream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    jstream!.on('error', reject);
  });
  const doc = JSON.parse(jtext);
  expect(doc.metrics.gpsApogee).toBeGreaterThan(9000);
  expect(doc.metrics.gpsApogeeAgreement).toBe('agree');
  expect(doc.metrics.gpsAscentFixes).toBeGreaterThan(50);
});

// A report is written for a purpose — a cert package, a drag study, a club post — so which
// readings it carries is the flyer's call, made once and followed by every report format.
test('the readings in a report are the flyer’s choice, and follow into the exports', async ({ page }) => {
  const read = async (dl: import('@playwright/test').Download) => {
    const stream = await dl.createReadStream();
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream!.on('data', (c) => chunks.push(Buffer.from(c)));
      stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream!.on('error', reject);
    });
  };

  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Flight time', { exact: true })).toBeVisible();

  const chooserToggle = page.locator('summary', { hasText: "Choose what's in this report" });
  await chooserToggle.click();
  const chooser = page.getByRole('checkbox', { name: 'Flight time' });
  await expect(chooser).toBeChecked();
  await chooser.uncheck();

  // Gone from the report on screen (only the chooser's own label is left), and the
  // chooser says how many are off.
  await expect(page.getByText('Flight time', { exact: true })).toHaveCount(1);
  await expect(page.getByText('1 off')).toBeVisible();
  // Apogee cannot be turned off — a flight report without one is a different document.
  await expect(page.getByRole('checkbox', { name: 'Apogee', exact: true })).toBeDisabled();

  // Closing it leaves no second copy of any reading's label behind.
  await chooserToggle.click();
  await expect(page.getByRole('checkbox', { name: 'Apogee', exact: true })).toHaveCount(0);

  // …and gone from the exported report, without the choice being made again per format.
  const [md] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .md' }).click(),
  ]);
  const markdown = await read(md);
  expect(markdown).toContain('| Apogee |');
  expect(markdown).not.toContain('| Flight time |');

  // The data export is a record, not a document: it still carries everything.
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .json' }).click(),
  ]);
  expect(JSON.parse(await read(json)).metrics.flightTime).not.toBeNull();

  // Remembered on this device, so the next flight opens the way the last one was left.
  // The reload comes back to the flight: a report has an address now (`?open=<id>`), so this
  // no longer has to re-load the sample by hand to have something to look at.
  await page.reload();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('1 off')).toBeVisible();
});

// A table you can't copy is the tell a spreadsheet has been beating tools on since 1985:
// the club's sheet, the cert document and the email all take a paste, and making a flyer
// round-trip through a saved file for that is a missing affordance, not a design.
test('the readings and the comparison both copy as a real table', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const clip = () =>
    page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const out: Record<string, string> = {};
      for (const item of items) {
        for (const type of item.types) out[type] = await (await item.getType(type)).text();
      }
      return out;
    });

  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Copy table' }).click();
  await expect(page.getByRole('button', { name: 'Copied ✓' })).toBeVisible();
  const one = await clip();
  // Tab-separated for anywhere that takes text…
  expect(one['text/plain']).toMatch(/^Reading\tValue\n/);
  expect(one['text/plain']).toMatch(/\nApogee\t[\d,]+ ft/);
  // …and a real table for a spreadsheet or a document.
  expect(one['text/html']).toContain('<th>Reading</th>');
  expect(one['text/html']).toMatch(/<td>Apogee<\/td>/);

  // The same affordance on the comparison, where a side-by-side table is the whole point.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page.getByLabel('Choose a flight log file').setInputFiles([
    path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'),
    path.join(__dirname, '../lib/parsers/__fixtures__/featherweight-raven-fip.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy table' }).click();
  await expect(page.getByText(/Table copied/)).toBeVisible();

  const two = await clip();
  const head = two['text/plain'].split('\n')[0].split('\t');
  expect(head[0]).toBe('Metric');
  expect(head).toContain('altusmetrum-telemetrum');
  expect(two['text/plain']).toMatch(/\nApogee\t/);
  expect(two['text/html']).toContain('<th>Metric</th>');
});

// A wait a flyer sees. On a phone at the field an 11 MB log takes about six seconds to
// read and analyze, which is long enough that a bare "Reading…" reads as stuck.
test('the wait says what it is reading', async ({ page }) => {
  // Hold the sample fetch open so the loading state can be read rather than raced. The
  // hold is released by the handler's own timer, not by unrouting: `unroute` while this
  // handler is still sleeping hands the route to Playwright, and the `continue()` below
  // then throws "Route is already handled" — a flake that fails a green build about one
  // run in twenty.
  await page.route('**/samples/*.csv', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const note = page.getByRole('status').filter({ hasText: 'Reading' });
  await expect(note).toBeVisible();
  await expect(note).toContainText('the sample flight');

  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
});


// What prints is the record; what doesn't is the chrome. A cross-check added to the report
// belongs in the printed page — a flyer printing for a certification package is printing
// the evidence — while the controls that produced it do not.
test('the printed report keeps the cross-checks and drops the controls', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: 'The GPS recording' })).toBeVisible();
  await expect(page.locator('summary', { hasText: "Choose what's in this report" })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Copy table' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Save .md' })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
});

// A plot of a flight should open on the flight. A logger armed early records the pad
// wait, and one corpus TeleMega holds 308 s of it before a 76 s flight — opened on the
// whole record, four fifths of that chart is a rocket standing still and the boost is a
// sliver. The record either side is never dropped: "Full record" reaches it.
test('the charts open on the flight, not on the pad wait before it', async ({ page }) => {
  const rows = ['Time (s),Alt (ft)'];
  // 300 s on the pad, a 24 s flight, then 10 s on the ground: the flight is 7% of the file.
  for (let t = 0; t < 300; t += 1) rows.push(`${t},0`);
  for (let i = 0; i <= 240; i++) {
    const t = 300 + i * 0.1;
    const dt = t - 302;
    rows.push(`${t.toFixed(1)},${Math.max(0, Math.round(2000 - 15 * dt * dt))}`);
  }
  for (let t = 325; t < 335; t += 1) rows.push(`${t},0`);

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'long-pad-wait.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  // The zoom row reports which view is showing, and it opens on the flight.
  const flight = page.getByRole('button', { name: 'Flight', exact: true });
  await expect(flight).toHaveAttribute('aria-pressed', 'true');
  const full = page.getByRole('button', { name: 'Full record' });
  await expect(full).toHaveAttribute('aria-pressed', 'false');

  // …and the whole record is one click away, which then reads as the active view.
  await full.click();
  await expect(full).toHaveAttribute('aria-pressed', 'true');
  await expect(flight).toHaveAttribute('aria-pressed', 'false');

  // The opening window must be an ordinary zoom, not a pinned axis. Setting it through
  // uPlot's scales.x.range does pin it — that callback runs on every setScale, so the
  // charts silently swallowed every zoom and every preset. Drag across the altitude
  // chart: the view has to move off any preset, and the reset has to bring it back.
  const chart = page.locator('.uplot').first();
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.locator('canvas').first().boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.35, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await expect(full).toHaveAttribute('aria-pressed', 'false');
  await expect(flight).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.dblclick(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await expect(full).toHaveAttribute('aria-pressed', 'true');
});

// The report/export builder's next slice: a report is written for a purpose, and a
// certification package often wants the altitude trace and nothing else — the velocity and
// acceleration curves are the flyer's working, not the evidence. Which figures travel is a
// choice now, kept on this device, and it reaches every place a figure goes.
test('the figures a report carries are the flyer’s choice, and it holds across formats', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  const velocity = page.getByRole('button', { name: 'Velocity figure', exact: true });
  await expect(velocity).toHaveAttribute('aria-pressed', 'true');

  // Everything on by default: the bundle carries all three.
  const bundleNames = async () => {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save bundle' }).click(),
    ]);
    return zipEntryNames(await readFile(await dl.path()));
  };
  const before = await bundleNames();
  expect(before.some((n) => n.endsWith('-velocity.svg'))).toBe(true);

  // Turn velocity off — the chart stays on screen (that's the analysis), the figure leaves
  // the document (that's the report).
  await velocity.click();
  await expect(velocity).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: /^Velocity \(/ })).toBeVisible();

  const after = await bundleNames();
  expect(after.some((n) => n.endsWith('-altitude.svg'))).toBe(true);
  expect(after.some((n) => n.endsWith('-velocity.svg'))).toBe(false);

  // …and the self-contained HTML report agrees with the bundle.
  const [htmlDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .html' }).click(),
  ]);
  const html = (await readFile(await htmlDl.path())).toString('utf8');
  // The figure captions the HTML report actually writes — not a substring that would be
  // present either way, which is an assertion that can't fail.
  expect(html).toContain('<figcaption>Altitude</figcaption>');
  expect(html).not.toContain('<figcaption>Velocity</figcaption>');

  // The choice is remembered on this device, like the units and the readings.
  // The reload comes back to the flight: a report has an address now (`?open=<id>`), so this
  // no longer has to re-load the sample by hand to have something to look at.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Velocity figure', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

// A raw sample table you cannot sort is a spreadsheet with the useful half removed. On a
// flight log it is not decoration either: sorting altitude descending is how a flyer tells a
// real apogee from a one-sample spike, because the top of the list shows the gap.
test('the sample table sorts by any column, and returns to sample order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  await page.locator('summary', { hasText: 'Show the samples' }).click();

  const table = page.locator('table').filter({ has: page.getByRole('button', { name: /^Time/ }) }).first();
  const firstCell = () => table.locator('tbody tr').first().locator('td').first();
  const secondCol = () => table.locator('tbody tr').first().locator('td').nth(1);

  // Sample order first: the table opens on the recording's own order, ascending in time.
  const t0 = await firstCell().innerText();
  const t1 = await table.locator('tbody tr').nth(1).locator('td').first().innerText();
  expect(Number(t1)).toBeGreaterThan(Number(t0));

  // Sort by the altitude column, descending: the top row must be the highest sample.
  // The sort control, not the column's copy button beside it.
  // "Altitude (AGL)" exactly: the table now shows every channel the file holds, so the raw
  // altitude sits beside the cleaned one and a /^Altitude/ locator matches both.
  const altHeader = table.getByRole('button', { name: /^Altitude \(AGL\)/ });
  await altHeader.click();
  const top = Number(await secondCol().innerText());
  const next = Number(await table.locator('tbody tr').nth(1).locator('td').nth(1).innerText());
  expect(top).toBeGreaterThanOrEqual(next);
  expect(top).toBeGreaterThan(Number(t0));
  // Announced to a screen reader, not only drawn.
  await expect(table.locator('th', { hasText: 'Altitude (AGL)' })).toHaveAttribute('aria-sort', 'descending');

  // Second click flips it; the third puts the samples back in the order they were recorded.
  await altHeader.click();
  await expect(table.locator('th', { hasText: 'Altitude (AGL)' })).toHaveAttribute('aria-sort', 'ascending');
  expect(Number(await secondCol().innerText())).toBeLessThanOrEqual(top);
  await altHeader.click();
  await expect(table.locator('th', { hasText: 'Altitude (AGL)' })).toHaveAttribute('aria-sort', 'none');
  expect(await firstCell().innerText()).toBe(t0);
});

// The last thing this table couldn't do that a spreadsheet can: hand you one channel. The
// whole set has always been a CSV away, but "save it, find it, open it, delete the other
// columns" is the workflow the table exists to replace — a flyer wanting the descent rates
// in a club sheet wants one column, not eleven.
test('one channel copies out of the sample table on its own', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  await page.locator('summary', { hasText: 'Show the samples' }).click();

  const table = page.locator('table').filter({ has: page.getByRole('button', { name: /^Time/ }) }).first();
  await table.getByRole('button', { name: /Copy the Altitude \(AGL\).* column/ }).click();
  await expect(page.getByText(/copied — [\d,]+ rows/)).toBeVisible();

  const text = await page.evaluate(() => navigator.clipboard.readText());
  const lines = text.trim().split('\n');
  // One column: its own header, then a value per row — not the whole table.
  expect(lines[0]).toMatch(/^Altitude/);
  expect(lines.length).toBeGreaterThan(50);
  expect(lines[1]).not.toContain('\t');
  expect(Number(lines[1])).not.toBeNaN();
});

// Benchmarked against AltosUI, which has offered a Google Earth export for years: a GPX
// track says where the rocket went on the ground, and KML says where it went, full stop.
test('a GPS flight saves as KML for Google Earth', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save KML' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/-track\.kml$/);
  const kml = (await readFile(await dl.path())).toString('utf8');
  expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
  expect(kml).toContain('<altitudeMode>relativeToGround</altitudeMode>');
  // Real fixes, with a height on them — not a flat line at zero.
  const coords = kml.match(/<coordinates>([^<]+)<\/coordinates>/g) ?? [];
  expect(coords.length).toBeGreaterThan(0);
  const triples = (kml.match(/-?\d+\.\d+,-?\d+\.\d+,\d+\.\d/g) ?? []);
  expect(triples.length).toBeGreaterThan(20);
  expect(triples.some((t) => Number(t.split(',')[2]) > 100)).toBe(true);
});

// Which flight events are called out on the plot — the other half of the OpenRocket plot-tab
// benchmark. Debrief drew all of them, and measured over the corpus that crowds nearly every
// flight: 28 of 30 have two markers inside 6% of the plotted span, the tightest a burnout and
// an apogee 0.10% apart on a 99-second record.
test('the explorer lets you choose which events are called out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // The markers are drawn on the canvas, so the chart's accessible name is what says which
  // are called out — the same sentence a screen reader gets.
  const chart = page.locator('[aria-label^="Line chart of"]').first();
  // Named by what it does, not just by the event: the sample table's "Jump to" row below has
  // a "Burnout" button that scrolls the table instead.
  const burnout = page.getByRole('button', { name: /marking burnout on the plot|^Mark burnout on the plot$/i });

  // Everything is on to start with — nothing has to be opted into.
  await expect(burnout).toHaveAttribute('aria-pressed', 'true');
  await expect(chart).toHaveAttribute('aria-label', /Events marked:.*burnout/);

  // Turn it off, and the marker goes with it.
  await burnout.click();
  await expect(burnout).toHaveAttribute('aria-pressed', 'false');
  await expect(chart).not.toHaveAttribute('aria-label', /burnout/);
  await expect(chart).toHaveAttribute('aria-label', /Events marked:.*apogee/);
  // Apogee is untouched — this picks one event, not all of them.
  await expect(page.getByRole('button', { name: /marking apogee on the plot/i })).toHaveAttribute('aria-pressed', 'true');

  // …and the choice survives a reload and the next flight, like the saved view does.
  // The reload comes back to the flight: a report has an address now (`?open=<id>`), so this
  // no longer has to re-load the sample by hand to have something to look at.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  const burnoutAgain = page.getByRole('button', { name: /burnout on the plot/i });
  await expect(burnoutAgain).toHaveAttribute('aria-pressed', 'false');
  await burnoutAgain.click();
  await expect(page.getByRole('button', { name: /burnout on the plot/i })).toHaveAttribute('aria-pressed', 'true');
});

// The timeline caption is the one line that claims to summarise the whole flight, and it
// said "liftoff to landing" whatever the record held — "2.6 s liftoff to landing" on a
// 3,548 ft log whose last sample is still climbing at 1,057 ft/s, and the same claim on 15
// of the 42 corpus flights that render a timeline at all. Both directions are checked here
// because the fix has to be a distinction, not a removal.
test('the timeline says what its span actually covers', async ({ page }) => {
  // A complete flight, up and back to the pad, resting there.
  const landed =
    'Time,Altitude\n' +
    Array.from({ length: 240 }, (_, i) => {
      const t = i * 0.25;
      const ft = t - 2;
      const alt = ft <= 0 ? 0 : ft <= 10 ? 600 * (1 - (1 - ft / 10) ** 2) : Math.max(0, 600 - 15 * (ft - 10));
      return `${t.toFixed(2)},${alt.toFixed(1)}`;
    }).join('\n');

  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({ name: 'landed.csv', mimeType: 'text/csv', buffer: Buffer.from(landed) });
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('heading', { name: 'Flight timeline' })).toBeVisible();
  const spanLanded = page.getByRole('heading', { name: 'Flight timeline' }).locator('xpath=following-sibling::span[1]');
  await expect(spanLanded).toContainText('liftoff to landing');

  // The same climb, cut off at apogee — the record never comes down.
  const truncated =
    'Time,Altitude\n' +
    Array.from({ length: 50 }, (_, i) => {
      const t = i * 0.25;
      const ft = t - 2;
      const alt = ft <= 0 ? 0 : 600 * (1 - (1 - Math.min(ft, 10) / 10) ** 2);
      return `${t.toFixed(2)},${alt.toFixed(1)}`;
    }).join('\n');

  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({ name: 'truncated.csv', mimeType: 'text/csv', buffer: Buffer.from(truncated) });
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('heading', { name: 'Flight timeline' })).toBeVisible();
  const spanCut = page.getByRole('heading', { name: 'Flight timeline' }).locator('xpath=following-sibling::span[1]');
  await expect(spanCut).toContainText('liftoff to the end of the record');
  await expect(spanCut).not.toContainText('liftoff to landing');
});

// One instant, two clocks, neither named. The Events list is on the log's own clock, which is
// what the charts are drawn against; every reading is on seconds-since-liftoff, which is what
// a flyer quotes. On a file whose clock doesn't start at liftoff those are different numbers
// for the same moment — the ground-station GPS log put apogee at 973.0 s in Events and 13.0 s
// in the grid, and 27 of the corpus's 45 flights disagree by half a second or more.
test('the events list names its clock, so it reconciles with the readings', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altimetercloud-mercury.csv'));
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // The note names the clock and where liftoff falls on it.
  const note = await page.evaluate(() => {
    const h = document.getElementById('events');
    const s = h?.parentElement?.querySelector('span');
    return s?.textContent?.trim() ?? '';
  });
  expect(note, `events clock note: ${note}`).toMatch(/log clock · liftoff at [\d.,]+ s/);
  const liftoff = Number((note.match(/liftoff at ([\d.,]+) s/) ?? [])[1]?.replace(/,/g, ''));
  expect(liftoff, 'this fixture does not start at liftoff, which is the point').toBeGreaterThan(1);

  // …and the two clocks reconcile: the grid's time-to-apogee plus the offset is the Events one.
  const grid = await page.locator('div.grid').first().innerText();
  const toApogee = Number((grid.match(/([\d.,]+) s to apogee/) ?? [])[1]?.replace(/,/g, ''));
  expect(Number.isFinite(toApogee), `grid should state a time to apogee; got: ${grid.slice(0, 80)}`).toBe(true);
  const apogeeOnLogClock = await page.evaluate(() => {
    const h = document.getElementById('events');
    const block = h?.parentElement?.parentElement;
    const row = [...(block?.querySelectorAll('div') ?? [])].find((d) => /^Apogee\b/.test((d as HTMLElement).innerText ?? ''));
    return Number(((row as HTMLElement)?.innerText.match(/([\d.,]+)\s*s/) ?? [])[1]?.replace(/,/g, ''));
  });
  expect(Number.isFinite(apogeeOnLogClock), 'the events list states an apogee time').toBe(true);
  expect(Math.abs(liftoff + toApogee - apogeeOnLogClock), `${liftoff} + ${toApogee} should be ${apogeeOnLogClock}`).toBeLessThan(0.6);
});

// The ground track used to be a picture: a canvas with role="img" and no handler on it, so
// "where was it at 40 s, and how far is that from the road" could only be answered by
// exporting KML and opening Google Earth. It reads now — by pointer, by touch and by
// keyboard.
test('the ground track can be read at a point, without a mouse', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: 'Recovery' })).toBeVisible();

  const map = page.locator('canvas[aria-describedby="ground-track-readout"]');
  const readout = page.locator('#ground-track-readout');
  await map.scrollIntoViewIfNeeded();
  // Nothing is claimed until something is picked, and the line says how to pick one.
  await expect(readout).toContainText(/arrow keys/);

  // The keyboard path. PageDown steps event to event, which is how a flight's shape is
  // read off the ground in four keystrokes rather than four hundred.
  await map.focus();
  await expect(map).toBeFocused();
  await page.keyboard.press('Home');
  await expect(readout).not.toContainText(/arrow keys/);
  await page.keyboard.press('PageDown'); // liftoff
  await page.keyboard.press('PageDown'); // burnout
  const atBurnout = (await readout.innerText()).trim();
  expect(atBurnout, `burnout reading: ${atBurnout}`).toMatch(/after burnout/);
  // What the map states is a GROUND position, and only that. It deliberately carries no
  // altitude: the honest ascent height is `altAt`'s (lib/analyze/index.ts), which withholds
  // only where the barometric trace is actually contradicted, and a fourth surface guessing
  // at that rule disagreed with the Events list in both directions during review — first
  // publishing −694 ft at a burnout the Events list prints "—" for, then withholding a
  // burnout height the Events list publishes as 1,600 ft.
  expect(atBurnout, `the map must not state a height: ${atBurnout}`).not.toMatch(/AGL/);
  expect(atBurnout).toMatch(/from pad · \d+° [NESW]+/);

  // The time is on the LOG's clock, like the Events list beside it — and where that clock
  // doesn't start at liftoff, the readout says so rather than printing a bare number that
  // disagrees with every reading in the grid.
  const eventsNote = await page.evaluate(() => {
    const h = document.getElementById('events');
    return h?.parentElement?.querySelector('span')?.textContent?.trim() ?? '';
  });
  const mapNamesClock = /log clock · liftoff at/.test(atBurnout);
  expect(
    mapNamesClock,
    `the map and the Events list must make the same call about naming the clock; events said "${eventsNote}", map said "${atBurnout}"`,
  ).toBe(/log clock · liftoff at/.test(eventsNote));

  await page.keyboard.press('PageDown'); // apogee
  await expect(readout).toContainText(/after apogee/);

  // Escape puts it back, so a reading is never a state with no way out of it.
  await page.keyboard.press('Escape');
  await expect(readout).toContainText(/arrow keys/);

  // The key names the events the dots on the track are drawn for, in flight order.
  const key = page.getByRole('list', { name: 'What the dots on the map mark' });
  await expect(key).toContainText('Liftoff');
  await expect(key).toContainText('Apogee');

  // And the pointer reads the same element, rather than a second readout that can disagree.
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.5);
  await expect(readout).not.toContainText(/arrow keys/);
  await page.mouse.move(box.x - 80, box.y - 80);
  await expect(readout).toContainText(/arrow keys/);

  // A gesture the browser takes for scrolling is not a choice. The map deliberately does
  // not own the touch action (a thumb must be able to scroll the report past a 356 px
  // block), so a finger landing on it fires pointerdown — and then pointercancel when the
  // UA claims the gesture. Without clearing on that, scrolling past the map leaves a
  // distance and bearing for a fix nobody picked, with Escape the only way out and no
  // keyboard on a phone.
  await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-describedby="ground-track-readout"]')!;
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.5, bubbles: true, pointerType: 'touch' }));
  });
  await expect(readout).not.toContainText(/arrow keys/);
  await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-describedby="ground-track-readout"]')!;
    c.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch' }));
  });
  await expect(readout).toContainText(/arrow keys/);

  // Hovering is not a choice either: the visible line follows the pointer, but nothing is
  // announced. A live region fed from pointermove reads a new position aloud per pixel.
  const spoken = page.locator('p.sr-only[role="status"]');
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.5);
  await expect(readout).not.toContainText(/arrow keys/);
  await expect(spoken).toHaveText('');
  await map.focus();
  await page.keyboard.press('End');
  await expect(spoken).toContainText(/from the pad, bearing/);
});

// The two asserts above that this fixture cannot exercise, on the one that can:
// `featherweight-gps-groundstation.csv` carries a Landing event AND a log clock that starts
// 180 s before liftoff. Split out rather than left in the first test, where both passed
// while proving nothing — the file has no landing event and its clock offset is 0.
test('the recovery map marks a landing once, and names the clock it reads', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/featherweight-gps-groundstation.csv'));
  await expect(page.getByRole('heading', { name: 'Recovery' })).toBeVisible();

  // The Events list has a Landing, so the omission below is a decision, not an absence.
  const events = page.locator('#events').locator('xpath=../..');
  await expect(events).toContainText('Landing');

  // …and the map's key does NOT repeat it. The ✕ already marks the landing, placed at
  // `stats.landingIndex` — the last valid fix — while the landing event has its own index.
  // On featherweight-gps.csv those are samples 479 and 474: a second dot would put a second
  // landing position on the same card, a different distance from the pad than the stat
  // grid right beneath it.
  const key = page.getByRole('list', { name: 'What the dots on the map mark' });
  await expect(key).toContainText('Apogee');
  await expect(key).not.toContainText('Landing');

  // This file's clock starts 180 s before liftoff, so a bare time off the map would
  // disagree with every reading in the grid — apogee reads 193 s here and 13 s there.
  // Both surfaces name the clock, from one helper (lib/readings.ts), or neither does.
  const map = page.locator('canvas[aria-describedby="ground-track-readout"]');
  const readout = page.locator('#ground-track-readout');
  await map.scrollIntoViewIfNeeded();
  await map.focus();
  await page.keyboard.press('End');
  await expect(readout).toContainText(/log clock · liftoff at/);
  const eventsNote = await page.evaluate(() => {
    const h = document.getElementById('events');
    return h?.parentElement?.querySelector('span')?.textContent?.trim() ?? '';
  });
  const mapNote = ((await readout.innerText()).match(/log clock · liftoff at [\d.,]+ s/) ?? [''])[0];
  expect(mapNote, `map "${mapNote}" vs events "${eventsNote}"`).toBe(eventsNote);
});

/** Drop a real file onto an arbitrary element, the way a browser does — DataTransfer and all.
 *  Returns whether the page cancelled the events, which is the only thing standing between a
 *  dropped log and the browser navigating away from Debrief to render it. */
/** Wait until the window's file-drop listener is actually attached.
 *
 *  It goes on in an effect (`components/useWindowFileDrop.ts`), so a synthetic `DragEvent`
 *  dispatched straight after `goto` can arrive before hydration and land on nothing —
 *  `dragover` comes back uncancelled and the test reads it as "the browser owns the drop".
 *  A flyer cannot drag a file faster than the page mounts; a script can, which is why this
 *  races here and nowhere a person is involved. `dragover` alone ingests nothing, so probing
 *  with it costs the test no state. */
async function waitForWindowDropListener(page: import('@playwright/test').Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const dt = new DataTransfer();
          dt.items.add(new File(['T,Alt\n0,0\n'], 'probe.csv', { type: 'text/csv' }));
          const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
          document.body.dispatchEvent(ev);
          return ev.defaultPrevented;
        }),
      { message: 'the window never started listening for a dropped file' },
    )
    .toBe(true);
}

async function dropFileOn(page: import('@playwright/test').Page, selector: string, name: string, contents: string) {
  return page.evaluate(
    ([sel, fileName, text]) => {
      const file = new File([text], fileName, { type: 'text/csv' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const el = document.querySelector(sel) ?? document.body;
      const fire = (type: string) => {
        const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      fire('dragenter');
      return { over: fire('dragover'), drop: fire('drop') };
    },
    [selector, name, contents] as const,
  );
}

// A browser's default action for a dropped file is to navigate to it. Debrief had two drop
// targets and neither is rendered once a report is open, so the most natural gesture on that
// screen — "read this one, here's the next" — released the file on the altitude chart and
// left the app for a page of raw CSV, taking the report, its zoom, its label and its notes
// with it, none of which have an address to come back to.
test('a flight dropped anywhere is read, instead of throwing the flyer out of the app', async ({ page }) => {
  const csv = readFileSync(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), 'utf8');
  await page.goto('/');
  await waitForWindowDropListener(page);

  // The idle screen, released in the FOOTER — outside the dashed box entirely.
  const first = await dropFileOn(page, 'footer', 'first.csv', csv);
  expect(first.over, 'dragover must be cancelled or the browser owns the drop').toBe(true);
  expect(first.drop).toBe(true);
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  // …and now the case that cost a report: a second file released on the chart itself.
  const second = await dropFileOn(page, '#altitude-chart', 'second.csv', csv);
  expect(second.drop, 'the report screen has no drop zone at all — the window has to catch it').toBe(true);
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await expect(page.getByText('second.csv').first()).toBeVisible();

  // A third file, released ON the dashed box itself — the path that has two candidate
  // handlers. The box used to have drop handlers of its own; leaving them beside the
  // window's would ingest this one twice as the event bubbled up, and the logbook count
  // below is what catches it.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await dropFileOn(page, '[aria-label="Flight log drop zone"]', 'third.csv', csv);
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  const names = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => {
      const q = indexedDB.open('debrief');
      q.onsuccess = () => res(q.result);
    });
    const all: { name: string }[] = await new Promise((res) => {
      const q = db.transaction('recents', 'readonly').objectStore('recents').getAll();
      q.onsuccess = () => res(q.result);
    });
    return all.map((r) => r.name).sort();
  });
  expect(names, `logbook after three drops: ${JSON.stringify(names)}`).toEqual(['first.csv', 'second.csv', 'third.csv']);
});

// "Drop a launch day's folder at once" is what the methods page says and what `lib/ingest` is
// written around — and it could not be done. `DataTransfer.files` holds ONE entry for a dropped
// folder, and that entry IS the folder: a File with no bytes behind it whose `arrayBuffer()`
// rejects. So the single gesture the ingest layer is named for produced one unreadable item and
// blamed the flyer's folder for not being a flight log.
test('a dropped folder is read as the flights inside it', async ({ page }) => {
  const csv = readFileSync(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), 'utf8');
  await page.goto('/');
  await waitForWindowDropListener(page);

  // A real folder drop cannot be synthesised with `DataTransfer` — `items.add(file)` only ever
  // yields a FILE entry from `webkitGetAsEntry()`. So the event carries a directory entry of the
  // shape the browser hands over, batched reader and all, which is the contract the walk in
  // lib/dropEntries.ts is written against.
  const outcome = await page.evaluate((text) => {
    const mkFile = (name: string) => ({
      isFile: true,
      isDirectory: false,
      name,
      file: (ok: (f: File) => void) => ok(new File([text], name, { type: 'text/csv' })),
    });
    const children = [mkFile('.DS_Store'), mkFile('IMG_1.HEIC'), mkFile('flight-1.csv'), mkFile('flight-2.csv')];
    const folder = {
      isFile: false,
      isDirectory: true,
      name: 'launch-day',
      // A FRESH cursor per reader, the way a real one behaves. Hoisting it outside would let an
      // implementation that calls `createReader()` per batch pass here while looping forever in
      // a browser.
      createReader: () => {
        let i = 0;
        return {
          // Batches of two, and an empty answer to end — exactly how a real reader behaves, and
          // the edge that loses every file past the first batch when it is read only once.
          readEntries: (ok: (e: unknown[]) => void) => {
            const next = children.slice(i, i + 2);
            i += next.length;
            ok(next);
          },
        };
      },
    };
    // What the browser ACTUALLY puts in `files` for a folder: one entry that IS the folder, with
    // no bytes behind it. Empty here would hide the branch that used to feed it back to the
    // parser and blame the folder for not being a flight log.
    const dt = {
      types: ['Files'],
      files: [new File([], 'launch-day')] as unknown as FileList,
      items: [{ kind: 'file', webkitGetAsEntry: () => folder }],
    };
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.body.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, csv);
  expect(outcome, 'the drop is cancelled, or the browser navigates to the folder').toBe(true);

  // Two flights came out of the folder, so this lands where any two-flight drop lands: a
  // comparison. That is the point of dropping a launch day at once.
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 20_000 });

  // Both flights inside the folder reached the logbook — the second one proves the reader was
  // drained rather than read once — and the filesystem's own clutter is not reported as a
  // flight that could not be read.
  const names = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => {
      const q = indexedDB.open('debrief');
      q.onsuccess = () => res(q.result);
    });
    const all: { name: string }[] = await new Promise((res) => {
      const q = db.transaction('recents', 'readonly').objectStore('recents').getAll();
      q.onsuccess = () => res(q.result);
    });
    return all.map((r) => r.name).sort();
  });
  // Exactly the two logs: the batching was drained (or flight-2 would be missing), and neither
  // the filesystem's own clutter nor the pad photo was opened, decoded and reported as a file
  // that could not be read.
  expect(names, `logbook after one folder drop: ${JSON.stringify(names)}`).toEqual(['flight-1.csv', 'flight-2.csv']);
});

// …and a folder with nothing in it that could be a flight has to SAY so. The browser puts the
// folder itself in `dataTransfer.files` — a File with no bytes, whose `arrayBuffer()` rejects —
// so falling back to that reproduced "Could not read this file." about the folder, which is the
// bug rather than the report.
test('a folder with no flight logs in it says so, instead of blaming the folder', async ({ page }) => {
  await page.goto('/');
  await waitForWindowDropListener(page);
  const cancelled = await page.evaluate(() => {
    const child = { isFile: true, isDirectory: false, name: 'IMG_9001.HEIC', file: (ok: (f: File) => void) => ok(new File(['x'], 'IMG_9001.HEIC')) };
    const folder = {
      isFile: false,
      isDirectory: true,
      name: 'holiday-photos',
      createReader: () => {
        let done = false;
        return {
          readEntries: (ok: (e: unknown[]) => void) => {
            ok(done ? [] : [child]);
            done = true;
          },
        };
      },
    };
    const dt = {
      types: ['Files'],
      files: [new File([], 'holiday-photos')] as unknown as FileList,
      items: [{ kind: 'file', webkitGetAsEntry: () => folder }],
    };
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.body.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(cancelled).toBe(true);

  await expect(page.getByText(/Nothing in “holiday-photos” looked like a flight log/)).toBeVisible();
  await expect(page.getByText('Could not read this file.'), 'the folder is not blamed for not being a flight').toHaveCount(0);
});

// Every reading in the grid is a term of art — "Coast efficiency", "Max Q",
// "Thrust-to-weight" — and none of them carried a title, a help affordance or a link. The
// methods page defines all of them and had ZERO `id` attributes in 790 lines, so there was
// nothing to point at even if they had. Learning what a number meant was: leave the report,
// open the methods page, and read down 45 blocks of prose.
test('a reading says where its definition is, and the link lands on it', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  const links = page.locator('a[href^="/methods#"]');
  const n = await links.count();
  expect(n, 'the readings grid should offer a definition per reading').toBeGreaterThanOrEqual(8);

  // It opens beside the report rather than instead of it: a definition is a lookup, not a
  // destination, and the report screen is the one you'd be giving up to read it.
  await expect(links.first()).toHaveAttribute('target', '_blank');

  // Follow one and prove the anchor is really there — a link to a page with no anchors
  // scrolls to the top and looks like it worked.
  const href = (await links.first().getAttribute('href'))!;
  const id = href.split('#')[1];
  await page.goto(`/methods/#${id}`);
  const target = page.locator(`#${id}`);
  await expect(target, `#${id} should be a heading on the methods page`).toBeVisible();
  await expect(target).toHaveRole('heading');
  // …and it is scrolled to, not merely present somewhere down the page.
  const top = await target.evaluate((el) => el.getBoundingClientRect().top);
  expect(top, `#${id} landed at y=${top}`).toBeLessThan(120);
});

// A wait has to say what it is waiting for. Three of the six transitions into `loading` passed
// no file name, so they fell back to "Reading the file…" — and one of them is now the path a
// RELOAD and a Back take, since a report has an address: coming back to a flight means parsing
// and analysing it again, which is six seconds on a phone with an 11 MB log. A six-second
// unnamed wait reads as stuck and gets tapped again.
test('a wait names the flight it is reading, and a failure is announced', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  // Polled, not read once: the address is the logbook id, which only exists when the save
  // resolves — a moment after the report paints. Reading it immediately passes on a quiet
  // machine and races under parallel workers.
  await expect.poll(() => new URL(page.url()).searchParams.get('open')).not.toBeNull();
  const address = page.url();

  // Reopen it the way a reload does, and record what the wait said. Watched from INSIDE the
  // page with a MutationObserver rather than polled from the driver: a poll loop here was
  // running 200 `evaluate` round-trips against a page that is parsing a flight, and this suite
  // runs two workers — it was tipping the 200,000-row worker test over its own 30 s deadline.
  // A test that destabilises its neighbours is a bad test even when it passes.
  await page.addInitScript(() => {
    const w = window as unknown as { __waits: string[] };
    w.__waits = [];
    const record = () => {
      for (const el of document.querySelectorAll('[role="status"]')) {
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (/Reading/.test(t) && !w.__waits.includes(t)) w.__waits.push(t);
      }
    };
    // Observed on `document`, not `document.documentElement`: an init script runs before any
    // page script, when the root element does not exist yet and observing it throws.
    new MutationObserver(record).observe(document, { childList: true, subtree: true, characterData: true });
    record();
  });
  await page.goto(address);
  await expect(page.locator('#readings-heading')).toBeVisible({ timeout: 20_000 });
  const said = new Set<string>(await page.evaluate(() => (window as unknown as { __waits: string[] }).__waits));
  // Asserted on what was NEVER said rather than on catching one frame: the wait passes through
  // two states (the logbook read, then the flight itself) and either can be too short to
  // sample. What must never appear on this path is the generic fallback.
  const heard = [...said].join(' | ') || '(nothing)';
  expect(said.size, `no wait was observed at all; sampled: ${heard}`).toBeGreaterThan(0);
  const generic = [...said].filter((t) => /Reading the file/.test(t));
  expect(generic, `the reopen wait fell back to the generic line; sampled: ${heard}`).toEqual([]);

  // And a file that can't be read announces itself, rather than replacing a status line a
  // screen reader was following with a silent one.
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('   ') });
  // Scoped to the page's own content: Next ships a permanent `__next-route-announcer__` with
  // role="alert", so an unscoped query matches two things and says nothing useful about either.
  await expect(page.locator('main [role="alert"]')).toContainText(/empty/i);
});

// A launch day is not one flight, and until now Debrief read the first of them and told the
// flyer to go back to their altimeter's software and export the rest separately. The download
// they already have holds every flight; this is the flyer opening one of the others.
test('a launch day gives up every flight in it, and any of them can be read', async ({ page }) => {
  // Three flights in one continuously-running download: 300 m, 1,200 m, 250 m. The middle one
  // is the tallest deliberately — the rule this replaces measured every flight against the
  // file's best, so on this file it found nothing at all.
  const rows: string[] = ['Time (s),Altitude (m)'];
  let t = 0;
  const push = (a: number) => {
    rows.push(`${t.toFixed(1)},${a.toFixed(1)}`);
    t += 0.1;
  };
  for (const apogee of [300, 1200, 250]) {
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
    .setInputFiles({ name: 'launch-day.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  // The file says how many flights it holds, and names them.
  const picker = page.getByRole('region', { name: '3 flights in this file' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button', { name: /Flight 1/ })).toHaveAttribute('aria-current', 'true');
  await expect(picker).toContainText('Reading flight 1');

  // What is on screen is the FIRST flight, not a timeline spanning all three.
  const apogee = page.locator('[data-reading="Apogee"]');
  await expect(apogee).toContainText(/9\d\d ft|1,0\d\d ft/); // ~300 m
  await expect(page.getByText(/holds more than one flight/)).toContainText('3 of them');

  // Open the second flight. The report re-reads without going back to the drop zone.
  await picker.getByRole('button', { name: /Flight 2/ }).click();
  await expect(picker.getByRole('button', { name: /Flight 2/ })).toHaveAttribute('aria-current', 'true', {
    timeout: 15_000,
  });
  await expect(apogee).toContainText(/3,9\d\d ft|4,0\d\d ft/); // ~1,200 m
  // …and it says the stretch it read is the flyer's choice, not its own segmentation.
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeVisible();

  // The third flight is reachable from there too — the picker does not reset to the file.
  await picker.getByRole('button', { name: /Flight 3/ }).click();
  await expect(picker.getByRole('button', { name: /Flight 3/ })).toHaveAttribute('aria-current', 'true', {
    timeout: 15_000,
  });
  await expect(apogee).toContainText(/7\d\d ft|8\d\d ft/); // ~250 m

  // The samples behind the plot are the FLIGHT's, not the file's. This is the join that was
  // off by the crop's offset: the recorded columns came from the whole file while Debrief's
  // own series came from the stretch, so every recorded value was shifted by 298 samples.
  await page.locator('summary').filter({ hasText: 'Show the samples' }).click();
  const samples = page.locator('table').last();
  const firstRow = await samples.locator('tbody tr').nth(1).innerText();
  // Flight 3 starts at 129.5 s of the file, and the table keeps the file's clock.
  expect(firstRow, `the sample table starts inside flight 3, not at the file's first sample`).toMatch(
    /^1[23]\d(\.\d)?/,
  );
  const rowCount = await page.getByText(/[\d,]+ rows · exact values/).innerText();
  const sampleRows = Number(rowCount.match(/([\d,]+) rows/)![1].replace(/,/g, ''));
  expect(sampleRows, 'the table holds the flight, not the file').toBeLessThan(600);

  // And back to the first, which is where the file started.
  await picker.getByRole('button', { name: /Flight 1/ }).click();
  await expect(picker.getByRole('button', { name: /Flight 1/ })).toHaveAttribute('aria-current', 'true', {
    timeout: 15_000,
  });
  await expect(apogee).toContainText(/9\d\d ft|1,0\d\d ft/);

  // Every row is a real touch target, on the surface a flyer uses at the range.
  for (const n of [1, 2, 3]) {
    const box = await picker.getByRole('button', { name: new RegExp(`Flight ${n}`) }).boundingBox();
    expect(box, `flight ${n} has a box`).toBeTruthy();
    expect(box!.height, `flight ${n} clears the 44 px touch floor`).toBeGreaterThanOrEqual(44);
  }

  // …and the strip itself passes the same audit every other surface is held to.
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of violations) {
    console.log(`\n[${v.impact}] flight picker :: ${v.id} — ${v.help}\n  ${(v.nodes[0]?.html || '').slice(0, 140)}`);
  }
  expect(violations.map((v) => v.id)).toEqual([]);
});

// Debrief's segmentation is a reading of the trace, and the flyer can overrule it. This is
// the load-bearing half of that: a record the tool reads as one flight, cropped by hand to
// the stretch the flyer says is theirs, with the analysis honouring the choice.
test('a flyer can say which stretch of a record is their flight, and the analysis reads it', async ({ page }) => {
  // One file, two things in it: a 40 m bench pop at the start (below the segmenter's floor,
  // so it reads the file as one record beginning there), then the real 900 m flight.
  const rows: string[] = ['Time (s),Altitude (m)'];
  let t = 0;
  const push = (a: number) => {
    rows.push(`${t.toFixed(1)},${a.toFixed(1)}`);
    t += 0.1;
  };
  for (const apogee of [40, 900]) {
    const climb = Math.round(Math.sqrt((2 * apogee) / 9.80665) / 0.1);
    const fall = Math.round(apogee / 15 / 0.1);
    for (let i = 0; i < 20; i++) push(0);
    for (let i = 0; i <= climb; i++) push(apogee * Math.sin((Math.PI / 2) * (i / climb)));
    for (let i = 1; i <= fall; i++) push(Math.max(0, apogee * (1 - i / fall)));
    for (let i = 0; i < 30; i++) push(0);
  }
  const realFlightStartsAt = 20 * 0.1 + Math.round(Math.sqrt((2 * 40) / 9.80665) / 0.1) * 0.1 + Math.round(40 / 15 / 0.1) * 0.1 + 30 * 0.1;

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'bench-then-flight.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  // Read whole, the headline apogee tile carries a time-to-apogee that starts at the bench
  // pop and ends at the real flight's peak — a clock spanning both.
  const apogeeTile = page.locator('[data-reading="Apogee"]');
  const before = (await apogeeTile.textContent()) ?? '';
  expect(before).toMatch(/to apogee/);

  // The crop row says what it would do before it is pressed.
  const crop = page.getByText('This stretch is my flight');
  await expect(crop).toBeVisible();
  const from = page.getByLabel('From (s)');
  const to = page.getByLabel('To (s)');
  await from.fill(realFlightStartsAt.toFixed(1));
  await to.fill(t.toFixed(1));
  const read = page.getByRole('button', { name: 'Read this stretch' });
  await expect(read).toBeEnabled();
  await read.click();

  // The analysis is of the stretch chosen, and it says so.
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeVisible({ timeout: 15_000 });
  const apogee = page.locator('[data-reading="Apogee"]');
  await expect(apogee).toContainText(/2,9\d\d ft|3,0\d\d ft/); // ~900 m
  // …and the clock on it is the real flight's, not one that started at the bench pop.
  await expect(apogeeTile).not.toHaveText(before);
  await expect(apogeeTile).toContainText(/1[0-9]\.\d s to apogee/); // ~13.5 s for a 900 m climb

  // There is a way back out — the state is not one-way.
  const whole = page.getByRole('button', { name: 'Read the whole file' });
  await expect(whole).toBeVisible();
  await whole.click();
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeHidden({ timeout: 15_000 });

  // A stretch too short to read refuses out loud rather than failing when pressed.
  await from.fill('1.0');
  await to.fill('1.1');
  await expect(read).toBeDisabled();
  await expect(page.getByText(/too few to read a flight from/)).toBeVisible();

  // …and the choice survives leaving the page. A control that forgets is on the standing tell
  // list, and this is a flyer's own answer about which flight is theirs — the thing on that
  // screen the tool has least business overruling on a reload.
  await from.fill(realFlightStartsAt.toFixed(1));
  await to.fill(t.toFixed(1));
  await read.click();
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600); // the write is fire-and-forget, like the caption's
  await page.reload();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-reading="Apogee"]')).toContainText(/2,9\d\d ft|3,0\d\d ft/);

  // …and the reload AFTER that one, which is the reload that used to lose it. Reopening a
  // flight is itself a save, and the save carried three named members forward with `read` not
  // among them — so the crop survived being read back in and was wiped on the way out. One
  // reload proved nothing; the flyer found out on the second visit, silently, with a launch-day
  // record back to reporting a flight time that spans two flights.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/You chose the stretch Debrief read/), 'the crop survives a SECOND reopen').toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[data-reading="Apogee"]')).toContainText(/2,9\d\d ft|3,0\d\d ft/);

  // And reading the whole file again forgets it, rather than leaving a crop the flyer
  // cancelled to come back on the next reload.
  await page.getByRole('button', { name: 'Read the whole file' }).click();
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeHidden({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/You chose the stretch Debrief read/)).toBeHidden();
});

test('two altimeters on one flight are one flight in the logbook, counted once', async ({ page }) => {
  // A rocket flown with two altimeters — a Blue Raven and a Featherweight GPS recording the
  // SAME flight — plus a flight from another day. The two recordings disagree slightly, the
  // way two real instruments do, and that is the point: neither reading is thrown away and
  // neither is averaged into the other.
  const fx = (n: string) => path.join(__dirname, '../lib/parsers/__fixtures__/', n);

  await page.goto('/');
  // Read one at a time, which is what a flyer with two cards actually does: open the primary,
  // read it, open the backup, read it — and only then notice they are the same launch.
  for (const file of ['blueraven-app-lr.csv', 'featherweight-gps.csv', 'altusmetrum-telemetrum.csv']) {
    await page.getByLabel('Choose a flight log file').setInputFiles(fx(file));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }

  // Direct children only: a flight that carries several recordings nests a list of them, and
  // those are rows about a recording rather than rows about a flight.
  const logbook = page.getByRole('list', { name: 'Your flights' });
  const flightRows = logbook.locator('> li');
  await expect(flightRows).toHaveCount(3, { timeout: 20_000 });

  // Three files, three flights — and the two recordings of one launch each carry their own
  // reading and their own row.
  const primaryRow = flightRows.filter({ hasText: 'blueraven-app-lr.csv' });
  await expect(primaryRow).toHaveCount(1);

  // The flyer says the two are one flight.
  await logbook.getByLabel(/Select blueraven-app-lr\.csv to compare/).check();
  await logbook.getByLabel(/Select featherweight-gps\.csv to compare/).check();
  const join = page.getByRole('button', { name: 'These 2 are one flight' });
  await expect(join).toBeVisible();
  await join.click();

  // One flight where there were two, and the other day is untouched.
  await expect(flightRows).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Recorded 2 times/ })).toBeVisible();

  // How closely they agree, on the row — the figure a flyer flew two altimeters FOR, and the one
  // they otherwise work out by hand from two rows. Per reading, never one number for the flight.
  const spread = page.getByRole('button', { name: /^Recorded 2 times/ });
  await expect(spread).toContainText(/apogee within [0-9.]+%/);
  // These two fixtures are NOT one flight — the walk says they are, which is what a flyer joining
  // the wrong two files does. A gap that size has to read as a flag rather than as a quiet
  // figure, at the same threshold the comparison panel already uses.
  await expect(spread.locator('span.text-amber-700, span.text-amber-400').first()).toBeVisible();

  // Both recordings are still there, each with what IT read — no mean, no maximum.
  const recordings = page.getByRole('list', { name: /^Recordings of / });
  await expect(page.getByText('reports this flight')).toBeVisible();
  await expect(page.getByRole('button', { name: 'report by this one' })).toBeVisible();
  await expect(recordings.getByRole('button', { name: 'featherweight-gps.csv' })).toBeVisible();

  // …and the ★ is awarded over FLIGHTS now, so a launch that happened once cannot hold more
  // than one of each crown.
  await expect(logbook.getByText('highest,')).toHaveCount(1);
  await expect(logbook.getByText('fastest,').or(logbook.getByText('nothing-here'))).toHaveCount(1);

  // Which recording reports the flight is the flyer's call, not Debrief's. Read which one it
  // started as rather than assuming — the join hands it to the first of the ticked rows in the
  // order they are on screen, and that order is the flyer's sort, not a fact about the files.
  const disclosureLabel = async () => (await page.getByRole('button', { name: /^Recorded 2 times/ }).textContent()) ?? '';
  const reportedFirst = /featherweight-gps/.test(await disclosureLabel()) ? 'featherweight-gps.csv' : 'blueraven-app-lr.csv';
  const reportedAfter = reportedFirst === 'featherweight-gps.csv' ? 'blueraven-app-lr.csv' : 'featherweight-gps.csv';
  await page.getByRole('button', { name: 'report by this one' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Recorded 2 times — reported by ${reportedAfter.replace('.', '\\.')}`) })).toBeVisible({
    timeout: 10_000,
  });

  // It survives a reload — a flyer's own statement about their own flight is not a view state,
  // and it must not be undone by the reopen the reload itself performs.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Your flights' }).locator('> li')).toHaveCount(2, { timeout: 20_000 });
  await expect(
    page.getByRole('button', { name: new RegExp(`Recorded 2 times — reported by ${reportedAfter.replace('.', '\\.')}`) }),
  ).toBeVisible();

  // The whole thing exists on a phone, and every control on it is a real touch target. A
  // capability that renders on a wide screen and simply is not there on a narrow one is the
  // standing tell this walk exists to catch — and the 44 px floor comes from a
  // `pointer: coarse` rule, so it can only be measured at a phone's viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  const disclosure = page.getByRole('button', { name: /Recorded 2 times/ });
  await expect(disclosure).toBeVisible();
  await disclosure.click();
  const separate = page.getByRole('button', { name: 'Separate these into 2 flights' });
  for (const [what, locator] of [
    ['the recordings disclosure', disclosure],
    ['a recording’s own row', page.getByRole('list', { name: /^Recordings of / }).getByRole('button', { name: 'blueraven-app-lr.csv' })],
    ['the way back out', separate],
  ] as const) {
    const box = await locator.first().boundingBox();
    expect(box, `${what} has a box on a phone`).toBeTruthy();
    expect(box!.height, `${what} clears the 44 px touch floor`).toBeGreaterThanOrEqual(44);
  }

  // The REPORT says which recording these readings are, and reaches the other one in a click.
  // Every headline figure on that page is one instrument reading the flight; a cert write-up
  // quoting an apogee has to be able to say which.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('list', { name: /^Recordings of / }).getByRole('button', { name: reportedAfter }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });
  const strip = page.getByRole('region', { name: '2 recordings of this flight' });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('never averaged together');
  await expect(strip.getByRole('button', { name: new RegExp(`${reportedAfter.replace('.', '\\.')} · reading`) })).toHaveAttribute(
    'aria-current',
    'true',
  );
  // The card marking where you are stays in the tab order. `disabled` would take the only
  // "you are here" marker in the strip out of it, so a keyboard user could reach every
  // recording except the one they are reading.
  const hereCard = strip.getByRole('button', { name: new RegExp(`${reportedAfter.replace('.', '\\.')} · reading`) });
  await expect(hereCard).toHaveAttribute('aria-disabled', 'true');
  await hereCard.focus();
  await expect(hereCard).toBeFocused();

  // …and the OTHER recording is one click away, with its own reading.
  await strip.getByRole('button', { name: new RegExp(reportedFirst.replace('.', '\\.')) }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole('region', { name: '2 recordings of this flight' }).getByRole('button', { name: new RegExp(`${reportedFirst.replace('.', '\\.')} · reading`) }),
  ).toHaveAttribute('aria-current', 'true');

  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Your flights' })).toBeVisible({ timeout: 20_000 });

  // A note is the FLIGHT's, and survives handing the flight to the other recording. It is
  // written on the row, and the row moves when the reporting recording changes — so without
  // this the note a flyer typed disappears off the screen with nothing saying where it went,
  // while the prune that keeps a noted flight is still reading it.
  await page.setViewportSize({ width: 1280, height: 900 });
  // On the GROUPED flight's row specifically — the note has to survive that row moving.
  const groupedRow = flightRows.filter({ hasText: 'Recorded 2 times' });
  await expect(groupedRow).toHaveCount(1);
  await groupedRow.getByRole('button', { name: /note for/ }).click();
  await groupedRow.getByRole('textbox', { name: /^Note for/ }).fill('L2 cert, M1297');
  await groupedRow.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(groupedRow.getByText('L2 cert, M1297')).toBeVisible();
  await page.getByRole('button', { name: /^Recorded 2 times/ }).click();
  await page.getByRole('button', { name: 'report by this one' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`reported by ${reportedFirst.replace('.', '\\.')}`) })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    flightRows.filter({ hasText: 'Recorded 2 times' }).getByText('L2 cert, M1297'),
    'the note followed the flight',
  ).toBeVisible();

  // And there is a way back out.
  await page.getByRole('button', { name: /^Recorded 2 times/ }).click();
  await separate.click();
  await expect(page.getByRole('list', { name: 'Your flights' }).locator('> li')).toHaveCount(3, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Recorded 2 times/ })).toBeHidden();

  // ✕ on a flight row takes the FLIGHT — every recording of it. Taking only the recording that
  // reports it deleted one file for good and left the flight on screen under the surviving
  // instrument's name: the flyer aimed at a flight, lost a file, and saw the row stay.
  await logbook.getByLabel(/Select blueraven-app-lr\.csv to compare/).check();
  await logbook.getByLabel(/Select featherweight-gps\.csv to compare/).check();
  await page.getByRole('button', { name: 'These 2 are one flight' }).click();
  await expect(flightRows).toHaveCount(2, { timeout: 10_000 });
  await page.getByRole('button', { name: /Remove .* and its other recording from recent flights/ }).click();
  await expect(flightRows).toHaveCount(1, { timeout: 10_000 });
  await expect(logbook).toContainText('altusmetrum-telemetrum.csv');
  await expect(logbook).not.toContainText('blueraven-app-lr.csv');
  await expect(logbook).not.toContainText('featherweight-gps.csv');
});

// D5's colour clause on the single-flight report. Its figures are coloured per CHANNEL rather
// than per flight — "my altitude trace in green" is a statement about the trace — and the six
// literals this replaced were the same hex written once for the export and again for the screen,
// so the saved file and the page could drift apart one edit at a time.
test('a figure colour the flyer picks reaches the saved figure, and can be undone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  const svg = async () => {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      // The report's own Save .svg — the channel explorer further down the page has one too.
      page.getByRole('button', { name: 'Save .svg' }).first().click(),
    ]);
    return (await readFile(await dl.path())).toString('utf8');
  };

  const before = await svg();
  expect(before, 'the default altitude stroke').toContain('#6366f1');

  // `fill` drives the native value setter, and React's change path with it. Setting `.value`
  // by hand leaves the value tracker unchanged and the handler never runs.
  const swatch = page.locator('input[type="color"]').first();
  await swatch.fill('#00ff00');

  const after = await svg();
  expect(after, 'the flyer’s colour is in the saved figure').toContain('#00ff00');
  // NOT "and #6366f1 is gone": indigo is also liftoff's marker colour in `lib/eventStyle.ts`,
  // so it is legitimately still in the file. Asserting its absence would fail for a reason that
  // has nothing to do with this feature — which is exactly what it did when first written.

  // Double-click restores the default — the way back out.
  await swatch.dblclick();
  const undone = await svg();
  expect(undone, 'the flyer’s colour is gone').not.toContain('#00ff00');
  expect(undone, 'and the default trace is back').toContain('#6366f1');
});

// D6 — the grouping D3 makes a flyer find by hand is OFFERED, with the evidence, and refusable.
//
// The signal is the launch second Featherweight's downloader writes into the file name, measured
// over the corpus in `lib/proposeGroups.test.ts`: 12 stamped files, 16 true pairs, 0 false ones.
// Here the same two fixtures are dropped under the names that vendor's tool would have given them,
// which is what a flyer's own folder actually contains. Detection is by CONTENT, so renaming
// changes nothing about how they read.
const stamped = async (file: string, name: string) => ({
  name,
  mimeType: 'text/csv',
  buffer: await readFile(path.join(__dirname, '../lib/parsers/__fixtures__/', file)),
});

test('two files that name the same launch are offered as one flight, and the flyer decides', async ({ page }) => {
  await page.goto('/');
  // One drop, two files — a flyer emptying the card after a flight.
  await page.getByLabel('Choose a flight log file').setInputFiles([
    await stamped('altusmetrum-telemetrum.csv', 'BlRv_SN1537 HR_04-12-2025_12_45_49.csv'),
    await stamped('featherweight-raven-fip.csv', 'BlRv_SN1537 LR_04-12-2025_12_45_49.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 20_000 });

  // The offer is where the drop LANDS the flyer. This route returns early on the comparison
  // without rendering the logbook at all, so an offer that lived only in the logbook would be
  // invisible at the exact moment it applies.
  const banner = page.getByRole('region', { name: 'Files that may be one flight' });
  await expect(banner).toBeVisible({ timeout: 20_000 });
  // The evidence is the feature: a fact the flyer can check against the two file names in front
  // of them, not "these look similar".
  await expect(banner).toContainText('12:45:49');
  await expect(banner).toContainText(/arrived together/);

  // Offered, not applied — nothing is grouped while the offer stands.
  await page.getByRole('button', { name: '← Back to a single flight' }).click();
  const logbook = page.getByRole('list', { name: 'Your flights' });
  await expect(logbook.locator('> li')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Recorded 2 times/ })).toHaveCount(0);

  // The flyer accepts, and gets exactly what stating it by hand gives them.
  await page.getByRole('region', { name: 'Files that may be one flight' })
    .getByRole('button', { name: 'Yes, one flight' }).click();
  await expect(logbook.locator('> li')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Recorded 2 times/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Files that may be one flight' })).toHaveCount(0);
});

test('an offered grouping can be refused, and nothing is merged', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    await stamped('altusmetrum-telemetrum.csv', 'BlRv_SN1537 HR_04-12-2025_12_45_49.csv'),
    await stamped('featherweight-raven-fip.csv', 'BlRv_SN1537 LR_04-12-2025_12_45_49.csv'),
  ]);
  const banner = page.getByRole('region', { name: 'Files that may be one flight' });
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await banner.getByRole('button', { name: 'No, separate flights' }).click();

  // Gone, and nothing grouped — the way out of an offer is one press and it leaves no trace.
  await expect(banner).toHaveCount(0);
  await page.getByRole('button', { name: '← Back to a single flight' }).click();
  await expect(page.getByRole('list', { name: 'Your flights' }).locator('> li')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Recorded 2 times/ })).toHaveCount(0);
});

test('the flyer names which recording reports the flight, before accepting', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    await stamped('altusmetrum-telemetrum.csv', 'BlRv_SN1537 HR_04-12-2025_12_45_49.csv'),
    await stamped('featherweight-raven-fip.csv', 'BlRv_SN1537 LR_04-12-2025_12_45_49.csv'),
  ]);
  const banner = page.getByRole('region', { name: 'Files that may be one flight' });
  await expect(banner).toBeVisible({ timeout: 20_000 });

  // Which recording reports the flight is a real choice between two instruments, and it was
  // only answerable AFTER the flight existed — the row control could always change it, so the
  // one moment the flyer is looking at both files was the one moment they could not say.
  const picker = banner.getByRole('group', { name: 'Which recording reports this flight' });
  await expect(picker).toBeVisible();
  const options = picker.getByRole('button');
  await expect(options).toHaveCount(2);

  // Labelled by the only part of the two names that differs, rather than by the forty
  // characters they share — the offer exists because the names agree.
  const suggested = picker.locator('button[aria-pressed="true"]');
  await expect(suggested).toHaveCount(1);
  const other = picker.locator('button[aria-pressed="false"]');
  const label = ((await other.textContent()) ?? '').split('\u00b7')[0].trim();
  expect(['HR', 'LR']).toContain(label);

  await other.click();
  await expect(picker.locator('button[aria-pressed="true"]')).toContainText(label);

  await banner.getByRole('button', { name: 'Yes, one flight' }).click();
  await page.getByRole('button', { name: '\u2190 Back to a single flight' }).click();
  const logbook = page.getByRole('list', { name: 'Your flights' });
  await expect(logbook.locator('> li')).toHaveCount(1, { timeout: 10_000 });
  // Assert on the "reported by" line specifically, NOT on the row: the row carries a nested
  // list of every recording by name, so `SN1537 HR` appears in it whichever one is primary and
  // an assertion there passes with the choice thrown away. Mutation-checked both ways round.
  const reportedBy = page.getByRole('button', { name: /Recorded 2 times/ });
  await expect(reportedBy).toBeVisible();
  await expect(reportedBy).toContainText(`SN1537 ${label}`);
  await expect(reportedBy).not.toContainText(`SN1537 ${label === 'HR' ? 'LR' : 'HR'}`);
});

test('files that name different launches are not offered as one flight', async ({ page }) => {
  await page.goto('/');
  // Sixteen minutes apart — which is where the corpus's own ground-station file sits from its
  // siblings. It IS the same flight and it must stay a miss rather than be reached by widening
  // the window, because a window that big swallows unrelated flights from the same launch day.
  await page.getByLabel('Choose a flight log file').setInputFiles([
    await stamped('altusmetrum-telemetrum.csv', 'BlRv_SN1537 HR_04-12-2025_12_45_49.csv'),
    await stamped('featherweight-raven-fip.csv', 'GPS_GS03748_04-12-2025_13_01_45.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Files that may be one flight' })).toHaveCount(0);
  await page.getByRole('button', { name: '← Back to a single flight' }).click();
  await expect(page.getByRole('list', { name: 'Your flights' }).locator('> li')).toHaveCount(2, { timeout: 10_000 });
});

// D7 slice 1. `MAX_SERIES` is a fact about how many TRACES stay readable on one chart — six
// lines on two axes — and it was silently deciding how many COLUMNS OF NUMBERS a flyer could
// see, because the sample table inherited the chart's selection. Measured over the corpus:
// 23 of 25 real logs carry more channels than the chart will draw at once, one carries 15, and
// 119 channels in total could not be read as numbers without going back to the chart and
// swapping the selection. AltosUI "shows all of the data available from the flight computer";
// the CSV export here always did too, so the data was there and only the in-app view was capped.
test('every channel the board recorded is readable as numbers, not just the plotted ones', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/blueraven-app-lr.csv'));
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.locator('summary', { hasText: 'Show the samples' }).click();

  const table = page.locator('table').filter({ has: page.getByRole('button', { name: /^Time/ }) }).first();
  const headers = () => table.locator('thead th');

  // The chart is drawing a handful of traces; the table is showing everything the file holds.
  const scope = page.getByRole('group', { name: /Which channels the sample table shows/ });
  await expect(scope).toBeVisible();
  const everyLabel = await scope.getByRole('button', { name: /Every channel/ }).innerText();
  const total = Number(everyLabel.match(/\((\d+)\)/)![1]);
  const plottedLabel = await scope.getByRole('button', { name: /Just what's plotted/ }).innerText();
  const plotted = Number(plottedLabel.match(/\((\d+)\)/)![1]);

  // This file genuinely carries more than the chart draws, or the test proves nothing.
  expect(total).toBeGreaterThan(plotted);
  expect(total).toBeGreaterThanOrEqual(8);

  // Default is every channel — the x column plus one per channel.
  await expect(headers()).toHaveCount(total + 1);
  // …including ones a six-trace chart could never show at once: a raw altitude beside the
  // cleaned one, the device's own inertial altitude, the battery and the temperature.
  for (const name of ['Altitude (raw)', 'Inertial_Altitude', 'Batt_Volts', 'Temperature']) {
    await expect(table.locator('th', { hasText: name })).toBeVisible();
  }

  // And the chart's own selection is still one press away, for reading the plot's numbers.
  await scope.getByRole('button', { name: /Just what's plotted/ }).click();
  await expect(headers()).toHaveCount(plotted + 1);
  await scope.getByRole('button', { name: /Every channel/ }).click();
  await expect(headers()).toHaveCount(total + 1);
});
