import type { StorybookConfig } from "@storybook/react-vite";

const sourcePreset = import.meta.resolve("../../../../src/preset.ts");

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../src/**/*.stories.tsx",
    "../outside/outside-fixture.stories.tsx",
  ],
  staticDirs: [{ from: "../control", to: "/control" }],
  addons: [
    {
      name: sourcePreset,
      options: {
        storyRoots: ["test/.tmp/project/src"],
        // CI's container/engine jobs flip these; everything else captures
        // with host chromium exactly as before.
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
  viteFinal: (config) => {
    config.optimizeDeps ??= {};
    config.optimizeDeps.include = [
      ...(config.optimizeDeps.include ?? []),
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom/client",
    ];
    return config;
  },
};

export default config;
