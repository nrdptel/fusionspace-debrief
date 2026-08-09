import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUG_REPORT_URL, FORMAT_REQUEST_URL, REPO_URL } from './links';

/**
 * P5 — "a working way to report a bug or request a format from inside the app".
 *
 * The forms have existed in `.github/ISSUE_TEMPLATE/` for a long time. Until 2026-08-09 the only
 * link to either was one sentence on the PRIVACY page, which is `MAINTAINING.md`'s craft-bar tell
 * almost word for word: "a feature reachable only by knowing it is there". A flyer whose logger is
 * not read has no reason to visit the privacy page.
 *
 * **The failure worth automating against is a link that 404s**, and it has two halves that no
 * amount of care catches: the template file being renamed, and the query parameter being wrong.
 * Both look fine in a diff and both land the flyer on GitHub's generic "choose a template" page or
 * an empty box.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));

describe('a flyer can tell the project something', () => {
  const links = [
    ['bug report', BUG_REPORT_URL],
    ['format request', FORMAT_REQUEST_URL],
  ] as const;

  it('points at a template file that is actually in the repo', () => {
    for (const [what, url] of links) {
      const template = new URL(url).searchParams.get('template');
      expect(template, `${what} names a template`).toBeTruthy();
      expect(
        existsSync(`${ROOT}.github/ISSUE_TEMPLATE/${template}`),
        `${what} points at .github/ISSUE_TEMPLATE/${template}, which does not exist`,
      ).toBe(true);
    }
  });

  it('uses the parameter GitHub actually reads', () => {
    // `?template=` is the one that opens the form. `?issue_template=`, `?labels=` and a bare
    // `/issues/new` all resolve to something — which is why this is worth pinning: the wrong one
    // does not error, it just quietly drops the flyer on an empty box.
    for (const [what, url] of links) {
      expect(url, `${what} opens a new issue`).toContain(`${REPO_URL}/issues/new?`);
      expect(url, `${what} uses ?template=`).toMatch(/[?&]template=[^&]+\.yml$/);
    }
  });

  it('is reachable from the surfaces that need it, not just the privacy page', () => {
    const footer = readFileSync(`${ROOT}components/SiteFooter.tsx`, 'utf8');
    const formats = readFileSync(`${ROOT}components/RecognizedFormats.tsx`, 'utf8');
    // The footer is on every route, so a problem can be reported from wherever it was seen.
    expect(footer, 'the footer links the bug report').toContain('BUG_REPORT_URL');
    // …and the format request is asked where a flyer DISCOVERS their board is not in the list.
    expect(formats, 'the recognized-loggers card links the format request').toContain('FORMAT_REQUEST_URL');
    // Both from the shared constants: a hand-written query string in two files drifts the day a
    // template is renamed, which is exactly what the first assertion here would then catch in only
    // one of them.
    expect(footer).not.toContain('issues/new?template=');
    expect(formats).not.toContain('issues/new?template=');
  });

  it('carries the standing rel on an outbound link', () => {
    const footer = readFileSync(`${ROOT}components/SiteFooter.tsx`, 'utf8');
    expect(footer).toMatch(/href=\{BUG_REPORT_URL\}[\s\S]{0,200}rel="noopener noreferrer"/);
  });
});
