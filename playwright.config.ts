/**
 * Minimal Playwright config so `pnpm exec playwright install chromium` and
 * tooling work out of the box. The apply pipeline drives Chromium directly via
 * the `playwright` package (see packages/browser); it is not a test suite.
 */
const config = {
  timeout: 60_000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure" as const,
    trace: "retain-on-failure" as const,
  },
};

export default config;
