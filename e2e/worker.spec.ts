import { test, expect } from '@playwright/test';

// Analysis runs in a Web Worker so a large/high-rate log never freezes the UI.
// These guard both that the worker path is actually taken (not the synchronous
// fallback) and that analysis still works when no Worker is available.

const reachesReport = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
};

test('analysis runs off the main thread in a Web Worker', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    (window as unknown as { __workers: number }).__workers = 0;
    const Orig = window.Worker;
    class Counting extends Orig {
      constructor(u: string | URL, o?: WorkerOptions) {
        (window as unknown as { __workers: number }).__workers++;
        super(u, o);
      }
    }
    window.Worker = Counting as unknown as typeof Worker;
  });
  await page.goto('/');
  await reachesReport(page);
  const workers = await page.evaluate(() => (window as unknown as { __workers: number }).__workers);
  expect(workers).toBeGreaterThan(0); // went off-thread, not the synchronous fallback
  expect(errors, errors.join('\n')).toEqual([]);
});

test('analysis still works when Workers are unavailable (synchronous fallback)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Simulate a browser/environment without Worker support.
  await page.addInitScript(() => {
    (window as unknown as { Worker: undefined }).Worker = undefined;
  });
  await page.goto('/');
  await reachesReport(page); // the report still renders, analysed on the main thread
  expect(errors, errors.join('\n')).toEqual([]);
});
