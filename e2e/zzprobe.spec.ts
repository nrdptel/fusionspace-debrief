import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });

const OUT = '/tmp/claude-0/-home-user/5a04f0e8-883c-5887-b650-6baf00510b2c/scratchpad';

test('probe: hide the only trace on the velocity chart', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible({ timeout: 60_000 });

  // Tag the Chart wrapper that owns the velocity switch so we can screenshot exactly it.
  await page.evaluate(() => {
    const th = document.querySelector('[aria-label="Show velocity on the chart"]') as HTMLElement;
    const legendHost = th.closest('.u-legend')!.parentElement!; // the legendRef div
    const chart = legendHost.parentElement!; // Chart's outer w-full div
    chart.setAttribute('data-probe', 'velchart');
    (chart.closest('section, article, div[class*="rounded"]') as HTMLElement)?.setAttribute('data-probe-card', 'velcard');
  });

  const chart = page.locator('[data-probe=velchart]');
  await chart.scrollIntoViewIfNeeded();
  await chart.screenshot({ path: `${OUT}/vel-before.png` });

  const vel = page.getByRole('switch', { name: /Show velocity on the chart/i });
  await vel.click();
  await page.waitForTimeout(600);

  await chart.screenshot({ path: `${OUT}/vel-after.png` });
  await page.locator('[data-probe-card=velcard]').screenshot({ path: `${OUT}/vel-card-after.png` });

  // What the surface says about the hidden state.
  const state = await page.evaluate(() => {
    const th = document.querySelector('[aria-label="Show velocity on the chart"]') as HTMLElement;
    const row = th.closest('tr') as HTMLElement;
    const label = row.querySelector('.u-label') as HTMLElement | null;
    const marker = row.querySelector('.u-marker') as HTMLElement | null;
    return {
      checked: th.getAttribute('aria-checked'),
      rowClass: row.className,
      rowOpacity: getComputedStyle(row).opacity,
      labelOpacity: label ? getComputedStyle(label).opacity : null,
      markerOpacity: marker ? getComputedStyle(marker).opacity : null,
      thBox: (() => { const b = th.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
      rowBox: (() => { const b = row.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
    };
  });
  console.log('STATE:', JSON.stringify(state));
});
