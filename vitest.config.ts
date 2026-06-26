import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only. The Playwright specs under e2e/ are run separately by
    // `npm run test:e2e` and must not be collected by vitest (their test() comes
    // from @playwright/test, not vitest).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
