import path from "node:path";

import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ARTIFACT_ROUTE,
  BASELINE_EVENT,
  COMMAND_EVENT,
  COMMAND_ERROR_EVENT,
  STATE_EVENT,
} from "../src/constants.js";
import {
  experimental_serverChannel,
  managerEntries,
  previewAnnotations,
} from "../src/preset.js";
import {
  ArtifactRegistry,
  installCommandHandlers,
  registerArtifactRoute,
} from "../src/node/server.js";
import type { VisualTestRunner } from "../src/node/runner.js";

// The preset owns option validation; the runner is stubbed so these tests
// observe exactly what the preset resolved and passed on.
const { constructedRunners } = vi.hoisted(() => ({
  constructedRunners: [] as Record<string, unknown>[],
}));

vi.mock("../src/node/runner.js", () => ({
  VisualTestRunner: class {
    constructor(options: Record<string, unknown>) {
      constructedRunners.push(options);
    }
    setOnState() {}
  },
}));

describe("visual addon preset", () => {
  test("appends absolute manager and preview entries", async () => {
    const manager = await managerEntries(["existing-manager"]);
    const preview = await previewAnnotations(["existing-preview"]);

    expect(manager[0]).toBe("existing-manager");
    expect(preview[0]).toBe("existing-preview");
    expect(path.isAbsolute(manager[1]!)).toBe(true);
    expect(path.isAbsolute(preview[1]!)).toBe(true);
    expect(manager[1]).toMatch(/storyproof\/src\/manager\.tsx$/);
    expect(preview[1]).toMatch(/storyproof\/src\/preview\.ts$/);
  });
});

describe("preset option validation", () => {
  beforeEach(() => {
    constructedRunners.length = 0;
  });

  test("applies the documented defaults when both options are omitted", async () => {
    await startServerChannel();

    expect(constructedRunners).toHaveLength(1);
    expect(constructedRunners[0]).toMatchObject({
      storyRoots: ["."],
      maxConcurrency: 2,
    });
  });

  test("accepts valid explicit values", async () => {
    await startServerChannel({
      storyRoots: ["src", "../ui/src"],
      maxConcurrency: 1,
    });

    expect(constructedRunners[0]).toMatchObject({
      storyRoots: ["src", "../ui/src"],
      maxConcurrency: 1,
    });
  });

  // Built by assignment rather than literal syntax: these are genuinely sparse
  // (holes, not `undefined` members), which `Array.from({ length })` is not.
  const allHoles: unknown[] = [];
  allHoles.length = 3;
  const leadingHole: unknown[] = [];
  leadingHole[1] = "src";

  const invalidStoryRoots: [string, unknown][] = [
    ["a string", "src"],
    ["an object", { 0: "src" }],
    ["null", null],
    ["a number", 1],
    ["an empty array", []],
    ["an empty-string member", [""]],
    ["a whitespace-only member", ["   "]],
    ["a mixed array", ["src", 1]],
    ["a null member", ["src", null]],
    ["an undefined member", ["src", undefined]],
    // Array holes are invisible to `.map`/`forEach`, so a sparse array is the
    // shape most likely to slip past a naive validator.
    ["an all-holes array", allHoles],
    ["a leading hole", leadingHole],
  ];

  test.each(invalidStoryRoots)(
    "rejects storyRoots given %s",
    async (_label, storyRoots) => {
      const presets = fakePresets();

      await expect(startServerChannel({ storyRoots }, presets)).rejects.toThrow(
        /storyRoots/,
      );
      expect(constructedRunners).toHaveLength(0);
      expect(presets.apply).not.toHaveBeenCalled();
    },
  );

  const invalidMaxConcurrency: [string, unknown][] = [
    ["a string", "2"],
    ["zero", 0],
    ["a negative number", -1],
    ["a fractional number", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["null", null],
    ["a boolean", true],
    ["an object", {}],
    ["a boxed number", new Number(2)],
    ["a bigint", 2n],
  ];

  test.each(invalidMaxConcurrency)(
    "rejects maxConcurrency given %s",
    async (_label, maxConcurrency) => {
      const presets = fakePresets();

      await expect(
        startServerChannel({ maxConcurrency }, presets),
      ).rejects.toThrow(/maxConcurrency/);
      expect(constructedRunners).toHaveLength(0);
      expect(presets.apply).not.toHaveBeenCalled();
    },
  );

  test("describes hostile values without throwing from the formatter", async () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    await expect(startServerChannel({ storyRoots: circular })).rejects.toThrow(
      "expected an array, received an object",
    );
    await expect(
      startServerChannel({ storyRoots: Object.create(null) as object }),
    ).rejects.toThrow("expected an array, received an object");
    // A bigint stringifies to a bare "2"; the type has to survive the message.
    await expect(startServerChannel({ maxConcurrency: 2n })).rejects.toThrow(
      "received 2 (bigint)",
    );
  });

  test("names the option, the received value, and the default", async () => {
    await expect(startServerChannel({ maxConcurrency: 0 })).rejects.toThrow(
      '[storyproof] Invalid "maxConcurrency" preset option: expected an integer greater than 0, received 0. Omit it to use the default 2.',
    );
    await expect(
      startServerChannel({ storyRoots: ["src", ""] }),
    ).rejects.toThrow(
      '[storyproof] Invalid "storyRoots[1]" preset option: expected a non-empty string, received "". Set "storyRoots" to a non-empty array of non-empty strings, or omit it to use the default ["."].',
    );
  });
});

// Storybook 10.0.x does not register a "storyIndexGenerator" preset at all
// (confirmed by inspecting its common preset directly), so `presets.apply`
// resolves `undefined` there. An unchecked cast used to let that `undefined`
// flow into the runner and explode later, mid-run, with an opaque
// "Cannot read properties of undefined (reading 'getIndex')" instead of
// failing the dev server at startup with a named reason.
describe("storyIndexGenerator capability validation", () => {
  beforeEach(() => {
    constructedRunners.length = 0;
  });

  test.each<[string, unknown]>([
    ["undefined (Storybook 10.0.x's actual return value)", undefined],
    ["null", null],
    ["an object without a getIndex method", {}],
    ["an object whose getIndex is not a function", { getIndex: "nope" }],
  ])(
    "rejects a storyIndexGenerator capability that is %s",
    async (_label, capability) => {
      const presets = { apply: vi.fn(async () => capability) };

      await expect(startServerChannel({}, presets)).rejects.toThrow(
        /storyIndexGenerator/,
      );
      expect(constructedRunners).toHaveLength(0);
    },
  );

  test("names the missing capability and the required Storybook floor", async () => {
    const presets = { apply: vi.fn(async () => undefined) };

    await expect(startServerChannel({}, presets)).rejects.toThrow(
      '[storyproof] Missing required "storyIndexGenerator" preset capability: expected an object with a "getIndex" method, received undefined (undefined). Storybook does not expose this capability via `presets.apply("storyIndexGenerator")` on every minor -- confirmed absent from Storybook 10.0.x\'s common preset and present from 10.5.x onward. Upgrade to Storybook ^10.5.0 or later.',
    );
  });

  test("accepts a real storyIndexGenerator capability", async () => {
    await startServerChannel();

    expect(constructedRunners).toHaveLength(1);
    expect(constructedRunners[0]!["storyIndexGenerator"]).toBeDefined();
  });
});

describe("artifact server", () => {
  test("serves only registered PNGs through opaque GET IDs", async () => {
    const registry = new ArtifactRegistry();
    const id = registry.register("/private/worktree/candidate.png");
    const app = fakeApp();
    registerArtifactRoute(app, registry, {
      readFile: vi.fn(async (file) => Buffer.from(`png:${file}`)),
    });
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(app.get).toHaveBeenCalledWith(
      `${ARTIFACT_ROUTE}/:artifactId`,
      expect.any(Function),
    );
    expect(app.post).not.toHaveBeenCalled();

    const handler = app.get.mock.calls[0]![1];
    const response = fakeResponse();
    await handler({ params: { artifactId: id } }, response, vi.fn());

    expect(response.writeHead).toHaveBeenCalledWith(200, {
      "Cache-Control": "no-store",
      "Content-Type": "image/png",
    });
    expect(response.end).toHaveBeenCalledWith(
      Buffer.from("png:/private/worktree/candidate.png"),
    );

    const unknown = fakeResponse();
    await handler(
      { params: { artifactId: "../../private/worktree/candidate.png" } },
      unknown,
      vi.fn(),
    );
    expect(unknown.writeHead).toHaveBeenCalledWith(404);
    expect(unknown.end).toHaveBeenCalledWith("Not found");
  });
});

describe("server channel", () => {
  test("parses commands and emits path-free state", async () => {
    const listeners = new Map<string, (payload: unknown) => Promise<void>>();
    const channel = {
      on: vi.fn(
        (event: string, listener: (payload: unknown) => Promise<void>) =>
          listeners.set(event, listener),
      ),
      emit: vi.fn(),
    };
    const state: ReturnType<VisualTestRunner["getState"]> = {
      runId: "run-1",
      running: false,
      results: [
        {
          runId: "run-1",
          storyId: "button--primary",
          title: "Button / Primary",
          importPath: "/private/button.stories.tsx",
          environmentKey: "chromium-1280x720@1x",
          status: "new" as const,
          artifacts: { candidate: "opaque-candidate" },
        },
      ],
    };
    const runner = {
      getState: vi.fn(() => state),
      run: vi.fn(),
      cancel: vi.fn(),
      clear: vi.fn(),
      approve: vi.fn(),
      loadBaseline: vi.fn(),
      setOnState: vi.fn(),
    };
    installCommandHandlers(channel, runner);

    await listeners.get(COMMAND_EVENT)?.({ type: "get-state" });

    expect(channel.emit).toHaveBeenCalledWith(STATE_EVENT, {
      runId: "run-1",
      running: false,
      results: [
        {
          runId: "run-1",
          storyId: "button--primary",
          title: "Button / Primary",
          environmentKey: "chromium-1280x720@1x",
          status: "new",
          artifacts: { candidate: "opaque-candidate" },
        },
      ],
    });
    expect(JSON.stringify(channel.emit.mock.calls)).not.toContain("/private/");

    await listeners.get(COMMAND_EVENT)?.({
      type: "get-state",
      path: "/private/leak.png",
    });
    expect(runner.run).not.toHaveBeenCalled();
    expect(channel.emit).toHaveBeenCalledTimes(1);
  });

  test("routes an exact clear command to the runner", async () => {
    const listeners = new Map<string, (payload: unknown) => Promise<void>>();
    const channel = {
      on: vi.fn(
        (event: string, listener: (payload: unknown) => Promise<void>) =>
          listeners.set(event, listener),
      ),
      emit: vi.fn(),
    };
    const runner = {
      getState: vi.fn(() => ({ running: false, results: [] })),
      run: vi.fn(),
      cancel: vi.fn(),
      clear: vi.fn(),
      approve: vi.fn(),
      loadBaseline: vi.fn(),
      setOnState: vi.fn(),
    };
    installCommandHandlers(channel, runner);

    await listeners.get(COMMAND_EVENT)?.({ type: "clear" });

    expect(runner.clear).toHaveBeenCalledOnce();
    expect(runner.run).not.toHaveBeenCalled();
  });

  test("answers a load-baseline command with the resolved baseline preview", async () => {
    const listeners = new Map<string, (payload: unknown) => Promise<void>>();
    const channel = {
      on: vi.fn(
        (event: string, listener: (payload: unknown) => Promise<void>) =>
          listeners.set(event, listener),
      ),
      emit: vi.fn(),
    };
    const preview = {
      storyId: "button--primary",
      environmentKey: "chromium-1280x720@1x",
      artifactId: "opaque-baseline",
    };
    const runner = {
      getState: vi.fn(() => ({ running: false, results: [] })),
      run: vi.fn(),
      cancel: vi.fn(),
      clear: vi.fn(),
      approve: vi.fn(),
      loadBaseline: vi.fn(async () => preview),
      setOnState: vi.fn(),
    };
    installCommandHandlers(channel, runner);

    await listeners.get(COMMAND_EVENT)?.({
      type: "load-baseline",
      storyId: "button--primary",
    });

    expect(runner.loadBaseline).toHaveBeenCalledWith("button--primary");
    expect(channel.emit).toHaveBeenCalledWith(BASELINE_EVENT, preview);
    expect(runner.run).not.toHaveBeenCalled();
  });

  test("reports the originating story when load-baseline fails", async () => {
    const listeners = new Map<string, (payload: unknown) => Promise<void>>();
    const channel = {
      on: vi.fn(
        (event: string, listener: (payload: unknown) => Promise<void>) =>
          listeners.set(event, listener),
      ),
      emit: vi.fn(),
    };
    const runner = {
      getState: vi.fn(() => ({ running: false, results: [] })),
      run: vi.fn(),
      cancel: vi.fn(),
      clear: vi.fn(),
      approve: vi.fn(),
      loadBaseline: vi.fn(async () => {
        throw new Error("Baseline lookup failed");
      }),
      setOnState: vi.fn(),
    };
    installCommandHandlers(channel, runner);

    await listeners.get(COMMAND_EVENT)?.({
      type: "load-baseline",
      storyId: "button--primary",
    });

    expect(channel.emit).toHaveBeenCalledWith(COMMAND_ERROR_EVENT, {
      command: "load-baseline",
      storyId: "button--primary",
      message: "Baseline lookup failed",
    });
  });

  test("reports rejected commands instead of leaking promise rejections", async () => {
    const listeners = new Map<string, (payload: unknown) => Promise<void>>();
    const channel = {
      on: vi.fn(
        (event: string, listener: (payload: unknown) => Promise<void>) =>
          listeners.set(event, listener),
      ),
      emit: vi.fn(),
    };
    const runner = {
      getState: vi.fn(() => ({ running: false, results: [] })),
      run: vi.fn(),
      cancel: vi.fn(),
      clear: vi.fn(),
      approve: vi.fn(async () => {
        throw new Error("Stale visual approval; rerun first");
      }),
      loadBaseline: vi.fn(),
      setOnState: vi.fn(),
    };
    installCommandHandlers(channel, runner);

    await expect(
      listeners.get(COMMAND_EVENT)?.({
        type: "approve",
        runId: "run-1",
        storyId: "button--primary",
        environmentKey: "chromium-1280x720@1x",
        candidateSha256: "a".repeat(64),
      }),
    ).resolves.toBeUndefined();
    expect(channel.emit).toHaveBeenCalledWith(COMMAND_ERROR_EVENT, {
      command: "approve",
      storyId: "button--primary",
      message: "Stale visual approval; rerun first",
    });
  });
});

function fakePresets() {
  return {
    apply: vi.fn(async () => ({
      getIndex: vi.fn(async () => ({ v: 5, entries: {} })),
    })),
  };
}

async function startServerChannel(
  options: Record<string, unknown> = {},
  presets: { apply: (key: string) => Promise<unknown> } = fakePresets(),
) {
  const channel = { on: vi.fn(), emit: vi.fn() };
  return experimental_serverChannel(
    channel as any,
    {
      port: 6006,
      presets,
      ...options,
    } as any,
  );
}

function fakeApp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
  } as any;
}

function fakeResponse() {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
  };
}
