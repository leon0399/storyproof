import path from "node:path";

import { expect, test } from "@playwright/test";

import { registerAddonAcceptanceSuite } from "../acceptance/addon-suite.js";

// VISUAL_TEST_PROJECT_DIR (see test/fixture-server.ts) points this same
// suite at a real installed project instead of the workspace-source fixture.
const consumerDir = process.env.VISUAL_TEST_PROJECT_DIR
  ? path.resolve(process.cwd(), process.env.VISUAL_TEST_PROJECT_DIR)
  : undefined;

registerAddonAcceptanceSuite({
  expect,
  projectRoot: consumerDir ?? path.join(process.cwd(), "test/.tmp/project"),
  staticBaseURL: `http://127.0.0.1:${process.env.VISUAL_TEST_STATIC_PORT ?? "6011"}`,
  test,
});
