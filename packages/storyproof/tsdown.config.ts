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
  publint: true,
  attw: {
    profile: "esm-only",
    level: "error",
  },
});
