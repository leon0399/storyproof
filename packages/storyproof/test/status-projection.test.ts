import { describe, expect, test } from "vitest";

import {
  commandErrorReducer,
  currentStoryPresentation,
  statusValueFor,
  visibleCommandError,
} from "../src/manager/state.js";
import type {
  VisualResult,
  VisualResultStatus,
} from "../src/shared/results.js";

function result(status: VisualResultStatus): VisualResult {
  return {
    runId: "run-1",
    storyId: "button--primary",
    title: "Button / Primary",
    environmentKey: "chromium-1280x720@1x",
    status,
  };
}

describe("statusValueFor", () => {
  test.each([
    ["queued", "status-value:pending"],
    ["running", "status-value:pending"],
    ["new", "status-value:new"],
    ["changed", "status-value:modified"],
    ["passed", "status-value:success"],
    ["disabled", "status-value:unknown"],
    ["capture-error", "status-value:error"],
    ["cancelled", "status-value:unknown"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(statusValueFor(result(input))).toBe(expected);
  });
});

describe("commandErrorReducer", () => {
  test("drops a command error when the selected story changes", () => {
    const failed = commandErrorReducer(
      { storyId: "button--primary" },
      { type: "failed", message: "Stale visual approval" },
    );

    expect(
      commandErrorReducer(failed, {
        type: "story-changed",
        storyId: "button--secondary",
      }),
    ).toEqual({ storyId: "button--secondary" });
  });

  test("hides a story error as soon as another story renders", () => {
    const failed = commandErrorReducer(
      { storyId: "button--primary" },
      { type: "failed", message: "Stale visual approval" },
    );

    expect(visibleCommandError(failed, "button--primary")).toBe(
      "Stale visual approval",
    );
    expect(visibleCommandError(failed, "button--secondary")).toBeUndefined();
  });

  test("keeps a delayed failure scoped to its originating story", () => {
    const failed = commandErrorReducer(
      { storyId: "button--secondary" },
      {
        type: "failed",
        storyId: "button--primary",
        message: "Baseline lookup failed",
      },
    );

    expect(failed).toEqual({
      storyId: "button--primary",
      message: "Baseline lookup failed",
    });
    expect(visibleCommandError(failed, "button--secondary")).toBeUndefined();
  });
});

describe("currentStoryPresentation", () => {
  test("keeps a never-run story idle while another story runs", () => {
    expect(
      currentStoryPresentation(
        {
          running: true,
          results: [
            {
              runId: "run-1",
              storyId: "button--primary",
              title: "Button / Primary",
              environmentKey: "chromium-1280x720@1x",
              status: "running",
            },
          ],
        },
        "button--secondary",
      ),
    ).toEqual({ active: false, result: undefined, status: "not-run" });
  });
});
