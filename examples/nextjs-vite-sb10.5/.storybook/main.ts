import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
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
