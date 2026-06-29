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

// Async analysis must not let a slow, superseded load overwrite a newer one: load
// a large flight (slow analysis), then drop a generic CSV during it — the column
// mapper (the newer action) must win, not the late-arriving flight report.
test('a slow in-flight analysis does not overwrite a newer load', async ({ page }) => {
  const big = (() => {
    const lines = ['T,Alt,VRaw,VFilt'];
    for (let i = 0; i < 200_000; i++) {
      const f = i / 200_000;
      lines.push(`${i * 10},${(Math.sin(f * Math.PI) * 9000).toFixed(0)},${(Math.cos(f * Math.PI) * 250).toFixed(1)},0`);
    }
    return lines.join('\n');
  })();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).waitFor();
  await page.getByLabel('Choose a flight log file').setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.from(big) });
  // Drop a generic CSV (→ column mapper) while the big flight is still analysing.
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(['t,h,spd\n0,0,0\n0.1,5,50\n0.2,12,80\n0.3,6,-10'], 'mystery.csv', { type: 'text/csv' }));
    return d;
  });
  await page.locator('[aria-label="Flight log drop zone"]').dispatchEvent('drop', { dataTransfer: dt });
  await page.waitForTimeout(4000); // well past the big flight's analysis
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toHaveCount(0);
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
