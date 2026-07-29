import { defineConfig, devices, chromium } from '@playwright/test';
import { realpathSync } from 'node:fs';

// Optional: point at a pre-installed Chromium (e.g. a sandboxed CI image that
// provisions browsers out-of-band). Unset in normal use — Playwright then uses
// the browser it manages itself.
//
// A pre-installed browser is only usable if it is the build THIS Playwright expects.
// An image that ships a nearby-but-different revision is the dangerous case, because
// the suite still runs and simply behaves differently: on chromium-1194 against
// Playwright 1.61.1 (which wants 1228), `context.setOffline(true)` stopped applying to
// service-worker-initiated fetches, so the worker's own `fetch` reached the server and
// the offline-fallback test failed with a 404 where it asserts a 503 — indistinguishable
// from a real routing regression, and it cost a session a wrong diagnosis. So compare the
// revisions and fail with the reason rather than handing back a misleading red.
function resolveExecutablePath(): string | undefined {
  const override = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (!override) return undefined;
  const rev = (p: string) => p.match(/chromium(?:_headless_shell)?-(\d+)/)?.[1];
  let want: string | undefined;
  let got: string | undefined;
  try {
    want = rev(chromium.executablePath());
    got = rev(realpathSync(override));
  } catch {
    return override; // can't tell (no managed install, or an unusual layout) — trust the caller
  }
  if (want && got && want !== got) {
    throw new Error(
      `PLAYWRIGHT_CHROMIUM_PATH points at chromium-${got}, but this Playwright expects chromium-${want}. ` +
        `A mismatched build changes browser behaviour without failing loudly (offline handling in service ` +
        `workers, for one). Run \`npx playwright install chromium\`, or unset PLAYWRIGHT_CHROMIUM_PATH.`,
    );
  }
  return override;
}

const executablePath = resolveExecutablePath();

// Headless browser (Chromium) end-to-end tests. These cover what the vitest unit
// tests can't: the real drop-file → parse → analyze → render pipeline, a clean
// hydration (no console errors), and an axe accessibility audit.
//
// Run against the STATIC EXPORT: `npm run build` first (emits out/), then
// `npm run test:e2e`. The webServer serves out/ with scripts/e2e-server.mjs
// instead of `next start` (which doesn't work with output: export); that script
// applies the Cloudflare _headers security headers and answers from memory, which
// is what ended this suite's long-running `EMFILE` web-server crashes. Same
// command as `npm run serve:out`, so a manual walk sees exactly what a run does.

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    // CI retries once, so a trace on the retry catches a flake there. Locally there are no
    // retries, which meant a local failure left nothing behind to read: a full-suite run
    // that failed 39 of 120 once, and passed either side of it with no code change, could
    // not be diagnosed afterwards. Both settings only write on failure, so a green run
    // costs nothing.
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
