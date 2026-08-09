import { afterEach, describe, expect, test, vi } from "vitest";

import { COMMAND_EVENT, STATE_EVENT } from "../src/constants.js";
import {
  createRetryingProjection,
  registerTestProviderCommands,
  subscribeToVisualState,
} from "../src/manager/channel.js";
import type { VisualRunState } from "../src/shared/results.js";

describe("manager state channel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("registers and returns clear callbacks that emit the authoritative command", () => {
    let registered: (() => void) | undefined;
    const testProviderStore = {
      onRunAll: vi.fn(),
      onClearAll: vi.fn((clear: () => void) => {
        registered = clear;
      }),
    };
    const channel = { emit: vi.fn() };

    const commands = registerTestProviderCommands(testProviderStore, channel);

    expect(registered).toBe(commands.clear);
    registered!();

    expect(channel.emit).toHaveBeenCalledOnce();
    expect(channel.emit).toHaveBeenCalledWith(COMMAND_EVENT, { type: "clear" });

    channel.emit.mockClear();
    commands.clear();

    expect(channel.emit).toHaveBeenCalledOnce();
    expect(channel.emit).toHaveBeenCalledWith(COMMAND_EVENT, { type: "clear" });
  });

  test("clear discards a run-all request queued before state sync", () => {
    let requestRunAll: (() => void) | undefined;
    let clear: (() => void) | undefined;
    const testProviderStore = {
      onRunAll: vi.fn((handler: () => void) => {
        requestRunAll = handler;
      }),
      onClearAll: vi.fn((handler: () => void) => {
        clear = handler;
      }),
    };
    const channel = { emit: vi.fn() };
    const commands = registerTestProviderCommands(testProviderStore, channel);

    requestRunAll!();
    expect(channel.emit).not.toHaveBeenCalled();

    clear!();
    commands.stateSynced();

    expect(channel.emit.mock.calls).toEqual([
      [COMMAND_EVENT, { type: "clear" }],
    ]);
  });

  test("runs a queued request on first sync and later requests immediately", () => {
    let requestRunAll: (() => void) | undefined;
    const testProviderStore = {
      onRunAll: vi.fn((handler: () => void) => {
        requestRunAll = handler;
      }),
      onClearAll: vi.fn(),
    };
    const channel = { emit: vi.fn() };
    const commands = registerTestProviderCommands(testProviderStore, channel);

    requestRunAll!();
    expect(channel.emit).not.toHaveBeenCalled();
    commands.stateSynced();

    expect(channel.emit).toHaveBeenCalledOnce();
    expect(channel.emit).toHaveBeenLastCalledWith(COMMAND_EVENT, {
      type: "run",
      scope: "all",
    });

    commands.stateSynced();
    expect(channel.emit).toHaveBeenCalledOnce();

    requestRunAll!();
    expect(channel.emit).toHaveBeenCalledTimes(2);
    expect(channel.emit).toHaveBeenLastCalledWith(COMMAND_EVENT, {
      type: "run",
      scope: "all",
    });
  });

  test("retries dropped state requests until connected, then stops", () => {
    vi.useFakeTimers();
    const state: VisualRunState = { running: false, results: [] };
    let stateListener: ((nextState: VisualRunState) => void) | undefined;
    let requests = 0;
    const channel = {
      emit: vi.fn((event: string) => {
        if (event !== COMMAND_EVENT) return;
        requests += 1;
        if (requests === 3) stateListener?.(state);
      }),
      on: vi.fn(
        (event: string, listener: (nextState: VisualRunState) => void) => {
          if (event === STATE_EVENT) stateListener = listener;
        },
      ),
      off: vi.fn(),
    };
    const onState = vi.fn();

    const unsubscribe = subscribeToVisualState(channel, onState);
    expect(requests).toBe(1);

    vi.advanceTimersByTime(500);
    expect(requests).toBe(3);
    expect(onState).toHaveBeenCalledWith(state);

    vi.advanceTimersByTime(1_000);
    expect(requests).toBe(3);
    const updated: VisualRunState = { running: true, results: [] };
    stateListener?.(updated);
    expect(onState).toHaveBeenLastCalledWith(updated);

    unsubscribe();
    expect(channel.off).toHaveBeenCalledWith(STATE_EVENT, stateListener);
  });

  test("replays only the latest state when a projection becomes ready", () => {
    vi.useFakeTimers();
    const first: VisualRunState = { running: false, results: [] };
    const latest: VisualRunState = { running: true, results: [] };
    let ready = false;
    const project = vi.fn((state: VisualRunState) => {
      if (!ready) throw new Error("Cannot set state before store is ready");
      expect(state).toBe(latest);
    });
    const projection = createRetryingProjection(
      project,
      (error) =>
        error instanceof Error &&
        error.message.includes("Cannot set state before store is ready"),
    );

    projection.project(first);
    projection.project(latest);
    ready = true;
    vi.advanceTimersByTime(250);

    expect(project.mock.calls.map(([state]) => state)).toEqual([
      first,
      latest,
      latest,
    ]);
    vi.advanceTimersByTime(1_000);
    expect(project).toHaveBeenCalledTimes(3);

    projection.dispose();
  });
});
