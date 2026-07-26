import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { NavLink } from "./NavLink.js";

const meta = {
  title: "NavLink",
  component: NavLink,
} satisfies Meta<typeof NavLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: {
    label: "Dashboard",
    href: "/dashboard",
    active: true,
  },
};

export const Inactive: Story = {
  args: {
    label: "Settings",
    href: "/settings",
    active: false,
  },
};
