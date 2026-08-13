import { test, expect } from '@playwright/test';
import { storedZip } from './orkFixture';
import { openMadeUpFlight, SYNTH_SENTENCE, SYNTH_SHORT, SYNTH_TAIL } from './madeUp';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';

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
  await page.getByRole('button', { name: 'per quantity', exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Units per quantity' }).locator('select').nth(0).selectOption('m');
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
  // A receiver's worth of fixes, not a logger's worth of rows. This asserted `> 50` while
  // `gpsAscentFixes` counted SAMPLES — a receiver with no new solution holds its last position
  // rather than writing nothing, so on this file the count was the repeats. It is 3: three
  // independent solutions in a 22.4 s climb. Bounded rather than pinned, because the exact number
  // belongs to `corpus-digests.json` and this is the contract the JSON consumer reads.
  expect(doc.metrics.gpsAscentFixes).toBeGreaterThan(0);
  expect(doc.metrics.gpsAscentFixes).toBeLessThan(doc.metrics.timeToApogee * 20);
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
  // The GROUND TRACK's announcements. Scoped by id rather than by shape: every chart on the
  // report now carries a status region of its own, so `p.sr-only[role="status"]` matches five.
  const spoken = page.locator('#ground-track-spoken');
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
  await expect(page.getByText('It could not be read.'), 'the folder is not blamed for not being a flight').toHaveCount(0);
});

// P1 item 5, on the app's most-hit error surface: every unreadable file dropped on `/` lands here.
// `DESIGN.md` §5 requires an error to name "the file or field that failed", and `MAINTAINING.md`
// lists a failure that names something not on the page as a tell. Six of this surface's ten error
// paths named nothing at all — "That file is empty.", "Could not read this file." — which on a
// launch day's drop leaves the flyer to work out WHICH of eight files it meant.
test('an unreadable file is named in the error, not described in the abstract', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    { name: 'shopping-list.csv', mimeType: 'text/csv', buffer: Buffer.from('') },
  ]);

  // Scoped to the danger card rather than `getByRole('alert')` alone: `ForgetDeviceData` and
  // `RecentFlights`'s Clear confirmation are alerts too, and both are on this page.
  const err = page.getByRole('alert').filter({ hasText: /Couldn’t read/ });
  await expect(err).toBeVisible();
  // The file, by name — the whole point of the change.
  await expect(err).toContainText('shopping-list.csv');
  // …and what was expected of it, so the message teaches rather than reports.
  await expect(err).toContainText(/no contents at all/i);
  // The old wording said "That file is empty." and named nothing. If it comes back, so does the
  // defect: a flyer holding eight files cannot act on it.
  await expect(err).not.toContainText('That file is empty.');
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

  // **Rewritten 2026-08-08 (owner note ON-3).** This used to assert the opposite contract —
  // that every reading's "?" is an anchor carrying `target="_blank"`, so the definition opened
  // BESIDE the report rather than instead of it. That was the best available answer while the
  // only place an explanation existed was the methods page. It is not any more: the explanation
  // opens in place, and the anchor now lives inside the popover for the reader who wants the
  // neighbouring blocks too.
  //
  // The half of this test that still matters is the half about the ANCHOR really existing — a
  // link to a page with no anchors scrolls to the top and looks like it worked — so that is
  // what it keeps doing, reached the way a flyer now reaches it.
  const help = page.getByRole('button', { name: /is worked out$/ });
  const n = await help.count();
  expect(n, 'the readings grid should offer a definition per reading').toBeGreaterThanOrEqual(8);

  await help.first().click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // `/methods/#id`, with the trailing slash, because the control is a `<Link>` and
  // `next.config.mjs` sets `trailingSlash: true`. The hand-written anchor this replaced emitted
  // `/methods#id` and relied on the host's redirect carrying the fragment across — which is not
  // something every host does. Going through the primitive fixed that on the way past.
  // Scoped to the "read the whole block" link by NAME, not to the first `/methods#…` in the
  // panel. Since 2026-08-09 a block that rests on published work also carries a sources line, so
  // the first such href is a citation pointing at `#ref-…` — an `<li>` in the references section,
  // which is a correct destination for a citation and a wrong one for this assertion. A locator
  // that silently retargets is how a test starts passing for a different reason than it was
  // written for; this one would have failed loudly, and does.
  const links = panel.getByRole('link', { name: 'Read this on the methods page' });
  const href = (await links.first().getAttribute('href'))!;
  expect(href, 'the canonical trailing-slash form, so no redirect has to preserve the fragment').toMatch(
    /^\/methods\/#/,
  );
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
// see, because the sample table inherited the chart's selection. Measured over the corpus: of the
// 25 files a parser auto-detects as a flight, 23 carry more channels than the chart draws, and
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

  // The chart is drawing few and the file holds many, or this file proves nothing. Both sides
  // come off the control's own labels, so they are also checked against the DOM below.
  expect(total).toBeGreaterThan(plotted);

  // Default is every channel — the x column plus one per channel.
  await expect(headers()).toHaveCount(total + 1);
  // …including ones a six-trace chart could never show at once: a raw altitude beside the
  // cleaned one, the device's own inertial altitude, the battery and the temperature. These
  // are the file's channels, not the app's count of them.
  for (const name of ['Altitude (raw)', 'Inertial_Altitude', 'Batt_Volts', 'Temperature']) {
    await expect(table.locator('th', { hasText: name })).toBeVisible();
  }

  // READABLE AS NUMBERS is the milestone's own wording, so read the numbers. A table with every
  // header and no cells would satisfy a column count, and that is exactly the shape a broken
  // data path takes here.
  const firstRow = table.locator('tbody tr').filter({ has: page.locator('td:not([colspan])') }).first();
  await expect(firstRow.locator('td')).toHaveCount(total + 1);
  const cells = await firstRow.locator('td').allTextContents();
  // Every cell is a number or an explicit "—"; at least four channels carry a real reading, and
  // they are not all the same value (which a stuck or mis-indexed series would give).
  const numeric = cells.filter((c) => /^-?[\d.]+$/.test(c.trim()));
  expect(numeric.length).toBeGreaterThanOrEqual(5);
  for (const c of cells) expect(c.trim()).toMatch(/^(-?[\d.]+|—)$/);
  expect(new Set(numeric).size).toBeGreaterThan(1);

  // The battery column in particular: a voltage is unmistakable, and it is a channel the chart
  // could not have been showing next to an altitude without a second axis.
  // textContent, not innerText: the headers are CSS-uppercased, so innerText reads BATT_VOLTS.
  const battIdx = (await headers().allTextContents()).findIndex((h) => h.includes('Batt_Volts'));
  expect(battIdx).toBeGreaterThan(0);
  expect(Number(cells[battIdx])).toBeGreaterThan(1);
  expect(Number(cells[battIdx])).toBeLessThan(30);

  // And the chart's own selection is still one press away, for reading the plot's numbers.
  await scope.getByRole('button', { name: /Just what's plotted/ }).click();
  await expect(headers()).toHaveCount(plotted + 1);
  await scope.getByRole('button', { name: /Every channel/ }).click();
  await expect(headers()).toHaveCount(total + 1);

  // The sort is held by its COLUMN, not by a column index, and this is what that buys. Sort by a
  // channel only the wide set has, then narrow: the column is gone, so no header may claim a sort
  // and the rows must be back in record order. Held as an index it stayed armed at a position that
  // now meant a different channel — or none — so the rows silently reverted while every header
  // read aria-sort="none": a sort that was on, showing nothing, with no way to see or clear it.
  const battHeader = table.getByRole('button', { name: /^Batt_Volts/ });
  const dataRows = () => table.locator('tbody tr').filter({ has: page.locator('td:not([colspan])') });
  const recordTop = await dataRows().first().locator('td').first().textContent();
  await battHeader.click();
  await expect(table.locator('th', { hasText: 'Batt_Volts' })).toHaveAttribute('aria-sort', 'descending');
  const sortedTop = await dataRows().first().locator('td').first().textContent();
  expect(sortedTop).not.toBe(recordTop);

  await scope.getByRole('button', { name: /Just what's plotted/ }).click();
  await expect(table.locator('th[aria-sort="descending"], th[aria-sort="ascending"]')).toHaveCount(0);
  expect(await dataRows().first().locator('td').first().textContent()).toBe(recordTop);

  // And when the column comes back, its sort comes back WITH the header that says so — the two
  // never disagree, which is the whole point of keying it.
  await scope.getByRole('button', { name: /Every channel/ }).click();
  await expect(table.locator('th', { hasText: 'Batt_Volts' })).toHaveAttribute('aria-sort', 'descending');
  expect(await dataRows().first().locator('td').first().textContent()).toBe(sortedTop);
});

// The window-stats table is the one a cert document quotes — min, max and mean of each channel
// over the stretch of flight the flyer zoomed to — and the only way to get those into one was to
// retype them off the screen. It cannot be a `DataTable` (the channel is a `th scope="row"` and a
// channel with no samples in the zoom collapses its whole row to one `colSpan` cell), so what got
// lifted is the copy affordance rather than the machinery.
test('the window stats copy as a real table, with the unit beside each channel', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/blueraven-app-lr.csv'));
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  const copy = page.getByRole('button', { name: 'Copy these stats' });
  await expect(copy).toBeVisible();
  await copy.click();
  // The announcement first — the copy is async, and reading the clipboard in the next statement
  // races the write. See the note in e2e/stitch.spec.ts; the same omission failed there on CI.
  await expect(page.getByRole('status').filter({ hasText: /Copied/ })).toBeVisible();

  const clip = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const out: Record<string, string> = {};
    for (const item of items) for (const type of item.types) out[type] = await (await item.getType(type)).text();
    return out;
  });

  const lines = clip['text/plain'].split('\n');
  expect(lines[0].split('\t').slice(0, 5)).toEqual(['Channel', 'Unit', 'min', 'max', 'mean']);
  // A real row: a named channel, its unit, and three numbers — not empty cells, and not the
  // header repeated.
  const alt = lines.find((l) => l.startsWith('Altitude (AGL)\t'));
  expect(alt).toBeTruthy();
  const cols = alt!.split('\t');
  expect(cols[1]).toBe('ft');
  for (const v of cols.slice(2, 5)) expect(v).toMatch(/^-?[\d,.]+$/);
  // max is at or above min, or the columns are transposed.
  expect(Number(cols[3].replace(/,/g, ''))).toBeGreaterThanOrEqual(Number(cols[2].replace(/,/g, '')));
  expect(clip['text/html']).toContain('<th>Channel</th>');
  expect(clip['text/html']).not.toContain('<span');
});

test('a file Debrief recognises and declines is not called unreadable', async ({ page }) => {
  // `ParseGuidanceError` covers files Debrief READ and is deliberately not treating as a
  // flight — an OpenRocket prediction, a device summary, a raw binary download. They used to
  // be headed "Couldn't read <file>", which sat directly above a sentence explaining that
  // Debrief had read the design well enough to name the rocket and count its simulations. The
  // heading contradicted its own body on the one surface whose job is to say what happened.
  const ork = path.join(
    __dirname,
    '../lib/parsers/__corpus__/openrocket/openrocket__example-simple-model-rocket__A-simple-model-rocket.ork',
  );
  test.skip(!existsSync(ork), 'corpus not fetched — this case needs the real .ork');

  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(ork);

  // Next renders its own empty role=alert route announcer, so scope to the visible one.
  const alert = page.getByRole('alert').filter({ visible: true }).first();
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toContainText('Debrief didn’t analyse');
  await expect(alert).toContainText('not a recording of a flight');
  await expect(alert).not.toContainText('Couldn’t read');
});

/** One simulation, so Debrief has an unambiguous prediction to compare against. The apogee is
 *  set well clear of the fixture flight's so the direction of the miss is unmistakable. */
const ONE_SIM_ORK = storedZip(
  'rocket.ork',
  `<?xml version='1.0' encoding='utf-8'?><openrocket version="1.10" creator="OpenRocket 24.12">` +
    `<rocket><name>Telemetrum</name></rocket><simulations>` +
    `<simulation status="uptodate"><name>Simulation 1</name>` +
    `<flightdata maxaltitude="200" maxvelocity="68.6" maxacceleration="143.649" maxmach="0.2" ` +
    `timetoapogee="6.5" flighttime="60" groundhitvelocity="4.681" launchrodvelocity="15.365" ` +
    `deploymentvelocity="2.646" optimumdelay="2.751"/></simulation>` +
    `</simulations></openrocket>`,
);

test('a design dropped beside a log is compared against it, and never called a measurement', async ({ page }) => {
  // D9 slice 3. The prediction is a THIRD source in the cross-check — not a second measurement,
  // and the wording has to keep those apart: a flight that missed its prediction is the answer,
  // not a discrepancy to chase.
  await page.goto('/');
  // Written to disk rather than passed as a buffer: Playwright refuses to mix paths and
  // buffers in one drop, and the flight has to come from the real fixture.
  const orkPath = path.join(os.tmpdir(), 'Telemetrum.ork');
  writeFileSync(orkPath, ONE_SIM_ORK);
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), orkPath]);

  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });

  // The panel names what it holds, rather than calling a simulation "the logger's own summary".
  const panel = page.getByRole('region', { name: /Predicted, logged, and read|design’s prediction/ });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('not a measurement of it');

  // The column exists and carries the design's figure.
  await expect(panel.getByRole('columnheader', { name: 'Predicted' })).toBeVisible();
  await expect(panel.getByRole('row', { name: /Apogee/ }).first()).toContainText('656 ft'); // 200 m

  // …and the verdict is in the prediction's own vocabulary, with a direction — and the direction
  // words belong to the QUANTITY. "flew higher" is a sentence about altitude; said about all ten
  // figures, a flight that took two and a half times longer to reach apogee than predicted read
  // `Time to apogee — flew higher · +245%`, on the row directly above Apogee.
  await expect(panel).toContainText(/flew (higher|lower)/);
  const timeRow = panel.getByRole('row', { name: /Time to apogee/ }).first();
  await expect(timeRow).toContainText(/took (longer|less time)/);
  await expect(timeRow).not.toContainText(/flew (higher|lower)/);

  // This flight carries no device summary, so the panel has no `Agreement` column to put a
  // prediction under — the one column header a prediction must never appear beneath.
  await expect(panel.getByRole('columnheader', { name: 'vs prediction' })).toBeVisible();
  await expect(panel.getByRole('columnheader', { name: 'Agreement' })).toHaveCount(0);
  // The word appears exactly once per row: the heading says `Predicted`, so the cell does not
  // repeat it. It did in txt/md/html — `250 m (predicted)` under a column headed "Predicted".
  await expect(panel.getByRole('table')).not.toContainText('(predicted)');
  // The discrepancy words belong to two instruments that measured one flight. This flight has
  // only a prediction, so no VERDICT may use them. Scoped to the table rather than the panel:
  // the panel's own subhead says "where the flight and the prediction differ, the flight is the
  // measurement", which is the distinction being drawn rather than a verdict drawing on it.
  const verdicts = panel.getByRole('table');
  await expect(verdicts).not.toContainText(/\bdiffer\b/);
  await expect(verdicts).not.toContainText(/\bconsistent\b/);
  // Four of the ten have no counterpart Debrief measures, and say so rather than showing 0%.
  await expect(verdicts).toContainText('not measured');
});

test('a log, its logger summary and a design make three columns, and one verdict per question', async ({ page }) => {
  // The three-source table. Two questions are being asked of one row and they are NOT the same
  // question: how two measurements of this flight line up, and how the flight compared with what
  // was expected of it. `Agreement` used to fall back to the prediction verdict on any row the
  // logger didn't state — which put a prediction under the one column header it must never
  // appear beneath, and on a row like this rendered the identical accent chip twice.
  await page.goto('/');
  const orkPath = path.join(os.tmpdir(), 'three-source.ork');
  writeFileSync(orkPath, ONE_SIM_ORK);
  await page.getByLabel('Choose a flight log file').setInputFiles([
    path.join(__dirname, '../lib/parsers/__fixtures__/blueraven-app-lr.csv'),
    path.join(__dirname, '../lib/parsers/__fixtures__/blueraven-app.summary.csv'),
    orkPath,
  ]);

  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });
  const panel = page.getByRole('region', { name: /Predicted, logged, and read/ });
  await expect(panel).toBeVisible();
  for (const name of ['Reading', 'Predicted', 'Logger', 'Debrief', 'Agreement', 'vs prediction']) {
    await expect(panel.getByRole('columnheader', { name, exact: true })).toBeVisible();
  }

  // A row only the DESIGN states: the logger's cells are blank, including its verdict, and the
  // prediction's verdict sits under its own header. Blue Raven's summary carries no time to
  // apogee; Debrief measures one, so there is a real comparison to state here.
  const only = panel.getByRole('row', { name: /Time to apogee/ }).first();
  await expect(only.getByRole('cell').nth(2)).toHaveText('—'); // Logger
  await expect(only.getByRole('cell').nth(4)).toHaveText('—'); // Agreement — not the logger's row
  await expect(only.getByRole('cell').nth(5)).toContainText(/took (longer|less time)|as predicted/);

  // A row BOTH state: each verdict in its own cell, in its own vocabulary. The logger's may say
  // `agree`; the design's may never.
  const both = panel.getByRole('row', { name: /^Apogee/ }).first();
  await expect(both.getByRole('cell').nth(4)).toContainText(/agree|consistent|differ/);
  await expect(both.getByRole('cell').nth(5)).toContainText(/flew (higher|lower)|as predicted/);
  await expect(both.getByRole('cell').nth(5)).not.toContainText(/agree|consistent|differ/);
});

test('a design that states several simulations is read, and refuses to pick one', async ({ page }) => {
  // The corpus fixture holds five, for an A8-3 through a C6-5, whose apogees run 50.59 m to
  // 319.75 m. Nothing in a flight log says which motor flew.
  const ork = path.join(
    __dirname,
    '../lib/parsers/__corpus__/openrocket/openrocket__example-simple-model-rocket__A-simple-model-rocket.ork',
  );
  test.skip(!existsSync(ork), 'corpus not fetched — this case needs the real .ork');

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), ork]);

  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });
  // Read, paired, and declined — all three said out loud. A silent nothing would read as
  // "this file has no prediction", which is false.
  // Scoped to the note rather than the page since D9 slice 3b: the picker below it labels each
  // simulation by name too, so an unscoped match now resolves to two elements. The subject of
  // this case is what the NOTE says — which is also what travels into an export, where the
  // picker does not exist.
  const howRead = page.locator('li').filter({ hasText: /will not pick one to compare against/ });
  await expect(howRead).toHaveCount(1);
  await expect(howRead).toContainText('states 5 simulations');
  await expect(howRead).toContainText('Simulation 3 - too short delay');

  // **And it is not ALSO announced as a prediction that landed.** The refusal is the whole
  // account of this drop; the paired sentence beside it said "Read the prediction for this
  // flight alongside it … it sits beside Debrief's read of what actually flew" — two sentences
  // contradicting each other on one screen, with no prediction column anywhere on the page.
  await expect(page.getByText(/Read the prediction for this flight alongside it/)).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Predicted' })).toHaveCount(0);
});

/** The same single simulation, but with the saved curve OpenRocket writes when
 *  `StorageOptions.saveSimulationData` is on — a `types=` header and one comma-separated
 *  `datapoint` row per sample. `Altitude` is deliberately the THIRD column, with a velocity
 *  between it and `Time`, so a reader keying on position rather than on name draws the wrong
 *  line and this case says so. */
const ONE_SIM_ORK_WITH_CURVE = storedZip(
  'rocket.ork',
  `<?xml version='1.0' encoding='utf-8'?><openrocket version="1.10" creator="OpenRocket 24.12">` +
    `<rocket><name>Telemetrum</name></rocket><simulations>` +
    `<simulation status="uptodate"><name>Simulation 1</name>` +
    `<flightdata maxaltitude="200" maxvelocity="68.6" maxacceleration="143.649" maxmach="0.2" ` +
    `timetoapogee="6.5" flighttime="60" groundhitvelocity="4.681" launchrodvelocity="15.365" ` +
    `deploymentvelocity="2.646" optimumdelay="2.751">` +
    `<databranch name="Sustainer" types="Time,Vertical velocity,Altitude,Altitude above sea level">` +
    `<datapoint>0,0,0,120</datapoint><datapoint>3.25,40,120,240</datapoint>` +
    `<datapoint>6.5,0,200,320</datapoint><datapoint>60,-5,0,120</datapoint>` +
    `</databranch></flightdata></simulation></simulations></openrocket>`,
);

test('a design that saved its curve is drawn beside the flight, dashed and on its own clock', async ({ page }) => {
  // D9 slice 4. The prediction becomes a second line on the altitude chart — and the two do NOT
  // share a clock, so they are merged onto a union x that keeps every original sample of each
  // rather than resampling the simulation onto a measured liftoff.
  await page.goto('/');
  const orkPath = path.join(os.tmpdir(), 'Telemetrum-curve.ork');
  writeFileSync(orkPath, ONE_SIM_ORK_WITH_CURVE);
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), orkPath]);

  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });

  // The chart's text alternative carries the second line, because `role="img"` means the canvas
  // says nothing else and a screen-reader flyer would otherwise not know it is there.
  const chart = page.getByRole('img', { name: /Line chart: altitude above ground/ });
  await expect(chart).toBeVisible();
  const label = (await chart.getAttribute('aria-label')) ?? '';
  expect(label, 'names the design').toContain('Telemetrum');
  expect(label, 'says the line is dashed').toContain('dashed');
  // The claim that matters: it is stated as a simulation, not as a reading.
  expect(label).toContain('a simulation, not a measurement');
  // 200 m is the design's stated apogee AND the peak of the curve it saved; the label quotes the
  // curve's own peak, so a wrong-column read would put a different number here.
  expect(label).toMatch(/peaking at 200|peaking at 656/); // metric or imperial

  // uPlot's legend is the one place both series are named on screen.
  await expect(page.locator('.u-legend').first()).toContainText('Telemetrum (predicted)');

  // And the prediction is NOT resampled onto the flight: the union keeps the simulation's own
  // four instants, so the chart's x-extent still ends at the flight's own last sample rather
  // than being truncated to it.
  const drawn = await page.evaluate(() => document.querySelectorAll('.u-legend').length);
  expect(drawn).toBeGreaterThan(0);
});

// Debrief refuses to report a peak speed it cannot stand behind, and six surfaces say so: the
// timeline reading NaNs it, the channel explorer attaches the reason to the trace, the rail exit
// refuses, the exports NaN it, the comparison marks it unusable, and drag refuses. The report's
// own Velocity chart — the largest rendering of that same data, and the one a flyer would read a
// peak off by eye — said only "derived from altitude".
//
// Measured 2026-08-08 over the corpus: 15 of 50 analysable recordings reach the report with
// `series.velocityUnusable` set and a finite trace. `featherweight-gps-groundstation.csv` is the
// committed fixture in that state, so this runs without the private corpus.
test('a velocity trace the report will not read a peak off says so on the chart', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/featherweight-gps-groundstation.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  // The headline withholds it. That is the claim the chart has to agree with.
  const speedTile = page.locator('[data-reading="Max velocity"]');
  await expect(speedTile).toContainText(/withheld/i);

  // …and the chart carries the same refusal, with the same reason, from the same function.
  const chart = page.locator('#velocity-chart').locator('xpath=ancestor::*[contains(@class,"rounded-xl")][1]');
  await expect(chart, 'the velocity chart names the refusal').toContainText(
    /will not report a peak off this trace/i,
  );
  await expect(chart, 'and gives the headline’s own reason').toContainText(
    /the ascent has a stretch the record doesn’t cover/i,
  );
  // The curve stays drawn on purpose — a mis-scaled column has to remain visible to be
  // diagnosed. Removing the trace would be a different bug, so assert it is still there.
  await expect(chart.locator('canvas').first(), 'the curve is still drawn').toBeVisible();

  // And a flight whose speed stands carries no such caveat — otherwise this passes on every
  // flight and says nothing.
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
  const ok = page.locator('#velocity-chart').locator('xpath=ancestor::*[contains(@class,"rounded-xl")][1]');
  await expect(ok, 'a believable speed gets no refusal').not.toContainText(/will not report a peak/i);
});

// `OWNER-NOTES.md` ON-2 — "there needs to be more sample flights for showing the different
// capabilities of the project." Until 2026-08-08 there was ONE sample behind one hardcoded URL:
// a single baro+GPS log, and the entire demonstration surface for ten parsers, the column
// mapper, reconciliation, stitching, the design overlay and the report builder.
//
// The capability with the sharpest gap was multi-recording reconciliation — a shipped milestone
// (D3) that a visitor could not see at all without bringing two of their own files. This walks
// it: two REAL recordings of one physical flight, from two different boards, in one click.
test('a sample can show two boards recording one flight, in one click', async ({ page }) => {
  await page.goto('/');

  // The primary button stays the single flight — a first-time visitor wants one obvious way in.
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();

  await page.getByRole('button', { name: 'Two altimeters, one flight' }).click();

  // Two files means the batch path, which lands on a comparison rather than a single report.
  // That is the whole point: the two recordings are set SIDE BY SIDE, never averaged.
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 20_000 });

  // Both boards are present by name, so it is visibly two instruments and not one file twice.
  const body = page.locator('body');
  await expect(body, 'the PerfectFlite recording is there').toContainText(/pnut/i);
  await expect(body, 'and the Featherweight Raven one').toContainText(/raven/i);

  // And it is a comparison of READINGS, not just two file names — the apogee row is the one
  // the two boards cross-check each other on. Scoped to the table, because "Apogee" also
  // appears in the page's own print-only and screen-reader copy.
  await expect(
    page.getByRole('table').getByText(/Apogee/i).first(),
    'the comparison table has an apogee row',
  ).toBeVisible();
});

// The sample path is the drop path, and it did not used to be. It fetched one URL, ran the
// bytes through `decodeBytes` and handed `ingest` a string — so a sample could only ever be a
// UTF-8 text file, and no binary download could be one. `sample-pnut.pf2` is a native PerfectFlite
// binary; it opening at all is the proof that divergence is gone.
test('a binary sample opens, which the old single-URL sample path could not do', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Two altimeters, one flight' }).click();
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 20_000 });
  // The `.pf2` is parsed by its NAMED parser and produces a column of its own. Asserted on the
  // table rather than on the absence of an error string: the page's own "How to use this" copy
  // contains the sentence "Anything in the drop Debrief couldn't read is named, with the
  // reason", so a `not.toContainText(/couldn't read/)` over the body matches page furniture and
  // fails on a working app — which is exactly what it did.
  const table = page.getByRole('table');
  await expect(table.getByText(/PerfectFlite/i).first(), 'the .pf2 is read by its own parser').toBeVisible();
  await expect(table.getByText(/Featherweight Raven/i).first(), 'and the CSV by its own').toBeVisible();
});

// `OWNER-NOTES.md` ON-3 — "it would be nice if clicking on any of the question marks would just
// open up a pop up not to a seperate page that would explain".
//
// Measured before this: 21 of the readings grid's tiles carried a "?", and ALL 21 were an
// anchor with target=_blank onto /methods — a second tab, a 12,700-word document, an anchor
// among 51 blocks. A flyer looking up one term lost their place in the report to get it.
//
// The cost the note is actually about is the LOST PLACE, so that is what this measures.
test('a question mark explains the reading where it is, without losing the page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // Scroll well down the report, so "kept my place" is a claim with something to lose.
  await page.evaluate(() => window.scrollTo(0, 1200));
  const before = await page.evaluate(() => Math.round(window.scrollY));
  expect(before, 'the reader is some way down the report').toBeGreaterThan(200);

  const help = page.getByRole('button', { name: /is worked out$/ }).first();
  await help.scrollIntoViewIfNeeded();
  const at = await page.evaluate(() => Math.round(window.scrollY));
  await help.click();

  // It explains IN PLACE: a dialog on this page, not a navigation.
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  expect(page.url(), 'no navigation happened').not.toContain('/methods');
  expect(await page.evaluate(() => document.title), 'still the report').not.toMatch(/Where the numbers come from/);

  // …with real prose, not a restated label. The shortest methods block runs to dozens of words;
  // a panel echoing the tile's name would be the "tooltip that restates the label" tell.
  const words = (await panel.innerText()).trim().split(/\s+/).length;
  expect(words, `the explanation is ${words} words`).toBeGreaterThan(25);

  // **It is READABLE, which no other assertion here can see.** `text-transform` and
  // `letter-spacing` inherit, and this popover opens from inside `Readout`'s label — which is
  // `text-xs uppercase tracking-wide`. The first version of this feature rendered all 51
  // explanations as ALL CAPS at 12 px with letter-spacing, and every text assertion above
  // passed, because `innerText` is identical either way. Found with `getComputedStyle`, so
  // that is what guards it.
  const type = await panel.evaluate((el) => {
    const cs = getComputedStyle(el);
    const p = el.querySelector('p');
    return { transform: cs.textTransform, spacing: cs.letterSpacing, pTransform: p ? getComputedStyle(p).textTransform : 'none' };
  });
  expect(type.transform, 'the panel does not inherit uppercase from the reading label').toBe('none');
  expect(type.pTransform, 'nor does the prose inside it').toBe('none');
  expect(type.spacing, 'nor the label letter-spacing').toBe('normal');

  // The full page is still one click away for anyone who wants the neighbouring blocks.
  await expect(panel.getByRole('link', { name: /Read this on the methods page/ })).toBeVisible();

  // And the place is kept — the whole point of the note.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  const after = await page.evaluate(() => Math.round(window.scrollY));
  expect(Math.abs(after - at), `scroll moved ${Math.abs(after - at)} px`).toBeLessThan(4);

  // No reading sends the flyer away any more. This is the count the note is about, so it is
  // asserted as a count rather than as "the first one works".
  const navigating = await page.locator('a[href*="/methods"][href*="#"][target="_blank"]').count();
  expect(navigating, 'no reading opens the methods page in a second tab').toBe(0);
  const explaining = await page.getByRole('button', { name: /is worked out$/ }).count();
  expect(explaining, 'and every term of art explains in place').toBeGreaterThanOrEqual(8);
});

// D11's *done when*, walked in the real app rather than asserted in a unit test: any of the ten
// formats goes in, one canonical file comes out, and dropping that file back in returns the same
// flight. The unit half (`lib/canonical.test.ts`) proves the model survives across every corpus
// recording; this proves a flyer can actually do it, which is the half that decides whether it
// shipped.
test('a flight saved as a record opens again as the same flight', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // The readings this flight is read at, before it is ever written out. Taken off the metric
  // grid — what a flyer actually looks at — rather than out of any internal state.
  const readingsOf = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('main dl div, main [data-reading]')]
        .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 12),
    );
  const before = await readingsOf();
  expect(before.length, 'readings to compare').toBeGreaterThan(3);

  const [record] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save record' }).click(),
  ]);
  expect(record.suggestedFilename()).toMatch(/-debrief-record\.json$/);
  const saved = (await record.path()) as string;
  const firstBytes = await readFile(saved, 'utf8');
  // Big enough to be the flight rather than a header — a record that wrote no samples would
  // otherwise round-trip perfectly and prove nothing.
  expect(firstBytes.length, 'the record carries the flight').toBeGreaterThan(50_000);

  // Drop it back in, as a flyer would with a file off their disk.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page.getByLabel('Choose a flight log file').setInputFiles(saved);
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible({
    timeout: 20_000,
  });

  // Not the column mapper, and not the refusal beside it — the failure this whole slice is
  // about. Before the canonical parser existed, `importFlight` fell through to the generic table
  // path and the flight that came back was a different flight. Both headings are quoted from
  // `components/ColumnMapper.tsx`: an assertion naming a string the app does not contain passes
  // whatever happens, which is worse than not asserting.
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /no flight data in this file/i })).toHaveCount(0);

  expect(await readingsOf(), 'the same flight, read the same way').toEqual(before);

  // The assertion that actually bites: writing the re-imported flight out again must produce
  // the SAME BYTES. A readings comparison cannot see a channel the record dropped — measured,
  // by deleting the last channel on the way out and watching the readings match anyway — but a
  // fixed point can see it, because every sample of every channel is in the file.
  const [again] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save record' }).click(),
  ]);
  const secondBytes = await readFile((await again.path()) as string, 'utf8');
  expect(secondBytes.length, 'the second record is the same size').toBe(firstBytes.length);
  expect(secondBytes === firstBytes, 'writing the re-imported flight reproduces the record').toBe(true);
});

// D11 slice 3 — the *done when*'s multi-source clause, driven end to end: "a flight with two
// recordings does not flatten into one".
//
// Slice 1 proved a single recording round-trips. What it could not carry is the thing the flyer
// SAID: that these two files are one flight, flown on two altimeters. That statement lives in the
// logbook, not in either file, so before this it was lost the moment the records left the browser
// — save both, drop both back, get two unrelated flights and do the joining again by hand.
test('two recordings saved as records come back as one flight, not two', async ({ page }) => {
  await page.goto('/');

  // Direct children only. A grouped row nests a second list of its recordings, so a descendant
  // count reads 4 for one flight — which would have made this test pass for the wrong reason.
  const flights = page.locator('ul[aria-label="Your flights"] > li');

  // Two genuinely different logs, so nothing here can be an accident of deduplication: the
  // logbook collapses two copies of one file into a single row on its own.
  const logs = ['altusmetrum-telemetrum.csv', 'featherweight-raven-fip.csv'];
  for (const name of logs) {
    await page.getByLabel('Choose a flight log file').setInputFiles(path.join(__dirname, `../lib/parsers/__fixtures__/${name}`));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  await expect(flights).toHaveCount(2);

  // The flyer says they are one flight — the statement this slice has to preserve.
  for (const name of logs) await page.getByRole('checkbox', { name: `Select ${name} to compare` }).check();
  await page.getByRole('button', { name: /are one flight/ }).click();
  await expect(flights, 'the two rows are one flight now').toHaveCount(1);

  // Open it, and save a record from each recording. The picker is what makes the second one
  // reachable at all, and it exists only because the flight now holds two.
  await flights.first().getByRole('button').filter({ hasText: logs[0] }).first().click();
  await expect(page.getByRole('heading', { name: '2 recordings of this flight' })).toBeVisible({ timeout: 20_000 });

  const archive = await mkdtemp(path.join(os.tmpdir(), 'debrief-records-'));
  const saved: string[] = [];
  for (const name of logs) {
    if (saved.length > 0) {
      const card = page.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
      await card.click();
      // Wait for the SWITCH, not for a heading that was already on screen — the picker marks the
      // recording being read with `aria-current`. Waiting on the heading is a no-op, so "Save
      // record" could fire against the previous recording and both files would claim to report
      // the flight.
      await expect(card).toHaveAttribute('aria-current', 'true', { timeout: 20_000 });
    }
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save record' }).click(),
    ]);
    // Saved under the name the app CHOSE, not the driver's temp uuid: the sentence the flyer
    // reads names the files, so a test that drops uuids cannot check what it says.
    const to = path.join(archive, dl.suggestedFilename());
    await dl.saveAs(to);
    saved.push(to);
  }
  expect(saved.every((f) => f.endsWith('-debrief-record.json'))).toBe(true);

  // Both records name the SAME flight and exactly one of them reports it. Read off the files
  // themselves, because the file is the only thing that crosses the device boundary.
  const tokens = await Promise.all(saved.map(async (f) => JSON.parse(await readFile(f, 'utf8')).grouping));
  expect(tokens[0]?.flight, 'the record carries a grouping at all').toBeTruthy();
  expect(tokens[0]?.flight, 'both records name one flight').toBe(tokens[1]?.flight);
  expect(tokens.filter((g) => g?.reports), 'exactly one reports it').toHaveLength(1);
  expect(tokens.every((g) => g?.of === 2), 'each states the flight held two recordings').toBe(true);

  // Now wipe the logbook, so nothing but the two files can supply the grouping.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /^Delete/ }).click();
  await expect(flights).toHaveCount(0);

  // Drop both records at once, as a flyer would from an archive folder. Two files assemble a
  // COMPARISON, so the sentence is read here and the logbook is checked afterwards.
  await page.getByLabel('Choose a flight log file').setInputFiles(saved);
  const restored = page.getByText(/carries the grouping you saved it with/).first();
  await expect(restored, 'it says the grouping was remembered, not worked out').toBeVisible({ timeout: 30_000 });
  // Naming the files, so the flyer can see WHICH two Debrief put together.
  for (const f of saved) await expect(restored).toContainText(path.basename(f));

  // The grouping itself: back on the logbook, one flight where two files were dropped.
  await page.goto('/');
  await expect(flights, 'ONE flight in the logbook, not two').toHaveCount(1, { timeout: 30_000 });
  // …and it is one flight OF TWO RECORDINGS, not one file that lost its partner — the failure a
  // bare count of 1 would also pass.
  await expect(page.getByRole('button', { name: /Recorded 2 times/ }).first()).toBeVisible();
});

/** A design stating THREE simulations, with apogees far enough apart that the picker's own
 *  labels tell them apart: 100 m, 200 m and 300 m are 328, 656 and 984 ft. Built here rather
 *  than taken from the corpus so this case runs on a fork with no fixtures token — the corpus
 *  `.ork` states five and is the same shape. */
const THREE_SIM_ORK = storedZip(
  'rocket.ork',
  `<?xml version='1.0' encoding='utf-8'?><openrocket version="1.10" creator="OpenRocket 24.12">` +
    `<rocket><name>Telemetrum</name></rocket><simulations>` +
    [
      { name: 'Simulation 1 - A8-3', alt: 100 },
      { name: 'Simulation 2 - B6-4', alt: 200 },
      { name: 'Simulation 3 - C6-5', alt: 300 },
    ]
      .map(
        (s) =>
          `<simulation status="uptodate"><name>${s.name}</name>` +
          `<flightdata maxaltitude="${s.alt}" maxvelocity="68.6" maxacceleration="143.649" maxmach="0.2" ` +
          `timetoapogee="6.5" flighttime="60" groundhitvelocity="4.681" launchrodvelocity="15.365" ` +
          `deploymentvelocity="2.646" optimumdelay="2.751"/></simulation>`,
      )
      .join('') +
    `</simulations></openrocket>`,
);

test('a design stating several simulations lets the flyer say which flew, and says it was theirs', async ({ page }) => {
  // D9 slice 3b. Debrief still refuses to pick — nothing in a flight log names the motor — so
  // what ships is the flyer's own statement, attributed to them on the surface where a
  // PREDICTION sits beside a MEASUREMENT. The refusal stays the default and stays reachable.
  await page.goto('/');
  const orkPath = path.join(os.tmpdir(), 'three-sims.ork');
  writeFileSync(orkPath, THREE_SIM_ORK);
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), orkPath]);

  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });

  // Before anybody says anything: no prediction is compared, and the refusal says why.
  const picker = page.getByRole('region', { name: /Which simulation flew/ });
  await expect(picker).toBeVisible();
  await expect(page.getByText(/will not pick one to compare against/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Predicted' })).toHaveCount(0);

  // Each run is offered by name AND by its stated apogee — the thing that tells three
  // OpenRocket-default names apart.
  const group = picker.getByRole('group', { name: 'Which simulation flew' });
  const sim2 = group.getByRole('button', { name: /Simulation 2 - B6-4/ });
  await expect(sim2).toContainText('656 ft');
  // The design's own word for how current each run is, VISIBLE rather than in a title — a chip
  // whose freshness is hover-only says nothing at all at the pad, and picking a run the design
  // has been edited past compares a flight against numbers that predate the edit.
  await expect(sim2, 'the file\u2019s own status, carried verbatim').toContainText('uptodate');

  // Say which flew.
  await group.getByRole('button', { name: /Simulation 2 - B6-4/ }).click();

  const panel = page.getByRole('region', { name: /Predicted, logged, and read|design’s prediction/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('row', { name: /Apogee/ }).first()).toContainText('656 ft');
  // Attribution is the whole point: Debrief did not work this out.
  await expect(page.getByText(/You said “Simulation 2 - B6-4” is the one that flew/)).toBeVisible();
  await expect(page.getByText(/Debrief cannot read that from a flight log/)).toBeVisible();
  await expect(page.getByText(/the other 2 are not compared/)).toBeVisible();
  // …and the refusal is no longer on a flight it is no longer true of.
  await expect(page.getByText(/will not pick one to compare against/)).toHaveCount(0);

  // Change it. The old choice leaves nothing behind — one attribution line, one apogee.
  await group.getByRole('button', { name: /Simulation 3 - C6-5/ }).click();
  await expect(panel.getByRole('row', { name: /Apogee/ }).first()).toContainText('984 ft');
  await expect(page.getByText(/You said “Simulation 3 - C6-5” is the one that flew/)).toBeVisible();
  await expect(page.getByText(/You said “Simulation 2 - B6-4”/)).toHaveCount(0);

  // A zoom set to compare two traces survives picking the other trace. "Controls that forget" is
  // a named tell, and this one forgot because the chart group was keyed on the flight OBJECT,
  // which a choice rewrites — additively, with no re-analysis, so nothing about the measured
  // series moved at all.
  await page.getByRole('button', { name: 'Ascent', exact: true }).first().click();
  const ascent = page.getByRole('button', { name: 'Ascent', exact: true }).first();
  await expect(ascent).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: /Simulation 2 - B6-4/ }).click();
  await expect(ascent, 'the view a flyer chose is still the view').toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: /Simulation 3 - C6-5/ }).click();

  // And the way back out — the state a flyer entered is one they can leave, which is what
  // stops this being a one-way door.
  await group.getByRole('button', { name: /Don’t compare one/ }).click();
  await expect(page.getByText(/will not pick one to compare against/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Predicted' })).toHaveCount(0);
  await expect(page.getByText(/You said/)).toHaveCount(0);
});

test('a chosen simulation reaches the exports, not just the panel', async ({ page }) => {
  // The rule this repo keeps relearning: when a value is computed, presented or withheld, it
  // changes on EVERY surface that carries it. A choice that filled the cross-check and left the
  // .md a flyer pastes into a cert document saying Debrief declined to pick would be the caveat
  // landing on one panel and a confident claim on another.
  await page.goto('/');
  const orkPath = path.join(os.tmpdir(), 'three-sims-export.ork');
  writeFileSync(orkPath, THREE_SIM_ORK);
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), orkPath]);
  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });

  await page
    .getByRole('region', { name: /Which simulation flew/ })
    .getByRole('button', { name: /Simulation 3 - C6-5/ })
    .click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save .md' }).first().click();
  const text = readFileSync(await (await download).path(), 'utf8');

  expect(text, 'the chosen simulation’s apogee').toContain('984 ft');
  expect(text, 'and whose statement it was').toContain('You said “Simulation 3 - C6-5” is the one that flew');
  expect(text, 'the refusal is not still being made').not.toContain('will not pick one to compare against');
});

/** One simulation, named for the same rocket as THREE_SIM_ORK, so both designs pair to one log. */
const ONE_SIM_TELEMETRUM_ORK = storedZip(
  'rocket.ork',
  `<?xml version='1.0' encoding='utf-8'?><openrocket version="1.10" creator="OpenRocket 24.12">` +
    `<rocket><name>Telemetrum</name></rocket><simulations>` +
    `<simulation status="uptodate"><name>The only one</name>` +
    `<flightdata maxaltitude="150" maxvelocity="68.6" maxacceleration="143.649" maxmach="0.2" ` +
    `timetoapogee="6.5" flighttime="60" groundhitvelocity="4.681" launchrodvelocity="15.365" ` +
    `deploymentvelocity="2.646" optimumdelay="2.751"/></simulation>` +
    `</simulations></openrocket>`,
);

test('a saved record that already names its simulation comes back saying so, not asking again', async ({ page }) => {
  // The failure this closes, found by the pre-push review: `pairPredictions` decided "offer a
  // choice" from "this design contributed no figures", which is also true of a flight that ALREADY
  // states one — because a canonical record keeps `notes`, `reported` and `predicted` verbatim. So
  // doing exactly what the chosen note tells a flyer to do (drop the design in again beside the
  // flight) stapled the refusal on beside the statement contradicting it, and opened the picker
  // showing "Don't compare one" over a populated Predicted column.
  await page.goto('/');
  const orkPath = path.join(os.tmpdir(), 'three-sims-record.ork');
  writeFileSync(orkPath, THREE_SIM_ORK);
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), orkPath]);
  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });

  await page
    .getByRole('region', { name: /Which simulation flew/ })
    .getByRole('button', { name: /Simulation 3 - C6-5/ })
    .click();

  const archive = await mkdtemp(path.join(os.tmpdir(), 'debrief-simchoice-'));
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save record' }).click(),
  ]);
  const record = path.join(archive, dl.suggestedFilename());
  await dl.saveAs(record);

  // Wipe the logbook, so what comes back comes back from the FILE and not from this browser.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /^Delete/ }).click();

  await page.getByLabel('Choose a flight log file').setInputFiles([record, orkPath]);
  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });

  // The statement survived, and Debrief is not asking again over the top of it.
  await expect(page.getByText(/You said “Simulation 3 - C6-5” is the one that flew/)).toBeVisible();
  await expect(page.getByText(/will not pick one to compare against/)).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Predicted' })).toBeVisible();

  // …and the control agrees with the panel beside it rather than contradicting it.
  const group = page.getByRole('group', { name: 'Which simulation flew' });
  await expect(group.getByRole('button', { name: /Simulation 3 - C6-5/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: /Don’t compare one/ })).toHaveAttribute('aria-pressed', 'false');
});

test('two designs claiming one flight are not offered a picker that would delete one of them', async ({ page }) => {
  // Also from the pre-push review. Applying a choice strips predicted rows by SOURCE, so with two
  // designs paired onto one log the picker would delete the other design's figures and its curve
  // while leaving its note behind — asserting a prediction no longer on the page. Both `.ork`s
  // name the same rocket as the log, so `sameRocket` pairs both.
  await page.goto('/');
  const three = path.join(os.tmpdir(), 'two-designs-three.ork');
  const one = path.join(os.tmpdir(), 'two-designs-one.ork');
  writeFileSync(three, THREE_SIM_ORK);
  writeFileSync(one, ONE_SIM_TELEMETRUM_ORK);
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'), one, three]);
  await expect(page.getByRole('heading', { name: /Flight report/i })).toBeVisible({ timeout: 60_000 });

  // No picker at all — and the single-simulation design's figures are untouched, which is the
  // thing the picker would have deleted.
  await expect(page.getByRole('region', { name: /Which simulation flew/ })).toHaveCount(0);
  const panel = page.getByRole('region', { name: /Predicted, logged, and read|design’s prediction/ });
  await expect(panel.getByRole('row', { name: /Apogee/ }).first()).toContainText('492 ft'); // 150 m
  // The design stating several still says so, so the drop is still accounted for in full.
  await expect(page.getByText(/will not pick one to compare against/)).toBeVisible();
});

/**
 * A flight Debrief MADE UP has to say so where the numbers are, on every surface a figure can
 * travel out through — `ROADMAP.md`'s D10, and the hardest clause of it.
 *
 * The file and the mapper walk that opens it live in `./madeUp`, because three specs drive the
 * same made-up flight now — this one, `stitch.spec.ts` for the composite timeline, and
 * `audit.spec.ts` for the share link. Read that module's header for why it is written test-side
 * rather than imported from `lib/`.
 */

test('a flight Debrief made up says so at the top of the report AND beside the readings', async ({ page }) => {
  await openMadeUpFlight(page);

  // Two notices, not one, and the second is the load-bearing half: the report runs nine screens
  // on a phone, and the readings grid is the part that gets screenshotted, printed and scrolled
  // straight to. A claim true at the top of a document and absent where the numbers are is the
  // shape `MAINTAINING.md` names as worse than either alone.
  await expect(page.locator('[data-synthetic="report"]')).toContainText(SYNTH_SENTENCE);
  await expect(page.locator('[data-synthetic="report"]')).toContainText(SYNTH_TAIL);
  // The readings carry the SHORT form, and that is asserted as a difference rather than as a
  // second copy: two renderings of the same 200 characters cost ~230 px of an 844 px phone and
  // read out twice to a screen reader. Swapping one for the other has to be a failure.
  await expect(page.locator('[data-synthetic="readings"]')).toContainText(SYNTH_SHORT);
  await expect(
    page.locator('[data-synthetic="readings"]'),
    'the readings carry the short form, not the whole paragraph again',
  ).not.toContainText(SYNTH_TAIL);

  // …and it is not merely present, it is ABOVE the numbers it qualifies.
  const readings = page.locator('[data-synthetic="readings"]');
  const firstTile = page.locator('[data-reading]').first();
  const noticeBox = await readings.boundingBox();
  const tileBox = await firstTile.boundingBox();
  expect(noticeBox && tileBox && noticeBox.y < tileBox.y, 'the notice sits above the first reading').toBe(true);

  // It stays on the page a printer sees. Everything else in this strip is `print:hidden`, and a
  // printed page of made-up numbers with the claim stripped off is the worst version of this.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-synthetic="report"]')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
});

test('the file a made-up flight exports says so on every row, not just on screen', async ({ page }) => {
  // **The walk the unit tests cannot do: that the BUTTON is wired to the labelled writer.** The
  // per-row `Provenance` column is asserted over `analyzedDataCsv` directly in
  // `lib/synthetic.test.ts`; nothing there proves the report's save strip calls it with the flight
  // that knows. This is the export a flyer pastes into a spreadsheet, so the gap between "the
  // function is right" and "the button reaches the function" is the whole risk.
  await openMadeUpFlight(page);

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    // Two controls on this page carry the visible label "Save .csv" — the report's data export and
    // the channel explorer's plotted-data export, which is a separate sink with its own walk below.
    // Addressed by its title; the label collision is filed in `BACKLOG.md`.
    page.getByTitle(/Download the whole flight as CSV/).click(),
  ]);
  const text = await readFile(await csv.path(), 'utf8');
  const lines = text.trim().split('\n');
  expect(lines[0].startsWith('provenance,'), `header was: ${lines[0].slice(0, 60)}`).toBe(true);
  // The walk's own generated flight is ~400 samples (the module's is 5,144); this bound is about
  // the export not being a stub, so it is set from what this file actually holds.
  expect(lines.length, 'a whole flight of samples, not a stub').toBeGreaterThan(300);
  // Every DATA row, because select-the-block-and-paste is the gesture this file exists for.
  expect(lines.slice(1).filter((l) => !l.startsWith('"SYNTHETIC')).length).toBe(0);
});

test('the channel explorer is a second data export, and it says so too', async ({ page }) => {
  // **The sink the 2026-08-09 audit missed entirely**, because it is not in `lib/documents.ts` and
  // the registry-driven check cannot reach what is not registered. `ChannelExplorer` writes its own
  // `<stem>-explore.csv` of exactly what is plotted, on every report, from a different writer
  // (`lib/explore.ts#exploreCsv`) than the report's data CSV — so the walk above passing said
  // nothing at all about this one.
  await openMadeUpFlight(page);

  // Addressed by its title, like the report's export above: both controls read "Save .csv".
  const save = page.getByTitle(/Save the plotted data/);
  await expect(save).toBeVisible({ timeout: 60_000 });

  const [csv] = await Promise.all([page.waitForEvent('download'), save.click()]);
  const lines = (await readFile(await csv.path(), 'utf8')).trim().split('\n');
  // FIRST, so it is the column a spreadsheet opens on — and on the HEADER too, because
  // `SampleTable` beside it copies one column out on its own and nothing else travels with it.
  expect(lines[0].startsWith('"Provenance",'), `header was: ${lines[0].slice(0, 80)}`).toBe(true);
  // EVERY column, counted — not "at least one". A regression that tagged the x column and dropped
  // the series would satisfy a `toContain`, and the walk claiming to cover this is the one a future
  // session will trust over the unit cases.
  const cols = lines[0].split('","').length - 1; // the leading `Provenance` is not a data column
  expect(
    lines[0].split('","').filter((h) => h.includes('SYNTHETIC — ')).length,
    `only some columns tagged in ${lines[0].slice(0, 200)}`,
  ).toBe(cols);
  expect(cols, 'a time column and at least one channel').toBeGreaterThan(1);
  expect(lines.length, 'the plotted data, not a stub').toBeGreaterThan(300);
  expect(
    lines.slice(1).filter((l) => !l.startsWith('"SYNTHETIC — made up by Debrief, not flown",')).length,
    'every data row carries it, because a pasted block leaves the header behind',
  ).toBe(0);
});

/**
 * D10's second half, walked: a flyer who has never flown a rocket can SEE the column mapper work,
 * in one click, without supplying a file — and cannot mistake what they are looking at.
 *
 * The mapper was a shipped capability with no demonstration at all, because a sample a parser
 * recognises cannot demonstrate it: the only file that reaches the mapper is one no parser claims.
 * So this sample is generated rather than borrowed, which makes it the first flight in the app
 * that Debrief made up — and the reason the previous twelve slices existed.
 */
test('the made-up sample opens the column mapper, and says it is made up before and after', async ({ page }) => {
  await page.goto('/');
  const offer = page.getByRole('button', { name: /A spreadsheet Debrief has to be told about/ });
  await expect(offer).toBeVisible();
  // BEFORE: the offer itself carries the tag, beside three buttons that open real recordings.
  const aside = offer.locator('..');
  await expect(aside, 'the button says what it opens before it is pressed').toContainText('SYNTHETIC');

  await offer.click();
  // The mapper, which is the capability being demonstrated — not a report.
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Role for the Elapsed column')).toBeVisible();

  // The roles a flyer would pick off the header row. Height and Rate are in feet, which is what
  // the generated file writes and what makes the unit selects worth demonstrating.
  await page.getByLabel('Role for the Elapsed column').selectOption('time');
  await page.getByLabel('Role for the Height column').selectOption('altitude');
  await page.getByLabel('Role for the Rate column').selectOption('velocity');
  await page.getByLabel('Unit for the Height column').selectOption('ft');
  await page.getByLabel('Unit for the Rate column').selectOption('ft/s');
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 60_000 });

  // AFTER: the same two notices every made-up flight carries, from the file's own marker rather
  // than from the button that offered it — so it is still true of the file a flyer saves and
  // drops back in.
  await expect(page.locator('[data-synthetic="report"]')).toContainText(SYNTH_SENTENCE);
  await expect(page.locator('[data-synthetic="readings"]')).toContainText(SYNTH_SHORT);
  // …and it is a real reading of the generated curve, not a stub: apogee 1,666.4 m = 5,467 ft.
  await expect(page.locator('[data-reading]').first()).toBeVisible();
  await expect(page.getByText(/5,4\d\d ft|1,66\d m/).first()).toBeVisible();
});

test('the three exports a flyer navigates by say the flight was made up', async ({ page }) => {
  // **The sink where an unlabelled figure is not read but WALKED TO.** A `.gpx` goes into a
  // handheld, a `.kml` into Google Earth, and the coordinate pair into a maps app — three files
  // that leave with no report around them and whose whole purpose is to send somebody to a place.
  // Everything below is read back out of the real download or the real clipboard, so a call site
  // that passes `synthetic={false}` fails here even though every unit case still passes.
  await openMadeUpFlight(page, { gps: true });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const saveGpx = page.getByRole('button', { name: 'Save GPX' });
  await expect(saveGpx).toBeVisible({ timeout: 60_000 });

  const [gpxDl] = await Promise.all([page.waitForEvent('download'), saveGpx.click()]);
  const gpx = await readFile(await gpxDl.path(), 'utf8');
  // The waypoint NAME, because a receiver's go-to list shows a name and nothing else.
  expect(gpx, `gpx was: ${gpx.slice(0, 300)}`).toContain('<name>SYNTHETIC — Landing</name>');
  // The document header, ahead of the waypoint — GPX 1.1 schema order, not preference.
  expect(gpx.indexOf('<metadata>')).toBeGreaterThan(-1);
  expect(gpx.indexOf('<metadata>')).toBeLessThan(gpx.indexOf('<wpt '));
  expect(gpx).toContain(SYNTH_SENTENCE);
  // …and it is still a track with fixes in it, not a labelled stub.
  expect((gpx.match(/<trkpt /g) ?? []).length, 'a whole track, not a stub').toBeGreaterThan(100);

  // …and it says which software wrote it, which the schema's own annotation on `creator` asks for
  // and a bare product name does not answer.
  expect(gpx).toMatch(/creator="Debrief [^"]+"/);

  const [kmlDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save KML' }).click(),
  ]);
  const kml = await readFile(await kmlDl.path(), 'utf8');
  // Every name Google Earth draws — the document, the landing pin, the track — counted rather
  // than "at least one", because tagging the document and leaving the pin bare is the regression
  // this walk exists to catch.
  expect((kml.match(/<name>SYNTHETIC — /g) ?? []).length, `kml names: ${kml.slice(0, 400)}`).toBe(3);
  expect(kml).toContain(SYNTH_SENTENCE);

  await page.getByRole('button', { name: 'Copy coords' }).click();
  await expect(page.getByRole('button', { name: 'Copied ✓' })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  // The pair first and unchanged, so pasting it into a maps app still resolves — then the claim.
  expect(clip, `clipboard was: ${clip}`).toMatch(/^-?\d+\.\d+, -?\d+\.\d+ \(SYNTHETIC — made up by Debrief, not flown\)$/);
});

test('a figure of a made-up flight carries the claim ON the image', async ({ page }, testInfo) => {
  // **The sink an unlabelled figure travels furthest through.** A `.svg` or `.png` of a plot goes
  // into a forum post or a cert document with no report around it, no file to re-read and no
  // metadata block anyone will open — so a caveat beside the image on screen reaches none of it.
  await openMadeUpFlight(page);
  await expect(page.getByTitle(/Save the plotted data/)).toBeVisible({ timeout: 60_000 });

  const [svgDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle(/Save the plot as a vector SVG/).click(),
  ]);
  const svg = await readFile(await svgDl.path(), 'utf8');
  expect(svg.startsWith('<svg') || svg.includes('<svg')).toBe(true);
  expect(svg, 'the claim is drawn into the figure').toContain(SYNTH_SHORT);
  expect(svg, "in §2's caveat wash, as a band rather than a line of grey text").toContain('#fffbeb');

  // **And the PNG grew by the band rather than having it painted over the plot** — a chart's
  // top-left is where the first series' peak is drawn, so an overlay would cover the trace the
  // figure exists to show. Read out of the PNG's own IHDR (bytes 16..24) rather than by decoding
  // the image: the height against the live canvas's is the whole claim, and it needs no library.
  const [pngDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle(/Save the current plot as a PNG/).click(),
  ]);
  const png = await readFile(await pngDl.path());
  expect(png.subarray(1, 4).toString('latin1'), 'a real PNG').toBe('PNG');
  const pngH = png.readUInt32BE(20);
  // The EXPLORER's chart specifically. `canvas` alone matched the shareable card at 1200x630 and
  // reported the PNG as shorter than the plot it composites — a red on a feature that was working.
  // The charts are the `role="img"` hosts; the explorer's is the last one on the report.
  const canvasH = await page.evaluate(() => {
    const hosts = document.querySelectorAll('[role="img"][tabindex="0"]');
    const c = hosts[hosts.length - 1]?.querySelector('canvas') as HTMLCanvasElement | null;
    return c ? c.height : 0;
  });
  expect(canvasH, 'the explorer chart has drawn').toBeGreaterThan(0);
  expect(pngH, `the PNG is taller than the plot it composites (${pngH} vs ${canvasH})`).toBeGreaterThan(canvasH);
  void testInfo;
});

test('the window stats a cert document quotes carry it too', async ({ page }) => {
  // **The explorer's THIRD export, and the one the slice that closed the other two missed.** Found
  // by a pre-push review: `Copy these stats` puts min/max/mean/Δ/rate for every plotted channel on
  // the clipboard, and the code comment above that button calls them "the numbers a cert document
  // quotes". It was in no row of D10's sink audit, so nothing could have gone red about it.
  await openMadeUpFlight(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const copy = page.getByRole('button', { name: /Copy these stats/ });
  await expect(copy).toBeVisible({ timeout: 60_000 });
  await copy.click();
  await expect(page.getByText(/Copied|copied/).first()).toBeVisible({ timeout: 30_000 });

  const text = await page.evaluate(() => navigator.clipboard.readText());
  const rows = text.trim().split('\n').slice(1); // past the header
  expect(rows.length, 'a row per plotted channel').toBeGreaterThan(0);
  // In the CHANNEL cell, where this table already carries the withheld-speed caveat — so it
  // survives a paste that takes only the first two columns.
  expect(
    rows.filter((r) => !r.startsWith('SYNTHETIC — ')).length,
    `every channel row carries it; got: ${rows[0]?.slice(0, 80)}`,
  ).toBe(0);
});

test('one channel copied out of the sample table carries the claim in its header', async ({ page }) => {
  // **The narrowest sink there is: one column, one header cell, nothing else.** The sample table's
  // per-column copy exists precisely so a flyer does not have to save the CSV and delete the other
  // columns — so the export that carries the claim in a *different* column cannot help here, and
  // the header is the only cell that travels.
  await openMadeUpFlight(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  // The table is collapsed by default — the chart is the answer most of the time.
  await expect(page.getByTitle(/Save the plotted data/)).toBeVisible({ timeout: 60_000 });
  // The `summary` specifically: the report also EXPLAINS the control in prose ("…show the
  // samples…" in an `em`), so the plain text locator matches two elements and fails strict mode.
  await page.locator('summary').filter({ hasText: 'Show the samples' }).click();
  const copy = page.getByRole('button', { name: /^Copy the .+ column$/ }).first();
  await expect(copy).toBeVisible({ timeout: 60_000 });
  await copy.click();
  // The announcement first — the copy is async, and reading the clipboard in the next statement
  // races the write.
  await expect(page.getByText(/copied — [\d,]+ rows/)).toBeVisible({ timeout: 30_000 });

  const text = await page.evaluate(() => navigator.clipboard.readText());
  const [header] = text.split('\n');
  expect(header.startsWith('SYNTHETIC — '), `clipboard header was: ${header}`).toBe(true);
  expect(text.trim().split('\n').length, 'the column itself, not just a header').toBeGreaterThan(50);
});

test('the shareable card carries it as a band, and the .png is the same pixels', async ({ page }) => {
  // **The sink where an unlabelled figure travels furthest.** The card exists to be posted to a
  // club chat or a forum: it leaves the device as a picture, with no report around it, no file to
  // re-read and no metadata block anyone will open. So the claim is drawn ON the canvas — asserted
  // here by reading the pixels back, because a DOM assertion would pass on a card that renders the
  // sentence beside the image and exports without it, which is exactly the failure to avoid.
  await openMadeUpFlight(page);
  await expect(page.getByRole('button', { name: 'Save card' })).toBeVisible();

  // §2's amber-50 band (#fffbeb) must actually be painted, and the caveat text drawn in amber-700.
  // The CARD's canvas by its accessible name — the report also draws uPlot charts onto canvases,
  // and `locator('canvas').first()` picked one of those, which is a check that would have
  // reported the band missing while it was painted perfectly.
  const painted = await page.getByRole('img', { name: /Shareable flight card/ }).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let amber = 0;
    for (let i = 0; i < data.length; i += 4) {
      // amber-50 fill and amber-300 border: red high, blue clearly lower — a band, not the white
      // card and not the indigo chip.
      if (data[i] > 230 && data[i + 1] > 200 && data[i + 2] < 200) amber++;
    }
    return { amber, px: width * height };
  });
  expect(painted.amber, 'the caveat band is painted on the canvas itself').toBeGreaterThan(2000);

  // …and the file a flyer actually posts is that canvas.
  const [png] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save card' }).click(),
  ]);
  expect(png.suggestedFilename()).toMatch(/-card\.png$/);
  const bytes = await readFile(await png.path());
  expect(bytes.length, 'a real image, not an empty canvas').toBeGreaterThan(10_000);
});

test('a flight Debrief made up is tagged in the logbook and never wears its star', async ({ page }) => {
  await openMadeUpFlight(page);

  // Two REAL flights beside it, so the star has a set it could settle — and 1,666 m of made-up
  // apogee that would beat both of them.
  // Two REAL flights beside it, and they are chosen rather than arbitrary: both are ≈1,000 ft
  // where the made-up flight reads ≈5,459 ft, so the demonstration WOULD hold the crown if it
  // were allowed to compete. Pick two higher fixtures and this assertion passes on a broken
  // exclusion — which is the version of this test that proves nothing.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([
      path.join(__dirname, '../lib/parsers/__fixtures__/perfectflite-pnut.pf2'),
      path.join(__dirname, '../lib/parsers/__fixtures__/featherweight-raven-fip.csv'),
    ]);
  await expect(page.getByRole('heading', { name: /Comparing 2 flights/i })).toBeVisible({ timeout: 60_000 });

  // Back to the landing surface, by RELOADING rather than by a button: the row has to come out of
  // storage carrying the tag, not out of the render that wrote it.
  await page.goto('/');
  const logbook = page.getByRole('list', { name: 'Your flights' });
  const row = logbook.getByRole('listitem').filter({ hasText: 'demo-mapper-flight.csv' }).first();
  await expect(row).toContainText('SYNTHETIC');
  // The star is the claim that must never land on it: "highest of your remembered flights" about
  // a flight nobody flew.
  await expect(row).not.toContainText('★');
  // …and the set is genuinely rankable, so this is the star going elsewhere rather than the star
  // being absent. Without this the assertion above passes on a logbook that crowns nothing.
  await expect(logbook.getByText('★').first()).toBeVisible();

  // **REOPEN it, which is the hop the first cut of this feature lost the claim on.** A hand-mapped
  // flight is rebuilt from the stored text plus the stored mapping, so nothing about the reopened
  // report comes from the render that wrote the row — and a reopen is also a SAVE, so an erasure
  // here would be permanent rather than cosmetic. Walked as well as unit-tested because the unit
  // test stops at `importRecent` and this is the click a flyer actually makes.
  await row.getByRole('button').first().click();
  await expect(page.locator('[data-synthetic="report"]')).toContainText(SYNTH_SENTENCE);
  await expect(page.locator('[data-synthetic="report"]')).toContainText(SYNTH_TAIL);
  // The readings carry the SHORT form, and that is asserted as a difference rather than as a
  // second copy: two renderings of the same 200 characters cost ~230 px of an 844 px phone and
  // read out twice to a screen reader. Swapping one for the other has to be a failure.
  await expect(page.locator('[data-synthetic="readings"]')).toContainText(SYNTH_SHORT);
  await expect(
    page.locator('[data-synthetic="readings"]'),
    'the readings carry the short form, not the whole paragraph again',
  ).not.toContainText(SYNTH_TAIL);
  await page.goto('/');
  await expect(
    page.getByRole('list', { name: 'Your flights' }).getByRole('listitem').filter({ hasText: 'demo-mapper-flight.csv' }).first(),
    'and the row still wears the tag after the reopen saved it back',
  ).toContainText('SYNTHETIC');
});

/**
 * The comparison is where an unlabelled made-up flight does the most damage: the surface exists
 * to put flights in columns beside each other, so a demonstration reads as one more recording.
 *
 * **Walked because the SCREEN was the surface that was actually broken, and no unit test could
 * see it.** The provenance row was assembled inside `metricsTable()` in `CompareView`, which the
 * `.csv` and the clipboard read and the rendered table did not — the table rendered
 * `compareMetricRows` directly. So a flyer looking at the comparison saw nothing, while the CSV
 * saved from that same screen said "made up by Debrief, not flown". The audit table called this
 * sink `labelled` and pointed at a unit test that only checks `buildComparison` copies a member.
 */
test('a made-up flight is marked in the comparison table a flyer looks at', async ({ page }) => {
  // Three analyses and a comparison in one walk — the mapper flow, a second real flight, then
  // `/compare` rebuilding both out of storage. CI timed the first cut out at the default 30 s
  // while the app was working correctly, and an `expect` timeout longer than the TEST timeout
  // cannot save it: the test clock fires first. `e2e/pwa.spec.ts` sets this the same way.
  test.setTimeout(120_000);
  await openMadeUpFlight(page);

  // One REAL flight beside it, so the row has both cells to tell apart. A comparison of one
  // made-up flight alone could pass a weaker assertion that never renders the word "recorded".
  // **Ingested by the two-file drop, which is the path already proven green on CI** — the walk
  // directly above this one uses exactly it. Three single-file variants were tried first and each
  // passed here and failed on CI: waiting for "Analyze another flight" (the report we just left is
  // already showing it), waiting for the file name (matches while the drop zone is still READING
  // the file), and asserting the button had gone first (still lost the race on a slower runner).
  // The heading below is the signal none of those were: a comparison exists only once BOTH files
  // are parsed, analysed and saved, so there is nothing left in flight when it appears.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([
      path.join(__dirname, '../lib/parsers/__fixtures__/perfectflite-pnut.pf2'),
      path.join(__dirname, '../lib/parsers/__fixtures__/featherweight-raven-fip.csv'),
    ]);
  await expect(page.getByRole('heading', { name: /Comparing 2 flights/i })).toBeVisible({ timeout: 60_000 });

  // Out of STORAGE rather than out of the render that wrote it — the same reason the logbook
  // walk reloads: `compareFromLogbook` rebuilds the flight, and that is the hop a marker gets
  // dropped on.
  await page.goto('/');
  // …and the control has to be THERE before it can be ticked, because the save is an IndexedDB
  // write and the list paints once storage answers. Waited on the CHECKBOX rather than on the row:
  // a `listitem` filtered by the file name looks like the more natural assertion and does not
  // match, so it fails on a logbook that is rendering the flight perfectly.
  const pnutBox = page.getByLabel('Select perfectflite-pnut.pf2 to compare');
  await expect(pnutBox).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Select demo-mapper-flight.csv to compare').check();
  await pnutBox.check();
  await page.getByRole('button', { name: /Compare 2 flights/ }).click();
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 60_000 });

  // FIRST in the table, so it is read before the numbers rather than after them.
  const table = page.locator('table').filter({ has: page.getByRole('rowheader', { name: 'Apogee', exact: true }) });
  const provenance = table
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Provenance', exact: true }) });
  await expect(provenance).toBeVisible();
  // EXACTLY ONE cell wears the claim and exactly one says "recorded" — the row's whole job is
  // telling the two apart, and an assertion on the made-up cell alone passes on a row that says
  // the same thing about every flight.
  //
  // Counted rather than positional, and that is what the first cut of this walk got wrong: the
  // column order follows the logbook, not the order the files were opened in, so `.first()`
  // pinned whichever flight happened to sort first. Each cell also carries the phone layout's
  // `aria-hidden` column label, so it is `hasText`, never `toHaveText`.
  const cells = provenance.getByRole('cell');
  await expect(cells.filter({ hasText: 'made up by Debrief, not flown' })).toHaveCount(1);
  await expect(cells.filter({ hasText: /recorded/ })).toHaveCount(1);

  // Not sortable, and not just visually: the readings all carry a sort button in their row
  // header, and a provenance row that grew one would offer to order flights by a sentence.
  await expect(
    provenance.getByRole('rowheader').getByRole('button'),
    'the provenance row header offers no sort control',
  ).toHaveCount(0);

  // **And nothing in this table crowns the flight it just called made up.** The demonstration
  // reads ~5,459 ft against the Pnut's ~1,025 ft, so it would hold every "highest" mark in the
  // table if it were allowed to compete — which is what makes this assertion mean something
  // rather than passing on a table that crowns nobody. Walked as well as unit-tested because the
  // ★ is drawn in the component, and a row saying "not flown" two rows above a ★ titled "Highest
  // of the flights being compared" is a table contradicting itself where a flyer reads it.
  await expect(
    table.getByText('★'),
    'no flight in this comparison wears the highest mark, because only one of them was flown',
  ).toHaveCount(0);

  // **And the cross-check is WITHHELD, saying why.** The panel above the table opens "If these are
  // recordings of the same flight, the independent readings agree to within X%" — a claim about
  // independent measurements, over a set where only one of the two is a measurement. `crossCheck`
  // excludes a made-up flight, which on this set leaves one recording and nothing to compare, so
  // the surface has to say that rather than fall silent: an absent panel and a panel the tool
  // forgot to compute look identical.
  const withheld = page.locator('[data-synthetic="cross-check"]');
  await expect(withheld).toBeVisible();
  await expect(withheld).toContainText('No cross-check');
  await expect(withheld).toContainText('not an independent measurement');
  await expect(
    page.getByText('agree to within'),
    'the confident cross-check sentence is gone, not merely pushed below the fold',
  ).toHaveCount(0);

  // **And the overlay CSV saved from this screen tells the two flights apart by COLUMN.** This is
  // the export `exploreCsv`'s other call site writes, and the shape that made it a separate sink:
  // its columns are the flights, so the per-row `Provenance` cell the single-flight exports carry
  // cannot say which one is made up — only the column header can. The row-level cell is still
  // there, pointing at the headers, because selecting the data block leaves the header behind.
  const [overlay] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle(/Save every overlaid channel/).click(),
  ]);
  const overlayLines = (await readFile(await overlay.path(), 'utf8')).trim().split('\n');
  const head = overlayLines[0];
  expect(head.startsWith('"Provenance",'), `header was: ${head.slice(0, 80)}`).toBe(true);
  // EXACTLY the made-up flight's columns, and not the recording's — the same both-directions
  // assertion the provenance ROW gets above, for the same reason: a tag on every column would
  // pass a weaker check while saying the recording was made up too.
  const heads = head.split('","');
  const demoCols = heads.filter((h) => h.includes('demo-mapper-flight'));
  expect(demoCols.length, `no demo columns in ${head.slice(0, 200)}`).toBeGreaterThan(0);
  expect(
    demoCols.filter((h) => !h.includes('SYNTHETIC — ')).length,
    `EVERY made-up column, not just one: ${demoCols.slice(0, 3).join(' | ')}`,
  ).toBe(0);
  expect(
    heads.filter((h) => h.includes('perfectflite-pnut') && h.includes('SYNTHETIC')),
    'the recording beside it is not tagged',
  ).toEqual([]);
  // The shared clock belongs to no one flight, so it is left alone even here.
  expect(head).toContain('"time after liftoff (s)"');
  expect(
    overlayLines[1].startsWith('"SYNTHETIC — some of these columns'),
    `first data row was: ${overlayLines[1].slice(0, 100)}`,
  ).toBe(true);

  // The other direction — a comparison of REAL flights gains no such row, and DOES get its
  // cross-check — is asserted in `e2e/compare.spec.ts`'s two-real-flights walk rather than rebuilt
  // here. Adding a third flight to this one to prove an absence is a longer path to a weaker
  // check, on a walk whose subject is the positive case.
});
