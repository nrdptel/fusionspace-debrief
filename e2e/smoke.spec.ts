import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// A clean load of the home page: the brand and drop zone render, and nothing
// throws to the console during hydration.
test('home loads cleanly with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { level: 1, name: 'Debrief' })).toBeVisible();
  await expect(page.getByLabel('Flight log drop zone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();

  expect(errors).toEqual([]);
});

// The parent-brand eyebrow and footer lockup both point at the Fusion Space hub.
test('brand eyebrow links to the Fusion Space hub', async ({ page }) => {
  await page.goto('/');
  const eyebrow = page.getByRole('link', { name: 'Fusion Space' }).first();
  await expect(eyebrow).toHaveAttribute('href', 'https://fusionspace.co');
});

// Privacy is reachable from the footer and renders its own page.
test('privacy page is reachable from the footer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
});

// The methods write-up lives on its own route, reachable from the home callout and
// the footer, and carries the calculation detail that used to sit on the home page.
test('methods page is its own route with the calculation detail', async ({ page }) => {
  await page.goto('/');
  // The home page points to it rather than inlining the whole write-up.
  await page.getByRole('link', { name: /Read the methods/ }).click();
  await expect(page).toHaveURL(/\/methods\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Where the numbers come from' })).toBeVisible();
  // A representative method section survived the move.
  await expect(page.getByRole('heading', { name: 'Drag coefficient' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "What Debrief isn't" })).toBeVisible();
  // Back to the analyzer.
  await page.getByRole('link', { name: /Back to Debrief/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();

  // And it's reachable from the footer too.
  await page.getByRole('link', { name: 'Methods', exact: true }).click();
  await expect(page).toHaveURL(/\/methods\/?$/);
});

// The validation page is its own route, reachable from the footer, and states both
// how the reads are checked and where they're known to be weak.
test('validation page is its own route with the accuracy account', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Validation', exact: true }).click();
  await expect(page).toHaveURL(/\/validation\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'How Debrief is validated' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Real flights, checked against real ground truth/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Where it is known to be weak/ })).toBeVisible();
  // Cross-linked with the methods write-up.
  await page.getByRole('link', { name: /where the numbers come from/ }).click();
  await expect(page).toHaveURL(/\/methods\/?$/);
});

// Debrief reads flights that have already been flown, and the line between that and a
// simulator is the basis on which its numbers can be trusted. Any surface that shows
// figures has to say so — it isn't a home-page footnote.
test('every surface that shows numbers says what Debrief is not', async ({ page }) => {
  for (const path of ['/', '/compare', '/stitch']) {
    await page.goto(path);
    await expect(
      page.getByText(/measurement instrument, not a simulator/),
      `${path} must carry the disclaimer`,
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Read the methods/ })).toBeVisible();
  }
});

// Two pages doing different jobs shouldn't introduce themselves with the same sentence.
test('each surface describes itself', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Drop in a flight log from any altimeter/)).toBeVisible();
  await page.goto('/compare');
  await expect(page.getByText(/Line up a launch day, a season/)).toBeVisible();
  await expect(page.getByText(/Drop in a flight log from any altimeter/)).toHaveCount(0);
  await page.goto('/stitch');
  await expect(page.getByText(/Put the stages of one launch in order/)).toBeVisible();
  await expect(page.getByText(/Line up a launch day, a season/)).toHaveCount(0);
});

// Both surfaces take a flight file, and they disagreed about which ones a flyer may pick: the
// analyze page filtered on a hand-typed `accept` list that had drifted behind the parsers, and
// the comparison filtered on nothing at all. `.pf2` is PerfectFlite's own export — detected on
// the extension alone, with a corpus fixture behind it — and the browser greyed it out.
test('both file pickers offer every format the app can read', async ({ page }) => {
  const accepts: string[] = [];
  for (const [path, label] of [
    ['/', 'Choose a flight log file'],
    ['/compare', 'Choose flight logs to compare'],
  ] as const) {
    await page.goto(path);
    const a = await page.getByLabel(label).getAttribute('accept');
    expect(a, `${path} filters its picker at all`).toBeTruthy();
    for (const ext of ['.csv', '.txt', '.xlsx', '.pf2']) {
      expect(a, `${path} offers ${ext}`).toContain(ext);
    }
    accepts.push(a as string);
  }
  expect(new Set(accepts).size, `the two surfaces offer different files: ${JSON.stringify(accepts)}`).toBe(1);
});

// `OWNER-NOTES.md` ON-1 — "the docs need some serious work in formatting and presentation.
// its just a large block of text at this point." The page was ~12,700 words in 51 blocks
// with ONE level of heading under the title, no contents and no in-page navigation of any
// kind, so finding one rule meant scrolling the whole thing.
//
// This walks the two things that fix it, rather than asserting the markup exists: a reader
// who has never seen the page reaches a named definition from the top in ONE click, and the
// definition they land on sits under a subject heading that says what it is among.
test('the page says which build a flyer is looking at, and links to it', async ({ page }) => {
  // P5 — the stamp has been on every SAVED document since D11 slice 4 and on no screen. Driven on
  // the built export, where `BUILD_SHA` is real; in `npm run dev` it is 'dev' and the line is
  // deliberately absent, which is why this belongs in the e2e rather than a unit test.
  await page.goto('/');
  // Not scoped to `contentinfo`: the footer is nested inside `<main>`, so `<footer>` carries no
  // implicit landmark role there and a role-scoped query finds nothing.
  const stamp = page.getByRole('link', { name: /^Debrief [0-9a-f]{7}/ });
  await expect(stamp).toBeVisible();

  // Resolvable, or it is decoration: the methods change most weeks, so the identifier is only
  // worth printing if the commit behind it can be read.
  const href = (await stamp.getAttribute('href')) as string;
  expect(href).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/commit\/[0-9a-f]{7,40}$/);
  await expect(stamp).toHaveAttribute('rel', /noreferrer/);

  // The same build the documents name. Save one and compare, rather than trusting that two call
  // sites of the same helper agree.
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .txt' }).click(),
  ]);
  const txt = await readFile((await dl.path()) as string, 'utf8');
  const shown = ((await stamp.textContent()) ?? '').trim();
  // The WHOLE line, not a prefix. A `toContain` alone passes when the footer drops the build date
  // and prints a shorter hand-built string — measured, by falsifying it that way.
  expect(shown, 'the footer prints the shared line in full').toMatch(/^Debrief [0-9a-f]{7,40}, built \d{4}-\d{2}-\d{2}$/);
  expect(txt, `the report names the same build the footer does: ${shown}`).toContain(shown);
});

test('the landing surface says what this does that your own software cannot', async ({ page }) => {
  // P5 slice 2. `COMPETITION.md`'s standing conclusion opens: "it is what the landing surface and
  // the README should say, and right now they do not say it." A flyer arriving from a forum link
  // had to discover all four by using the tool.
  await page.goto('/');
  const why = page.getByRole('region', { name: /your altimeter/i });
  await expect(why).toBeVisible();
  await expect(why.getByRole('listitem')).toHaveCount(4);

  // The two claims the ledger warns must be published carefully, checked as RENDERED rather than
  // as data — the unit test holds the strings, this holds what a flyer actually reads.
  await expect(why, 'the cross-vendor qualifier, because overlaying one maker is no longer unique').toContainText(
    /different makers/i,
  );
  await expect(why, 'a composite adds order and no reading').toContainText(/nothing is combined/i);

  // No assertion here that the panel is ABSENT elsewhere, and that is deliberate rather than an
  // omission. The report and the comparison return early and never reach this block at all, so an
  // assertion on either would pass whatever the guard said — it did, when it was falsified by
  // rendering the panel unconditionally. The `idle` guard is kept because a panel of claims under
  // "there's no flight data in this file" is a tell, but it is not a thing this walk can prove,
  // and an assertion that cannot fail is worse than none.
});

test('a method that rests on published work says which, and the source is reachable', async ({ page }) => {
  // P9 slice 5. `MAINTAINING.md`'s CLEAN-ROOM invariant has always required methods to be
  // implemented from published sources AND CITED; until 2026-08-09 the citing was happening in
  // code comments, where no flyer can reach it. Measured then: 0 URLs and no named algorithm in
  // 102 KB of method text.
  await page.goto('/methods/');

  // The block carries its own sources line — that is what the popover on the report also renders.
  const block = page.locator('#mach-dynamic-pressure').locator('xpath=..');
  await expect(block).toContainText('Sources:');

  // The marker goes to the entry, in the same tab. A citation that opened a second tab would cost
  // the flyer their place, which is the whole complaint P8 answered.
  const marker = block.getByRole('link', { name: 'USSA 1976' });
  await expect(marker).toHaveAttribute('href', '/methods/#ref-ussa-1976');
  await expect(marker).not.toHaveAttribute('target', '_blank');

  // The entry says what it IS, and what Debrief takes from it — the clause that makes a citation
  // checkable rather than decorative.
  const entry = page.locator('#ref-ussa-1976');
  await expect(entry).toContainText('U.S. Standard Atmosphere');
  await expect(entry).toContainText('Debrief takes from it');

  // …and out to the source itself, which is a navigation and carries nothing back.
  const out = entry.getByRole('link', { name: 'Read it' });
  await expect(out).toHaveAttribute('href', /^https:\/\/ntrs\.nasa\.gov\//);
  await expect(out).toHaveAttribute('rel', /noreferrer/);

  // The section is reachable from the top of the page rather than only by scrolling 12,700 words.
  await expect(page.getByRole('navigation', { name: 'Contents' }).getByRole('link', { name: 'Sources' })).toBeVisible();

  // And the honest half: most of this page is Debrief's own and must NOT cite. A page where
  // everything carried a source would mean authority had been borrowed to fill a field.
  const uncited = page.locator('#battery').locator('xpath=..');
  await expect(uncited).not.toContainText('Sources:');
});

test('the methods page can be navigated, not just scrolled', async ({ page }) => {
  await page.goto('/methods');
  await expect(page.getByRole('heading', { level: 1, name: 'Where the numbers come from' })).toBeVisible();

  // A real hierarchy: subjects above blocks. Flat, this page had 51 h2 and no h3 at all, so
  // nothing said that "Apogee" and "Parachute Cd" are different subjects.
  const groups = page.getByRole('heading', { level: 2 });
  const blocks = page.getByRole('heading', { level: 3 });
  const nGroups = await groups.count();
  const nBlocks = await blocks.count();
  expect(nGroups, `subject headings: ${nGroups}`).toBeGreaterThanOrEqual(8);
  expect(nBlocks, `block headings: ${nBlocks}`).toBeGreaterThanOrEqual(40);
  // Every block sits under a subject — more blocks than subjects, and no subject empty.
  expect(nBlocks).toBeGreaterThan(nGroups);

  // ONE click from the top of the page to a named subject, through the contents list.
  const contents = page.getByRole('navigation', { name: 'Contents' });
  await expect(contents).toBeVisible();
  await contents.getByRole('link', { name: 'Coming down' }).click();
  const landed = page.locator('#coming-down');
  const top = await landed.evaluate((el) => el.getBoundingClientRect().top);
  expect(top, `"Coming down" landed at y=${Math.round(top)}`).toBeLessThan(140);

  // The strip is pinned, so it is still reachable from deep in the page — the report has had
  // this since it reached nine screens on a phone and this page is longer.
  const strip = page.getByRole('navigation', { name: 'Jump to a subject on this page' });
  await expect(strip).toBeVisible();
  const stripBottom = await strip.evaluate((el) => el.getBoundingClientRect().bottom);
  expect(stripBottom, `the strip is still on screen, bottom at y=${Math.round(stripBottom)}`).toBeLessThan(80);

  // …and the heading landed BELOW the strip rather than under it. The first version of this
  // asserted `top >= 0`, which only says the heading is below the top of the VIEWPORT — a
  // heading sitting at y=10, wholly covered by a strip whose bottom is at 42, passed it. The
  // real margin is `scroll-mt-12` (48 px) against that bottom, so this has about 6 px in it
  // and will fail if either number moves.
  expect(top, `heading at y=${Math.round(top)} vs strip bottom y=${Math.round(stripBottom)}`).toBeGreaterThanOrEqual(
    stripBottom,
  );

  // And it marks where the reader is standing, which is the difference between a map and a
  // list of place names.
  await expect(
    strip.locator('[aria-current="location"]'),
    'the strip says which subject the reader is in',
  ).toHaveCount(1);

  // **Including the LAST subject, which could never light up.** A short final section cannot be
  // scrolled up to the reading line — there is no page left — so clicking its own chip left the
  // marker on the section above it. Measured before the fix: the last heading sits 288 px down
  // at maximum scroll on a desktop against a line at 50. The report has the same shape and hid
  // it behind a tall final section. This is the marker the primitive was lifted for, failing at
  // the one place a reader is most likely to look.
  const chips = strip.getByRole('link');
  const last = chips.nth((await chips.count()) - 1);
  const lastLabel = (await last.textContent())!.trim();
  await last.click();
  await expect(last, `the last chip ("${lastLabel}") marks itself once the reader is there`).toHaveAttribute(
    'aria-current',
    'location',
  );
});
