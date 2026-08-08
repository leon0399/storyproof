import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/manager.tsx", "src/preset.ts", "src/preview.ts"],
  format: "esm",
  platform: "node",
  // package.json is "type": "module", so plain `.js` is already unambiguous
  // ESM — the fixed `.mjs` extension tsdown defaults to for Node platforms
  // would break preset.ts's directory/entry-name resolution and the
  // required exports-map targets (dist/index.js, dist/manager.js, etc).
  fixedExtension: false,
  tsconfig: "tsconfig.build.json",
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  // Dependencies and peerDependencies stay external by tsdown's library
  // defaults; internal modules (src/node, src/manager, src/shared) are
  // bundled per entry, with chunks shared across entries where reachable
  // from more than one (e.g. src/shared) split out automatically.
  // React is used only by the manager entry and resolved by Storybook's
  // own bundler at manager compile time — it is not a consumer dependency.
  external: ["react"],
  publint: true,
  attw: {
    profile: "esm-only",
    level: "error",
  },
  // Derives package.json's "exports" map from the entry list above instead
  // of hand-syncing both. Bare-string subpaths (no explicit "types"
  // condition) are correct for this pure-ESM package: TS resolves the
  // sibling dist/*.d.ts implicitly, and attw's esm-only profile (above)
  // verifies that resolution holds. The added "./package.json" export is
  // additive and commonly recommended. The generated manifest is committed
  // and byte-stable across rebuilds, so CI's `git diff --exit-code` after
  // packing doubles as a drift gate.
  exports: true,
});
