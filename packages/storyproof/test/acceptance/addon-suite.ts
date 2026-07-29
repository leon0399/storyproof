import { createHash } from "node:crypto";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

import type {
  expect as PlaywrightExpect,
  Locator,
  Page,
  test as PlaywrightTest,
} from "@playwright/test";
import { PNG } from "pngjs";

// The key leads with the platform the BROWSER renders on (this host's
// platform locally, the distinct "container" token in the capture
// container) and the engine
// (STORYPROOF_BROWSER). Both env vars are the same switches the fixture's
// main.ts reads, so the suite and the addon agree by construction.
const ENVIRONMENT_KEY = `${
  process.env.STORYPROOF_CONTAINER === "1" ? "container" : process.platform
}-${process.env.STORYPROOF_BROWSER ?? "chromium"}-1280x720@1x`;

type AddonAcceptanceSuiteOptions = {
  expect: typeof PlaywrightExpect;
  projectRoot: string;
  staticBaseURL: string;
  test: typeof PlaywrightTest;
};

export function registerAddonAcceptanceSuite({
  expect,
  projectRoot,
  staticBaseURL,
  test,
}: AddonAcceptanceSuiteOptions): void {
  test.beforeEach(async () => {
    await resetFixtureState(projectRoot);
  });

  test.afterEach(async () => {
    await resetFixtureState(projectRoot);
  });

  test("reviews changed pixels across baseline, candidate, and diff", async ({
    page,
  }) => {
    const panel = await openVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--changed",
    });
    const artifactDirectory = visualArtifactDirectory(
      projectRoot,
      "visual-fixture--changed",
    );

    await createApprovedBaseline(expect, panel);
    await replaceBaselinePixels(artifactDirectory);

    await runCurrent(panel);
    await expect(panel.getByText("Changed", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.getByText(/\d[\d,]* px/)).toBeVisible();

    const reviewedSources = new Set<string>();
    for (const [button, image] of [
      ["Baseline", "baseline"],
      ["Latest", "candidate"],
      ["Diff", "diff"],
    ] as const) {
      await panel.getByRole("button", { name: button, exact: true }).click();
      const preview = panel.getByAltText(
        `${image} for Visual Fixture / Changed`,
      );
      await expect(preview).toBeVisible();
      await expect
        .poll(() =>
          preview.evaluate((element) =>
            element instanceof HTMLImageElement ? element.naturalWidth : 0,
          ),
        )
        .toBeGreaterThan(0);
      reviewedSources.add((await preview.getAttribute("src")) ?? "");
    }
    expect(reviewedSources.size).toBe(3);
    expect(reviewedSources.has("")).toBe(false);

    const baseline = await readFile(
      path.join(artifactDirectory, "baseline.png"),
    );
    const candidate = await readFile(
      path.join(artifactDirectory, "candidate.png"),
    );
    expect(candidate).not.toEqual(baseline);
    expect(await pathExists(path.join(artifactDirectory, "diff.png"))).toBe(
      true,
    );

    await panel.getByRole("button", { name: "Accept" }).click();
    await expect(panel.getByText("Passed", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await readFile(path.join(artifactDirectory, "baseline.png")),
    ).toEqual(candidate);
    await expect(
      panel.getByRole("button", { name: "Diff", exact: true }),
    ).toBeDisabled();
  });

  test("skips disabled stories without writing a candidate", async ({
    page,
  }) => {
    const panel = await openVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--disabled",
    });
    const artifactDirectory = visualArtifactDirectory(
      projectRoot,
      "visual-fixture--disabled",
    );

    await runCurrent(panel);
    await expect(panel.getByText("Passed", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      panel.getByText("Visual tests disabled for this story", { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Latest", exact: true }),
    ).toBeDisabled();
    expect(
      await pathExists(path.join(artifactDirectory, "candidate.png")),
    ).toBe(false);
  });

  test("captures fullscreen stories at exactly 1280x720", async ({ page }) => {
    const panel = await openVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--viewport",
    });
    const artifactDirectory = visualArtifactDirectory(
      projectRoot,
      "visual-fixture--viewport",
    );

    await runCurrent(panel);
    await expect(panel.getByText("New", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await panel.getByRole("button", { name: "Latest", exact: true }).click();
    const preview = panel.getByAltText(
      "candidate for Visual Fixture / Viewport",
    );
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate((element) =>
          element instanceof HTMLImageElement ? element.naturalWidth : 0,
        ),
      )
      .toBe(1280);
    await expect
      .poll(() =>
        preview.evaluate((element) =>
          element instanceof HTMLImageElement ? element.naturalHeight : 0,
        ),
      )
      .toBe(720);

    const candidate = PNG.sync.read(
      await readFile(path.join(artifactDirectory, "candidate.png")),
    );
    expect(candidate.width).toBe(1280);
    expect(candidate.height).toBe(720);
  });

  test("fails closed for stories outside story roots before writing artifacts", async ({
    page,
  }) => {
    const panel = await openVisualPanel({
      expect,
      page,
      storyId: "outside-fixture--default",
    });
    const outsideArtifactDirectory = path.join(
      projectRoot,
      "outside/__screenshots__/outside-fixture.stories.tsx.visual",
      "outside-fixture--default",
      ENVIRONMENT_KEY,
    );

    await runCurrent(panel);
    await expect(
      panel.getByText("Capture failed", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      panel.getByRole("alert").filter({
        hasText: "Story resolves outside the configured story roots",
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Latest", exact: true }),
    ).toBeDisabled();
    expect(
      await pathExists(path.join(outsideArtifactDirectory, "candidate.png")),
    ).toBe(false);
    expect(
      await pathExists(path.join(projectRoot, "outside/__screenshots__")),
    ).toBe(false);
    expect(
      await pathExists(path.join(projectRoot, "src/__screenshots__")),
    ).toBe(false);
  });

  test("rejects stale approval without promoting changed candidate bytes", async ({
    page,
  }) => {
    const panel = await openVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--stale",
    });
    const artifactDirectory = visualArtifactDirectory(
      projectRoot,
      "visual-fixture--stale",
    );
    const candidatePath = path.join(artifactDirectory, "candidate.png");

    await runCurrent(panel);
    await expect(panel.getByText("New", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await panel.getByRole("button", { name: "Latest", exact: true }).click();
    const preview = panel.getByAltText("candidate for Visual Fixture / Stale");
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate((element) =>
          element instanceof HTMLImageElement ? element.naturalWidth : 0,
        ),
      )
      .toBeGreaterThan(0);

    const reviewedCandidate = await readFile(candidatePath);
    const changedImage = PNG.sync.read(reviewedCandidate);
    changedImage.data[0] = (changedImage.data[0]! + 1) % 256;
    const changedCandidate = PNG.sync.write(changedImage);
    expect(changedCandidate).not.toEqual(reviewedCandidate);
    await writeFile(candidatePath, changedCandidate);

    await panel.getByRole("button", { name: "Accept" }).click();
    await expect(
      panel.getByRole("alert").filter({
        hasText:
          "Stale visual approval; rerun the visual test before approving",
      }),
    ).toBeVisible();
    await expect(panel.getByText("New", { exact: true })).toBeVisible();
    expect(await pathExists(path.join(artifactDirectory, "baseline.png"))).toBe(
      false,
    );
    expect(
      await pathExists(path.join(artifactDirectory, "baseline.json")),
    ).toBe(false);
    expect(await readFile(candidatePath)).toEqual(changedCandidate);
  });

  test("reports malformed baseline metadata as reviewable", async ({
    page,
  }) => {
    const panel = await openVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--malformed",
    });
    const artifactDirectory = visualArtifactDirectory(
      projectRoot,
      "visual-fixture--malformed",
    );
    const metadataPath = path.join(artifactDirectory, "baseline.json");

    await createApprovedBaseline(expect, panel);
    await writeFile(metadataPath, "{ malformed baseline metadata");

    await runCurrent(panel);
    await expect(panel.getByText("Changed", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      panel.getByText("Baseline metadata is missing or malformed", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Diff", exact: true }),
    ).toBeDisabled();
    expect(await pathExists(path.join(artifactDirectory, "diff.png"))).toBe(
      false,
    );

    const reviewedSources = new Set<string>();
    for (const [button, image] of [
      ["Baseline", "baseline"],
      ["Latest", "candidate"],
    ] as const) {
      await panel.getByRole("button", { name: button, exact: true }).click();
      const preview = panel.getByAltText(
        `${image} for Visual Fixture / Malformed`,
      );
      await expect(preview).toBeVisible();
      await expect
        .poll(() =>
          preview.evaluate((element) =>
            element instanceof HTMLImageElement ? element.naturalWidth : 0,
          ),
        )
        .toBeGreaterThan(0);
      reviewedSources.add((await preview.getAttribute("src")) ?? "");
    }
    expect(reviewedSources.size).toBe(2);
    expect(reviewedSources.has("")).toBe(false);

    await panel.getByRole("button", { name: "Accept" }).click();
    await expect(panel.getByText("Passed", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const repaired = JSON.parse(await readFile(metadataPath, "utf8")) as {
      schemaVersion: number;
      platform: string;
      renderFingerprint: string;
    };
    expect(repaired).toMatchObject({ schemaVersion: 2 });
    // Environment identity landed with schema 2: re-approval must record
    // where and how these pixels were actually rendered.
    expect(repaired.platform).toBe(
      process.env.STORYPROOF_CONTAINER === "1" ? "container" : process.platform,
    );
    expect(repaired.renderFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  test("cancels completed partial results before they can be approved", async ({
    page,
  }) => {
    test.skip(
      !(await hasControlFixture(projectRoot)),
      "requires the fault-injection control fixture (control/state.json + the Controlled story), which only test/fixtures/project carries",
    );
    await openVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--controlled",
    });
    await writeControlState(projectRoot, { mode: "hang" });

    const testingWidget = page.getByRole("region", {
      name: "Component tests",
    });
    await testingWidget
      .getByRole("button", { name: "Expand testing module" })
      .click();
    const provider = page.locator('[data-module-id="storyproof/provider"]');
    await provider.getByRole("button", { name: "Run visual tests" }).click();

    const completedPanel = await showVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--changed",
    });
    await expect(completedPanel.getByText("New", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      completedPanel.getByRole("button", { name: "Accept" }),
    ).toBeVisible();

    const runningPanel = await showVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--controlled",
    });
    await runningPanel
      .getByRole("button", { name: "Stop visual tests" })
      .click();

    const cancelledPanel = await showVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--changed",
    });
    await expect(
      cancelledPanel.getByText("Cancelled", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      cancelledPanel.getByRole("button", { name: "Accept" }),
    ).toHaveCount(0);
    await expect(
      provider.getByText("8 cancelled", { exact: true }),
    ).toBeVisible();
    await expect(
      testingWidget.getByRole("button", { name: "Run tests", exact: true }),
    ).toBeEnabled();
  });

  test("reports a browser connection failure with actionable text", async ({
    page,
  }) => {
    test.skip(
      !(await hasControlFixture(projectRoot)),
      "requires the fault-injection control fixture (control/state.json + the Controlled story), which only test/fixtures/project carries",
    );
    const panel = await openVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--controlled",
    });
    const unavailableUrl = await closedLoopbackUrl();
    await writeControlState(projectRoot, {
      mode: "connection-failure",
      url: unavailableUrl,
    });
    const artifactDirectory = visualArtifactDirectory(
      projectRoot,
      "visual-fixture--controlled",
    );

    await runCurrent(panel);
    await expect(
      panel.getByText("Capture failed", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    const alert = panel.getByRole("alert");
    await expect(alert).toContainText(new URL(unavailableUrl).origin);
    await expect(alert).not.toContainText("/unavailable");
    // Engine-agnostic: chromium says net::ERR_CONNECTION_REFUSED, firefox
    // NS_ERROR_CONNECTION_REFUSED, webkit "Connection refused" — the
    // contract is that the alert names the refused connection, not which
    // engine's spelling it uses.
    await expect(alert).toContainText(/connection[ _]refused/i);
    await expect(panel.getByRole("button", { name: "Accept" })).toHaveCount(0);
    expect(
      await pathExists(path.join(artifactDirectory, "candidate.png")),
    ).toBe(false);
  });

  test("shows the unavailable panel in a static Storybook", async ({
    page,
  }) => {
    await page.goto(`${staticBaseURL}/?path=/story/visual-fixture--changed`);
    const panelTab = page.getByRole("tab", { name: "Visual tests" });
    await expect(panelTab).toBeVisible({ timeout: 15_000 });
    await panelTab.click();
    const panel = page.getByRole("region", { name: "Visual tests" });

    await expect(
      panel.getByText("Visual tests unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(
        "Start Storybook in development mode to capture and approve local images.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Run visual tests" }),
    ).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Accept" })).toHaveCount(0);
  });

  test("completes a testing-widget run-all with mixed results", async ({
    page,
  }) => {
    await page.goto("/?path=/story/visual-fixture--changed");
    const testingWidget = page.getByRole("region", {
      name: "Component tests",
    });
    await testingWidget
      .getByRole("button", { name: "Expand testing module" })
      .click();
    const provider = page.locator('[data-module-id="storyproof/provider"]');
    await expect(
      provider.getByText("Visual tests", { exact: true }),
    ).toBeVisible();
    await expect(
      provider.getByRole("button", { name: "Run visual tests" }),
    ).toBeEnabled({ timeout: 15_000 });

    await testingWidget
      .getByRole("button", { name: "Run tests", exact: true })
      .click();
    await expect(provider.getByText("Running…", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      testingWidget.getByRole("button", { name: "Running...", exact: true }),
    ).toBeDisabled();

    await expect(provider.getByText("1 failed", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      testingWidget.getByRole("button", { name: "Run tests", exact: true }),
    ).toBeEnabled();
    await expect(
      testingWidget.getByRole("switch", {
        name: "Filter main navigation to show 1 tests with errors",
      }),
    ).toBeVisible();

    const disabledPanel = await showVisualPanel({
      expect,
      page,
      storyId: "visual-fixture--disabled",
    });
    await expect(
      disabledPanel.getByText("Passed", { exact: true }),
    ).toBeVisible();
    await expect(
      disabledPanel.getByText("Visual tests disabled for this story", {
        exact: true,
      }),
    ).toBeVisible();

    const outsidePanel = await showVisualPanel({
      expect,
      page,
      storyId: "outside-fixture--default",
    });
    await expect(
      outsidePanel.getByText("Capture failed", { exact: true }),
    ).toBeVisible();
    expect(
      await pathExists(
        path.join(
          projectRoot,
          "outside/__screenshots__/outside-fixture.stories.tsx.visual",
          "outside-fixture--default",
          ENVIRONMENT_KEY,
          "candidate.png",
        ),
      ),
    ).toBe(false);
    expect(
      await pathExists(
        path.join(
          visualArtifactDirectory(projectRoot, "visual-fixture--disabled"),
          "candidate.png",
        ),
      ),
    ).toBe(false);
  });

  test("runs, reviews, approves, and reruns from inside Storybook", async ({
    page,
  }) => {
    await page.goto("/?path=/story/visual-fixture--portal");

    const panelTab = page.getByRole("tab", { name: "Visual tests" });
    await expect(panelTab).toBeVisible({ timeout: 15_000 });
    await panelTab.click();
    const visualPanel = page.getByRole("region", { name: "Visual tests" });
    await visualPanel
      .getByRole("button", { name: "Run visual tests" })
      .last()
      .click();
    await expect(page.getByText("New", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Latest", exact: true }).click();
    await expect(
      page.getByAltText("candidate for Visual Fixture / Portal"),
    ).toBeVisible();

    const artifactDirectory = path.join(
      projectRoot,
      "src/__screenshots__/visual-fixture.stories.tsx.visual/visual-fixture--portal",
      ENVIRONMENT_KEY,
    );
    const candidate = await readFile(
      path.join(artifactDirectory, "candidate.png"),
    );
    const image = PNG.sync.read(candidate);
    expect(image.width).toBeLessThan(1280);
    expect(image.height).toBeLessThan(720);
    expect(hasPixel(image, [0, 180, 90])).toBe(true);
    expect(hasPixel(image, [20, 80, 220])).toBe(true);
    expect(hasPixel(image, [200, 30, 30])).toBe(false);

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("Passed", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await readFile(path.join(artifactDirectory, "baseline.png")),
    ).toEqual(candidate);

    await visualPanel.getByRole("button", { name: "Run visual tests" }).click();
    await expect(page.getByText("Passed", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });
}

async function resetFixtureState(projectRoot: string): Promise<void> {
  const tasks = [
    rm(path.join(projectRoot, "src/__screenshots__"), {
      recursive: true,
      force: true,
    }),
    rm(path.join(projectRoot, "outside/__screenshots__"), {
      recursive: true,
      force: true,
    }),
  ];
  // The control-file-driven hang/connection-failure fixture (see
  // hasControlFixture) is fault-injection plumbing that only
  // test/fixtures/project carries -- a real installed consumer (the
  // examples exercised by the CI `consumer` job) has no control/ directory
  // at all, so this write is skipped there rather than failing closed.
  if (await hasControlFixture(projectRoot)) {
    tasks.push(
      writeFile(
        path.join(projectRoot, "control/state.json"),
        `${JSON.stringify({ mode: "ready" }, null, 2)}\n`,
      ),
    );
  }
  await Promise.all(tasks);
}

async function hasControlFixture(projectRoot: string): Promise<boolean> {
  return pathExists(path.join(projectRoot, "control/state.json"));
}

async function openVisualPanel({
  expect,
  page,
  storyId,
}: {
  expect: typeof PlaywrightExpect;
  page: Page;
  storyId: string;
}): Promise<Locator> {
  for (const timeout of [5_000, 15_000]) {
    const panel = await showVisualPanel({ expect, page, storyId });
    try {
      await expect(
        panel.getByRole("button", { name: "Run visual tests" }).last(),
      ).toBeEnabled({ timeout });
      return panel;
    } catch (error) {
      if (timeout === 15_000) throw error;
      // A cold Storybook manager can subscribe to its universal stores before
      // the development-server leader is reachable. A single manager reload
      // creates a fresh follower after server startup; product assertions still
      // begin only after the addon state handshake is observable.
    }
  }
  throw new Error("Visual tests panel did not become ready");
}

async function showVisualPanel({
  expect,
  page,
  storyId,
}: {
  expect: typeof PlaywrightExpect;
  page: Page;
  storyId: string;
}): Promise<Locator> {
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get("/index.json");
          if (!response.ok()) return false;
          return storyIndexHasStory(await response.json(), storyId);
        } catch {
          return false;
        }
      },
      {
        message: `Storybook index did not include ${storyId}`,
        timeout: 30_000,
      },
    )
    .toBe(true);
  await page.goto(`/?path=/story/${storyId}`);
  const panelTab = page.getByRole("tab", { name: "Visual tests" });
  await expect(panelTab).toBeVisible({ timeout: 15_000 });
  await panelTab.click();
  return page.getByRole("region", { name: "Visual tests" });
}

async function runCurrent(panel: Locator): Promise<void> {
  await panel.getByRole("button", { name: "Run visual tests" }).last().click();
}

async function createApprovedBaseline(
  expect: typeof PlaywrightExpect,
  panel: Locator,
): Promise<void> {
  await runCurrent(panel);
  await expect(panel.getByText("New", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await panel.getByRole("button", { name: "Accept" }).click();
  await expect(panel.getByText("Passed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

function visualArtifactDirectory(projectRoot: string, storyId: string): string {
  return path.join(
    projectRoot,
    "src/__screenshots__/visual-fixture.stories.tsx.visual",
    storyId,
    ENVIRONMENT_KEY,
  );
}

async function replaceBaselinePixels(artifactDirectory: string): Promise<void> {
  const baselinePath = path.join(artifactDirectory, "baseline.png");
  const metadataPath = path.join(artifactDirectory, "baseline.json");
  const image = PNG.sync.read(await readFile(baselinePath));
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = 70;
    image.data[index + 1] = 30;
    image.data[index + 2] = 180;
    image.data[index + 3] = 255;
  }
  const baseline = PNG.sync.write(image);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    baselineSha256: string;
  };
  metadata.baselineSha256 = sha256(baseline);
  await Promise.all([
    writeFile(baselinePath, baseline),
    writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`),
  ]);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeControlState(
  projectRoot: string,
  state: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    path.join(projectRoot, "control/state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

async function closedLoopbackUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a loopback TCP port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return `http://127.0.0.1:${String(address.port)}/unavailable`;
}

function storyIndexHasStory(index: unknown, storyId: string): boolean {
  if (typeof index !== "object" || index === null || !("entries" in index)) {
    return false;
  }
  const entries = index.entries;
  return (
    typeof entries === "object" &&
    entries !== null &&
    Object.hasOwn(entries, storyId)
  );
}

function hasPixel(image: PNG, rgb: [number, number, number]): boolean {
  for (let index = 0; index < image.data.length; index += 4) {
    if (
      image.data[index] === rgb[0] &&
      image.data[index + 1] === rgb[1] &&
      image.data[index + 2] === rgb[2]
    ) {
      return true;
    }
  }
  return false;
}
