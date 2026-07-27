import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: [
    "../src/**/*.stories.tsx",
    "../outside/outside-fixture.stories.tsx",
  ],
  addons: [
    {
      name: "storyproof/preset",
      options: {
        storyRoots: ["src"],
        // Opt into reproducible container capture (requires Docker):
        //   STORYPROOF_CONTAINER=1 pnpm dev
        // Every machine then produces identical pixels under the
        // `linux-chromium-…` environment key instead of per-OS ones.
        ...(process.env.STORYPROOF_CONTAINER === "1"
          ? { capture: { container: true } }
          : {}),
      },
    },
  ],
};

export default config;
