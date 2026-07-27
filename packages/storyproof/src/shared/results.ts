export type VisualResultStatus =
  | "queued"
  | "running"
  | "new"
  | "changed"
  | "passed"
  | "capture-error"
  | "cancelled";

export interface VisualArtifactIds {
  baseline?: string;
  candidate?: string;
  diff?: string;
}

export interface VisualResult {
  runId: string;
  storyId: string;
  title: string;
  environmentKey: string;
  status: VisualResultStatus;
  message?: string;
  diffPixels?: number;
  diffRatio?: number;
  candidateSha256?: string;
  artifacts?: VisualArtifactIds;
}

/**
 * The rendering environment the current runner captures in, published with
 * run state so the panel can say where its pixels come from. `platform` is
 * where the browser renders — inside a container that differs from where the
 * Storybook server runs.
 */
export interface VisualEnvironment {
  key: string;
  platform: string;
  browserName: string;
  browserVersion?: string;
  playwrightVersion?: string;
  containerImage?: string;
  renderFingerprint?: string;
}

export interface VisualRunState {
  runId?: string;
  running: boolean;
  results: VisualResult[];
  environment?: VisualEnvironment;
}

/**
 * A committed baseline surfaced on demand for a story that has no local run in
 * this session. `artifactId` is absent when the story has no baseline on disk.
 */
export interface BaselinePreview {
  storyId: string;
  environmentKey: string;
  artifactId?: string;
}

export interface BaselineMetadata {
  /**
   * Schema 2 (2026-07-27) added `renderFingerprint` and made `platform` part
   * of compatibility. Schema-1 baselines fail closed with a migration
   * message rather than producing a false pixel diff.
   */
  schemaVersion: 2;
  baselineSha256: string;
  browser: {
    name: string;
    version: string;
    playwrightVersion: string;
  };
  platform: string;
  /**
   * SHA-256 of a fixed probe page rendered by the capturing browser. Catches
   * environment differences no enumerable attribute can — two hosts with
   * identical platform, browser build, and font metrics have been measured
   * rasterizing differently (2026-07-27; render-determinism appendix in the
   * environment-identity design doc).
   */
  renderFingerprint: string;
  viewport: {
    width: number;
    height: number;
  };
  deviceScaleFactor: number;
  comparator: {
    name: "pixelmatch";
    threshold: 0.1;
    includeAA: false;
  };
}
