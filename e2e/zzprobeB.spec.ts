import { test, expect } from '@playwright/test';

// SCRATCH PROBE — delete after use.

test('probe: does the role=img label go stale when a switch hides a trace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/compare');
  await page.getByRole('button', { name: /Two altimeters, one flight/i }).click();
  await expect(page.getByRole('heading', { name: /Comparing/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.u-legend').first()).toBeVisible();

  const host = page.locator('[role="img"]').first();
  const nameOf = async () => (await host.ariaSnapshot()).slice(0, 400);
  const drawn = () =>
    page.evaluate(() => {
      const l = document.querySelector('.u-legend') as HTMLElement;
      return {
        rows: Array.from(l.querySelectorAll('tr.u-series')).map((r) => ({
          label: (r.querySelector('th') as HTMLElement)?.textContent?.trim(),
          off: r.classList.contains('u-off'),
          checked: (r.querySelector('th') as HTMLElement)?.getAttribute('aria-checked'),
        })),
      };
    });

  console.log('BEFORE name:', JSON.stringify(await nameOf()));
  console.log('BEFORE drawn:', JSON.stringify(await drawn()));

  const sw = page.getByRole('switch').nth(1);
  console.log('SWITCH LABEL:', await sw.getAttribute('aria-label'));
  await sw.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  console.log('AFTER drawn:', JSON.stringify(await drawn()));
  console.log('AFTER name:', JSON.stringify(await nameOf()));

  // What the keyboard reading now announces on the chart itself.
  await host.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const announced = await page.locator('p[role="status"]').first().textContent();
  console.log('ANNOUNCED after hiding:', JSON.stringify(announced));

  // Does anything else on the page still claim two flights?
  const bodyClaims = await page.evaluate(() =>
    Array.from(document.querySelectorAll('h1,h2,h3,figcaption,caption'))
      .map((e) => (e as HTMLElement).textContent?.trim())
      .filter(Boolean)
      .slice(0, 20),
  );
  console.log('HEADINGS:', JSON.stringify(bodyClaims));
});
