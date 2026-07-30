# Changelog

All notable changes to the `storyproof` package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) (0.x: minor bumps may break).

Storyproof was developed inside the [llame](https://github.com/leon0399/llame)
monorepo until 2026-07-26; the day-by-day pre-extraction record lives in
[llame's CHANGELOG](https://github.com/leon0399/llame/blob/master/CHANGELOG.md).

## [Unreleased]

### Added

- The panel now says what is on disk before (and after) a run. A story whose
  committed baselines live under a _different_ environment key — the normal
  state of a repo with container baselines viewed from a bare host — no
  longer shows an unexplained "Not run"/"New": the panel lists the
  environments that do have baselines ("No baseline for
  `linux-chromium-1280x720@1x` — baselines exist for:
  `container-chromium-1280x720@1x`"), and a story whose current-environment
  baseline is committed gets "Committed baseline for this environment — run
  to compare" alongside the already-viewable Baseline tab.

- Environment identity for baselines. The environment key now leads with the
  platform the browser renders on (`linux-chromium-1280x720@1x`), so
  different platforms keep coexisting baselines instead of silently fighting
  over one path; architecture is deliberately excluded (measured
  byte-identical across amd64/arm64). Every capture session also renders a
  fixed probe page and records its image hash in `baseline.json` as the
  **render fingerprint** — the catch-all for environment differences no
  version number can name (two hosts with identical platform, browser build,
  and font metrics were measured rasterizing differently). Baseline metadata
  moves to schema 2; a baseline from a different environment now reports a
  message naming the specific mismatch (platform, browser version, Playwright
  version, or fingerprint) instead of a false pixel diff, and schema-1
  baselines report a migration message asking for one re-approval.
- Container capture (`capture.container` preset option, opt-in). storyproof
  starts the Playwright container image matching the installed Playwright
  version, connects over a loopback-only WebSocket, and captures stories
  there, so every machine — macOS, WSL2, native Linux — produces identical
  pixels under one shared `linux-chromium-…` key (measured: two Linux hosts
  that disagree when capturing bare produce byte-identical output in the
  container). The addon's Node side stays on the host, so approval and the
  path guards are unchanged. Requires the Docker CLI; failures (no docker,
  container died, readiness timeout) are named, fail-closed errors. The
  container is started once per dev-server process and reused across runs.
- The panel names the capture environment (`linux · chromium 140.0.… ·
container` / `· local`) under the story id, with the environment key,
  image, and fingerprint in its tooltip — so a preview that renders with
  different fonts than a container-captured baseline is a labelled fact.
- Capture engine selection (`capture.browser`: `"chromium"` | `"firefox"` |
  `"webkit"`, default chromium) — one engine per Storybook dev server.
  Baselines are keyed per engine (`linux-firefox-1280x720@1x`), so engines
  keep separate baseline sets and switching never overwrites anything. Works
  with `capture.container` (the image ships all three engines;
  `playwright run-server` is engine-generic and the client picks at connect).
  Each engine renders its own distinct probe image, confirming per-engine
  fingerprints. Documented plainly: Playwright's WebKit on Linux is the
  engine, not Safari. Multi-engine review of one story in a single run is
  deliberately deferred to the multi-candidate UI design.

### Changed

- The `capture.container.image` version guard is now registry-agnostic: any
  image named `playwright` with a `v<semver>-` tag is checked against the
  installed Playwright version, so a corporate registry mirror (e.g. an
  Artifactory proxy, which keeps the image name and tag and changes only
  the prefix) fails at startup on version drift instead of dying later as
  an opaque connect timeout. Previously only `mcr.microsoft.com/playwright`
  images were checked; custom-named images remain unchecked as before.
- **Breaking (pre-release):** baseline artifact paths gained the platform
  prefix and `baseline.json` moved to schema 2, so existing baselines report
  as incompatible until re-approved once. Deliberate while the published
  package has no working consumers.
- A platform mismatch between baseline and candidate is now an
  incompatibility. This reverses the earlier "platform is provenance only"
  decision, on evidence: bare macOS and bare Linux render measurably
  different pixels, so cross-platform comparison produced false diffs.

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
- Packed-consumer harness: real Storybook example projects under root
  `examples/` (`react-vite-sb10.5`, `nextjs-vite-sb10.5`) serve as both
  documentation-by-example (a plain demo plus the same scenario stories as
  `test/fixtures/project`, minus fault injection) and CI's packed-consumer
  acceptance fixture. They're pnpm workspace members depending on
  `storyproof: workspace:*` for local development; a new CI `consumer` job
  separately proves the actual packed npm tarball by copying an example out
  of the workspace, installing the exact tarball the `package` job built
  there (`pnpm pkg set` + `pnpm install --ignore-workspace`), and running the
  existing reusable acceptance specification (`test/acceptance/addon-suite.ts`,
  via `test:visual`'s new `VISUAL_TEST_PROJECT_DIR` environment variable)
  against that copy's real dev server — proving `storyproof/preset` resolves
  and runs correctly as an installed package, not just as workspace source.

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
- `package.json`'s `exports` map is now generated by tsdown
  (`tsdown.config.ts`'s `exports: true`) from its `entry` list instead of
  hand-authored: bare-string subpath targets (no explicit `"types"`
  condition — correct for this ESM-only package; TypeScript resolves the
  sibling `.d.ts` implicitly, verified by attw's `esm-only` profile) plus an
  added `"./package.json"` export. Rebuilding reproduces the manifest
  byte-for-byte, so the committed generated file also serves as a drift gate
  in CI.

### Fixed

- **The Visual tests panel never rendered for any installed consumer** —
  discovered by the packed-consumer harness (Added, above) actually loading
  the manager UI in a real browser, something no prior test did.
  `src/manager.tsx`'s automatic JSX transform compiled `dist/manager.js` to
  import `{ jsx, jsxs }` from `"react/jsx-runtime"`; Storybook's manager
  builder aliases bare `"react"`/`"react-dom"` imports to its own shared
  React instance but does not extend that aliasing to the `jsx-runtime`
  subpath, so a fresh copy got bundled into the addon's manager bundle whose
  `ReactSharedInternals` was never initialized by the same React build,
  throwing `Cannot read properties of undefined (reading
'recentlyCreatedOwnerStacks')` (a React 19 dev-mode-only internal field)
  the instant Storybook tried to render the panel. Reproduced identically
  across `workspace:*`, a packed npm tarball, pnpm, and npm — anything that
  loads the compiled manager entry through normal package resolution rather
  than compiling `src/manager.tsx` from source, which is the only path any
  test exercised before Task 8. Fixed by building the manager entry with the
  classic JSX transform (`tsconfig.build.json`'s `"jsx": "react"`, scoped to
  the build surface only) so `dist/manager.js` routes JSX through the
  already-imported `React` global instead of `react/jsx-runtime`, carrying
  no jsx-runtime import for Storybook's manager builder to duplicate.
  Verified against both supported framework integrations post-fix.
- **Icon-only manager buttons had no accessible name on Storybook 10.0.8** —
  the `consumer(react-vite-sb10.0)` matrix cell failed a `getByRole('button',
{name: 'Run visual tests'})` query even after the jsx-runtime fix above; the
  panel rendered fine, but the button had no computed accessible name on that
  specific floor version. `PanelView.tsx` and `TestProviderRow.tsx`'s
  icon-only Run/Stop buttons relied solely on `storybook/internal/components`'
  `Button`'s `ariaLabel` prop — a prop that doesn't exist at all in Storybook
  10.0.8's `Button` (confirmed by inspecting its shipped `dist/`: zero
  occurrences there, 49 in 10.5.4's, including a Storybook-11 deprecation
  notice for the prop's later replacement), so it silently produced an
  unnamed button on that version instead of erroring. Fixed by giving every
  icon-only button in both files a visually-hidden text child (the standard
  clip-rect pattern) carrying the same label, so the accessible name comes
  from real text content and works on every supported Storybook version
  regardless of that prop's availability; `ariaLabel` is kept alongside it
  since newer Storybook already deprecates omitting it. Verified via the
  accessibility tree (not just the prop) on both Storybook 10.0.8 (where the
  prop is absent) and 10.5.x (where it isn't) — the fix itself is confirmed
  correct on 10.0.8 even though 10.0.8 is not a supported version (see
  Removed, below).

Both defects above were invisible to every check that existed before Task 8
— publint, attw, the unit suite, and even a Playwright run against
`test/fixtures/project` compiled straight from source — and surfaced only
once a real packed install was loaded through a real browser's accessibility
tree on an installed Storybook version. That gap is the reason the
`consumer` matrix (Added, above) is a required CI gate, not an optional one.

- **A missing `storyIndexGenerator` preset capability silently became
  `undefined` and exploded later, mid-run, with no diagnostic (2026-07-27)**
  — the third failure the packed-consumer harness found on Storybook 10.0.8
  (see Removed, below) traced to `src/preset.ts`'s
  `experimental_serverChannel`, which cast
  `options.presets.apply("storyIndexGenerator")` straight to
  `StoryIndexGenerator` with an unchecked `as`. Storybook 10.0.x never
  registers a `storyIndexGenerator` preset at all (confirmed absent from its
  `common-preset.js`; present in 10.5.4's), so that call resolves `undefined`
  there, and the unchecked cast let it flow all the way into the runner
  before failing deep inside the first story-enumeration call with `Cannot
read properties of undefined (reading 'getIndex')` — or, worse, no visible
  error at all if that call path never surfaced one to the terminal, just a
  panel that accepts a run and never reports a result. Fixed by validating
  the resolved value has a callable `getIndex` before use
  (`resolveStoryIndexGenerator`, matching the existing
  `optionError`/`resolveStoryRoots`/`resolveMaxConcurrency` pattern), so an
  incompatible or future-renamed Storybook capability now fails the dev
  server at startup with a named `[storyproof]` error instead of hanging or
  throwing an unattributed error mid-run. This is independent of the 10.0
  floor decision below — it protects against any future Storybook minor
  that changes this preset key.

### Removed

- The `react-vite-sb10.0` example and its `consumer` CI matrix cell, and the
  attempted `peerDependencies.storybook` widening to `^10.0.0` (reverted back
  to `^10.5.0`, its original value — a net no-op). The packed-consumer
  harness proved the addon's own manager UI renders correctly and its
  controls are correctly named on Storybook 10.0.8 (both defects above were
  fixed and verified there), but every visual-test run submitted through the
  panel on that version then never completed — a systemic `toBeVisible`
  timeout waiting on a result, across nearly every acceptance scenario, with
  the identical suite passing cleanly against the two Storybook 10.5 cells.
  An intra-Storybook version-skew theory (`@storybook/builder-vite`
  resolving newer than `@storybook/react-vite`'s pinned core) was checked and
  ruled out: `@storybook/react-vite@10.0.8` depends on
  `@storybook/builder-vite` with an exact `"10.0.8"` pin, not a range, and
  the installed tree confirmed both resolve to that exact version. Root
  cause isolated on 2026-07-27 (see the "missing `storyIndexGenerator`
  preset capability" entry above): this was addon-side after all, not an
  unexplained Storybook internal — `presets.apply("storyIndexGenerator")`
  resolves `undefined` on Storybook 10.0.8 because it never registers that
  preset (10.5.4's does), and storyproof's own unchecked cast over that
  value hid the failure until it exploded mid-run. Reaching the story index
  generator on 10.0.x without it would require importing Storybook's
  internal core-server module directly instead of its public presets API,
  which is out of scope by design, so the range stays `^10.5.0`. Recorded as
  open, characterized future work rather than silently
  dropped.

- `test/build-contract.test.ts` and `test/identifier-contract.test.ts`:
  both were change-detector tests that read a config value or constant and
  asserted it against a hardcoded copy of itself, verifying nothing that
  couldn't already fail loudly elsewhere. Packaging correctness is now
  verified by publint and attw (build-time gates), `test/pack-inventory.test.ts`
  (a real pack asserting real shipped files), and the packed-consumer CI
  matrix (a real project installing the tarball and Storybook loading the
  addon through those exports) — behavioral checks the config-assertion
  tests were only ever a shadow of. The identifier scan for legacy
  (`llame`/`@workspace`) branding was a rebrand-migration guard; the package
  has since been extracted into its own repository, so there's no such
  source within reach to scan for.

## [0.0.1-alpha.1] - 2026-07-26

Name-claim placeholder published under the `alpha` dist-tag — **not a usable
release**. Contains the compiled addon as of the `storyproof` rebrand: the
in-Storybook run/review/approve workflow, source-adjacent committed baselines,
content-aware capture, pixelmatch comparison with per-baseline metadata, the
run-all testing-widget integration, and preset option validation. Install and
support contracts start with the first `0.1.0-next.*` prerelease.
