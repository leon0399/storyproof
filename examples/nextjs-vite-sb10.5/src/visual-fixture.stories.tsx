import { useState } from "react";
import { createPortal } from "react-dom";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

// Scenarios: each story below demonstrates a real reviewer behavior a
// storyproof user hits in practice, not a synthetic edge case. They're also
// storyproof's own reusable acceptance specification
// (packages/storyproof/test/acceptance/addon-suite.ts), exercised here
// against a real installed package rather than the workspace source — see
// the root AGENTS.md's Examples section.
// (Fault-injection scenarios — a story that hangs or fails its connection on
// command — are harness-only and stay in the workspace's
// test/fixtures/project; they'd be nonsense in a demo project.)

function VisualFixture() {
  const [ready, setReady] = useState(false);
  return (
    <main
      style={{
        width: 120,
        height: 80,
        background: ready ? "rgb(0, 180, 90)" : "rgb(200, 30, 30)",
      }}
    >
      <button type="button" onClick={() => setReady(true)}>
        Finish story
      </button>
      {ready
        ? createPortal(
            <aside
              style={{
                position: "fixed",
                left: 280,
                top: 160,
                width: 180,
                height: 100,
                background: "rgb(20, 80, 220)",
                color: "white",
              }}
            >
              Portal ready
            </aside>,
            document.body,
          )
        : null}
    </main>
  );
}

const meta = {
  title: "Visual Fixture",
  component: VisualFixture,
} satisfies Meta<typeof VisualFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The everyday case: run once to capture and approve a baseline, then run
 * again after the rendered pixels change. Expected: the panel reports
 * "Changed" with a pixel count, and the Baseline/Latest/Diff tabs each show
 * a distinct image.
 */
export const Changed: Story = {};

/**
 * Approving a candidate that no longer matches what's on disk (e.g. someone
 * else's rerun landed first) must not silently promote it. Expected: the
 * approval is rejected with a "stale visual approval" message and the story
 * stays in its pre-approval state.
 */
export const Stale: Story = {};

/**
 * A hand-edited or corrupted `baseline.json` next to a real `baseline.png`.
 * Expected: the story is still reviewable (Baseline/Latest tabs work) but
 * reports "Baseline metadata is missing or malformed" instead of a diff.
 */
export const Malformed: Story = {};

/**
 * A fullscreen story captures the full viewport, not just its rendered
 * content. Expected: the captured candidate is exactly 1280×720.
 */
export const Viewport: Story = {
  parameters: { layout: "fullscreen" },
};

/**
 * Opting a story out of visual testing (`visualTests: { disable: true }`).
 * Expected: running it reports "Passed" immediately with no candidate ever
 * written.
 */
export const Disabled: Story = {
  parameters: { visualTests: { disable: true } },
};

/**
 * Non-fullscreen content is captured tightly around what actually rendered
 * — including a `createPortal`-rendered element outside the story root —
 * not the full viewport. Expected: the candidate is smaller than 1280×720
 * and contains both the button's and the portal's colors.
 */
export const Portal: Story = {
  parameters: { layout: "centered" },
  play: async ({ canvas, canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await userEvent.click(canvas.getByRole("button", { name: "Finish story" }));
    await expect(
      within(canvasElement.ownerDocument.body).getByText("Portal ready"),
    ).toBeVisible();
  },
};
