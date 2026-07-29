import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Page } from "./Page.js";

// A full page, fullscreen: capture uses the complete 1280x720 viewport
// (see the capture contract's framing rules) rather than content-clipping.
// LoggedIn signs in through a play function — storyproof captures only
// after the story's play has finished, so the baseline records the
// signed-in header, not the initial state.

const meta = {
  title: "Ledgerline/Page",
  component: Page,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoggedOut: Story = {};

export const LoggedIn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(
      canvas.getByText("Ada Lovelace", { exact: false }),
    ).toBeInTheDocument();
  },
};
