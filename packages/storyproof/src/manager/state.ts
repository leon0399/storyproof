import type {
  VisualResult,
  VisualResultStatus,
  VisualRunState,
} from "../shared/results.js";

const STATUS_VALUES = {
  queued: "status-value:pending",
  running: "status-value:pending",
  new: "status-value:new",
  changed: "status-value:modified",
  passed: "status-value:success",
  disabled: "status-value:unknown",
  "capture-error": "status-value:error",
  cancelled: "status-value:unknown",
} as const satisfies Record<VisualResultStatus, string>;

export function statusValueFor(result: VisualResult) {
  return STATUS_VALUES[result.status];
}

export function currentStoryPresentation(
  state: VisualRunState,
  storyId: string | undefined,
): {
  active: boolean;
  result: VisualResult | undefined;
  status: VisualResultStatus | "not-run";
} {
  const result = state.results.find((item) => item.storyId === storyId);
  return {
    active: result?.status === "queued" || result?.status === "running",
    result,
    status: result?.status ?? "not-run",
  };
}

export interface CommandErrorState {
  storyId?: string;
  message?: string;
}

export type CommandErrorAction =
  | { type: "cleared" }
  | { type: "failed"; message: string; storyId?: string }
  | { type: "story-changed"; storyId?: string };

export function commandErrorReducer(
  state: CommandErrorState,
  action: CommandErrorAction,
): CommandErrorState {
  if (action.type === "failed") {
    return {
      storyId: action.storyId ?? state.storyId,
      message: action.message,
    };
  }
  if (action.type === "story-changed") {
    return action.storyId === state.storyId
      ? state
      : { storyId: action.storyId };
  }
  return { storyId: state.storyId };
}

export function visibleCommandError(
  state: CommandErrorState,
  storyId: string | undefined,
): string | undefined {
  return state.storyId === storyId ? state.message : undefined;
}
