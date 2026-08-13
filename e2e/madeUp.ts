import { expect } from '@playwright/test';

/**
 * The made-up flight three specs now drive, and the mapper walk that opens it.
 *
 * A flight Debrief MADE UP has to say so where the numbers are, on every surface a figure can
 * travel out through — `ROADMAP.md`'s D10, and the hardest clause of it. Every walk that proves
 * one of those sinks needs the same file, and by 2026-08-13 that was `e2e/analyze.spec.ts`'s
 * private helper plus two specs that would each have grown their own copy.
 *
 * The file is the shape `lib/synthetic.ts#toMapperCsv` writes: a `Synthetic` row in the metadata
 * block ahead of the header, and column names no parser claims, so it arrives through the COLUMN
 * MAPPER — the only route a generated demonstration file takes, and therefore the only route any
 * of this can be walked on.
 *
 * **Written here rather than imported from `lib/` on purpose**, and moving it did not change that:
 * these specs are what would catch the marker being read at parse time and then dropped on the way
 * to a surface, and a fixture that shares the PRODUCER cannot see a change to the consumer. This
 * module is test-side and imports nothing from `lib/`.
 */

/** The opening of the sentence, as it renders at the top of the report. */
export const SYNTH_SENTENCE = 'This flight is SYNTHETIC';
/** The tail of the full sentence — present at the top of the report, deliberately absent from
 *  the readings grid, which carries the one-line form. */
export const SYNTH_TAIL = 'no figure from it means anything';
/** The short form, the one a narrow surface takes. */
export const SYNTH_SHORT = 'SYNTHETIC — Debrief made this flight up';
/** The tag, the narrowest form there is — a header cell, a track name, a table cell. */
export const SYNTH_TAG = 'SYNTHETIC';

/** The pad these made-up fixes start over, when a walk asks for GPS. A real place on the map and a
 *  real distance to walk, so the recovery panel has something to measure. */
const MADE_UP_PAD = { lat: 34.49, lon: -116.95 };

export interface MadeUpOptions {
  /** Add `Lat`/`Lon` columns the mapper maps by role, so the walk reaches the recovery panel and
   *  its three exports. Costs ~4,800 samples, because a landing coordinate wants a landing. */
  gps?: boolean;
  /** Run the record to the GROUND rather than stopping 20 s in. Implied by `gps`; asked for on
   *  its own by the `/stitch` walk, which wants a full set of marks to line up. */
  toGround?: boolean;
}

export function madeUpCsv(opts: MadeUpOptions = {}): string {
  const { gps = false, toGround = gps } = opts;
  const rows: string[] = [
    'Synthetic,"This flight is SYNTHETIC — numbers Debrief made up to demonstrate what it can read. It is not a recording of anything, nothing here was flown, and no figure from it means anything about a real rocket."',
    'Demonstrates,"the column mapper"',
    '',
    gps ? 'Elapsed,Height,Rate,Lat,Lon' : 'Elapsed,Height,Rate',
  ];
  // A boost, a coast to a single apogee and a two-rate descent — enough shape for the analysis
  // to produce readings worth labelling, and short enough to drop instantly.
  let alt = 0;
  let v = 0;
  let apogeeAt = 0;
  // 400 samples is 20 s — a boost and the start of a descent, which is all most walks need, and
  // the size the SHARE walk depends on: measured, this file encodes to ~5,000 characters against
  // `MAX_SHARE_URL`'s 16,000, where the full-descent version encodes to 63,202 and renders "Too
  // big to link". Running to the ground is asked for, never assumed.
  const maxSamples = toGround ? 6000 : 400;
  for (let i = 0; i < maxSamples; i++) {
    const t = i * 0.05;
    const a = t < 1.6 ? 108.2 : -9.80665;
    if (v >= 0) {
      v += a * 0.05;
      alt = Math.max(0, alt + v * 0.05);
      apogeeAt = t;
    } else {
      v = alt > 150 ? -7.5 : -4.2;
      alt = Math.max(0, alt + v * 0.05);
    }
    // Straight up, then drifting east-north-east under canopy — a walkback of a few hundred
    // metres, which is what makes the landing coordinate worth copying at all.
    const drift = Math.max(0, t - apogeeAt);
    const cols = gps
      ? `,${(MADE_UP_PAD.lat + drift * 0.00001).toFixed(6)},${(MADE_UP_PAD.lon + drift * 0.00002).toFixed(6)}`
      : '';
    rows.push(`${t.toFixed(2)},${alt.toFixed(2)},${v.toFixed(2)}${cols}`);
    if (alt <= 0 && t > 5) break;
  }
  return rows.join('\n') + '\n';
}

/** The name the file arrives under, and therefore the name the logbook and every table shows. */
export const MADE_UP_NAME = 'demo-mapper-flight.csv';

/** Map the columns of a made-up file the mapper is already showing, and analyze it. Split out of
 *  `openMadeUpFlight` because `/stitch` drops two files in a row and the second one is real. */
export async function mapMadeUpColumns(page: import('@playwright/test').Page, opts: MadeUpOptions = {}) {
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  await page.getByLabel('Role for the Elapsed column').selectOption('time');
  await page.getByLabel('Role for the Height column').selectOption('altitude');
  await page.getByLabel('Role for the Rate column').selectOption('velocity');
  await page.getByLabel('Unit for the Height column').selectOption('m');
  await page.getByLabel('Unit for the Rate column').selectOption('m/s');
  if (opts.gps) {
    await page.getByLabel('Role for the Lat column').selectOption('latitude');
    await page.getByLabel('Role for the Lon column').selectOption('longitude');
  }
  await page.getByRole('button', { name: 'Analyze flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 60_000 });
}

/** Drop the made-up file on `/` and read it through the mapper, leaving the report on screen. */
export async function openMadeUpFlight(page: import('@playwright/test').Page, opts: MadeUpOptions = {}) {
  await page.goto('/');
  await dropMadeUpFile(page, opts);
  await mapMadeUpColumns(page, opts);
}

/** Just the drop, for a walk that is already on `/` with a logbook behind it. */
export async function dropMadeUpFile(page: import('@playwright/test').Page, opts: MadeUpOptions = {}) {
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: MADE_UP_NAME, mimeType: 'text/csv', buffer: Buffer.from(madeUpCsv(opts)) });
}
