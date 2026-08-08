# Changelog

## 0.1.0-next.4

### Minor Changes

- [#25](https://github.com/leon0399/storyproof/pull/25)
  [`3470c76`](https://github.com/leon0399/storyproof/commit/3470c761ffdffbddaa8ef36120bd3b8d1887c85a)
  Thanks [@leon0399](https://github.com/leon0399)! - `playwright` is now a peer
  dependency you install and own, instead of a version storyproof pins for you.

  ```bash
  pnpm add -D playwright        # alongside storyproof
  pnpm exec playwright install chromium
  ```

  Most package managers install a missing peer automatically, so an upgrade may
  need nothing from you — but declaring it explicitly is what puts the version
  under your control.

  **Why this matters more than a dependency detail:** the Playwright version is
  part of a baseline's identity. A baseline captured with a different one is
  refused with "Review and re-approve after the Playwright upgrade". While
  storyproof pinned Playwright, a storyproof release that happened to bump it
  would invalidate every baseline in your repository — a full visual re-review
  you never asked for, on storyproof's schedule. Now upgrading Playwright is
  your decision, made when you have time to review what moved. It also means a
  single Playwright copy and a single browser download shared with any
  Playwright you already run for end-to-end tests.

  The declared peer range is `>=1.45.0 <2`. 1.45.0 is the oldest version that
  supports container capture (Noble images and `run-server --host`); CI
  exercises both the floor and the current catalog version.

### Patch Changes

- [#41](https://github.com/leon0399/storyproof/pull/41)
  [`6c86279`](https://github.com/leon0399/storyproof/commit/6c86279c6e4c672ee8ce7db92c4caf18785c39c2)
  Thanks [@leon0399](https://github.com/leon0399)! - Add a 60-second Node-side
  timeout to each story capture. A capture that hangs — due to a browser
  transport failure, a Node runtime regression, or an unresponsive engine — now
  reports "Capture timed out" instead of freezing the UI indefinitely.

- [#31](https://github.com/leon0399/storyproof/pull/31)
  [`8d3e7d5`](https://github.com/leon0399/storyproof/commit/8d3e7d5c3e87e6ce7a49a71b0199f68339f024ca)
  Thanks [@leon0399](https://github.com/leon0399)! - Fixes container capture
  failing after a Playwright upgrade with
  `No matching version found for playwright@<version>`, naming a version that
  plainly exists. The container's npm cache was shared across versions, so one
  written before a release had no record of it — and no way to tell. The cache
  is now per version, and the error names the volume to clear if it recurs.

  A leftover `storyproof-npm-cache` volume is now unused:
  `docker volume rm storyproof-npm-cache`.

  The install inside the container also runs with lifecycle scripts disabled
  now, so a package fetched at capture time cannot execute install hooks. It was
  already pinned to an exact version. A custom `capture.container.image` must
  ship the browsers itself — the official images do.

- [#45](https://github.com/leon0399/storyproof/pull/45)
  [`55f28eb`](https://github.com/leon0399/storyproof/commit/55f28ebe2df7c12b575cb425b15be9cbc8e1fd60)
  Thanks [@leon0399](https://github.com/leon0399)! - Harden the support contract
  for stable release.

  - Drop React from peer dependencies — Storybook provides React to manager
    addons; `external: ["react"]` in the build config keeps the import external
    without requiring consumers to install it.
  - Ship `docs/` and `CHANGELOG.md` in the npm tarball so installed
    documentation matches the version rather than tracking main's HEAD.
  - Package README links are now relative, resolving against the shipped files.
  - Add quickstart configuration example, npm installation commands, and a
    troubleshooting section to the package README.
  - Fix Storybook catalog keyword order (`test` in the category position).
  - Capture-contract documentation now distinguishes host capture, managed
    container capture, and unsupported arbitrary split topologies.

- [#42](https://github.com/leon0399/storyproof/pull/42)
  [`2b54e63`](https://github.com/leon0399/storyproof/commit/2b54e632d3e07bcb0294b0bcd073773cafce8403)
  Thanks [@leon0399](https://github.com/leon0399)! - Report a refused navigation
  as the capture failure on every engine. A story that navigates somewhere
  unreachable now fails immediately, naming the origin and the refusal, instead
  of waiting out the readiness budget and reporting a generic "Timed out waiting
  for Storybook readiness" — which is what WebKit did, because it keeps the
  current document when a navigation is refused where Chromium and Firefox
  replace it.

- [#36](https://github.com/leon0399/storyproof/pull/36)
  [`8d13276`](https://github.com/leon0399/storyproof/commit/8d13276d42c66b6dbb120289205e44d6986a3ba1)
  Thanks [@leon0399](https://github.com/leon0399)! - Widen the
  `@storybook/icons` dependency to `^2.1.0` so it dedupes with Storybook's own
  copy.

## 0.1.0-next.3

### Patch Changes

- [#23](https://github.com/leon0399/storyproof/pull/23)
  [`7481901`](https://github.com/leon0399/storyproof/commit/7481901ae2608003f1ddda9e3c6aa7e7621fb0d8)
  Thanks [@leon0399](https://github.com/leon0399)! - Fixes three panel states
  that made a baseline migration unreviewable.

  - **A disabled story reported "Passed"** with a green dot, while also saying
    "Visual tests disabled for this story" — three contradictory signals at
    once. Disabled is now its own status: muted, no Accept, and a viewport that
    says the story opted out. (Consumers reading the Storybook status store see
    `status-value:unknown` for these instead of a false success.)
  - **A finished story showed "Capturing this story…"** for as long as _any_
    other story in the run was still going: the placeholder keyed off the
    suite's running flag rather than the story's own. It now follows the story.
  - **A metadata-only change showed no pixel count**, because the panel rendered
    the metric only when it was non-zero. "Changed" with a dead Diff tab and no
    number reads as a broken panel; it now reads "Changed · 0 px", which is what
    tells a reviewer the images are byte-identical and only the metadata moved —
    the state every story lands in during a schema-1 baseline migration.

## 0.1.0-next.2

### Minor Changes

- [#10](https://github.com/leon0399/storyproof/pull/10)
  [`caafdc0`](https://github.com/leon0399/storyproof/commit/caafdc03a83040083f73b1c92ca3ea7e5887ea6c)
  Thanks [@leon0399](https://github.com/leon0399)! - First public preview.

  **Added**

  - **Environment identity for baselines.** Baselines are keyed by the platform
    the browser renders on (`linux-chromium-1280x720@1x`), so different
    platforms coexist instead of fighting over one path. Every capture session
    also records a **render fingerprint** (the hash of a fixed probe page) in
    `baseline.json` — the catch-all for environment differences no version
    number can name. Baseline metadata moves to schema 2; a baseline from a
    different environment reports the specific mismatch instead of a false pixel
    diff.
  - **Container capture** (`capture.container`): captures run in the Playwright
    container image matching the installed Playwright version, so every machine
    — macOS, WSL2, native Linux — produces identical pixels (measured, including
    across amd64/arm64). Corporate registry mirrors work via
    `capture.container.image` and get the same version-drift guard as the
    official image. Requires the Docker CLI; failures are named, fail-closed
    errors.
  - **Capture engine selection** (`capture.browser`: `"chromium"` | `"firefox"`
    | `"webkit"`). Baselines are keyed per engine, so switching never overwrites
    another engine's set. Composes with container capture.
  - **The panel says what is on disk.** A story whose committed baselines live
    under a different environment key shows "baselines exist for: …" instead of
    an unexplained "Not run"/"New", and a committed current-environment baseline
    is viewable before any run.
  - The examples ship staged container baselines, so a fresh clone opens with
    passed, changed, and new states visible in the panel.

  **Changed**

  - **Breaking (pre-release):** baseline artifact paths gained the platform
    prefix and `baseline.json` moved to schema 2 — existing baselines report as
    incompatible until re-approved once.
  - A platform mismatch between baseline and candidate is now an incompatibility
    (measured: bare macOS and bare Linux render differently).

  **Fixed**

  - The Visual tests panel renders for installed consumers: the compiled manager
    bundled a second React via the automatic JSX runtime and crashed the moment
    Storybook rendered the panel; the shipped build now uses the classic
    transform against Storybook's shared React.

  The full engineering record — measurements and the rationale behind each
  decision — lives in code comments at the decision sites and in the repository
  history.

## [0.0.1-alpha.1] - 2026-07-26

Name-claim placeholder published under the `alpha` dist-tag — **not a usable
release**. Contains the compiled addon as of the `storyproof` rebrand: the
in-Storybook run/review/approve workflow, source-adjacent committed baselines,
content-aware capture, pixelmatch comparison with per-baseline metadata, the
run-all testing-widget integration, and preset option validation. Install and
support contracts start with the first `0.1.0-next.*` prerelease.

---

Entries from `0.1.0-next.*` onward are generated by
[Changesets](https://github.com/changesets/changesets) from each pull request's
changeset — the changeset's markdown body is the changelog entry. Versions
follow [Semantic Versioning](https://semver.org/) (0.x: minor bumps may break).
Storyproof was developed inside the [llame](https://github.com/leon0399/llame)
monorepo until 2026-07-26; the day-by-day pre-extraction record lives in
[llame's CHANGELOG](https://github.com/leon0399/llame/blob/master/CHANGELOG.md).
