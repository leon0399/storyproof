import { createHash } from "node:crypto";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import type { BaselineMetadata } from "../shared/results.js";

export const COMPARATOR_POLICY = {
  name: "pixelmatch",
  threshold: 0.1,
  includeAA: false,
} as const;

export interface ComparePngsOptions {
  baseline?: Buffer;
  baselineMetadata?: unknown;
  candidate: Buffer;
  candidateMetadata?: unknown;
}

export interface ComparisonResult {
  status: "new" | "passed" | "changed";
  message?: string;
  baselineSha256?: string;
  candidateSha256: string;
  diff?: Buffer;
  diffPixels: number;
  diffRatio: number;
  width: number;
  height: number;
}

export function comparePngs(options: ComparePngsOptions): ComparisonResult {
  const candidateSha256 = sha256(options.candidate);
  const candidate = PNG.sync.read(options.candidate);

  if (!options.baseline) {
    return {
      status: "new",
      candidateSha256,
      diffPixels: 0,
      diffRatio: 0,
      width: candidate.width,
      height: candidate.height,
    };
  }

  const baselineSha256 = sha256(options.baseline);
  const baseline = PNG.sync.read(options.baseline);
  const width = Math.max(baseline.width, candidate.width);
  const height = Math.max(baseline.height, candidate.height);
  const baselineCanvas = padImage(baseline, width, height);
  const candidateCanvas = padImage(candidate, width, height);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(
    baselineCanvas,
    candidateCanvas,
    diff.data,
    width,
    height,
    COMPARATOR_POLICY,
  );
  const diffRatio = diffPixels / (width * height);

  const storedMetadata = parseBaselineMetadata(options.baselineMetadata);
  const currentMetadata = parseBaselineMetadata(options.candidateMetadata);
  const message = incompatibilityReason({
    storedMetadata,
    storedSchemaHint: legacySchemaHint(options.baselineMetadata),
    currentMetadata,
    baselineSha256,
    candidateSha256,
    dimensionsChanged:
      baseline.width !== candidate.width ||
      baseline.height !== candidate.height,
  });
  const status = diffPixels === 0 && !message ? "passed" : "changed";

  return {
    status,
    ...(message ? { message } : {}),
    baselineSha256,
    candidateSha256,
    // A diff of zero changed pixels shows nothing; a metadata-only change
    // stays reviewable through its message plus baseline and candidate.
    ...(diffPixels > 0 ? { diff: PNG.sync.write(diff) } : {}),
    diffPixels,
    diffRatio,
    width,
    height,
  };
}

export function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseBaselineMetadata(
  value: unknown,
): BaselineMetadata | undefined {
  if (!isExactRecord(value, METADATA_KEYS)) return undefined;
  if (
    value.schemaVersion !== 2 ||
    typeof value.baselineSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.baselineSha256) ||
    typeof value.platform !== "string" ||
    value.platform.length === 0 ||
    typeof value.renderFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.renderFingerprint) ||
    !isPositiveNumber(value.deviceScaleFactor) ||
    !isExactRecord(value.browser, BROWSER_KEYS) ||
    typeof value.browser.name !== "string" ||
    value.browser.name.length === 0 ||
    typeof value.browser.version !== "string" ||
    value.browser.version.length === 0 ||
    typeof value.browser.playwrightVersion !== "string" ||
    value.browser.playwrightVersion.length === 0 ||
    !isExactRecord(value.viewport, VIEWPORT_KEYS) ||
    !isPositiveInteger(value.viewport.width) ||
    !isPositiveInteger(value.viewport.height) ||
    !isExactRecord(value.comparator, COMPARATOR_KEYS) ||
    value.comparator.name !== COMPARATOR_POLICY.name ||
    value.comparator.threshold !== COMPARATOR_POLICY.threshold ||
    value.comparator.includeAA !== COMPARATOR_POLICY.includeAA
  ) {
    return undefined;
  }

  return value as unknown as BaselineMetadata;
}

const METADATA_KEYS = [
  "schemaVersion",
  "baselineSha256",
  "browser",
  "platform",
  "renderFingerprint",
  "viewport",
  "deviceScaleFactor",
  "comparator",
] as const;
const BROWSER_KEYS = ["name", "version", "playwrightVersion"] as const;
const VIEWPORT_KEYS = ["width", "height"] as const;
const COMPARATOR_KEYS = ["name", "threshold", "includeAA"] as const;

/**
 * Recognize a well-formed schema-1 baseline so its owner gets a migration
 * message instead of the generic "malformed" one. Anything else that fails
 * parsing stays generic.
 */
function legacySchemaHint(value: unknown): string | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion === 1
  ) {
    return "Baseline metadata uses storyproof schema 1, from before environment identity (platform + render fingerprint) existed. Re-approve this baseline to migrate it.";
  }
  return undefined;
}

function incompatibilityReason(options: {
  storedMetadata?: BaselineMetadata;
  storedSchemaHint?: string;
  currentMetadata?: BaselineMetadata;
  baselineSha256: string;
  candidateSha256: string;
  dimensionsChanged: boolean;
}): string | undefined {
  if (!options.storedMetadata) {
    return (
      options.storedSchemaHint ?? "Baseline metadata is missing or malformed"
    );
  }
  if (options.storedMetadata.baselineSha256 !== options.baselineSha256) {
    return "Baseline metadata hash does not match baseline image";
  }
  if (!options.currentMetadata)
    return "Candidate metadata is missing or malformed";
  if (options.currentMetadata.baselineSha256 !== options.candidateSha256) {
    return "Candidate metadata hash does not match candidate image";
  }
  const mismatch = environmentMismatch(
    options.storedMetadata,
    options.currentMetadata,
  );
  if (mismatch) return mismatch;
  if (options.dimensionsChanged) return "Image dimensions changed";
  return undefined;
}

/**
 * Names the first environment difference between the baseline's recorded
 * capture environment and this run's. Ordered from most to least
 * explanatory: a platform mismatch subsumes a fingerprint mismatch, and the
 * fingerprint is the catch-all for differences no attribute can name — two
 * hosts with identical platform, browser build, and font metrics have been
 * measured rasterizing differently (measured
 * 2026-07-27). Comparator fields need no comparison here: parsing already
 * pins them to the fixed policy.
 */
function environmentMismatch(
  baseline: BaselineMetadata,
  candidate: BaselineMetadata,
): string | undefined {
  if (baseline.platform !== candidate.platform) {
    return `Baseline was captured on "${baseline.platform}" but this run renders on "${candidate.platform}". Re-approve from this environment, or capture in one shared environment (see the capture.container option).`;
  }
  if (baseline.browser.name !== candidate.browser.name) {
    return `Baseline was captured with ${baseline.browser.name}; this run uses ${candidate.browser.name}.`;
  }
  if (baseline.browser.version !== candidate.browser.version) {
    return `Baseline was captured with ${baseline.browser.name} ${baseline.browser.version}; this run uses ${candidate.browser.version}. Review and re-approve after the browser upgrade.`;
  }
  if (
    baseline.browser.playwrightVersion !== candidate.browser.playwrightVersion
  ) {
    return `Baseline was captured with Playwright ${baseline.browser.playwrightVersion}; this run uses ${candidate.browser.playwrightVersion}. Review and re-approve after the Playwright upgrade.`;
  }
  if (
    baseline.viewport.width !== candidate.viewport.width ||
    baseline.viewport.height !== candidate.viewport.height ||
    baseline.deviceScaleFactor !== candidate.deviceScaleFactor
  ) {
    return "Baseline viewport or scale differs from this run's capture settings.";
  }
  if (baseline.renderFingerprint !== candidate.renderFingerprint) {
    return `Baseline was captured in a different rendering environment (render fingerprint ${baseline.renderFingerprint.slice(0, 12)}… vs ${candidate.renderFingerprint.slice(0, 12)}…): fonts or rasterization differ even though platform and browser match. Capture in one shared environment (see the capture.container option), or re-approve from this machine.`;
  }
  return undefined;
}

function padImage(image: PNG, width: number, height: number): Buffer {
  if (image.width === width && image.height === height) return image.data;
  const canvas = Buffer.alloc(width * height * 4);
  for (let row = 0; row < image.height; row += 1) {
    image.data.copy(
      canvas,
      row * width * 4,
      row * image.width * 4,
      (row + 1) * image.width * 4,
    );
  }
  return canvas;
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
