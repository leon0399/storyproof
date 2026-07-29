import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    layout: "centered",
    // Reading order for the sidebar: the Ledgerline demo first (Button's
    // simple loop, then composition, then the full page), then the scenario
    // stories that double as storyproof's acceptance suite (see
    // src/visual-fixture.stories.tsx).
    options: {
      storySort: {
        order: [
          "Ledgerline",
          ["Button", "Header", "Page"],
          "Visual Fixture",
          "Outside Fixture",
        ],
      },
    },
  },
};

export default preview;
