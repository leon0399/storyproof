import { DEFAULT_ENVIRONMENT } from "../constants.js";

/**
 * Where and how pixels get rendered — the identity a baseline is valid for.
 *
 * Two mechanisms with different jobs:
 *
 * - The **environment key** is a path segment (`linux-chromium-1280x720@1x`).
 *   It holds only stable, coexistence-worthy dimensions: platform, browser
 *   name, viewport, scale. Two platforms' baselines live side by side instead
 *   of overwriting each other. Architecture is deliberately absent — measured
 *   2026-07-27: amd64 and arm64 render the identical probe image
 *   byte-for-byte (all three engines), so keying on arch would fragment baselines
 *   along a dimension that does not affect pixels.
 *
 * - The **render fingerprint** (captured per session, stored in
 *   `baseline.json`) is a hash of a fixed probe page rendered by the actual
 *   browser. It catches what no enumerable attribute can: the same
 *   experiment showed two Linux hosts with identical platform, browser
 *   build, and font metrics still rasterizing differently. A fingerprint
 *   mismatch reports as a named incompatibility, never as a pixel diff.
 */
export const CAPTURE_BROWSERS = ["chromium", "firefox", "webkit"] as const;
export type CaptureBrowserName = (typeof CAPTURE_BROWSERS)[number];

export interface ContainerCaptureConfig {
  image: string;
}

export interface ResolvedEnvironment {
  key: string;
  /** Node-style platform token for where the BROWSER renders, not where the
   * Storybook server runs — inside a container those differ. */
  platform: string;
  browserName: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  container?: ContainerCaptureConfig;
}

/** The Playwright-maintained image matching the installed client version.
 * Browsers ship inside it; the `playwright` npm package does not (verified
 * 2026-07-27 against v1.55.1-noble), which is why the container command
 * installs the exact-version package before starting the server. */
export function defaultContainerImage(playwrightVersion: string): string {
  return `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
}

export function resolveEnvironment(
  options: {
    browser?: CaptureBrowserName;
    container?: { image?: string } | undefined;
    playwrightVersion?: string;
  } = {},
): ResolvedEnvironment {
  let container: ContainerCaptureConfig | undefined;
  if (options.container) {
    const image =
      options.container.image ??
      (options.playwrightVersion
        ? defaultContainerImage(options.playwrightVersion)
        : undefined);
    if (!image) {
      throw new Error(
        "Container capture needs either an explicit image or the installed Playwright version to derive one",
      );
    }
    // The Playwright wire protocol is version-locked and the container runs
    // `npx playwright@<installed version> run-server` against the image's
    // bundled browsers — so an image whose tag disagrees with the installed
    // playwright package can only produce an opaque connect timeout later.
    // Fail at dev-server startup with the actual cause instead. The check
    // is registry-agnostic on purpose: corporate mirrors (an Artifactory
    // proxy of mcr.microsoft.com) keep the image name and version tag and
    // change only the registry prefix, and they carry the exact same drift
    // risk. Images not named `playwright`, or without a `v<semver>-` tag,
    // can't be version-checked from their name and remain the user's
    // responsibility.
    const tagged = /(?:^|\/)playwright:v(\d+\.\d+\.\d+)-/.exec(image);
    if (
      tagged?.[1] &&
      options.playwrightVersion &&
      tagged[1] !== options.playwrightVersion
    ) {
      throw new Error(
        `capture.container.image is pinned to Playwright v${tagged[1]}, but the installed playwright package is ${options.playwrightVersion}. The Playwright wire protocol is version-locked, so these must match: update the image tag, or install playwright@${tagged[1]}, or omit the image to derive it automatically.`,
      );
    }
    container = { image };
  }

  // "container" rather than "linux": the container is its own rendering
  // environment, distinct from bare Linux on the SAME machine (measured:
  // bare and containerized capture on one Linux host produce different
  // pixels). Sharing the "linux" token would give bare-Linux and container
  // capture the identical key — and therefore the identical baseline
  // directory, each re-approval clobbering the other's baseline — defeating
  // the coexistence this key exists to provide.
  const platform = container ? "container" : process.platform;
  const environment = {
    platform,
    // Engines are distinct rendering environments with their own hashes
    // (measured: chromium/firefox/webkit each produce a different probe
    // image in the same container), which is exactly why the key leads
    // with the browser name — per-engine baselines coexist by construction.
    browserName: options.browser ?? DEFAULT_ENVIRONMENT.browserName,
    viewport: DEFAULT_ENVIRONMENT.viewport,
    deviceScaleFactor: DEFAULT_ENVIRONMENT.deviceScaleFactor,
  };
  return {
    ...environment,
    key: buildEnvironmentKey(environment),
    ...(container ? { container } : {}),
  };
}

export function buildEnvironmentKey(environment: {
  platform: string;
  browserName: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
}): string {
  const { platform, browserName, viewport, deviceScaleFactor } = environment;
  return `${platform}-${browserName}-${String(viewport.width)}x${String(viewport.height)}@${String(deviceScaleFactor)}x`;
}

/**
 * The fixed page whose rendered pixels fingerprint a capture environment.
 * `system-ui` is deliberate — it resolves to whatever the environment
 * provides, which is exactly the variable under test. Weights, small text, a
 * border radius, a rotation, and a gradient cover text rasterization and
 * edge antialiasing, where environments actually diverge. No network, no
 * webfonts, no animation.
 */
export const RENDER_PROBE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background: #ffffff;
        font-family: system-ui, sans-serif; color: #111111;
        padding: 40px; display: flex; flex-direction: column; gap: 24px;
      }
      .w300 { font-weight: 300; font-size: 32px; }
      .w400 { font-weight: 400; font-size: 24px; }
      .w700 { font-weight: 700; font-size: 18px; }
      .small { font-size: 11px; letter-spacing: 0.4px; }
      .row { display: flex; align-items: center; gap: 32px; }
      .chip {
        background: rgb(79, 70, 229); color: #ffffff;
        padding: 12px 24px; border-radius: 14px; font-weight: 600;
      }
      .ring {
        width: 120px; height: 120px; border-radius: 50%;
        border: 6px solid rgb(220, 38, 38);
      }
      .tilt {
        width: 180px; height: 60px; background: rgb(16, 185, 129);
        transform: rotate(11.5deg);
      }
      .grad {
        width: 300px; height: 60px;
        background: linear-gradient(90deg, #000000, #ffffff);
      }
    </style>
  </head>
  <body>
    <div class="w300">Rasterization probe &mdash; light 300</div>
    <div class="w400">The quick brown fox jumps over the lazy dog</div>
    <div class="w700">BOLD 700 &bull; kerning AVA To Wa &bull; 0O1lI</div>
    <div class="small">tracking &mdash; abcdefghijklmnopqrstuvwxyz 0123456789</div>
    <div class="row">
      <div class="chip">Rounded chip</div>
      <div class="ring"></div>
      <div class="tilt"></div>
    </div>
    <div class="grad"></div>
  </body>
</html>`;
