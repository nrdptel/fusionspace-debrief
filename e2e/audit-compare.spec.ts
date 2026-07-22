import { test, expect } from '@playwright/test';
import path from 'node:path';

// A deep, user-simulated audit of the compare feature: realistic multi-flight
// sessions exercising the table, the mixed-source (baro) marking, every overlay
// channel, the exports, the units toggle, the cap+note, and the recents path.

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);

test('a rocketeer compares two flights end to end', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  // Drop two real flights at once. aim-xtra has a BARO-derived velocity while
  // TeleMetrum logs it on the device — a genuine mixed-source comparison.
  await page.getByLabel('Choose a flight log file').setInputFiles([fx('aim-xtra.csv'), fx('altusmetrum-telemetrum.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  // The side-by-side table with both flights and the headline rows.
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Max velocity', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Max Q', exact: true })).toBeVisible();

  // Mixed velocity sources → the baro flight is marked, with an explaining note.
  await expect(page.getByText(/\(baro\)/).first()).toBeVisible();
  await expect(page.getByText(/derived from altitude rather than logged/)).toBeVisible();
  // …and the cross-check itself is honest that a mixed measured/derived agreement is
  // the looser bound.
  await expect(page.getByText(/mix a measured value with one derived from altitude/)).toBeVisible();

  // Every overlay channel renders and titles itself correctly.
  const channel = async (button: string, heading: RegExp | string) => {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  };
  await channel('Velocity', /Velocity \(ft\/s\)/);
  await channel('Acceleration', /Acceleration \(g\)/);
  await channel('Mach', 'Mach');
  await channel('Dynamic pressure', /Dynamic pressure \((psi|kPa)\)/);
  await channel('Altitude', /Altitude \(ft\)/);

  // Units toggle relabels the comparison.
  const units = page.getByRole('button', { name: /Units:/ });
  await expect(units).toContainText('feet');
  await units.click();
  await expect(units).toContainText('meters');
  await expect(page.getByRole('heading', { name: /Altitude \(m\)/ })).toBeVisible();

  // All three exports fire a download.
  for (const [name, re] of [
    ['Save .png', /^compare-.*\.png$/],
    ['Save chart data', /^compare-.*\.csv$/],
    ['Save metrics', /^compare-metrics\.csv$/],
  ] as const) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
    expect(dl.suggestedFilename()).toMatch(re);
  }

  // Back returns to the start.
  await page.getByRole('button', { name: /Back to a single flight/ }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
});

test('two device-velocity flights show no baro marking', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  // Both log velocity on-device → no "(baro)" tag, no explaining note, and no
  // mixed-source caveat on the cross-check.
  await expect(page.getByText(/derived from altitude rather than logged/)).toHaveCount(0);
  await expect(page.getByText(/mix a measured value with one derived from altitude/)).toHaveCount(0);
});

test('dropping more than six flights caps at six with a note', async ({ page }) => {
  await page.goto('/');
  // Seven auto-detecting files (repeats are fine — distinct compare entries).
  await page.getByLabel('Choose a flight log file').setInputFiles([
    fx('aim-xtra.csv'),
    fx('altusmetrum-telemetrum.csv'),
    fx('featherweight-raven-fip.csv'),
    fx('perfectflite-pnut.pf2'),
    fx('blueraven-app-lr.csv'),
    fx('aim-xtra.csv'),
    fx('altusmetrum-telemetrum.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 6 flights' })).toBeVisible();
  await expect(page.getByText(/Showing 6 of 7 files/)).toBeVisible();
});

test('comparing three flights from the recents list', async ({ page }) => {
  await page.goto('/');
  const load = async (file: string) => {
    await page.getByLabel('Choose a flight log file').setInputFiles(fx(file));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };
  await load('altusmetrum-telemetrum.csv');
  await load('featherweight-raven-fip.csv');
  await load('aim-xtra.csv');

  await page.getByRole('checkbox', { name: 'Select altusmetrum-telemetrum.csv to compare' }).check();
  await page.getByRole('checkbox', { name: 'Select featherweight-raven-fip.csv to compare' }).check();
  await page.getByRole('checkbox', { name: 'Select aim-xtra.csv to compare' }).check();
  await page.getByRole('button', { name: /Compare 3 flights/ }).click();

  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
  // Three flight columns + the metric label column = 4 column headers.
  await expect(page.locator('thead th')).toHaveCount(4);
});
