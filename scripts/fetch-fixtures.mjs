#!/usr/bin/env node
// Fetch the private Debrief flight-log corpus into lib/parsers/__corpus__/.
//
//   npm run fetch-fixtures
//
// - Pins a release TAG + SHA-256 in corpus.lock.json, so a fetch is reproducible and
//   tamper-evident (the tag is immutable once released; the sha256 catches a swapped asset).
// - Needs a token with read access to the private fixtures repo, in FIXTURES_TOKEN
//   (or GITHUB_TOKEN). WITHOUT a token it exits 0 with a notice — a fresh public clone and
//   CI on forks stay green; corpus.test.ts simply skips when the corpus is absent.
// - Zero runtime deps: Node ≥20 global fetch + the system `unzip`.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(ROOT, 'corpus.lock.json');
const DEST = join(ROOT, 'lib', 'parsers', '__corpus__');

function notice(msg) {
  console.log(`[fetch-fixtures] ${msg}`);
}

if (!existsSync(LOCK)) {
  notice(`no corpus.lock.json at ${LOCK} — nothing to fetch.`);
  process.exit(0);
}
const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
const { repo, tag, asset, sha256 } = lock;
if (!repo || !tag) {
  notice('corpus.lock.json is missing "repo" or "tag" — skipping.');
  process.exit(0);
}

const token = process.env.FIXTURES_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  notice('no FIXTURES_TOKEN (or GITHUB_TOKEN) set — skipping corpus fetch.');
  notice('Corpus regression tests will be skipped. This is expected on public clones / forks.');
  process.exit(0);
}

const assetName = asset || `corpus-${tag}.zip`;
const api = 'https://api.github.com';
const headers = {
  Authorization: `Bearer ${token}`,
  'User-Agent': 'debrief-fetch-fixtures',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function main() {
  notice(`resolving ${repo}@${tag} …`);
  const relRes = await fetch(`${api}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: { ...headers, Accept: 'application/vnd.github+json' },
  });
  if (!relRes.ok) {
    const hint =
      relRes.status === 404
        ? ' (release/tag not found, or the token cannot see this private repo)'
        : relRes.status === 401
          ? ' (token rejected — check it has read access to the fixtures repo)'
          : '';
    throw new Error(`GitHub API ${relRes.status} for release ${tag}${hint}`);
  }
  const release = await relRes.json();
  const found = (release.assets || []).find((a) => a.name === assetName);
  if (!found) {
    const names = (release.assets || []).map((a) => a.name).join(', ') || '(none)';
    throw new Error(`asset "${assetName}" not on release ${tag}. Assets present: ${names}`);
  }

  notice(`downloading ${assetName} (${(found.size / 1e6).toFixed(1)} MB) …`);
  const dl = await fetch(found.url, { headers: { ...headers, Accept: 'application/octet-stream' } });
  if (!dl.ok) throw new Error(`asset download failed: HTTP ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());

  const got = createHash('sha256').update(buf).digest('hex');
  if (sha256 && sha256 !== 'REPLACE_WITH_SHA256_FROM_make-release-zip.sh') {
    if (got !== sha256) throw new Error(`sha256 mismatch!\n  expected ${sha256}\n  got      ${got}\nRefusing to extract a corpus that doesn't match the lock.`);
    notice('sha256 verified.');
  } else {
    notice(`WARNING: corpus.lock.json has no pinned sha256 — skipping integrity check. (got ${got})`);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'debrief-corpus-'));
  const zipPath = join(tmp, assetName);
  writeFileSync(zipPath, buf);

  // Replace the corpus dir atomically-ish: extract to a temp dir, then swap.
  const staging = join(tmp, 'unzipped');
  mkdirSync(staging, { recursive: true });
  try {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', staging], { stdio: 'inherit' });
  } catch {
    throw new Error('`unzip` failed or is not installed. Install unzip, or extract the asset manually into lib/parsers/__corpus__/.');
  }

  rmSync(DEST, { recursive: true, force: true });
  mkdirSync(dirname(DEST), { recursive: true });
  execFileSync('cp', ['-R', staging, DEST]);
  writeFileSync(join(DEST, '.corpus-meta.json'), JSON.stringify({ repo, tag, asset: assetName, sha256: got }, null, 2));
  rmSync(tmp, { recursive: true, force: true });

  notice(`corpus ready at lib/parsers/__corpus__/ (from ${repo}@${tag}).`);
}

main().catch((e) => {
  console.error(`[fetch-fixtures] ERROR: ${e.message}`);
  process.exit(1);
});
