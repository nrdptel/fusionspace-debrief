import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

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
  const maxVelTile = page.getByText('Max velocity', { exact: true }).locator('xpath=..');
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

  // It survives a reload and a different flight, which is the point of naming it.
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
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
  await expect(gps.getByText(/locked fixes on the way up/)).toBeVisible();

  // The channel itself is plottable against the barometric line, not just summarised.
  await expect(page.getByLabel('X axis channel').locator('option', { hasText: 'altitude (GPS)' })).toHaveCount(1);
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
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
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
  // Hold the sample fetch open so the loading state can be read rather than raced.
  await page.route('**/samples/*.csv', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const note = page.getByRole('status').filter({ hasText: 'Reading' });
  await expect(note).toBeVisible();
  await expect(note).toContainText('the sample flight');
  await page.unroute('**/samples/*.csv');

  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();
});
