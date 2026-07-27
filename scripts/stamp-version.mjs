// Writes public/version.json so the deployed site can say which commit it is.
//
// Why this exists: the site is a static export on a CDN with content-hashed asset
// names, and nothing in the served HTML identified the build. "What is production
// actually serving, and how far behind the branch is it?" could only be answered by
// building locally and comparing chunk file names — which does not work, because a
// local build and a CI build produce different hashes for identical source. So the
// question had no answer at all.
//
// Generated at build time, never committed (.gitignore covers it), and served at
// /version.json. Both the CDN headers (public/_headers) and the service worker
// (public/sw.js) are told not to cache it — a stale version marker is worse than
// none, because it answers confidently and wrongly.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The commit being built. CI states it outright; locally we ask git. */
function commit() {
  // GitHub Actions sets this for every workflow run, including the deploy.
  const fromCI = process.env.GITHUB_SHA?.trim();
  if (fromCI) return fromCI;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    // A tarball with no git and no CI env — say so rather than inventing a value.
    return 'unknown';
  }
}

/** True when the tree had uncommitted changes at build time, so a SHA alone would
 *  overstate what was built. Unknowable without git, in which case say nothing. */
function dirty() {
  if (process.env.GITHUB_SHA?.trim()) return false; // CI builds a clean checkout
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return null;
  }
}

const sha = commit();
const version = {
  commit: sha,
  short: sha === 'unknown' ? 'unknown' : sha.slice(0, 7),
  builtAt: new Date().toISOString(),
  ...(dirty() === null ? {} : { dirty: dirty() }),
};

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'version.json'), `${JSON.stringify(version, null, 2)}\n`);
console.log(`version.json: ${version.short}${version.dirty ? ' (dirty tree)' : ''}`);
