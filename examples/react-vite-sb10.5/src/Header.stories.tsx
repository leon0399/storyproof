import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Header } from "./Header";

// The two auth states differ only inside the header's right-hand cluster, so
// their baselines make a tight, readable diff — a realistic review, not a
// wall of red.

const meta = {
  title: "Ledgerline/Header",
  component: Header,
  parameters: { layout: "fullscreen" },
  args: {
    onLogin: fn(),
    onLogout: fn(),
    onCreateAccount: fn(),
  },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoggedOut: Story = {};

export const LoggedIn: Story = {
  args: {
    user: { name: "Ada Lovelace" },
  },
};
