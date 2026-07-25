import { defineConfig, devices } from '@playwright/test';

// Optional: point at a pre-installed Chromium (e.g. a sandboxed CI image that
// provisions browsers out-of-band). Unset in normal use — Playwright then uses
// the browser it manages itself.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

// Headless browser (Chromium) end-to-end tests. These cover what the vitest unit
// tests can't: the real drop-file → parse → analyze → render pipeline, a clean
// hydration (no console errors), and an axe accessibility audit.
//
// Run against the STATIC EXPORT: `npm run build` first (emits out/), then
// `npm run test:e2e`. The webServer serves out/ with `serve` instead of
// `next start` (which doesn't work with output: export), using e2e-serve.json to
// emulate the Cloudflare _headers security headers.

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
    command: 'npx serve -c e2e-serve.json -l 3000 --no-clipboard --no-request-logging',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
