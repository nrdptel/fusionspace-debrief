import { test, expect } from '@playwright/test';
import path from 'node:path';

// Audit, pass 3: every named parser auto-detecting in the real browser, the
// compare-selection cap, and the export buttons not yet exercised (explorer PNG,
// comparison PNG).

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);

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

// Reaching the report (not the column mapper) proves the file auto-detected.
const reachesReport = async (page: import('@playwright/test').Page) => {
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
};

for (const file of [
  'altusmetrum-telemetrum.csv',
  'perfectflite-pnut.pf2',
  'featherweight-raven-fip.csv',
  'blueraven-app-lr.csv',
  'aim-xtra.csv',
  'featherweight-gps.csv',
]) {
  test(`auto-detects and analyses ${file} in the browser`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Choose a flight log file').setInputFiles(fx(file));
    await reachesReport(page);
  });
}

test('a GPS log shows the recovery (ground track) view with walkback numbers', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('featherweight-gps.csv'));
  await reachesReport(page);
  await expect(page.getByRole('heading', { name: 'Recovery', exact: true })).toBeVisible();
  await expect(page.getByText('Landed from pad', { exact: true })).toBeVisible();
  await expect(page.getByText('Bearing', { exact: true })).toBeVisible();
  await expect(page.getByText('Max drift', { exact: true })).toBeVisible();
  // The measured wind aloft (from the descent drift), e.g. "12 ft/s from E".
  await expect(page.getByText('Wind (descent)', { exact: true })).toBeVisible();
  // The descent-wind stat value sits above the wind-aloft profile (which also reads
  // "… from <dir>"), so take the first match — the average stat, not a layer.
  await expect(page.getByText(/from (N|NE|E|SE|S|SW|W|NW)$/).first()).toBeVisible();
  // How far off vertical the ascent flew (weathercocking), from the GPS track.
  await expect(page.getByText('Off vertical', { exact: true })).toBeVisible();
  await expect(page.getByText(/flew about \d+° off vertical/)).toBeVisible();
  // The canvas exposes a text description of the track for screen readers.
  await expect(page.getByRole('img', { name: /landed .* from the pad, bearing/i })).toBeVisible();
  // This flight is supersonic — the design-point note calls it out.
  await expect(page.getByText(/Went supersonic — crossed Mach 1/)).toBeVisible();

  // GPS altitude → acceleration is honestly omitted, not shown as noise.
  await expect(page.getByText(/Acceleration is omitted/)).toBeVisible();
  await expect(page.getByText('Max acceleration', { exact: true })).toHaveCount(0);

  // The recovery view offers the exact landing coordinates and a GPX export.
  await expect(page.getByText(/^-?\d+\.\d+, -?\d+\.\d+$/)).toBeVisible(); // "34.49802, -116.95231"
  const [gpx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save GPX' }).click(),
  ]);
  expect(gpx.suggestedFilename()).toMatch(/-track\.gpx$/);
});

test('reads a wind-aloft profile (shear by altitude) from the GPS descent', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('featherweight-gps.csv'));
  await reachesReport(page);
  // The descent drift binned by altitude — a layered table of wind vs height.
  await expect(page.getByText('Wind aloft (by altitude)', { exact: true })).toBeVisible();
  // Each layer reads "<n> ft/s from <dir>"; there are several (the shear profile).
  const layers = page.getByText(/\d+\s*ft\/s from (N|NE|E|SE|S|SW|W|NW)$/);
  expect(await layers.count()).toBeGreaterThanOrEqual(2);
  // And an altitude band label like "650–1,301 ft".
  await expect(page.getByText(/[\d,]+–[\d,]+ ft$/).first()).toBeVisible();
});

test('an Altus Metrum GPS flight also gets the recovery view', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('altusmetrum-telemetrum.csv'));
  await reachesReport(page);
  await expect(page.getByRole('heading', { name: 'Recovery', exact: true })).toBeVisible();
  await expect(page.getByText('Max drift', { exact: true })).toBeVisible();
});

test('auto-detects a tiny Eggtimer file', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({ name: 'egg.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await reachesReport(page);
});

test('compare selection is capped at six flights', async ({ page }) => {
  await page.goto('/');
  const load = async (name: string) => {
    await page.getByLabel('Choose a flight log file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };
  for (let i = 1; i <= 7; i++) await load(`cap-${i}.csv`);

  // Tick six; the seventh must then be disabled (the comparison cap is six).
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('checkbox', { name: `Select cap-${i}.csv to compare` }).check();
  }
  await expect(page.getByRole('checkbox', { name: 'Select cap-7.csv to compare' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Compare 6 flights/ })).toBeVisible();
});

test('shows battery voltage when the logger recorded it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Battery low', { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+(\.\d+)?\s*V at rest/)).toBeVisible();
});

test('shows the deployment shock on a flight that logged acceleration', async ({ page }) => {
  await page.goto('/');
  // The bundled sample is a real Altus Metrum flight that logged acceleration and
  // had a firm main snatch (~6.9 g) — above the floor for showing a shock.
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/\d+(\.\d+)?\s*g shock/).first()).toBeVisible();
});

test('reports coast efficiency (drag loss) on the bundled sample', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Coast efficiency', { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d{1,3}%$/)).toBeVisible(); // e.g. "59%"
  await expect(page.getByText(/drag cost [\d,]+ (ft|m)/)).toBeVisible(); // the tile sub, e.g. "drag cost 5,109 ft"
});

test('reads roll/spin from a mapped roll-rate column', async ({ page }) => {
  await page.goto('/');
  const csv =
    'time,altitude,Roll Rate (deg/s)\n' +
    Array.from({ length: 40 }, (_, i) => {
      const alt = i < 20 ? i * 15 : Math.max(0, 300 - (i - 20) * 15);
      return `${(i * 0.1).toFixed(1)},${alt},540`;
    }).join('\n');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'spinny.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  // Generic CSV → the mapper, with the roll column pre-recognized.
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await expect(page.getByLabel(/Role for the Roll Rate/)).toHaveValue('rollRate');
  await page.getByRole('button', { name: 'Analyze flight' }).click();

  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Peak roll rate', { exact: true })).toBeVisible();
  await expect(page.getByText('Revolutions', { exact: true })).toBeVisible();
});

test('reports average boost acceleration alongside the peak', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Avg acceleration', { exact: true })).toBeVisible();
  await expect(page.getByText('over the boost', { exact: true })).toBeVisible();
});

test('reports thrust-to-weight off the pad on a clean accel flight, withholds it on a saturated one', async ({
  page,
}) => {
  // The AIM flight's accelerometer didn't saturate at liftoff → a real T/W (~7.5:1).
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('aim-xtra.csv'));
  await reachesReport(page);
  await expect(page.getByText('Thrust-to-weight', { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d+(\.\d)?:1$/)).toBeVisible(); // e.g. "7.5:1"

  // The bundled sample railed its accelerometer from the pad → T/W is withheld.
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Thrust-to-weight', { exact: true })).toHaveCount(0);
});

test('flags a saturated accelerometer on the bundled sample', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  // The sample's TeleMetrum accelerometer railed at ~17.9 g — a flat top we flag
  // honestly rather than reporting the railed value as the true peak.
  await expect(page.getByText('may be clipped')).toBeVisible();
});

test('measures the parachute Cd from the descent, and remembers the inputs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const panel = page.getByRole('region', { name: 'Parachute Cd (measured)' });
  await expect(panel.getByRole('heading', { name: 'Parachute Cd (measured)' })).toBeVisible();
  await expect(panel.getByText('—', { exact: true })).toBeVisible(); // nothing until inputs

  // The descending mass is entered once (in Landing energy) and shared.
  await page.getByRole('region', { name: 'Landing energy' }).getByLabel(/Descending mass/).fill('53'); // oz
  await panel.getByLabel(/Canopy diameter/).fill('36'); // in
  // A real canopy Cd lands in the rule-of-thumb band (this sample reads ~0.85), 2 dp.
  await expect(panel.getByText(/^\d\.\d{2}$/)).toBeVisible();
  await expect(panel.getByText(/terminal · rule of thumb/)).toBeVisible();

  // The inputs stick across a reload (localStorage).
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('region', { name: 'Parachute Cd (measured)' }).getByLabel(/Canopy diameter/)).toHaveValue(
    '36',
  );
  await expect(page.getByRole('region', { name: 'Landing energy' }).getByLabel(/Descending mass/)).toHaveValue('53');
});

test('measures the drogue Cd from the drogue-phase descent on a dual-deploy flight', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const panel = page.getByRole('region', { name: 'Drogue Cd (measured)' });
  await expect(panel.getByRole('heading', { name: 'Drogue Cd (measured)' })).toBeVisible();
  await expect(panel.getByText('—', { exact: true })).toBeVisible(); // nothing until inputs

  // Descending mass is shared (entered once in Landing energy); drogue diameter here.
  await page.getByRole('region', { name: 'Landing energy' }).getByLabel(/Descending mass/).fill('53'); // oz
  await panel.getByLabel(/Drogue diameter/).fill('15'); // in
  // A sane drogue Cd (this sample reads ~0.5 for a 15" drogue), shown to 2 dp.
  await expect(panel.getByText(/^\d\.\d{2}$/)).toBeVisible();
  await expect(panel.getByText(/in the thinner air aloft/)).toBeVisible();

  // The inputs stick across a reload (localStorage).
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('region', { name: 'Drogue Cd (measured)' }).getByLabel(/Drogue diameter/)).toHaveValue('15');
});

test('measures the drag coefficient from the coast, and remembers the inputs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const drag = page.getByRole('region', { name: 'Drag coefficient (measured)' });
  await expect(drag.getByRole('heading', { name: 'Drag coefficient (measured)' })).toBeVisible();
  // Until both inputs are given there's nothing to compute.
  await expect(drag.getByText('—', { exact: true })).toBeVisible();

  // Imperial is the default unit system, so the fields read ounces and inches.
  await drag.getByLabel(/Coast mass/).fill('53'); // oz (~1.5 kg)
  await drag.getByLabel(/Body diameter/).fill('2.1'); // in (~54 mm)
  // A real airframe Cd lands in a sane band (this sample reads ~0.65), shown to 2 dp.
  await expect(drag.getByText(/^\d\.\d{2}$/)).toBeVisible();
  await expect(drag.getByText(/over Mach/)).toBeVisible();

  // The inputs stick across a reload (localStorage).
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByLabel(/Coast mass/)).toHaveValue('53');
  await expect(page.getByLabel(/Body diameter/)).toHaveValue('2.1');
});

test('reports rail-exit velocity for a barometric flight, and remembers the rail', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const rail = page.getByRole('region', { name: 'Rail-exit velocity' });
  await expect(rail.getByRole('heading', { name: 'Rail-exit velocity' })).toBeVisible();
  // A real boosted flight clears the rail with a readable speed (e.g. "89 ft/s").
  await expect(rail.getByText(/\d+\s*ft\/s/)).toBeVisible();

  // Picking a different rail length sticks across a reload (localStorage).
  await page.getByLabel('Launch rail length').selectOption({ label: '12 ft (3.7 m)' });
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByLabel('Launch rail length')).toHaveValue(/3\.6/);
});

test('computes landing energy from a supplied descending mass, and remembers it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const panel = page.getByRole('region', { name: 'Landing energy' });
  await expect(panel.getByRole('heading', { name: 'Landing energy' })).toBeVisible();
  // Until a mass is entered there's nothing to compute.
  await expect(panel.getByText('—', { exact: true })).toBeVisible();

  // The mass-free drop-height read shows even before a mass is entered.
  await expect(panel.getByText(/free-fall drop from \d/)).toBeVisible();

  await panel.getByLabel(/Descending mass/).fill('24');
  // ½·m·v² in ft·lbf (imperial default) — e.g. "11 ft·lbf".
  await expect(panel.getByText(/\d+(\.\d+)?\s*ft·lbf/)).toBeVisible();

  // The mass sticks across a reload (localStorage).
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByLabel(/Descending mass/)).toHaveValue('24');
});

test('reads the main deploy altitude and checks it against a set value', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const panel = page.getByRole('region', { name: 'Main deploy altitude' });
  await expect(panel.getByRole('heading', { name: 'Main deploy altitude' })).toBeVisible();
  // The sample is dual-deploy: the main fired near 969 ft AGL, shown always.
  await expect(panel.getByText(/\d{3} ft\b/).first()).toBeVisible();
  await expect(panel.getByText(/of drogue descent first/)).toBeVisible();

  // Setting ~the measured firing altitude → reads within slop, "on the mark".
  await panel.getByLabel(/Set main deploy altitude/).fill('960');
  await expect(panel.getByText(/right on the mark/)).toBeVisible();

  // A much lower set value → the main reads as firing higher than set.
  await panel.getByLabel(/Set main deploy altitude/).fill('500');
  await expect(panel.getByText(/fired about .* higher/)).toBeVisible();

  // The set altitude sticks across a reload (localStorage).
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('region', { name: 'Main deploy altitude' }).getByLabel(/Set main deploy altitude/)).toHaveValue(
    '500',
  );
});

test('frames the coast time as the ideal ejection delay and checks a flown delay', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const panel = page.getByRole('region', { name: 'Ejection delay' });
  await expect(panel.getByRole('heading', { name: 'Ejection delay' })).toBeVisible();
  // The ideal delay (the measured coast to apogee) is always shown, e.g. "18.5 s".
  await expect(panel.getByText('ideal delay (coast to apogee)', { exact: true })).toBeVisible();
  await expect(panel.getByText(/^\d+(\.\d+)?\s*s$/)).toBeVisible();

  // A short delay relative to this long coast fires before apogee — the risky case.
  await panel.getByLabel(/Motor delay flown/).fill('4');
  await expect(panel.getByText(/fires about .* before/)).toBeVisible();

  // The flown delay sticks across a reload (localStorage).
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('region', { name: 'Ejection delay' }).getByLabel(/Motor delay flown/)).toHaveValue('4');
});

test('rail-exit velocity is omitted for a GPS-only flight', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('featherweight-gps.csv'));
  await reachesReport(page);
  // The card (a labelled region) is absent — note the methodology section below the
  // report still has a same-named heading, so we check for the region, not the text.
  await expect(page.getByRole('region', { name: 'Rail-exit velocity' })).toHaveCount(0);
});

test('exports a report-grade Markdown summary', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const [md] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .md' }).click(),
  ]);
  expect(md.suggestedFilename()).toBe('sample-altusmetrum-debrief.md');
});

test('renders a shareable flight card and saves it as a PNG', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  const card = page.getByRole('region', { name: 'Flight card' });
  await expect(card.getByRole('heading', { name: 'Flight card' })).toBeVisible();
  // The card itself is a canvas exposed to assistive tech as an image of the flight.
  await expect(card.getByRole('img', { name: /Shareable flight card/ })).toBeVisible();

  const [png] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('button', { name: 'Save card' }).click(),
  ]);
  expect(png.suggestedFilename()).toBe('sample-altusmetrum-card.png');
});

test('the explorer plots one channel against another (non-monotonic x)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('featherweight-gps.csv'));
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // Velocity (y) against altitude (x). Altitude is non-monotonic — it climbs then
  // falls — which once collapsed both scales (uPlot ranges x by its endpoints, then
  // y only over that window) and drew nothing at all on this flight. Guard that the
  // curve actually draws.
  await page.getByLabel('Add a channel to the plot').selectOption({ label: 'Velocity' });
  await page.getByRole('button', { name: /Remove Altitude .AGL. from the plot/ }).click();
  await page.getByLabel('X axis channel').selectOption({ label: 'Altitude (AGL)' });
  const coloured = await page.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('.uplot canvas')) as HTMLCanvasElement[];
    const c = cs[cs.length - 1];
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

test('the explorer exports the current plot as a PNG', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle('Save the current plot as a PNG').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/-explore\.png$/);
});

test('the comparison exports its chart as a PNG', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle('Save the comparison chart as a PNG').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^compare-.*\.png$/);
});
