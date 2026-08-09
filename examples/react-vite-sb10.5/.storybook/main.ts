import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../src/**/*.stories.tsx",
    "../outside/outside-fixture.stories.tsx",
  ],
  addons: [
    {
      name: "storyproof/preset",
      options: {
        storyRoots: ["src"],
        // Opt into reproducible container capture (requires Docker) and/or a
        // different engine:
        //   STORYPROOF_CONTAINER=1 pnpm dev
        //   STORYPROOF_BROWSER=firefox pnpm dev
        // Container capture keys baselines `container-<engine>-…` so every
        // machine produces identical pixels; engines keep separate baselines.
        ...(process.env.STORYPROOF_CONTAINER === "1" ||
        process.env.STORYPROOF_BROWSER
          ? {
              capture: {
                ...(process.env.STORYPROOF_CONTAINER === "1"
                  ? { container: true }
                  : {}),
                ...(process.env.STORYPROOF_BROWSER
                  ? {
                      browser: process.env.STORYPROOF_BROWSER as
                        "chromium" | "firefox" | "webkit",
                    }
                  : {}),
              },
            }
          : {}),
      },
    },
  ],
};

export default config;
