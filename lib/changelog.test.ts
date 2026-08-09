import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RELEASES, latestRelease, releaseId, releasesThatMovedAReading } from './changelog';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(`${root}${p}`, 'utf8');

const PAGE = 'app/changelog/page.tsx';

describe('the changelog', () => {
  it('is newest first, one entry per day, with no gaps in the shape', () => {
    // The page renders in array order and the jump strip is built from it, so the order IS the
    // reading order — a release inserted in the wrong place would read as having shipped later
    // than it did.
    const dates = RELEASES.map((r) => r.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(new Set(dates).size, 'one release per date — releaseId() is the date').toBe(dates.length);

    for (const r of RELEASES) {
      expect(r.date, `${r.date} is ISO YYYY-MM-DD`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(r.date)), `${r.date} is a real date`).toBe(false);
      expect(r.headline.length, `${r.date} has a headline for the contents list`).toBeGreaterThan(10);
      // A release that says nothing at all is a date with no content behind it.
      expect(
        r.readings.length + r.added.length + r.improved.length,
        `${r.date} says something`,
      ).toBeGreaterThan(0);
      for (const entry of [...r.readings, ...r.added, ...r.improved]) {
        // Written for a flyer: a one-clause commit subject is not an entry.
        expect(entry.length, `${r.date}: "${entry.slice(0, 40)}…" is a sentence`).toBeGreaterThan(40);
        expect(entry.trim(), 'no stray whitespace').toBe(entry);
      }
    }
  });

  it('never dates a release in the future', () => {
    // A changelog whose newest entry is tomorrow is describing a build nobody is running. The
    // check is against the day the suite runs, so it fails the moment somebody post-dates one.
    const today = new Date().toISOString().slice(0, 10);
    expect(latestRelease().date <= today, `latest is ${latestRelease().date}, today is ${today}`).toBe(true);
  });

  it('says which builds moved a reading, and the page leads with that', () => {
    // The section that earns this page. A changelog for a measurement instrument that buries a
    // changed number among the features is the same failure as a caveat on one surface and a
    // confident claim on another.
    const moved = releasesThatMovedAReading();
    expect(moved.length, 'at least one release has moved a reading').toBeGreaterThan(0);
    expect(moved.every((r) => RELEASES.includes(r))).toBe(true);
    expect(moved.length).toBeLessThan(RELEASES.length); // …and not every one, or the split says nothing

    const page = read(PAGE);
    expect(page, 'the page names the section').toContain('Readings that changed');
    // The notice that tells a flyer with an old report where to look is above the list, not in it.
    const notice = page.indexOf('If you saved a report before today');
    const list = page.indexOf('RELEASES.map');
    expect(notice).toBeGreaterThan(-1);
    expect(notice, 'the warning is above the list').toBeLessThan(list);
  });

  it('states plainly when a release moved nothing, rather than hiding the heading', () => {
    // An absent heading leaves a reader working out whether nothing moved or nobody checked.
    expect(RELEASES.some((r) => r.readings.length === 0), 'a quiet release exists to state').toBe(true);
    expect(read(PAGE)).toContain('No reading changed in this release');
  });

  it('is reachable — the route is in the footer, the sitemap and the offline precache', () => {
    // "Shipped means reachable by a flyer". A page nothing links to is a page nobody opens, and
    // one the service worker never caches is a page that 404s at the field.
    expect(read('components/SiteFooter.tsx'), 'linked from the docs spine').toContain('href="/changelog"');
    expect(read('components/SiteFooter.tsx'), 'prefetched, like its siblings — the offline promise').toMatch(
      /href="\/changelog" prefetch/,
    );
    expect(read('app/sitemap.ts')).toContain('/changelog/');
    expect(read('public/sw.js'), 'precached, so it opens with the radio off').toContain("'/changelog/'");
  });

  it('gives every release a stable anchor the jump strip can address', () => {
    for (const r of RELEASES) {
      // Dates are unique, so the id is too — and it cannot start with a digit, which is not a
      // valid CSS selector target for the you-are-here hook.
      expect(releaseId(r)).toBe(`r${r.date}`);
      expect(releaseId(r)).toMatch(/^[A-Za-z][\w-]*$/);
    }
    expect(new Set(RELEASES.map(releaseId)).size).toBe(RELEASES.length);
  });

  it('never says a flyer uploads anything', () => {
    // PRIVACY IS SACRED reaches the copy, not just the code — the same check `lib/readme.test.ts`
    // makes. "Nothing uploaded" is fine; "upload your log" is the promise being broken in words.
    const copy = RELEASES.flatMap((r) => [r.headline, ...r.readings, ...r.added, ...r.improved]).join('\n');
    for (const line of copy.split('\n')) {
      const bad = /\bupload(s|ed|ing)?\b/i.test(line) && !/nothing (is )?upload/i.test(line);
      expect(bad, `"${line.slice(0, 60)}…" describes uploading`).toBe(false);
    }
  });

  it('does not claim Debrief rewrites a document a flyer already saved', () => {
    // The one promise this page makes beyond reporting: re-reading the log gives today's answer,
    // and a saved report is frozen at the build that wrote it. `lib/buildInfo.ts` is what makes
    // that traceable, so the two must not contradict each other.
    expect(read(PAGE)).toContain('never rewrites a document you already saved');
  });
});
