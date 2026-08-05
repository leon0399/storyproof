import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  BaselinePreview,
  VisualEnvironment,
  VisualResult,
} from "../shared/results.js";

export const CAPTURE_TIMEOUT_MS = 60_000;

import {
  approveCandidate as approveCandidateDefault,
  type ApprovalRequest,
  type CompletedVisualResult,
} from "./approval.js";
import {
  COMPARATOR_POLICY,
  comparePngs as comparePngsDefault,
  sha256,
} from "./compare.js";
import {
  createCaptureSession as createCaptureSessionDefault,
  type CaptureResult,
  type CaptureSession,
} from "./capture.js";
import { resolveEnvironment, type ResolvedEnvironment } from "./environment.js";
import {
  isMissingPathError,
  resolveArtifactPaths as resolveArtifactPathsDefault,
  type ArtifactPaths,
  type ResolveArtifactPathsOptions,
} from "./paths.js";
import {
  discoverStories,
  type StoryIndexGenerator,
  type StorySelection,
} from "./story-index.js";

type ComparePngs = typeof comparePngsDefault;
type ApproveCandidate = typeof approveCandidateDefault;
interface InternalVisualResult extends VisualResult {
  importPath: string;
}

interface InternalVisualRunState {
  runId?: string;
  running: boolean;
  results: InternalVisualResult[];
  environment?: VisualEnvironment;
}

interface ArtifactRegistrar {
  register(filePath: string): string;
}

export interface VisualTestRunnerOptions {
  baseUrl: string;
  cwd: string;
  storyRoots: string[];
  storyIndexGenerator: StoryIndexGenerator;
  /** Resolved capture environment; defaults to local capture on this host. */
  environment?: ResolvedEnvironment;
  maxConcurrency?: number;
  // ponytail: 60 s hardcoded default, expose as capture.timeout if users need it
  captureTimeoutMs?: number;
  onState?: (state: InternalVisualRunState) => void;
  artifactRegistry?: ArtifactRegistrar;
  createCaptureSession?: () => Promise<CaptureSession>;
  resolveArtifactPaths?: (
    options: ResolveArtifactPathsOptions,
  ) => Promise<ArtifactPaths>;
  comparePngs?: ComparePngs;
  approveCandidate?: ApproveCandidate;
}

interface ActiveRun {
  id: string;
  controller: AbortController;
  state: InternalVisualRunState;
  // The results this run actually captures. `state.results` also carries
  // preserved entries from earlier runs, which this run must not re-execute.
  targets: InternalVisualResult[];
  // Captured once per session before the pool starts; every candidate's
  // metadata records it.
  renderFingerprint?: string;
  completion?: Promise<void>;
}

export class VisualTestRunner {
  private state: InternalVisualRunState = { running: false, results: [] };
  private activeRun: ActiveRun | undefined;
  private runGeneration = 0;
  private onState: ((state: InternalVisualRunState) => void) | undefined;
  private readonly environment: ResolvedEnvironment;
  private readonly completed = new Map<string, CompletedVisualResult>();
  private readonly createCaptureSession: () => Promise<CaptureSession>;
  private readonly resolveArtifactPaths: VisualTestRunnerOptions["resolveArtifactPaths"];
  private readonly comparePngs: ComparePngs;
  private readonly approveCandidate: ApproveCandidate;

  constructor(private readonly options: VisualTestRunnerOptions) {
    this.onState = options.onState;
    this.environment = options.environment ?? resolveEnvironment();
    this.createCaptureSession =
      options.createCaptureSession ?? createCaptureSessionDefault;
    this.resolveArtifactPaths =
      options.resolveArtifactPaths ?? resolveArtifactPathsDefault;
    this.comparePngs = options.comparePngs ?? comparePngsDefault;
    this.approveCandidate = options.approveCandidate ?? approveCandidateDefault;
  }

  setOnState(listener: (state: InternalVisualRunState) => void): void {
    this.onState = listener;
  }

  getState(): InternalVisualRunState {
    return structuredClone(this.state);
  }

  /**
   * Resolve a story's committed baseline without capturing, so the panel can
   * show it for a story that has no local run yet. Returns `artifactId` only
   * when a baseline exists on disk within the configured story roots.
   */
  async loadBaseline(storyId: string): Promise<BaselinePreview> {
    const preview: BaselinePreview = {
      storyId,
      environmentKey: this.environment.key,
    };
    let importPath: string;
    try {
      const stories = await discoverStories(this.options.storyIndexGenerator, {
        scope: "current",
        storyId,
      });
      importPath = stories[0]!.importPath;
    } catch {
      return preview;
    }
    try {
      const paths = await this.resolveArtifactPaths!({
        cwd: this.options.cwd,
        storyRoots: this.options.storyRoots,
        importPath,
        storyId,
        environmentKey: this.environment.key,
      });
      // Baselines are keyed per environment (sibling directories of this
      // one), so also report every key that has one — the panel uses this
      // to explain a "New" that is really "baselined under a different
      // environment" (e.g. committed container baselines seen from a bare
      // host). Each candidate key resolves through resolveArtifactPaths so
      // paths.ts stays the sole authority on the artifact layout and its
      // segment guards vet the directory name.
      const availableEnvironmentKeys = await listBaselineEnvironmentKeys(
        path.dirname(paths.directory),
        (environmentKey) =>
          this.resolveArtifactPaths!({
            cwd: this.options.cwd,
            storyRoots: this.options.storyRoots,
            importPath,
            storyId,
            environmentKey,
          }),
      );
      if (availableEnvironmentKeys.length > 0) {
        preview.availableEnvironmentKeys = availableEnvironmentKeys;
      }
      const baseline = await readFileIfPresent(paths.baselinePath);
      if (!baseline || !this.options.artifactRegistry) return preview;
      return {
        ...preview,
        artifactId: this.options.artifactRegistry.register(paths.baselinePath),
      };
    } catch {
      return preview;
    }
  }

  async run(selection: StorySelection): Promise<InternalVisualRunState> {
    const generation = ++this.runGeneration;
    const previousCompletion = this.activeRun?.completion;
    // A run we supersede while it is still in flight is discarded wholesale;
    // a run that already finished is the incremental base for this one.
    const supersededInFlight = this.activeRun?.state.running === true;
    this.cancelActiveRun();
    const runId = randomUUID();
    const stories = await discoverStories(
      this.options.storyIndexGenerator,
      selection,
    );
    const selectedStoryIds = new Set(stories.map((story) => story.id));

    // Re-running a story invalidates any approval candidate it left behind.
    for (const [key, value] of this.completed) {
      if (selectedStoryIds.has(value.storyId)) this.completed.delete(key);
    }

    const targets: InternalVisualResult[] = stories.map((story) => ({
      runId,
      storyId: story.id,
      title: `${story.title} / ${story.name}`,
      importPath: story.importPath,
      environmentKey: this.environment.key,
      status: "queued",
    }));

    // Keep prior results for stories this run does not touch, so a single-story
    // run no longer discards unreviewed changes from an earlier run.
    const preserved = supersededInFlight
      ? []
      : structuredClone(
          this.state.results.filter(
            (result) => !selectedStoryIds.has(result.storyId),
          ),
        );

    const run: ActiveRun = {
      id: runId,
      controller: new AbortController(),
      targets,
      state: {
        runId,
        running: true,
        results: [...preserved, ...targets],
      },
    };

    if (generation !== this.runGeneration) {
      return cancelledState(run.state);
    }
    await previousCompletion?.catch(() => undefined);
    if (generation !== this.runGeneration) {
      return cancelledState(run.state);
    }

    this.activeRun = run;
    this.state = run.state;
    this.publish(run);

    const completion = this.executeRun(run);
    run.completion = completion;
    await completion;
    return structuredClone(run.state);
  }

  cancel(): void {
    this.runGeneration += 1;
    this.cancelActiveRun();
  }

  private async executeRun(run: ActiveRun): Promise<void> {
    let session: CaptureSession;
    try {
      session = await this.createCaptureSession();
    } catch (error) {
      this.failRun(
        run,
        `The ${this.environment.browserName} capture browser could not start: ${errorMessage(error)}`,
      );
      return;
    }

    try {
      // One probe per session: the fingerprint every candidate's metadata
      // records. A failed probe — or a browser handle that dies right after
      // it, making session.info()'s version() throw — means a broken
      // browser: fail closed with a message rather than leaving every
      // result permanently queued.
      try {
        run.renderFingerprint = await session.fingerprint();
        const info = session.info();
        run.state.environment = {
          key: this.environment.key,
          platform: this.environment.platform,
          browserName: this.environment.browserName,
          browserVersion: info.browserVersion,
          playwrightVersion: info.playwrightVersion,
          ...(info.containerImage
            ? { containerImage: info.containerImage }
            : {}),
          renderFingerprint: run.renderFingerprint,
        };
      } catch (error) {
        this.failRun(
          run,
          `Render environment probe failed: ${errorMessage(error)}`,
        );
        return;
      }
      this.publish(run);
      await this.runPool(run, session);
    } finally {
      await session.close().catch(() => undefined);
      run.state.running = false;
      this.publish(run);
    }
  }

  private failRun(run: ActiveRun, message: string): void {
    for (const result of run.targets) {
      result.status = "capture-error";
      result.message = message;
    }
    run.state.running = false;
    this.publish(run);
  }

  private cancelActiveRun(): void {
    const run = this.activeRun;
    if (!run || !run.state.running) return;
    run.controller.abort();
    for (const result of run.targets) {
      result.status = "cancelled";
    }
    for (const [key, result] of this.completed) {
      if (result.runId === run.id) this.completed.delete(key);
    }
    run.state.running = false;
    this.publish(run);
  }

  async approve(request: ApprovalRequest): Promise<void> {
    const result = this.completed.get(completedKey(request));
    if (!result || result.candidateSha256 !== request.candidateSha256) {
      throw staleApproval();
    }
    const stories = await discoverStories(this.options.storyIndexGenerator, {
      scope: "current",
      storyId: request.storyId,
    });
    await this.approveCandidate({
      request,
      result,
      currentImportPath: stories[0]!.importPath,
    });
    this.completed.delete(completedKey(request));

    const publicResult = this.state.results.find(
      (item) =>
        item.storyId === request.storyId && item.runId === request.runId,
    );
    if (publicResult) {
      publicResult.status = "passed";
      publicResult.message = "Approved exact captured candidate";
      publicResult.diffPixels = 0;
      publicResult.diffRatio = 0;
      if (publicResult.artifacts) {
        const { diff: _diff, ...rest } = publicResult.artifacts;
        publicResult.artifacts = rest;
      }
      this.onState?.(this.getState());
    }
  }

  private async runPool(
    run: ActiveRun,
    session: CaptureSession,
  ): Promise<void> {
    let cursor = 0;
    const worker = async () => {
      while (cursor < run.targets.length) {
        const index = cursor;
        cursor += 1;
        const result = run.targets[index]!;
        if (run.controller.signal.aborted) {
          result.status = "cancelled";
          continue;
        }
        await this.runStory(run, result, session);
      }
    };
    const count = Math.min(
      this.options.maxConcurrency ?? 2,
      run.targets.length,
    );
    await Promise.all(Array.from({ length: count }, worker));
  }

  private async runStory(
    run: ActiveRun,
    result: InternalVisualResult,
    session: CaptureSession,
  ): Promise<void> {
    result.status = "running";
    this.publish(run);
    const timeoutMs = this.options.captureTimeoutMs ?? CAPTURE_TIMEOUT_MS;

    try {
      const capturePromise = session.capture({
        baseUrl: this.options.baseUrl,
        storyId: result.storyId,
        signal: run.controller.signal,
      });
      const capture = await Promise.race([
        capturePromise,
        new Promise<never>((_resolve, reject) =>
          setTimeout(
            () =>
              reject(
                new DOMException(
                  `Capture timed out (${String(timeoutMs / 1000)} s). The browser or its transport may be unresponsive.`,
                  "TimeoutError",
                ),
              ),
            timeoutMs,
          ),
        ),
      ]);
      if (capture.status !== "captured") {
        await this.finishCapture(run, result, undefined, capture);
        this.publish(run);
        return;
      }
      const paths = await this.resolveArtifactPaths!({
        cwd: this.options.cwd,
        storyRoots: this.options.storyRoots,
        importPath: result.importPath,
        storyId: result.storyId,
        environmentKey: result.environmentKey,
      });
      await mkdir(path.dirname(paths.candidatePath), { recursive: true });
      await writeFile(paths.candidatePath, capture.image);
      await this.finishCapture(run, result, paths, capture);
    } catch (error) {
      result.status = run.controller.signal.aborted
        ? "cancelled"
        : "capture-error";
      result.message =
        result.status === "cancelled"
          ? undefined
          : `Visual capture failed: ${errorMessage(error)}`;
    }
    this.publish(run);
  }

  private async finishCapture(
    run: ActiveRun,
    result: InternalVisualResult,
    paths: ArtifactPaths | undefined,
    capture: CaptureResult,
  ): Promise<void> {
    if (capture.status === "cancelled" || run.controller.signal.aborted) {
      result.status = "cancelled";
      return;
    }
    if (capture.status === "disabled") {
      result.status = "disabled";
      result.message = "Visual tests disabled for this story";
      return;
    }
    if (capture.status === "capture-error") {
      result.status = "capture-error";
      result.message = capture.message;
      return;
    }
    if (!paths) throw new Error("Captured image has no artifact path");

    if (!run.renderFingerprint) {
      throw new Error("Capture finished without a render fingerprint");
    }
    const candidateSha256 = sha256(capture.image);
    const candidateMetadata = {
      schemaVersion: 2 as const,
      baselineSha256: candidateSha256,
      browser: {
        name: this.environment.browserName,
        version: capture.browserVersion,
        playwrightVersion: capture.playwrightVersion ?? "unknown",
      },
      // Where the BROWSER rendered — in container mode that is the
      // container's platform, not this process's.
      platform: this.environment.platform,
      renderFingerprint: run.renderFingerprint,
      viewport: this.environment.viewport,
      deviceScaleFactor: this.environment.deviceScaleFactor,
      comparator: COMPARATOR_POLICY,
    };
    const [baseline, baselineMetadata] = await Promise.all([
      readFileIfPresent(paths.baselinePath),
      readJsonIfPresent(paths.baselineMetadataPath),
    ]);
    if (run.controller.signal.aborted) {
      result.status = "cancelled";
      return;
    }
    const comparison = this.comparePngs({
      baseline,
      baselineMetadata,
      candidate: capture.image,
      candidateMetadata,
    });

    // Writing the diff is load-bearing — a changed result registers this path,
    // so a failed write must fail the story rather than advertise an image
    // that is missing or stale.
    if (comparison.diff) {
      await mkdir(path.dirname(paths.diffPath), { recursive: true });
      await writeFile(paths.diffPath, comparison.diff);
    } else {
      // Removing an earlier run's diff is best effort. It matters because the
      // artifact registry hands out one stable id per path for the process
      // lifetime, so a stale file stays servable to anyone still holding that
      // id. But non-exposure is already guaranteed below by not registering
      // the path at all, so a locked or read-only file must not downgrade a
      // genuinely passing comparison to a capture-error — the testing widget
      // reports that as a failed visual test.
      //
      // The tradeoff is that a persistent failure here is silent, since the
      // addon has nowhere to report it; a retained id would keep serving the
      // stale image until some later run manages the removal. Revisit if this
      // ever gets a logging surface.
      await rm(paths.diffPath, { force: true }).catch(() => undefined);
    }
    const artifacts = {
      ...(baseline && this.options.artifactRegistry
        ? {
            baseline: this.options.artifactRegistry.register(
              paths.baselinePath,
            ),
          }
        : {}),
      ...(this.options.artifactRegistry
        ? {
            candidate: this.options.artifactRegistry.register(
              paths.candidatePath,
            ),
          }
        : {}),
      ...(comparison.diff && this.options.artifactRegistry
        ? { diff: this.options.artifactRegistry.register(paths.diffPath) }
        : {}),
    };
    if (run.controller.signal.aborted) {
      result.status = "cancelled";
      return;
    }

    result.status = comparison.status;
    result.message = comparison.message;
    result.diffPixels = comparison.diffPixels;
    result.diffRatio = comparison.diffRatio;
    result.candidateSha256 = comparison.candidateSha256;
    result.artifacts = artifacts;

    if (comparison.status === "new" || comparison.status === "changed") {
      const completed: CompletedVisualResult = {
        completed: true,
        runId: result.runId,
        storyId: result.storyId,
        importPath: result.importPath,
        environmentKey: result.environmentKey,
        status: comparison.status,
        candidateSha256: comparison.candidateSha256,
        candidateMetadata,
        artifactRoot: paths.artifactRoot,
        candidatePath: paths.candidatePath,
        baselinePath: paths.baselinePath,
        baselineMetadataPath: paths.baselineMetadataPath,
      };
      this.completed.set(completedKey(completed), completed);
    }
  }

  private publish(run: ActiveRun): void {
    if (this.activeRun !== run) return;
    this.state = run.state;
    this.onState?.(this.getState());
  }
}

function cancelledState(state: InternalVisualRunState): InternalVisualRunState {
  return {
    ...state,
    running: false,
    // Only cancel this run's own results; carried-over results from earlier
    // runs keep their terminal status.
    results: state.results.map((result) =>
      result.runId === state.runId
        ? { ...result, status: "cancelled" }
        : result,
    ),
  };
}

/**
 * Environment keys (directory names) under a story's artifact directory that
 * hold a committed baseline, resolved through the caller's paths authority.
 * The names are reported for display, never joined back into write paths.
 * Never throws: this is best-effort context for the panel, and an unreadable
 * or malformed sibling directory must not cost the current environment its
 * own perfectly-readable baseline preview.
 */
async function listBaselineEnvironmentKeys(
  storyArtifactDirectory: string,
  resolveBaselinePaths: (environmentKey: string) => Promise<ArtifactPaths>,
): Promise<string[]> {
  try {
    const entries = await readdir(storyArtifactDirectory, {
      withFileTypes: true,
    });
    const keys = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const paths = await resolveBaselinePaths(entry.name);
            // Existence check only — never read the image here; the panel
            // fetches whichever baseline it displays through the artifact
            // route, and this runs on every story navigation.
            await access(paths.baselinePath);
            return entry.name;
          } catch {
            return undefined;
          }
        }),
    );
    return keys.filter((key) => key !== undefined).sort();
  } catch {
    return [];
  }
}

async function readFileIfPresent(
  filePath: string,
): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw error;
  }
}

async function readJsonIfPresent(filePath: string): Promise<unknown> {
  const value = await readFileIfPresent(filePath);
  if (!value) return undefined;
  try {
    return JSON.parse(value.toString("utf8"));
  } catch {
    // Corrupt metadata is treated as absent so one bad file cannot crash the
    // run; the comparator falls back to a full-capture "new" result.
    return undefined;
  }
}

function completedKey(identity: {
  runId: string;
  storyId: string;
  environmentKey: string;
}): string {
  return `${identity.runId}\0${identity.storyId}\0${identity.environmentKey}`;
}

function staleApproval(): Error {
  return new Error(
    "Stale visual approval; rerun the visual test before approving",
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
