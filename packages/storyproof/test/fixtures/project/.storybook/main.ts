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
        // CI's container-capture job flips this; everything else captures
        // with the host browser exactly as before.
        ...(process.env.STORYPROOF_CONTAINER === "1"
          ? { capture: { container: true } }
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
