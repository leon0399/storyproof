import { defineConfig } from "@playwright/test";

const devPort = process.env.VISUAL_TEST_DEV_PORT ?? "6010";

export default defineConfig({
  testDir: "./test/smoke",
  timeout: 60_000,
  workers: 1,
  // Retry in CI only. The engine matrix has a standing intermittent failure
  // — measured 2026-08-03 across 25 runs, `visual smoke (webkit)` failed 6
  // of them (~24%), always the same heaviest tests (the run-all, the
  // approve flow, the forced connection failure), and firefox once burned
  // its whole 25-minute budget then passed in 2m21s on a rerun of the
  // identical tree. A 10x gap is a hang, not slowness, so there is a real
  // defect here and this does NOT fix it.
  //
  // What it fixes is the cost of not fixing it: at ~24% on a required
  // check, roughly one pull request in four was blocked by a failure that
  // had nothing to do with its diff, and the habit that builds — press
  // rerun, assume flake — is how a genuine regression gets waved through.
  // A retried pass reports as "flaky" rather than green, so the signal
  // survives instead of being laundered by a human clicking rerun.
  //
  // Safe because every test resets the fixture project in beforeEach, so a
  // retry starts from the same state the first attempt did.
  retries: process.env.CI ? 2 : 0,
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
