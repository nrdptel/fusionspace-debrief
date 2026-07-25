import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

const fixture = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Put a flight in this browser's logbook by opening it on the analyze page. */
async function remember(page: import('@playwright/test').Page, file: string) {
  await page.getByLabel('Choose a flight log file').setInputFiles(fixture(file));
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
}

// The comparison is its own surface, and the point of that is permanence: the set of
// flights is named in the URL, so the view survives a reload, the back button works, and
// the address can be bookmarked or opened in a second tab. Before this it was a state of
// the analyze page that vanished the moment the page did.
test('a comparison built from the logbook has an address, and survives a reload', async ({
  page,
}) => {
  await page.goto('/');
  await remember(page, 'altusmetrum-telemetrum.csv');
  await remember(page, 'featherweight-raven-fip.csv');

  await page.getByLabel('Select altusmetrum-telemetrum.csv to compare').check();
  await page.getByLabel('Select featherweight-raven-fip.csv to compare').check();
  await page.getByRole('button', { name: /Compare 2 flights/ }).click();

  // Comparing leaves the analyze page for the surface that does it.
  await expect(page).toHaveURL(/\/compare\?ids=/);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();

  // The header says which surface you're on.
  await expect(page.getByRole('link', { name: 'Compare' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // The address is the comparison: reloading it rebuilds the same view rather than
  // dropping you back at an empty picker.
  const url = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  expect(page.url()).toBe(url);

  // Leaving the comparison is a history step, so Back returns to it.
  await page.getByRole('button', { name: /Compare other flights/ }).click();
  await expect(page.getByRole('heading', { name: 'Compare flights' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
});

// Landing on the surface with nothing to compare, and with a stale link — the two states
// a page you can bookmark has to handle without looking broken.
test('the compare page explains an empty logbook and a stale link', async ({ page }) => {
  await page.goto('/compare');

  await expect(page.getByRole('heading', { name: 'Compare flights' })).toBeVisible();
  await expect(page.getByText(/logbook is empty/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open a flight' })).toBeVisible();

  // Nothing in the accessibility pass on the surface's own empty state.
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);

  // A link to flights this device no longer has says so, by name, and offers the picker
  // instead of a blank page or a spinner that never ends.
  await page.goto('/compare?ids=gone-1,gone-2');
  await expect(page.getByRole('status')).toContainText('no longer in this logbook');
  await expect(page.getByRole('heading', { name: 'Compare flights' })).toBeVisible();
});

// The two surfaces share one logbook and hand off to each other: a row opened from the
// comparison picker reads that flight on the analyze page.
test('the compare picker opens a single flight on the analyze page', async ({ page }) => {
  await page.goto('/');
  await remember(page, 'altusmetrum-telemetrum.csv');

  await page.getByRole('link', { name: 'Compare' }).click();
  await expect(page).toHaveURL(/\/compare/);
  // One flight is not a comparison, and the surface says which flight it has.
  await expect(page.getByText(/One flight in your logbook/)).toBeVisible();
  await expect(page.getByText('altusmetrum-telemetrum.csv', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /altusmetrum-telemetrum\.csv/ }).first().click();
  // The flight opens on the analyze page, read from the logbook rather than re-dropped.
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Flight report for altusmetrum-telemetrum.csv' }),
  ).toBeVisible();
  // The id is spent once used, so a refresh doesn't re-open it forever.
  await expect(page).not.toHaveURL(/open=/);
});
