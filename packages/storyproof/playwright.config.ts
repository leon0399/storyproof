import { defineConfig } from "@playwright/test";

const devPort = process.env.VISUAL_TEST_DEV_PORT ?? "6010";

export default defineConfig({
  testDir: "./test/smoke",
  timeout: 60_000,
  workers: 1,
  // Retry in CI only, and now only as a backstop. The webkit failures these
  // were added for — 6 of 25 runs (~24%), measured 2026-08-03, always the
  // heaviest tests — came from the readiness wait burning its full budget on
  // that engine, which capture.ts now fixes at the source: the slowest webkit
  // test went 18.1s -> 2.7s. Kept because a retried pass reports as "flaky"
  // rather than green, so a new intermittent failure stays visible instead of
  // being laundered by a human clicking rerun.
  //
  // Safe because every test resets the fixture project in beforeEach, so a
  // retry starts from the same state the first attempt did.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${devPort}`,
    browserName: "chromium",
  },
  webServer: {
    command: "exec node --import tsx test/fixture-server.ts",
    url: `http://127.0.0.1:${devPort}/index.json`,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    timeout: 300_000,
  },
});
