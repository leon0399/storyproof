import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Config for the demo APP server only (`pnpm dev:app`), deliberately not
// named vite.config.ts: @storybook/react-vite auto-merges a default-named
// config into Storybook's own Vite setup, which would double-register the
// react plugin there. The non-default name keeps the two servers decoupled.
export default defineConfig({
  plugins: [react()],
  server: {
    // Fail loudly if taken, matching the repo's pinned-port philosophy.
    port: 6206,
    strictPort: true,
  },
});
