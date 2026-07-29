import { test, expect } from '@playwright/test';
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

  const velocity = page.getByRole('button', { name: 'Velocity', exact: true });
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
  await expect(page.getByRole('button', { name: 'Velocity', exact: true })).toHaveAttribute('aria-pressed', 'false');
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
  const altHeader = table.getByRole('button', { name: /^Altitude/ });
  await altHeader.click();
  const top = Number(await secondCol().innerText());
  const next = Number(await table.locator('tbody tr').nth(1).locator('td').nth(1).innerText());
  expect(top).toBeGreaterThanOrEqual(next);
  expect(top).toBeGreaterThan(Number(t0));
  // Announced to a screen reader, not only drawn.
  await expect(table.locator('th', { hasText: 'Altitude' })).toHaveAttribute('aria-sort', 'descending');

  // Second click flips it; the third puts the samples back in the order they were recorded.
  await altHeader.click();
  await expect(table.locator('th', { hasText: 'Altitude' })).toHaveAttribute('aria-sort', 'ascending');
  expect(Number(await secondCol().innerText())).toBeLessThanOrEqual(top);
  await altHeader.click();
  await expect(table.locator('th', { hasText: 'Altitude' })).toHaveAttribute('aria-sort', 'none');
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
  await table.getByRole('button', { name: /Copy the Altitude .* column/ }).click();
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
