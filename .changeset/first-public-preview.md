---
"storyproof": minor
---

First public preview.

**Added**

- **Environment identity for baselines.** Baselines are keyed by the platform
  the browser renders on (`linux-chromium-1280x720@1x`), so different
  platforms coexist instead of fighting over one path. Every capture session
  also records a **render fingerprint** (the hash of a fixed probe page) in
  `baseline.json` — the catch-all for environment differences no version
  number can name. Baseline metadata moves to schema 2; a baseline from a
  different environment reports the specific mismatch instead of a false
  pixel diff.
- **Container capture** (`capture.container`): captures run in the Playwright
  container image matching the installed Playwright version, so every
  machine — macOS, WSL2, native Linux — produces identical pixels (measured,
  including across amd64/arm64). Corporate registry mirrors work via
  `capture.container.image` and get the same version-drift guard as the
  official image. Requires the Docker CLI; failures are named, fail-closed
  errors.
- **Capture engine selection** (`capture.browser`: `"chromium"` | `"firefox"`
  | `"webkit"`). Baselines are keyed per engine, so switching never
  overwrites another engine's set. Composes with container capture.
- **The panel says what is on disk.** A story whose committed baselines live
  under a different environment key shows "baselines exist for: …" instead of
  an unexplained "Not run"/"New", and a committed current-environment
  baseline is viewable before any run.
- The examples ship staged container baselines, so a fresh clone opens with
  passed, changed, and new states visible in the panel.

**Changed**

- **Breaking (pre-release):** baseline artifact paths gained the platform
  prefix and `baseline.json` moved to schema 2 — existing baselines report as
  incompatible until re-approved once.
- A platform mismatch between baseline and candidate is now an
  incompatibility (measured: bare macOS and bare Linux render differently).

**Fixed**

- The Visual tests panel renders for installed consumers: the compiled
  manager bundled a second React via the automatic JSX runtime and crashed
  the moment Storybook rendered the panel; the shipped build now uses the
  classic transform against Storybook's shared React.

The full engineering record — measurements and the rationale behind each
decision — lives in code comments at the decision sites and in the repository
history.
