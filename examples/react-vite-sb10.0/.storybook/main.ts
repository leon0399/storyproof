import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../src/**/*.stories.tsx",
    "../outside/outside-fixture.stories.tsx",
  ],
  staticDirs: [{ from: "../control", to: "/control" }],
  addons: [
    {
      name: "storyproof/preset",
      options: {
        storyRoots: ["src"],
      },
    },
  ],
};

export default config;
