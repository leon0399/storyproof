import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { Button } from "./Button.js";

// Basics: a plain component with no storyproof-specific behavior — open the
// Visual tests panel here first to see the run/review/approve loop before
// the Visual Fixture / Outside Fixture scenarios below. Derived from
// Storybook's official scaffold Button, restyled as Ledgerline.

const meta = {
  title: "Ledgerline/Button",
  component: Button,
  args: { onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    label: "Record payment",
    variant: "primary",
  },
};

export const Secondary: Story = {
  args: {
    label: "Save draft",
    variant: "secondary",
  },
};

export const Danger: Story = {
  args: {
    label: "Void invoice",
    variant: "danger",
  },
};

export const Small: Story = {
  args: {
    label: "Filter",
    size: "sm",
    variant: "secondary",
  },
};

export const Large: Story = {
  args: {
    label: "Send all reminders",
    size: "lg",
    variant: "primary",
  },
};

export const Disabled: Story = {
  args: {
    label: "Record payment",
    disabled: true,
  },
};
