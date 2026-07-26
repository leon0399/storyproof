# Changelog

All notable changes to the `storyproof` package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) (0.x: minor bumps may break).

Storyproof was developed inside the [llame](https://github.com/leon0399/llame)
monorepo until 2026-07-26; the day-by-day pre-extraction record lives in
[llame's CHANGELOG](https://github.com/leon0399/llame/blob/master/CHANGELOG.md).

## [Unreleased]

### Added

- Tarball inventory gate: `test/pack-inventory.test.ts` packs the package
  itself (`pnpm pack`, which always reruns `build` via `prepack` first, so a
  stale build can never be packed) and asserts the resulting file list is
  exactly `dist/**` plus `LICENSE`, `README.md`, and `package.json`, with the
  four public entry points and their declarations present, within a 150 KiB
  packed-size budget. A second test imports the built `dist/preset.js`
  directly and asserts `managerEntries()`/`previewAnnotations()` resolve to
  real, existing `dist/manager.js`/`dist/preview.js` files — the only runtime
  exercise of `preset.ts`'s compiled-vs-source directory detection in the
  suite. `preset.ts` resolves both entries from its own `import.meta.url`,
  never through `node_modules` resolution, so a direct import after `build`
  exercises the identical code path an installed consumer hits without an
  isolated project or a real package-manager install.

### Changed

- Extracted from the llame monorepo into
  [leon0399/storyproof](https://github.com/leon0399/storyproof) with full
  history; `repository` and `bugs` metadata now point here. Panel story meta
  types moved from `@storybook/nextjs-vite` to `@storybook/react-vite`
  (type-only).
- Replaced the bespoke build/pack/verify scripts with conventional tooling:
  **tsdown** (with publint and attw as build-time gates) builds the compiled
  ESM and declarations that used to come from `scripts/build.mjs`'s
  `tsc -p tsconfig.build.json` wrapper. TypeScript moved to **7.0.2** (exact),
  replacing `@typescript/native-preview`, with `isolatedDeclarations` scoped
  to `tsconfig.build.json` so tsdown's declaration generation takes the
  oxc-transform backend; `typecheck` is now plain `tsc --noEmit`. The
  published tarball's contents and 150 KiB size budget are unchanged.

## [0.0.1-alpha.1] - 2026-07-26

Name-claim placeholder published under the `alpha` dist-tag — **not a usable
release**. Contains the compiled addon as of the `storyproof` rebrand: the
in-Storybook run/review/approve workflow, source-adjacent committed baselines,
content-aware capture, pixelmatch comparison with per-baseline metadata, the
run-all testing-widget integration, and preset option validation. Install and
support contracts start with the first `0.1.0-next.*` prerelease.
