import { test, expect } from '@playwright/test';

// A file that carries the logger's own summary (AltimeterCloud writes a grid of
// key,value pairs ahead of the data) should surface those figures beside Debrief's
// independent read as a cross-check.
test('a logger summary is cross-checked against Debrief’s read', async ({ page }) => {
  // Build a clean rise-and-fall with a device velocity column, then state the
  // file's own peak altitude and velocity in an AltimeterCloud-style header so the
  // two reads agree.
  const t: number[] = [], alt: number[] = [], vel: number[] = [];
  for (let i = 0; i < 80; i++) {
    const ms = i * 50;
    const s = i / 40; // 0..2 over the climb window
    const a = i <= 40 ? 120 * (1 - (1 - s) ** 2) : Math.max(0, 120 - (i - 40) * 6);
    const v = i <= 40 ? 45 * Math.sin((Math.PI * i) / 40) : -18;
    t.push(ms); alt.push(a); vel.push(v);
  }
  const maxAlt = Math.max(...alt);
  const maxVel = Math.max(...vel);

  const header = [
    `Apogee meters,${maxAlt.toFixed(2)},,Max velocity up,${maxVel.toFixed(2)},Burnout time (ms),400,`,
    `Device tag,Test Unit,,Serial number,0000-0000,Max acc ascent (mG),9807,`,
    'Time(ms),Altitude(m),Velocity(m/s)',
  ];
  const data = t.map((ms, i) => `${ms},${alt[i].toFixed(3)},${vel[i].toFixed(3)}`);
  const csv = [...header, ...data].join('\n');

  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'altimetercloud.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  // Confirm the auto-guessed mapping, then land on the report.
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // The cross-check panel shows the device's figures next to Debrief's, and the
  // altitude/velocity reads agree with the logger's own.
  const panel = page.getByRole('region', { name: /logger.s own summary/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Apogee')).toBeVisible();
  await expect(panel.getByText('Max velocity')).toBeVisible();
  await expect(panel.getByText(/agree/).first()).toBeVisible();
});
