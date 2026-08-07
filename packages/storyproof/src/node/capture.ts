import { createRequire } from "node:module";

import { chromium, firefox, webkit } from "playwright";

import { DEFAULT_ENVIRONMENT } from "../constants.js";
import type { VisualCaptureMode } from "../shared/results.js";
import { sha256 } from "./compare.js";
import {
  acquireContainerBrowser,
  type ContainerBrowserRequest,
  type FingerprintCache,
} from "./container.js";
import { RENDER_PROBE_HTML, type CaptureBrowserName } from "./environment.js";

const LAUNCHERS: Record<CaptureBrowserName, unknown> = {
  chromium,
  firefox,
  webkit,
};

const require = createRequire(import.meta.url);
export const playwrightVersion = (
  require("playwright/package.json") as { version: string }
).version;

interface CapturePage {
  on?(
    event: "console" | "pageerror" | "requestfailed",
    listener:
      | ((message: { type(): string; text(): string }) => void)
      | ((error: Error) => void)
      | ((request: {
          failure(): { errorText: string } | null;
          isNavigationRequest(): boolean;
          url(): string;
        }) => void),
  ): void;
  addInitScript(script: () => void): Promise<unknown>;
  goto(url: string): Promise<unknown>;
  waitForLoadState?(state: "load"): Promise<unknown>;
  evaluate<T, A>(
    script: (argument: A) => Promise<T> | T,
    argument: A,
  ): Promise<T>;
  evaluate<T>(script: () => Promise<T> | T): Promise<T>;
  screenshot(options: {
    type: "png";
    clip?: { x: number; y: number; width: number; height: number };
  }): Promise<Buffer>;
}

interface CaptureContext {
  newPage(): Promise<CapturePage>;
  close(): Promise<unknown>;
}

interface CaptureBrowser {
  newContext(options: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    locale: string;
    timezoneId: string;
    reducedMotion: "reduce";
  }): Promise<CaptureContext>;
  close(): Promise<unknown>;
  version(): string;
}

export interface BrowserLauncher {
  launch(options?: { headless?: boolean }): Promise<CaptureBrowser>;
}

export interface CaptureRequest {
  baseUrl: string;
  storyId: string;
  signal?: AbortSignal;
}

export type CaptureResult =
  | {
      status: "captured";
      image: Buffer;
      browserVersion: string;
      playwrightVersion?: string;
    }
  | { status: "disabled" }
  | { status: "capture-error"; message: string }
  | { status: "cancelled" };

export interface CaptureSessionInfo {
  browserVersion: string;
  playwrightVersion: string;
  containerImage?: string;
}

export interface CaptureSession {
  capture(request: CaptureRequest): Promise<CaptureResult>;
  /**
   * SHA-256 of the fixed probe page rendered by this session's browser —
   * the render fingerprint stored in baseline metadata. Computed once per
   * session and cached.
   */
  fingerprint(): Promise<string>;
  info(): CaptureSessionInfo;
  close(): Promise<void>;
}

export async function createCaptureSession(
  options: {
    launcher?: BrowserLauncher;
    browser?: CaptureBrowserName;
    container?: ContainerBrowserRequest;
  } = {},
): Promise<CaptureSession> {
  if (options.container) {
    const remote = await acquireContainerBrowser(options.container);
    return new PlaywrightCaptureSession(
      remote.browser as unknown as CaptureBrowser,
      {
        mapBaseUrl: remote.mapBaseUrl,
        containerImage: remote.image,
        // The shared browser's rendering environment cannot change while it
        // lives, so the probe cost is paid once per container, not per run.
        fingerprintCache: remote.fingerprintCache,
        // The container browser is shared across runs; closing a session
        // must not tear it down.
        close: remote.release,
      },
    );
  }
  const launcher =
    options.launcher ??
    (LAUNCHERS[options.browser ?? "chromium"] as BrowserLauncher);
  const browser = await launcher.launch({ headless: true });
  return new PlaywrightCaptureSession(browser);
}

interface SessionExtras {
  mapBaseUrl?: (url: string) => string;
  containerImage?: string;
  fingerprintCache?: FingerprintCache;
  close?: () => Promise<void>;
}

class PlaywrightCaptureSession implements CaptureSession {
  private readonly ownFingerprintCache: FingerprintCache = {};

  constructor(
    private readonly browser: CaptureBrowser,
    private readonly extras: SessionExtras = {},
  ) {}

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    if (request.signal?.aborted) return { status: "cancelled" };

    let context: CaptureContext | undefined;
    const consoleDiagnostics: string[] = [];
    const navigationFailures: string[] = [];
    const pageErrors: string[] = [];
    const cancel = () => {
      void context?.close().catch(() => undefined);
    };

    try {
      context = await this.browser.newContext({
        viewport: DEFAULT_ENVIRONMENT.viewport,
        deviceScaleFactor: DEFAULT_ENVIRONMENT.deviceScaleFactor,
        locale: "en-US",
        timezoneId: "UTC",
        reducedMotion: "reduce",
      });
      request.signal?.addEventListener("abort", cancel, { once: true });
      const page = await context.newPage();
      page.on?.("console", (message: { type(): string; text(): string }) => {
        if (message.type() === "error") consoleDiagnostics.push(message.text());
      });
      page.on?.("pageerror", (error: Error) => pageErrors.push(error.message));
      // A failed document navigation ends the capture, and it is the only
      // failure signal all three engines report alike. What they do to the
      // document differs: chromium and firefox replace it (destroying the
      // context the readiness wait runs in), webkit keeps it — so waiting on a
      // destroyed context never returns there, and the wait burns its whole
      // budget before reporting a timeout naming neither origin nor refusal.
      // Measured 2026-08-07: event at 39/448/9ms, vs webkit's 15s timeout.
      let failNavigation: ((error: Error) => void) | undefined;
      const navigationFailed = new Promise<never>((_resolve, reject) => {
        failNavigation = reject;
      });
      // A later failure (sub-frame during screenshot) has no awaiter; an extra
      // handler keeps that from surfacing as an unhandled rejection without
      // hiding it from the race.
      navigationFailed.catch(() => undefined);
      page.on?.(
        "requestfailed",
        (request: {
          failure(): { errorText: string } | null;
          isNavigationRequest(): boolean;
          url(): string;
        }) => {
          if (!request.isNavigationRequest()) return;
          navigationFailures.push(
            `${safeNavigationUrl(request.url())}: ${request.failure()?.errorText ?? "unknown browser error"}`,
          );
          // The catch below appends every recorded failure, so this names the
          // class of failure only and never duplicates the detail.
          failNavigation?.(new Error("Capture navigation failed"));
        },
      );
      await page.addInitScript(installPreviewBridge);
      const baseUrl = this.extras.mapBaseUrl
        ? this.extras.mapBaseUrl(request.baseUrl)
        : request.baseUrl;
      await page.goto(storyUrl(baseUrl, request.storyId));
      if (request.signal?.aborted) return { status: "cancelled" };

      const readiness = await Promise.race([
        waitForStoryAfterReload(page, request.storyId),
        navigationFailed,
      ]);
      if (request.signal?.aborted) return { status: "cancelled" };
      if (readiness.disabled) return { status: "disabled" };
      if (readiness.status !== "success") {
        return {
          status: "capture-error",
          message: `Story ${request.storyId} finished with an error`,
        };
      }

      await stabilizePage(page);
      if (request.signal?.aborted) return { status: "cancelled" };
      if (pageErrors.length > 0) {
        return {
          status: "capture-error",
          message: `Story ${request.storyId} raised a page error: ${pageErrors.join("; ")}`,
        };
      }
      const image = await page.screenshot(
        readiness.capture === "content"
          ? { type: "png", clip: await contentClip(page) }
          : { type: "png" },
      );
      if (request.signal?.aborted) return { status: "cancelled" };
      return {
        status: "captured",
        image,
        browserVersion: this.browser.version(),
        playwrightVersion,
      };
    } catch (error) {
      if (request.signal?.aborted) return { status: "cancelled" };
      return {
        status: "capture-error",
        message: `${error instanceof Error ? error.message : "Visual capture failed"}${navigationFailures.length > 0 ? `; failed navigation: ${navigationFailures.join("; ")}` : ""}${pageErrors.length > 0 ? `; page errors: ${pageErrors.join("; ")}` : ""}${consoleDiagnostics.length > 0 ? `; console errors: ${consoleDiagnostics.join("; ")}` : ""}`,
      };
    } finally {
      request.signal?.removeEventListener("abort", cancel);
      await context?.close().catch(() => undefined);
    }
  }

  fingerprint(): Promise<string> {
    const cache = this.extras.fingerprintCache ?? this.ownFingerprintCache;
    if (!cache.promise) {
      const probe = this.captureFingerprint();
      cache.promise = probe;
      // A failed probe must not poison a long-lived shared cache: the next
      // run retries instead of replaying the rejection forever.
      probe.catch(() => {
        if (cache.promise === probe) cache.promise = undefined;
      });
    }
    return cache.promise;
  }

  info(): CaptureSessionInfo {
    return {
      browserVersion: this.browser.version(),
      playwrightVersion,
      ...(this.extras.containerImage
        ? { containerImage: this.extras.containerImage }
        : {}),
    };
  }

  async close(): Promise<void> {
    if (this.extras.close) {
      await this.extras.close();
      return;
    }
    await this.browser.close();
  }

  private async captureFingerprint(): Promise<string> {
    // Same context options as story captures, so the fingerprint describes
    // the configuration baselines are actually captured under.
    const context = await this.browser.newContext({
      viewport: DEFAULT_ENVIRONMENT.viewport,
      deviceScaleFactor: DEFAULT_ENVIRONMENT.deviceScaleFactor,
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      // A data: URL needs no server and cannot be affected by the project
      // under test. Deliberately NOT stabilizePage(): that helper asserts a
      // mounted #storybook-root, which the probe page does not have.
      await page.goto(
        `data:text/html;charset=utf-8,${encodeURIComponent(RENDER_PROBE_HTML)}`,
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      });
      const image = await page.screenshot({ type: "png" });
      return sha256(image);
    } finally {
      await context.close().catch(() => undefined);
    }
  }
}

function safeNavigationUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "unavailable URL";
  }
}

async function waitForStoryAfterReload(
  page: CapturePage,
  storyId: string,
): Promise<{
  status: "error" | "success";
  disabled: boolean;
  capture: VisualCaptureMode;
}> {
  try {
    return await waitForStory(page, storyId);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("Execution context was destroyed")
    ) {
      throw error;
    }
    await page.waitForLoadState?.("load");
    return waitForStory(page, storyId);
  }
}

function storyUrl(baseUrl: string, storyId: string): string {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL("iframe.html", root);
  url.searchParams.set("id", storyId);
  url.searchParams.set("viewMode", "story");
  return url.toString();
}

async function waitForStory(
  page: CapturePage,
  storyId: string,
): Promise<{
  status: "error" | "success";
  disabled: boolean;
  capture: VisualCaptureMode;
}> {
  return page.evaluate(async (id) => {
    const bridge = globalThis.__STORYPROOF__;
    if (!bridge) throw new Error("Visual preview bridge was not installed");
    const report = await Promise.race([
      bridge.wait(id),
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timed out waiting for Storybook readiness: ${JSON.stringify(bridge.get(id))}`,
              ),
            ),
          15_000,
        ),
      ),
    ]);
    if (report.status !== "error" && report.status !== "success") {
      throw new Error("Story did not produce a terminal result");
    }
    return {
      status: report.status,
      disabled: report.disabled === true,
      capture: report.capture === "viewport" ? "viewport" : "content",
    };
  }, storyId);
}

async function stabilizePage(page: CapturePage): Promise<void> {
  await page.evaluate(async () => {
    if (!document.querySelector("#storybook-root")) {
      throw new Error("Storybook story root was not mounted");
    }
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
}

async function contentClip(
  page: CapturePage,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const padding = 8;
    const rectangles = [...document.body.querySelectorAll("*")]
      .filter((element) => {
        const style = getComputedStyle(element);
        return !(
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        );
      })
      .map((element) => element.getBoundingClientRect())
      .filter(
        (rectangle) =>
          rectangle.width > 0 &&
          rectangle.height > 0 &&
          rectangle.right > 0 &&
          rectangle.bottom > 0 &&
          rectangle.left < globalThis.innerWidth &&
          rectangle.top < globalThis.innerHeight,
      );

    if (rectangles.length === 0) {
      return {
        x: 0,
        y: 0,
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      };
    }

    const left = Math.max(
      0,
      Math.floor(
        Math.min(...rectangles.map((rectangle) => rectangle.left)) - padding,
      ),
    );
    const top = Math.max(
      0,
      Math.floor(
        Math.min(...rectangles.map((rectangle) => rectangle.top)) - padding,
      ),
    );
    const right = Math.min(
      globalThis.innerWidth,
      Math.ceil(
        Math.max(...rectangles.map((rectangle) => rectangle.right)) + padding,
      ),
    );
    const bottom = Math.min(
      globalThis.innerHeight,
      Math.ceil(
        Math.max(...rectangles.map((rectangle) => rectangle.bottom)) + padding,
      ),
    );

    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  });
}

function installPreviewBridge(): void {
  type Report = {
    storyId: string;
    status?: "error" | "success";
    disabled?: boolean;
    capture?: VisualCaptureMode;
  };
  type Waiter = (report: Report) => void;
  const reports = new Map<string, Report>();
  const waiters = new Map<string, Waiter[]>();
  const complete = (report: Report) =>
    report.status !== undefined &&
    report.disabled !== undefined &&
    report.capture !== undefined;

  globalThis.__STORYPROOF__ = {
    report(update: Report) {
      const report = { ...reports.get(update.storyId), ...update };
      reports.set(update.storyId, report);
      if (!complete(report)) return;
      for (const resolve of waiters.get(update.storyId) ?? []) resolve(report);
      waiters.delete(update.storyId);
    },
    async wait(storyId: string) {
      const existing = reports.get(storyId);
      if (existing && complete(existing)) return existing;
      return new Promise<Report>((resolve) => {
        waiters.set(storyId, [...(waiters.get(storyId) ?? []), resolve]);
      });
    },
    get(storyId: string) {
      return reports.get(storyId);
    },
  };
}
