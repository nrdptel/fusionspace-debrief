import { readFileSync } from 'node:fs';

/**
 * The build's identity, inlined into the bundle so a document Debrief writes can name the build
 * that produced it.
 *
 * Read from `public/version.json` rather than computed here, and that is the point: `prebuild`
 * runs `scripts/stamp-version.mjs` before `next build`, so the file already exists and the git
 * logic lives in exactly one place. Computing the sha a second time here would be two lists that
 * must agree, which this repo has been bitten by before.
 *
 * Inlined at build time rather than fetched at runtime, because these documents are written in a
 * browser that may be offline at a launch site — a `fetch('/version.json')` would be the one part
 * of an export that needs a network, on a tool whose promise is that it does not.
 *
 * `next dev` never runs `prebuild`, so the file is absent there and the answer is 'dev'.
 */
function buildStamp() {
  try {
    const v = JSON.parse(readFileSync(new URL('./public/version.json', import.meta.url), 'utf8'));
    return { sha: String(v.short ?? 'unknown'), builtAt: String(v.builtAt ?? '') };
  } catch {
    return { sha: 'dev', builtAt: '' };
  }
}

const stamp = buildStamp();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BUILD_SHA: stamp.sha,
    NEXT_PUBLIC_BUILT_AT: stamp.builtAt,
  },
};

export default nextConfig;
