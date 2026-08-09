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
test('a visitor with no files can still see a comparison', async ({ page }) => {
  // D10 — this surface's whole subject is more than one flight, and it offered nothing to someone
  // who has not flown two boards: an empty state whose only exit needs a thing they do not have.
  // The sample it offers is a REAL pair — a PerfectFlite Pnut and a Featherweight Raven aboard one
  // airframe — so the capability being demonstrated (D3) is demonstrated by an actual instance of
  // it, not by a stand-in.
  await page.goto('/compare/');
  const sample = page.getByRole('button', { name: /Two altimeters, one flight/i });
  await expect(sample).toBeVisible();

  await sample.click();
  await expect(page.getByText(/Comparing 2 flights/)).toBeVisible({ timeout: 30_000 });

  // Two recordings, not one file twice — and they went through the ordinary drop path, so they are
  // in the logbook and the comparison has an address.
  await expect(page).toHaveURL(/ids=/, { timeout: 20_000 });
  expect((new URL(page.url()).searchParams.get('ids') ?? '').split(',').filter(Boolean)).toHaveLength(2);
});

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
  // …and the way out of it is on this page: the folder can be dropped right here.
  await expect(page.getByLabel('Choose flight logs to compare')).toBeAttached();
  await expect(page.getByRole('link', { name: 'analyze page' }).first()).toBeVisible();

  // Nothing in the accessibility pass on the surface's own empty state.
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);

  // A link to flights this device no longer has says so, by name, and offers the picker
  // instead of a blank page or a spinner that never ends.
  await page.goto('/compare?ids=gone-1,gone-2');
  // Scoped to the region it is asserting about. A bare `getByRole('status')` was unique here only
  // by accident: the logbook list below gained its own live region on 2026-08-02 (so a screen
  // reader that hears "looking for flights…" also hears the answer), and this locator then matched
  // two elements and failed in strict mode — for a reason that had nothing to do with stale links.
  // `HANDOFF.md` records the same trap on a ground-track locator; when a shared shape is added,
  // grep the suite for locators that select on the shape rather than on the surface.
  await expect(page.getByRole('status').filter({ hasText: 'no longer in this logbook' })).toBeVisible();
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
  // The id is KEPT in the URL, which reverses what this test used to assert ("spent once
  // used, so a refresh doesn't re-open it forever"). Spending it is what left the report
  // with no address at all: all seven in-app links on that screen destroyed it, and Back
  // landed on an empty drop zone. Every way back to the drop zone still exists — "Analyze
  // another flight" clears the address, and a reload after that stays cleared — so keeping
  // it costs nothing and buys Back, a refresh and a bookmark.
  await expect(page).toHaveURL(/open=/);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Flight report for altusmetrum-telemetrum.csv' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await expect(page).not.toHaveURL(/open=/);
});

// A comparison built by dropping files exists only until the page does — but those files
// went into the logbook on the way in, so the same set can be named by id. The offer to
// turn it into an address is what closes the gap between the two ways of comparing.
test('a comparison built from a drop can be given an address', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  await page.getByRole('link', { name: /Give this comparison an address/ }).click();

  // Same comparison, now at an address that survives a reload.
  await expect(page).toHaveURL(/\/compare\/?\?ids=[^&]+,[^&]+/);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  // …and it carries the unit choice, not just the flights.
  await expect(page).toHaveURL(/[?&]u=/);
});

// The surface called "Compare flights" could not take a flight. A flyer landing on it with
// a launch day's folder was sent to the analyze page to drop it and come back — the one
// action the page is named for was the one it couldn't do, while its own source comment
// claimed dropping files here was offered. It reads the folder through the same
// lib/ingest the analyze page uses, so the two can't disagree about what a launch day holds.
test('a launch day can be dropped on the compare surface itself', async ({ page }) => {
  await page.goto('/compare');
  await expect(page.getByRole('heading', { name: 'Compare flights' })).toBeVisible();

  await page.getByLabel('Choose flight logs to compare').setInputFiles([
    fixture('altusmetrum-telemetrum.csv'),
    fixture('blueraven-app-lr.csv'),
  ]);

  // Two readable flights → straight to the comparison, at an address that survives a reload.
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  expect(page.url()).toContain('ids=');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
});

test('one flight dropped on the compare surface joins the logbook and says so', async ({ page }) => {
  await page.goto('/compare');
  await page.getByLabel('Choose flight logs to compare').setInputFiles([fixture('altusmetrum-telemetrum.csv')]);

  // Not enough for a comparison, so it says what it did rather than doing nothing visible.
  await expect(page.getByText(/Added altusmetrum-telemetrum\.csv to your logbook/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /altusmetrum-telemetrum/ })).toBeVisible();
});

test('the compare surface says which dropped files it could not use', async ({ page }) => {
  await page.goto('/compare');
  await page.getByLabel('Choose flight logs to compare').setInputFiles([
    fixture('altusmetrum-telemetrum.csv'),
    fixture('blueraven-app-lr.csv'),
    // A device summary: headline figures and no flight record. Both logs here are renamed
    // fixtures, so neither is named for the rocket the summary states — it cannot be paired,
    // and what it says has to be what Debrief actually knows. "Its flight log wasn't in this
    // drop" would be flatly false: the SN0829 log IS in this drop, under another name.
    fixture('blueraven-app.summary.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByText(/blueraven-app\.summary\.csv — the device's own summary/)).toBeVisible();
  await expect(page.getByText(/can't tell which flight it belongs to/)).toBeVisible();
  await expect(page.getByText(/wasn't in this drop/)).toHaveCount(0);
});

// A launch day's folder mixes loggers Debrief knows with ones it doesn't, and the file it
// doesn't know is exactly the one a flyer most wants in the comparison. This surface used to
// name it in a sentence — "needs its columns mapped, which happens on the analyze page" —
// with nothing to press, on the one surface whose whole job is assembling a set.
test('a file that needs mapping joins the comparison without leaving the surface', async ({ page }) => {
  await page.goto('/compare');
  await page.getByLabel('Choose flight logs to compare').setInputFiles([
    fixture('altusmetrum-telemetrum.csv'),
    fixture('featherweight-gps.csv'),
    fixture('perfectflite-stratologger.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  // Offered by name, as an action.
  const mapIt = page.getByRole('button', { name: /^Map perfectflite-stratologger/ });
  await expect(mapIt).toBeVisible();
  await mapIt.click();

  // The mapper opens in place — the comparison keeps its address, so this is a round trip
  // and not a departure.
  await expect(page.getByRole('button', { name: /^Analyze/ })).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe('/compare');
  const before = new URL(page.url()).searchParams.get('ids')!.split(',');
  expect(before).toHaveLength(2);

  await page.getByRole('button', { name: /^Analyze/ }).click();
  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
  // …and the flight it became is in the address, so the three-flight view reloads.
  const after = new URL(page.url()).searchParams.get('ids')!.split(',');
  expect(after).toHaveLength(3);
  expect(after.slice(0, 2)).toEqual(before);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comparing 3 flights' })).toBeVisible();
});
