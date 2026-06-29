import { test, expect } from '@playwright/test';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';

// Automated WCAG 2.0/2.1 A + AA audit of the key pages, in both light and dark
// themes. Any violation logs its impact, page, theme, and a sample node before
// the test fails, so concrete issues are easy to fix.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);

/** Run axe over the current page and fail (loudly) on any violation. */
async function audit(page: import('@playwright/test').Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of violations) {
    const node = v.nodes[0];
    console.log(
      `\n[${v.impact}] ${where} :: ${v.id} — ${v.help}` +
        `\n  nodes: ${v.nodes.length} | ${(node?.target || []).join(' ')}` +
        `\n  html: ${(node?.html || '').slice(0, 140)}`,
    );
  }
  expect(violations.map((v) => v.id)).toEqual([]);
}
const PAGES: [string, string][] = [
  ['home', '/'],
  ['privacy', '/privacy'],
];

for (const [name, path] of PAGES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`a11y: ${name} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path, { waitUntil: 'networkidle' });
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      for (const v of violations) {
        const node = v.nodes[0];
        console.log(
          `\n[${v.impact}] ${name}/${scheme} :: ${v.id} — ${v.help}` +
            `\n  nodes: ${v.nodes.length} | ${(node?.target || []).join(' ')}` +
            `\n  html: ${(node?.html || '').slice(0, 140)}`,
        );
      }
      expect(violations.map((v) => v.id)).toEqual([]);
    });
  }
}

// The report view renders a different surface (metrics, charts, export toolbar)
// that the idle-page audits never reach — audit it too.
test('a11y: flight report', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of violations) {
    const node = v.nodes[0];
    console.log(
      `\n[${v.impact}] report :: ${v.id} — ${v.help}` +
        `\n  nodes: ${v.nodes.length} | ${(node?.target || []).join(' ')}` +
        `\n  html: ${(node?.html || '').slice(0, 140)}`,
    );
  }
  expect(violations.map((v) => v.id)).toEqual([]);
});

// The column mapper is a wholly different, form-heavy surface the page audits
// never reach — and its per-column Role/Unit selects are exactly where an
// unnamed-control violation hides. Drive a generic CSV to it and audit.
test('a11y: column mapper', async ({ page }) => {
  await page.goto('/');
  const csv =
    'elapsed,height,speed\n' +
    Array.from({ length: 20 }, (_, i) => `${(i * 0.1).toFixed(1)},${i * 5},${i * 3}`).join('\n');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'mystery-logger.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  // Every Role/Unit select must carry an accessible name.
  await expect(page.getByLabel('Role for the elapsed column')).toBeVisible();
  await audit(page, 'column-mapper');
});

// The comparison view (overlay chart, channel toggles, side-by-side table) is
// another surface the report audit never reaches.
test('a11y: comparison view', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await audit(page, 'comparison');
});
