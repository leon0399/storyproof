import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./Button.js";

// Basics: a plain component with no storyproof-specific behavior — open the
// Visual tests panel here first to see the run/review/approve loop before
// the Visual Fixture / Outside Fixture scenarios below.

const meta = {
  title: "Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    label: "Save changes",
    variant: "primary",
  },
};

export const Secondary: Story = {
  args: {
    label: "Cancel",
    variant: "secondary",
  },
};
