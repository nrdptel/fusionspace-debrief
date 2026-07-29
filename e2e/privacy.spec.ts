import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DEVICE_DATA } from '../lib/deviceData';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The privacy page said local storage held "your theme and units", and that clearing browser data
// "or using the 'clear' control on the recents list" removed all of it. Nineteen keys existed —
// including the flyer's own typed text and their rocket's mass, diameters, rail, deployment
// altitude and motor delay — and the logbook's Clear took the flights and one of them. This is the
// page that states the invariant, so it is the page that has to be checkable.

test('the privacy page names every setting this app actually stores', async ({ page }) => {
  await page.goto('/privacy/');
  const body = await page.locator('main').innerText();
  for (const d of DEVICE_DATA) {
    expect(body, `${d.key} is stored but not named on the privacy page`).toContain(d.key);
  }
  // …and the count in the prose is the real one, not a number that drifted.
  expect(body).toContain(`${DEVICE_DATA.length} small settings`);
  expect(body, 'the cookie line said "beyond the theme/units preference"; there are no cookies').toContain(
    'No cookies at all',
  );
});

test('“forget these settings” takes them, and says how many were there', async ({ page }) => {
  await page.goto('/privacy/');
  // Put a real spread on the device: something typed, a rocket number, a preference — and one key
  // that belongs to another app, which Debrief has no business deleting.
  await page.evaluate(() => {
    localStorage.setItem('debrief.mass.kg', '12.4');
    localStorage.setItem('debrief.maindeploy.m', '150');
    localStorage.setItem('debrief.compare.captions', '{"a,b":{"label":"L3 cert","notes":"","at":1}}');
    localStorage.setItem('debrief.theme', 'dark');
    localStorage.setItem('some-other-app', 'keep me');
  });
  await page.reload();

  const forget = page.getByRole('button', { name: 'Forget these settings' });
  await expect(forget).toBeVisible();
  await expect(page.getByText('4 of them are stored on this device right now')).toBeVisible();

  // It confirms first, and names what goes — this is not undoable.
  await forget.click();
  const confirm = page.locator('main').getByRole('alert');
  await expect(confirm).toContainText('Forget all 4 settings stored on this device?');
  await expect(confirm, 'it says what they are, not just how many').toContainText('descending mass');

  // Focus is INSIDE the panel, on the safe control. The first version replaced the trigger with
  // the panel, so the trigger's ref was already null, focus fell to <body>, and a keyboard flyer's
  // next Tab landed on "Yes, forget them". Nothing in an axe audit can see that.
  await expect(page.getByRole('button', { name: 'Keep them' })).toBeFocused();
  await expect(forget, 'the trigger stays on the page behind the panel').toHaveAttribute('aria-expanded', 'true');
  // Safe first in DOM order too, the way the logbook's Clear confirm has it — so a Tab from the
  // panel reaches "Keep them" before the irreversible one, whatever moved focus there.
  expect(
    await confirm.locator('button').allInnerTexts(),
    'the destructive control is not the first thing in the panel',
  ).toEqual(['Keep them', 'Yes, forget them']);

  // Escape backs out, returns focus to the trigger, and leaves everything alone.
  await page.keyboard.press('Escape');
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(forget, 'focus comes back to where it started').toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('debrief.mass.kg')), 'Escape kept them').toBe('12.4');

  await forget.click();
  await page.getByRole('button', { name: 'Yes, forget them' }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('4 settings removed from this device');

  const after = await page.evaluate(() => ({
    debrief: Object.keys(localStorage).filter((k) => k.startsWith('debrief.')),
    other: localStorage.getItem('some-other-app'),
  }));
  expect(after.debrief, 'every Debrief setting is gone').toEqual([]);
  expect(after.other, 'another app’s key is not Debrief’s to remove').toBe('keep me');
});

// The control comes BACK when something puts a key back. It is not a terminal state: the theme
// toggle sits in this page's own header and writes one, and the first version rendered the
// "forgotten" line and nothing else, forever — so the page could say this device was clear while
// storage refilled behind it, with no way to run it again but a reload.
test('the forget control returns when something is stored again', async ({ page }) => {
  await page.goto('/privacy/');
  await page.evaluate(() => localStorage.setItem('debrief.mass.kg', '12.4'));
  await page.reload();
  await page.getByRole('button', { name: 'Forget these settings' }).click();
  await page.getByRole('button', { name: 'Yes, forget them' }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('1 setting removed');
  const forget = page.getByRole('button', { name: 'Forget these settings' });
  await expect(forget, 'the control stays, rather than sealing itself off').toBeVisible();

  // The theme toggle is on this page, above the control, and writes debrief.theme — with nothing
  // broadcasting that. So the count line is allowed to be stale; the CONTROL is not. Pressing it
  // re-reads storage and finds what appeared behind it.
  await page.getByRole('button', { name: /System|Light|Dark/ }).first().click();
  await page.evaluate(() => localStorage.setItem('debrief.rail', '3.05'));
  await forget.click();
  const confirm = page.locator('main').getByRole('alert');
  await expect(confirm, 'it counted what is there NOW, not what it read on load').toContainText(
    'the rail you fly off',
  );
  await page.getByRole('button', { name: 'Yes, forget them' }).click();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('debrief.')))).toEqual([]);
});

// Pressing it on a device that holds nothing says so, rather than arming a confirm over an empty
// list — and it is the same press, because the count beside the button is only ever a snapshot.
test('pressing forget on an empty device says so', async ({ page }) => {
  await page.goto('/privacy/');
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('button', { name: 'Forget these settings' }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('this device was already clear');
  await expect(page.locator('main').getByRole('alert'), 'nothing to confirm').toHaveCount(0);
});

// Both themes. The audit that caught this control's first contrast failure (white on amber-600,
// 3.19:1) was run by hand in dark mode; nothing guarded it, which is the exact regression class it
// had just found.
for (const scheme of ['light', 'dark'] as const) {
  test(`the privacy page passes an accessibility audit with the control armed (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/privacy/');
    await page.evaluate(() => localStorage.setItem('debrief.mass.kg', '12.4'));
    await page.reload();
    await page.getByRole('button', { name: 'Forget these settings' }).click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
