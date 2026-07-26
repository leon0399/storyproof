# Changelog

All notable changes to the `storyproof` package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) (0.x: minor bumps may break).

Storyproof was developed inside the [llame](https://github.com/leon0399/llame)
monorepo until 2026-07-26; the day-by-day pre-extraction record lives in
[llame's CHANGELOG](https://github.com/leon0399/llame/blob/master/CHANGELOG.md).

## [Unreleased]

### Added

- Tarball inventory gate: `test:pack` read-only inspector enforcing a positive
  entry allowlist (`dist/**`, `LICENSE`, `README.md`, `package.json`), a
  required-entries lower bound, canonical path segments (traversal member
  names rejected), and a 150 KiB packed-size budget; `prepack` now always
  rebuilds `dist` so a stale build can never be packed.

### Changed

- Extracted from the llame monorepo into
  [leon0399/storyproof](https://github.com/leon0399/storyproof) with full
  history; `repository` and `bugs` metadata now point here. Panel story meta
  types moved from `@storybook/nextjs-vite` to `@storybook/react-vite`
  (type-only).

## [0.0.1-alpha.1] - 2026-07-26

Name-claim placeholder published under the `alpha` dist-tag — **not a usable
release**. Contains the compiled addon as of the `storyproof` rebrand: the
in-Storybook run/review/approve workflow, source-adjacent committed baselines,
content-aware capture, pixelmatch comparison with per-baseline metadata, the
run-all testing-widget integration, and preset option validation. Install and
support contracts start with the first `0.1.0-next.*` prerelease.
