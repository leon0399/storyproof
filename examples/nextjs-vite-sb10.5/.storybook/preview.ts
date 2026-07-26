import type { Preview } from "@storybook/nextjs-vite";

const preview: Preview = {
  parameters: {
    layout: "centered",
    // Reading order for the sidebar: the plain demo first, then the
    // scenario stories that double as storyproof's acceptance suite (see
    // src/visual-fixture.stories.tsx).
    options: {
      storySort: {
        order: ["NavLink", "Visual Fixture", "Outside Fixture"],
      },
    },
  },
};

export default preview;
