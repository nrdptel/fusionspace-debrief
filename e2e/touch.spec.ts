import { test, expect } from '@playwright/test';
import path from 'node:path';

// Debrief is built to be read on a phone at the field. uPlot binds only mouse
// events, so the charts had no touch zoom at all; this covers the two-finger
// pinch (and double-tap reset) added on top. The explorer's stats heading flips
// to "In the selected window" once the x-range is zoomed, which is the observable
// proof the gesture reached uPlot.
test.use({ hasTouch: true });

// Fire a synthetic two-finger pinch on the last chart's cursor layer (the
// explorer chart), each touch at a fraction of the element's width (centred).
async function pinch(page: import('@playwright/test').Page, from: [number, number], to: [number, number]) {
  await page.evaluate(
    ({ from, to }) => {
      const overs = document.querySelectorAll('.u-over');
      const el = overs[overs.length - 1] as HTMLElement;
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const mk = (fracs: number[]) =>
        fracs.map((f, i) => new Touch({ identifier: i, target: el, clientX: r.left + f * r.width, clientY: y }));
      const fire = (type: string, touches: Touch[]) =>
        el.dispatchEvent(new TouchEvent(type, { touches, changedTouches: touches, bubbles: true, cancelable: true }));
      fire('touchstart', mk(from));
      fire('touchmove', mk([from[0] - (from[0] - to[0]) / 2, from[1] + (to[1] - from[1]) / 2]));
      fire('touchmove', mk(to));
      fire('touchend', []);
    },
    { from, to },
  );
}

test('a two-finger pinch zooms the chart on a touch device', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // The explorer's stats start across the whole flight.
  await expect(page.getByRole('heading', { name: 'Across the whole flight' })).toBeVisible();

  // Two fingers starting close, spread apart → zoom in (the explorer chart is the
  // last .u-over on the page).
  await pinch(page, [0.45, 0.55], [0.15, 0.85]);

  // The stats now track a sub-window — proof the pinch zoomed the x-scale.
  await expect(page.getByRole('heading', { name: 'In the selected window' })).toBeVisible();

  // A double-tap (two quick single-finger taps) resets back to the full range.
  await page.evaluate(() => {
    const overs = document.querySelectorAll('.u-over');
    const el = overs[overs.length - 1] as HTMLElement;
    const r = el.getBoundingClientRect();
    const t = [new Touch({ identifier: 0, target: el, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })];
    const tap = () => {
      el.dispatchEvent(new TouchEvent('touchstart', { touches: t, changedTouches: t, bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: t, bubbles: true, cancelable: true }));
    };
    tap();
    tap();
  });
  await expect(page.getByRole('heading', { name: 'Across the whole flight' })).toBeVisible();
});

// A pad check happens one-handed, on a phone, sometimes with gloves on. Every control
// the flyer has to hit there needs a real touch target — 44 px, the floor Apple's HIG
// and WCAG 2.5.5 set — while the pointer/desktop layout keeps its dense 26 px chips.
// Links inside prose are exempt (a 44 px-tall link mid-sentence would be wrong), but a
// nav link is a target like any other.
test('every control on a phone is a thumb-sized target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  const small = await page.evaluate(() => {
    const out: string[] = [];
    const sel =
      'button, select, summary, [role=button], nav a, input:not([type=checkbox]):not([type=radio]):not([type=range])';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // hidden (e.g. the sr-only file input)
      if (r.height < 44) out.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
    }
    return out;
  });
  expect(small, `controls under 44 px tall on a phone:\n${small.join('\n')}`).toEqual([]);
});

// The same floor on the comparison surface, where the logbook is the whole page: its
// rows, its per-flight controls and the sort chips are what a thumb has to hit at the
// field, and they had never been measured because the analyze page only shows them
// after a flight is loaded.
test('the compare surface is thumb-sized too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  // Wait for the flight to actually be IN the logbook before leaving the page — the save
  // is a background write, and navigating on the render alone raced it.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();

  await page.goto('/compare');
  await expect(page.getByRole('heading', { name: 'Compare flights' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();

  const small = await page.evaluate(() => {
    const out: string[] = [];
    const sel =
      'button, select, summary, [role=button], nav a, input:not([type=checkbox]):not([type=radio]):not([type=range])';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44) out.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
    }
    return out;
  });
  expect(small, `controls under 44 px tall on the compare page:\n${small.join('\n')}`).toEqual([]);

  // And nothing on the page pushes past the viewport — the row that lost its file name
  // to a five-column squeeze was overflowing, not just crowded.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// The column mapper is the first screen for every logger Debrief doesn't auto-detect —
// the "universal" half of the promise — and it is a form, so a phone has to be able to
// work it. As a four-column table it put the sample values, which are how you tell one
// column from another, off the right edge with no sign they were there.
test('the column mapper is usable one-handed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/perfectflite-stratologger.csv'));
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();

  // Every column's own values sit inside the viewport's width — as a four-column table
  // they were rendered past the right edge, reachable only by scrolling the table itself.
  for (const sample of ['0, 0.05, 0.1', '22, 33, 33', '7.9, 7.9, 7.9']) {
    const cell = page.getByText(sample);
    await expect(cell).toHaveCount(1);
    const box = (await cell.boundingBox())!;
    expect(box.x, `"${sample}" starts at x=${box.x}`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `"${sample}" ends at x=${box.x + box.width}`).toBeLessThanOrEqual(390);
  }

  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, select, summary, nav a')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44) out.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName}`);
    }
    return out;
  });
  expect(small, `controls under 44 px tall on the mapper:\n${small.join('\n')}`).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
