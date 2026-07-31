import { test, expect } from '@playwright/test';

// A clean load of the home page: the brand and drop zone render, and nothing
// throws to the console during hydration.
test('home loads cleanly with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { level: 1, name: 'Debrief' })).toBeVisible();
  await expect(page.getByLabel('Flight log drop zone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();

  expect(errors).toEqual([]);
});

// The parent-brand eyebrow and footer lockup both point at the Fusion Space hub.
test('brand eyebrow links to the Fusion Space hub', async ({ page }) => {
  await page.goto('/');
  const eyebrow = page.getByRole('link', { name: 'Fusion Space' }).first();
  await expect(eyebrow).toHaveAttribute('href', 'https://fusionspace.co');
});

// Privacy is reachable from the footer and renders its own page.
test('privacy page is reachable from the footer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
});

// The methods write-up lives on its own route, reachable from the home callout and
// the footer, and carries the calculation detail that used to sit on the home page.
test('methods page is its own route with the calculation detail', async ({ page }) => {
  await page.goto('/');
  // The home page points to it rather than inlining the whole write-up.
  await page.getByRole('link', { name: /Read the methods/ }).click();
  await expect(page).toHaveURL(/\/methods\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Where the numbers come from' })).toBeVisible();
  // A representative method section survived the move.
  await expect(page.getByRole('heading', { name: 'Drag coefficient' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "What Debrief isn't" })).toBeVisible();
  // Back to the analyzer.
  await page.getByRole('link', { name: /Back to Debrief/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();

  // And it's reachable from the footer too.
  await page.getByRole('link', { name: 'Methods', exact: true }).click();
  await expect(page).toHaveURL(/\/methods\/?$/);
});

// The validation page is its own route, reachable from the footer, and states both
// how the reads are checked and where they're known to be weak.
test('validation page is its own route with the accuracy account', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Validation', exact: true }).click();
  await expect(page).toHaveURL(/\/validation\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'How Debrief is validated' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Real flights, checked against real ground truth/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Where it is known to be weak/ })).toBeVisible();
  // Cross-linked with the methods write-up.
  await page.getByRole('link', { name: /where the numbers come from/ }).click();
  await expect(page).toHaveURL(/\/methods\/?$/);
});

// Debrief reads flights that have already been flown, and the line between that and a
// simulator is the basis on which its numbers can be trusted. Any surface that shows
// figures has to say so — it isn't a home-page footnote.
test('every surface that shows numbers says what Debrief is not', async ({ page }) => {
  for (const path of ['/', '/compare', '/stitch']) {
    await page.goto(path);
    await expect(
      page.getByText(/measurement instrument, not a simulator/),
      `${path} must carry the disclaimer`,
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Read the methods/ })).toBeVisible();
  }
});

// Two pages doing different jobs shouldn't introduce themselves with the same sentence.
test('each surface describes itself', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Drop in a flight log from any altimeter/)).toBeVisible();
  await page.goto('/compare');
  await expect(page.getByText(/Line up a launch day, a season/)).toBeVisible();
  await expect(page.getByText(/Drop in a flight log from any altimeter/)).toHaveCount(0);
  await page.goto('/stitch');
  await expect(page.getByText(/Put the stages of one launch in order/)).toBeVisible();
  await expect(page.getByText(/Line up a launch day, a season/)).toHaveCount(0);
});

// Both surfaces take a flight file, and they disagreed about which ones a flyer may pick: the
// analyze page filtered on a hand-typed `accept` list that had drifted behind the parsers, and
// the comparison filtered on nothing at all. `.pf2` is PerfectFlite's own export — detected on
// the extension alone, with a corpus fixture behind it — and the browser greyed it out.
test('both file pickers offer every format the app can read', async ({ page }) => {
  const accepts: string[] = [];
  for (const [path, label] of [
    ['/', 'Choose a flight log file'],
    ['/compare', 'Choose flight logs to compare'],
  ] as const) {
    await page.goto(path);
    const a = await page.getByLabel(label).getAttribute('accept');
    expect(a, `${path} filters its picker at all`).toBeTruthy();
    for (const ext of ['.csv', '.txt', '.xlsx', '.pf2']) {
      expect(a, `${path} offers ${ext}`).toContain(ext);
    }
    accepts.push(a as string);
  }
  expect(new Set(accepts).size, `the two surfaces offer different files: ${JSON.stringify(accepts)}`).toBe(1);
});
