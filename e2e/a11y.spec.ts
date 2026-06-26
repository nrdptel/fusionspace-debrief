import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Automated WCAG 2.0/2.1 A + AA audit of the key pages, in both light and dark
// themes. Any violation logs its impact, page, theme, and a sample node before
// the test fails, so concrete issues are easy to fix.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
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
