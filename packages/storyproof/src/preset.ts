import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Channel } from "storybook/internal/channels";
import type { Options, ServerApp } from "storybook/internal/types";

import { ADDON_ID } from "./constants.js";
import { createCaptureSession, playwrightVersion } from "./node/capture.js";
import {
  CAPTURE_BROWSERS,
  resolveEnvironment,
  type CaptureBrowserName,
} from "./node/environment.js";
import { VisualTestRunner } from "./node/runner.js";
import type { StoryIndexGenerator } from "./node/story-index.js";
import {
  ArtifactRegistry,
  installCommandHandlers,
  registerArtifactRoute,
} from "./node/server.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const compiled = path.basename(directory) === "dist";
const artifacts = new ArtifactRegistry();

const DEFAULT_STORY_ROOTS = ["."];
const DEFAULT_MAX_CONCURRENCY = 2;

export interface VisualTestsPresetOptions {
  storyRoots?: string[];
  maxConcurrency?: number;
  capture?: {
    /**
     * Engine to capture with. Baselines are keyed per engine
     * (`linux-firefox-…`), so switching engines never overwrites another
     * engine's baselines. Default `"chromium"`. Note: Playwright's WebKit
     * on Linux is the engine, not Safari — see the configuration docs.
     */
    browser?: "chromium" | "firefox" | "webkit";
    /**
     * Capture in the version-matched Playwright container instead of a
     * host browser, so every machine produces identical pixels. `true`
     * derives the image from the installed Playwright version; pass
     * `{ image }` to override. Requires the Docker CLI.
     */
    container?: boolean | { image?: string };
  };
}

export async function managerEntries(
  existing: string[] = [],
): Promise<string[]> {
  return [
    ...existing,
    path.join(directory, compiled ? "manager.js" : "manager.tsx"),
  ];
}

export async function previewAnnotations(
  existing: string[] = [],
): Promise<string[]> {
  return [
    ...existing,
    path.join(directory, compiled ? "preview.js" : "preview.ts"),
  ];
}

export async function experimental_serverChannel(
  channel: Channel,
  options: Options & VisualTestsPresetOptions,
): Promise<Channel> {
  // Storybook merges addon options into this object without validating them,
  // so treat all of these as untrusted and fail the dev server before any
  // capture work.
  const storyRoots = resolveStoryRoots(options.storyRoots);
  const maxConcurrency = resolveMaxConcurrency(options.maxConcurrency);
  const capture = resolveCaptureOptions(options.capture);

  const storyIndexGenerator = resolveStoryIndexGenerator(
    await options.presets.apply("storyIndexGenerator"),
  );
  const environment = resolveEnvironment({
    browser: capture.browser,
    container: capture.container,
    playwrightVersion,
  });
  const runner = new VisualTestRunner({
    baseUrl: `http://127.0.0.1:${String(options.port)}`,
    cwd: process.cwd(),
    storyRoots,
    maxConcurrency,
    storyIndexGenerator,
    artifactRegistry: artifacts,
    environment,
    createCaptureSession: () =>
      createCaptureSession(
        environment.container
          ? {
              container: {
                image: environment.container.image,
                playwrightVersion,
                browser: capture.browser,
              },
            }
          : { browser: capture.browser },
      ),
  });
  installCommandHandlers(channel, runner);
  return channel;
}

export async function experimental_devServer(
  app: ServerApp,
): Promise<ServerApp> {
  registerArtifactRoute(app, artifacts);
  return app;
}

const STORY_ROOTS_HINT = `Set "storyRoots" to a non-empty array of non-empty strings, or omit it to use the default ${JSON.stringify(DEFAULT_STORY_ROOTS)}.`;

function resolveStoryRoots(value: unknown): string[] {
  if (value === undefined) return [...DEFAULT_STORY_ROOTS];
  if (!Array.isArray(value)) {
    throw optionError(
      `Invalid "storyRoots" preset option: expected an array, received ${format(value)}. ${STORY_ROOTS_HINT}`,
    );
  }
  if (value.length === 0) {
    throw optionError(
      `Invalid "storyRoots" preset option: expected at least one story root, received an empty array. ${STORY_ROOTS_HINT}`,
    );
  }
  // Indexed rather than `.map`, which skips holes and would wave a sparse
  // array such as `new Array(3)` straight through.
  const roots: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry: unknown = value[index];
    if (typeof entry !== "string" || entry.trim() === "") {
      throw optionError(
        `Invalid "storyRoots[${String(index)}]" preset option: expected a non-empty string, received ${format(entry)}. ${STORY_ROOTS_HINT}`,
      );
    }
    roots.push(entry);
  }
  return roots;
}

const CAPTURE_HINT =
  'Set "capture" to an object like { browser: "firefox" }, { container: true }, or { container: { image: "mcr.microsoft.com/playwright:v1.55.1-noble" } }; omit it to capture with host chromium.';

// Exported for direct unit coverage; not part of the package's public API
// (only ./index, ./manager, ./preset, ./preview are exported subpaths).
export function resolveCaptureOptions(value: unknown): {
  browser?: CaptureBrowserName;
  container?: { image?: string };
} {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw optionError(
      `Invalid "capture" preset option: expected an object, received ${format(value)}. ${CAPTURE_HINT}`,
    );
  }
  const keys = Object.keys(value);
  const unknown = keys.filter(
    (key) => key !== "container" && key !== "browser",
  );
  if (unknown.length > 0) {
    throw optionError(
      `Invalid "capture" preset option: unknown key ${JSON.stringify(unknown[0])}. ${CAPTURE_HINT}`,
    );
  }

  const browserValue = (value as { browser?: unknown }).browser;
  let browser: CaptureBrowserName | undefined;
  if (browserValue !== undefined) {
    if (
      typeof browserValue !== "string" ||
      !(CAPTURE_BROWSERS as readonly string[]).includes(browserValue)
    ) {
      throw optionError(
        `Invalid "capture.browser" preset option: expected one of ${CAPTURE_BROWSERS.map((name) => JSON.stringify(name)).join(", ")}, received ${format(browserValue)}. ${CAPTURE_HINT}`,
      );
    }
    browser = browserValue as CaptureBrowserName;
  }
  const withBrowser = browser ? { browser } : {};

  const container = (value as { container?: unknown }).container;
  if (container === undefined || container === false) return withBrowser;
  if (container === true) return { ...withBrowser, container: {} };
  if (
    typeof container !== "object" ||
    container === null ||
    Array.isArray(container)
  ) {
    throw optionError(
      `Invalid "capture.container" preset option: expected true, false, or an object, received ${format(container)}. ${CAPTURE_HINT}`,
    );
  }
  const containerKeys = Object.keys(container);
  const unknownContainer = containerKeys.filter((key) => key !== "image");
  if (unknownContainer.length > 0) {
    throw optionError(
      `Invalid "capture.container" preset option: unknown key ${JSON.stringify(unknownContainer[0])}. ${CAPTURE_HINT}`,
    );
  }
  const image = (container as { image?: unknown }).image;
  if (image === undefined) return { ...withBrowser, container: {} };
  if (typeof image !== "string" || image.trim() === "") {
    throw optionError(
      `Invalid "capture.container.image" preset option: expected a non-empty string, received ${format(image)}. ${CAPTURE_HINT}`,
    );
  }
  return { ...withBrowser, container: { image } };
}

function resolveMaxConcurrency(value: unknown): number {
  if (value === undefined) return DEFAULT_MAX_CONCURRENCY;
  // Number.isInteger already rejects NaN and both infinities.
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw optionError(
      `Invalid "maxConcurrency" preset option: expected an integer greater than 0, received ${format(value)}. Omit it to use the default ${String(DEFAULT_MAX_CONCURRENCY)}.`,
    );
  }
  return value;
}

const STORY_INDEX_GENERATOR_HINT =
  'Storybook does not expose this capability via `presets.apply("storyIndexGenerator")` on every minor -- confirmed absent from Storybook 10.0.x\'s common preset and present from 10.5.x onward. Upgrade to Storybook ^10.5.0 or later.';

// Storybook, not the addon consumer, supplies this value, so a mismatch here
// means an incompatible Storybook version rather than user misconfiguration.
// Without this check, a missing/renamed capability silently becomes
// `undefined`, which explodes deep inside the runner the first time a run
// enumerates stories (`Cannot read properties of undefined (reading
// 'getIndex')`) instead of failing the dev server at startup with a reason.
function resolveStoryIndexGenerator(value: unknown): StoryIndexGenerator {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { getIndex?: unknown }).getIndex === "function"
  ) {
    return value as StoryIndexGenerator;
  }
  throw optionError(
    `Missing required "storyIndexGenerator" preset capability: expected an object with a "getIndex" method, received ${format(value)}. ${STORY_INDEX_GENERATOR_HINT}`,
  );
}

function optionError(message: string): Error {
  return new Error(`[${ADDON_ID}] ${message}`);
}

// Never inspects the value's own properties, so a circular, null-prototype, or
// throwing-getter object still produces the intended error instead of a
// TypeError from the formatter.
function format(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  if (typeof value === "function") return "a function";
  if (typeof value === "number") return String(value);
  return `${String(value)} (${typeof value})`;
}
