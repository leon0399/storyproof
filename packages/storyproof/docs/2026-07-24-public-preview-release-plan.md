# Storybook Visual Tests Public Preview Implementation Plan

**Document version:** v5

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the addon for a narrow public `0.x` preview while developing
and testing it inside the llame monorepo, with repository extraction remaining
an optional final release step.

**Architecture:** Keep Storybook's development server as the trusted local
control plane. Separate server-only state from channel-visible state, keep one
reusable browser acceptance specification, verify it through an in-repository
fixture template executed under `/tmp` outside the workspace, and publish only a
compiled, allowlisted artifact. The preview targets Ubuntu 24.04 x64, Node 22
and 24, Storybook `^10.0.0` (verified at the 10.0 and 10.5 boundaries), the
react-vite and nextjs-vite framework integrations with React 19 fixtures,
bundled Chromium, and direct loopback HTTP. Consumer React is not a runtime
dependency — the manager consumes Storybook's bundled React and the preview
bridge is renderer-agnostic. Storybook 9.x (floor 9.1) and non-React renderers
are tracked, evidence-gated follow-ups.

**Tech Stack:** TypeScript, Storybook 10, React, Vite, Playwright Chromium,
Vitest, pnpm, Turborepo, npm trusted publishing.

---

## Release contract

The first public preview is not a general visual-testing platform. It supports:

- local, development-only Storybook;
- Storybook and Playwright running in the same network namespace;
- direct loopback HTTP access to Storybook;
- Node `>=22.12` (22 and 24 verified by the release matrix);
- Storybook `^10.0.0` (10.0 and 10.5 boundaries verified; all four
  experimental APIs the addon uses are registry-verified present since
  10.0.0);
- the `@storybook/react-vite` and `@storybook/nextjs-vite` framework
  integrations (consumer React is not a runtime dependency; fixtures use
  React 19);
- bundled Playwright Chromium at `1280x720`, DPR 1;
- Ubuntu 24.04 x64 only;
- source-adjacent baseline review and approval;
- static Storybook rendering the panel as unavailable.

The initial release does not promise HTTPS, reverse-proxy path prefixes,
container-separated capture, remote approval, multiple browsers, viewport
matrices, theme matrices, masking, or a CI runner.

Git diff, commit review, and pull-request review remain the authorization
boundary for accepting baseline changes. The addon validates candidate
integrity; it does not authenticate the human issuing a command through a
development Storybook manager.

## File map

Expected files are listed up front so package boundaries remain explicit.
Exact paths may be narrowed during implementation, but additional production
files require a task-level justification.

- `src/constants.ts` — public addon, event, route, and bridge identifiers.
- `src/shared/results.ts` — channel-visible result and state types.
- `src/node/runner.ts` — server-only result state, capture lifecycle, and
  artifact cleanup.
- `src/node/server.ts` — typed server-to-manager serialization boundary.
- `src/node/capture.ts` — capture URL construction and actionable connection
  errors.
- `src/preset.ts` — preset options and supported local capture origin.
- `src/manager.tsx`, `src/manager/Panel.tsx` — consume only public wire types.
- `src/manager/PanelView.tsx` — user-visible error and review behavior.
- `test/protocol.test.ts`, `test/runner.test.ts`, `test/compare.test.ts`,
  `test/server.test.ts`, `test/capture.test.ts` — focused unit contracts.
- `test/fixtures/consumer/` — minimal external React-Vite Storybook project,
  copied outside the workspace for packed-artifact tests.
- `test/consumer/` — tarball build/install/dev/static-build orchestration.
- `test/smoke/addon.spec.ts` — browser-visible release acceptance path.
- `package.json` — build, exports, files allowlist, public metadata, peer
  contract, and pack checks.
- `tsconfig.build.json` or the selected build-tool configuration — distributable
  ESM and declarations, excluding tests and stories.
- `README.md`, `docs/configuration.md`, `docs/capture-contract.md` — verified
  public contract, security boundary, and troubleshooting.
- `.github/workflows/ci.yml` — packed-consumer release gate.
- `.github/workflows/release-storybook-addon-visual-tests.yml` — protected,
  provenance-producing publication.
- `LICENSE` — license grant, added no later than the release-metadata task.

Every shipping task PR must update this plan's checkboxes, remove completed
work from the forward-only root `ROADMAP.md`, and record user-visible package changes under `## [Unreleased]` in the package `CHANGELOG.md` (Keep a Changelog sections; Changesets takes over version rollup once integrated).
The commit snippets below name the core implementation paths; those three
tracking files are part of the required commit whenever their state changes.

## Chunk 1: Stabilize the public contract

### Task 1: Replace llame-specific runtime identifiers

**Files:**

- Modify: `packages/storybook-addon-visual-tests/src/constants.ts`
- Modify: `packages/storybook-addon-visual-tests/src/preview.ts`
- Modify: `packages/storybook-addon-visual-tests/src/node/capture.ts`
- Modify: identifier-dependent tests under
  `packages/storybook-addon-visual-tests/test/`

- [x] **Step 1: Add failing identifier-contract tests**

  Assert that addon IDs, channel events, artifact routes, and the preview bridge
  use one generic namespace and contain neither `llame` nor `workspace`.

- [x] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```bash
  pnpm --filter storyproof test identifier-contract protocol preview server capture
  ```

  Expected: failure because current identifiers use `llame` and
  `__LLAME_VISUAL_TESTS__`.

- [x] **Step 3: Rename the identifiers as one atomic protocol change**

  Use the final public package namespace consistently. Do not add compatibility
  aliases: no public version depends on the old names.

- [x] **Step 4: Run focused and package checks**

  ```bash
  pnpm --filter storyproof test
  pnpm --filter storyproof typecheck
  pnpm --filter storyproof lint
  ```

  Expected: all pass.

- [x] **Step 5: Verify internal branding is gone from runtime surfaces**

  ```bash
  rg -n "llame|LLAME|@workspace" \
    packages/storybook-addon-visual-tests/src \
    packages/storybook-addon-visual-tests/test \
    --glob '!test/fixtures/**'
  rg -n "llame|LLAME" \
    packages/storybook-addon-visual-tests/test/fixtures
  ```

  Expected: no runtime identifier or non-fixture test import matches. Fixtures
  contain no llame-specific branding; their workspace-scoped imports may remain
  only until the packed-consumer task.

- [x] **Step 6: Commit**

  ```bash
  git add packages/storybook-addon-visual-tests/src \
    packages/storybook-addon-visual-tests/test
  git commit -m "refactor(storybook-addon): genericize runtime identifiers"
  ```

### Task 2: Separate server-only and channel-visible state

**Files:**

- Modify: `packages/storybook-addon-visual-tests/src/shared/results.ts`
- Modify: `packages/storybook-addon-visual-tests/src/node/runner.ts`
- Modify: `packages/storybook-addon-visual-tests/src/node/server.ts`
- Modify: `packages/storybook-addon-visual-tests/src/manager.tsx`
- Modify: `packages/storybook-addon-visual-tests/src/manager/Panel.tsx`
- Test: `packages/storybook-addon-visual-tests/test/server.test.ts`
- Test: `packages/storybook-addon-visual-tests/test/protocol.test.ts`

- [x] **Step 1: Add failing serialization/type-contract tests**

  Prove that server-owned results contain `importPath` while emitted manager
  state cannot contain or access it.

- [x] **Step 2: Run focused tests and typecheck**

  ```bash
  pnpm --filter storyproof test server protocol
  pnpm --filter storyproof typecheck
  ```

  Expected: the new contract fails because manager payloads are currently typed
  as `VisualRunState` even though `publicState()` removes `importPath`.

- [x] **Step 3: Introduce explicit internal and public state types**

  Keep story import paths exclusively in the Node runner. Convert once at the
  server channel boundary. Do not accept an import path from browser commands.

- [x] **Step 4: Run package checks**

  ```bash
  pnpm --filter storyproof test
  pnpm --filter storyproof typecheck
  pnpm --filter storyproof lint
  ```

  Expected: all pass.

- [x] **Step 5: Commit**

  ```bash
  git add packages/storybook-addon-visual-tests/src \
    packages/storybook-addon-visual-tests/test
  git commit -m "fix(storybook-addon): type the public channel boundary"
  ```

### Task 3: Remove misleading passing diff artifacts

**Files:**

- Modify: `packages/storybook-addon-visual-tests/src/node/compare.ts`
- Modify: `packages/storybook-addon-visual-tests/src/node/runner.ts`
- Modify: `packages/storybook-addon-visual-tests/src/manager/PanelView.tsx`
- Test: `packages/storybook-addon-visual-tests/test/compare.test.ts`
- Test: `packages/storybook-addon-visual-tests/test/runner.test.ts`

- [x] **Step 1: Add failing artifact-lifecycle tests**

  Cover pixel-identical passes, changed pixels, metadata-only incompatibility,
  and removal/non-registration of a stale previous diff.

- [x] **Step 2: Run focused tests and verify failure**

  ```bash
  pnpm --filter storyproof test compare runner
  ```

  Expected: pixel-identical comparisons currently return and register a diff.

- [x] **Step 3: Emit diffs only for pixel changes**

  Keep baseline and candidate review available for metadata incompatibility, but
  do not display a zero-information diff. Ensure a later passing run cannot
  expose a stale diff artifact.

  Shipped as two guarantees of deliberately different strength:

  - A result without a diff never exposes or registers one — unconditional.
    The artifact entry and the `register` call share the same guard, so this
    does not depend on the filesystem.
  - The stale bytes become unreachable — best effort. Removal is what makes a
    diff id issued by an earlier changed run stop resolving, since
    `ArtifactRegistry` caches one opaque id per path for the process lifetime.
    If the unlink fails, that older id stays servable until a later run
    removes the file.

  Removal is best effort by design: because the first guarantee never depended
  on it, an undeletable file must not downgrade a passing comparison to a
  capture-error, which the testing widget reports as a failed visual test.
  Writing a diff still fails loudly, since a changed result registers that path
  and must not advertise a missing image.

- [x] **Step 4: Run package and Storybook UI verification**

  Follow the repository Storybook MCP instructions before changing the rendered
  panel. Run the affected story tests and preview the affected panel stories,
  then run:

  ```bash
  pnpm --filter storyproof test
  pnpm --filter storyproof typecheck
  pnpm --filter storyproof lint
  ```

  Expected: all pass; a passing result exposes no Diff tab.

  Storybook story tests could not be executed locally (the WSL2 host is missing
  Playwright's browser system libraries, and nixpkgs' replacements need a newer
  glibc than the host provides). The affected panel states were instead
  verified in a real browser against the running Storybook, and CI runs the
  story tests with `playwright install --with-deps chromium`.

- [x] **Step 5: Commit**

  ```bash
  git add packages/storybook-addon-visual-tests/src \
    packages/storybook-addon-visual-tests/test
  git commit -m "fix(storybook-addon): emit diffs only for changed pixels"
  ```

## Chunk 2: Prove supported behavior

### Task 4: Define the target compatibility and trust contract

**Files:**

- Modify: `packages/storybook-addon-visual-tests/README.md`
- Modify: `packages/storybook-addon-visual-tests/docs/configuration.md`
- Modify: `packages/storybook-addon-visual-tests/docs/capture-contract.md`
- Modify: `packages/storybook-addon-visual-tests/package.json`
- Modify: `packages/storybook-addon-visual-tests/src/preset.ts`
- Test: `packages/storybook-addon-visual-tests/test/server.test.ts`

- [x] **Step 1: Write the target support matrix**

  Record the Node, Storybook, React, framework, browser, operating-system, and
  network-topology combination that Tasks 8 and 10 must prove. Mark it as a
  release target, not verified support, until the packed-consumer matrix passes.
  Keep the preview Ubuntu 24.04 x64 only. Another operating system or Linux
  distribution is post-preview work and requires exact Ubuntu-approved baseline
  files to pass the fixed comparator there without reapproval.

- [x] **Step 2: Document the trusted-development-interface boundary**

  Explain that any party with development manager-channel access may issue
  capture and approval commands, approval writes repository files, candidate
  integrity checks are not user authentication, and Git/PR review authorizes
  committed baseline changes.

- [x] **Step 3: Document the capture origin**

  State that zero-config capture uses direct loopback HTTP in the same network
  namespace. List HTTPS, proxy prefixes, and split-container operation as
  unsupported rather than silently implying compatibility.

- [x] **Step 4: Define and test preset option validation**

  Add failing tests proving `storyRoots` must be a non-empty array of non-empty
  strings and `maxConcurrency`, when present, must be a number that is finite,
  integer, and greater than zero. Cover wrong JavaScript runtime types, empty
  strings, mixed arrays, zero, negative, fractional, NaN, and infinite values.
  Make preset startup reject invalid values with actionable errors. Keep the
  default concurrency at 2; do not invent a configurable upper bound without
  evidence.

- [x] **Step 5: Document every supported option and default**

  Include `storyRoots`, `maxConcurrency`, capture framing, disable semantics,
  comparator policy, artifact ignores, and failure behavior.

- [x] **Step 6: Verify target docs agree and mark metadata provisional**

  ```bash
  rg -n "Storybook|React|Node|Chromium|HTTP|storyRoots|maxConcurrency" \
    packages/storybook-addon-visual-tests/README.md \
    packages/storybook-addon-visual-tests/docs \
    packages/storybook-addon-visual-tests/package.json
  pnpm format:check
  ```

  Expected: one consistent target matrix with an explicit “verified by release
  CI before publication” status; formatting passes. Existing peer and engine
  ranges remain provisional package metadata, not support claims. Task 10
  finalizes the ranges and support wording after Task 8 supplies evidence.

- [x] **Step 7: Commit**

  ```bash
  git add packages/storybook-addon-visual-tests/README.md \
    packages/storybook-addon-visual-tests/docs \
    packages/storybook-addon-visual-tests/package.json \
    packages/storybook-addon-visual-tests/src/preset.ts \
    packages/storybook-addon-visual-tests/test/server.test.ts
  git commit -m "docs(storybook-addon): define the public preview contract"
  ```

### Remaining critical path

After Task 4, the release-critical dependency chain is Task 6 → Task 7 → Task 8:
compiled exports first, then tarball control, then the isolated packed consumer.
Task 5 may run in parallel with Task 6 because it prepares reusable acceptance
coverage, but it does not block Task 7 and must not grow into a second
workspace-only release suite. Task 8 is the convergence point: it consumes both
the controlled archive and Task 5's acceptance specification.

### Task 5: Make release acceptance reusable and close browser-visible gaps

**Files:**

- Modify:
  `packages/storybook-addon-visual-tests/test/fixtures/project/src/visual-fixture.stories.tsx`
- Modify: `packages/storybook-addon-visual-tests/test/smoke/addon.spec.ts`
- Modify: supporting fixture files under
  `packages/storybook-addon-visual-tests/test/fixtures/project/`

- [x] **Step 1: Separate the acceptance specification from fixture startup**

  Keep the current workspace-source fixture as a thin development smoke, but
  structure its browser-visible scenarios so Task 8 can run the same acceptance
  specification against the installed tarball. Fixture startup, package
  resolution, and archive isolation belong to the harness; public workflow
  assertions must not be copied into a second suite.

- [x] **Step 2: Add one browser-visible case at a time**

  Prioritize release-visible gaps:

  1. changed pixels with baseline/candidate/diff review;
  2. disabled story with no candidate;
  3. viewport framing at exactly `1280x720`;
  4. story outside `storyRoots`;
  5. stale approval rejection;
  6. malformed baseline metadata;
  7. cancellation without an approval-capable partial result;
  8. browser-launch or connection failure with actionable text;
  9. static Storybook panel unavailable state;
  10. testing-widget run-all over at least two stories, including one
      disabled/error result, with correct aggregate completion.

  Content framing already has a browser smoke assertion; viewport framing does
  not. Do not duplicate unit-only cases unless their manager projection or
  filesystem effect is part of the public contract.

- [x] **Step 3: Record evidence before changing production code**

  ```bash
  pnpm --filter storyproof test:visual --grep "<case>"
  ```

  Existing behavior may already pass because unit tests cover several of these
  paths. Record the result. Require a red reproduction before a production fix,
  but do not manufacture a product failure when only browser coverage is missing.

- [x] **Step 4: Make the minimal behavior or fixture change**

  Change production code only for an evidenced defect. Otherwise add the fixture
  state and browser assertion needed to expose the existing public behavior.

- [x] **Step 5: Run the full addon verification**

  ```bash
  pnpm --filter storyproof test
  pnpm --filter storyproof test:visual
  pnpm --filter storyproof typecheck
  pnpm --filter storyproof lint
  ```

  Expected: all pass.

- [x] **Step 6: Commit**

  ```bash
  git add packages/storybook-addon-visual-tests/test \
    packages/storybook-addon-visual-tests/src
  git commit -m "test(storybook-addon): reuse public workflow acceptance"
  ```

## Chunk 3: Validate the package boundary inside the monorepo

### Task 6: Produce compiled ESM and declarations

**Files:**

- Modify: `packages/storybook-addon-visual-tests/package.json`
- Create: `packages/storybook-addon-visual-tests/tsconfig.build.json` or the
  selected minimal build-tool configuration
- Modify: `packages/storybook-addon-visual-tests/turbo.json`
- Modify: `packages/storybook-addon-visual-tests/src/preset.ts`
- Test: package export-resolution tests under
  `packages/storybook-addon-visual-tests/test/`

- [x] **Step 1: Add a failing built-export resolution test command**

  Add `pack:artifact -- <absolute-tgz-path>` as the single-purpose archive
  creator used by later tasks. Add `test:exports -- <absolute-tgz-path>` that
  installs a supplied package artifact into a minimal temporary Node project and
  asserts that the root, manager, preset, and preview exports resolve to
  JavaScript while their declaration targets exist under `dist`. The test must
  never pack implicitly and must reject resolved `.ts`/`.tsx` source and
  workspace paths.

- [x] **Step 2: Run the test and verify failure**

  ```bash
  pnpm --filter storyproof pack:artifact -- \
    /tmp/storybook-addon-visual-tests/export-red.tgz
  pnpm --filter storyproof test:exports -- \
    /tmp/storybook-addon-visual-tests/export-red.tgz
  ```

  Expected: assertion failure because current exports resolve to raw TypeScript
  source and declarations under `dist` do not exist. A missing script is not an
  acceptable red result.

- [x] **Step 3: Add the smallest build pipeline**

  Emit ESM and declarations while preserving separate manager, preview, preset,
  and Node/shared modules. Exclude tests, stories, temporary artifacts, and
  package-private configuration. Ensure the compiled preset resolves compiled
  manager and preview files. Declare `dist/**` as this package's Turborepo build
  output so a cached build restores the distributable.

- [x] **Step 4: Point exports at built output**

  Add explicit `types` and `import` conditions. Do not export internal Node
  modules unless a public consumer requirement exists.

- [x] **Step 5: Verify build and package checks**

  ```bash
  pnpm --filter storyproof build
  pnpm --filter storyproof pack:artifact -- \
    /tmp/storybook-addon-visual-tests/export-green.tgz
  pnpm --filter storyproof test:exports -- \
    /tmp/storybook-addon-visual-tests/export-green.tgz
  pnpm --filter storyproof typecheck
  pnpm --filter storyproof test
  pnpm --filter storyproof lint
  ```

  Expected: all pass and `dist` contains only intended runtime/declaration
  output.

- [x] **Step 6: Commit**

  ```bash
  git add packages/storybook-addon-visual-tests
  git commit -m "build(storybook-addon): emit public package artifacts"
  ```

**Deviation (2026-07-26):** by owner decision, the bespoke
`scripts/build.mjs` (a `tsc -p tsconfig.build.json` wrapper) was replaced
with **tsdown**, configured in `tsdown.config.ts`, with **publint** and
**attw** (`@arethetypeswrong/core`, `profile: "esm-only"`) run as build-time
gates instead of the separate `test:exports` isolated-consumer script. The
guarantee this task shipped is unchanged — compiled ESM and declarations at
exactly `dist/index.js`, `dist/manager.js`, `dist/preset.js`, `dist/preview.js`
and their `.d.ts` siblings, with `preset.ts`'s compiled-vs-source directory
detection intact — only the mechanism producing and verifying it changed.
attw replaces the _static_ half of `test:exports`'s isolated-project
resolution check — type/exports-map resolution across module systems —
but attw never imports or executes the package. The _runtime_ half
(`import()`ing the `/preset` entry and asserting
`managerEntries()`/`previewAnnotations()` resolve to real `dist/manager.js`
and `dist/preview.js` at runtime) is covered by
`test/pack-inventory.test.ts` (Task 7), which imports the built
`dist/preset.js` directly after `pnpm build` — not through an isolated
consumer install: `preset.ts` resolves both entries purely from its own
`import.meta.url`, never through `node_modules` resolution, so a real
package-manager install (and the network/`playwright`-download cost that
comes with it) proves nothing a direct import doesn't already prove for this
specific code path. Genuine `node_modules`-resolution and end-to-end
behavior against an installed package is Task 8's concern, not a packaging
unit test's. This also moved TypeScript to
**7.0.2** (exact) as the sole `typescript` devDependency, replacing
`@typescript/native-preview`, with `isolatedDeclarations` scoped to
`tsconfig.build.json` (the build surface only, so tsdown's `.d.ts` generation
takes the oxc-transform backend — TypeScript 7.0 ships no programmatic
compiler API, so tsdown's TS-compiler fallback path is unusable until 7.1;
the documented escape hatch, if oxc's isolatedDeclarations proves
insufficient for some future file, is aliasing `typescript` to
`npm:@typescript/typescript6` — the highest published compatible version at
this writing is `6.0.2`, not `6.0.3`). `typecheck` is now plain
`tsc --noEmit` (dropping the `tsgo` binary name, which TypeScript 7 no
longer ships under).

**Deviation (2026-07-27):** by owner decision, `tsdown.config.ts` sets
`exports: true`, deriving `package.json`'s `exports` map from the `entry`
list above instead of hand-syncing both. This was evaluated, rejected, and
then adopted in the same session as evidence came in — recorded here in
full because the reasoning matters more than the back-and-forth:

- **What actually changes.** tsdown 0.22.14 emits bare-string subpath
  targets (`".": "./dist/index.js"`, not
  `{"types": "./dist/index.d.ts", "import": "./dist/index.js"}`) and
  unconditionally adds `"./package.json": "./package.json"`
  (`exports.packageJson` defaults to `true`).
- **Why the bare-string shape is correct, not a regression.** This package
  is permanent ESM-only intent (see root AGENTS.md) — no CJS output is ever
  planned. For a pure-ESM package, TypeScript resolves the sibling
  `dist/*.d.ts` next to the bare-string target implicitly; an explicit
  `"types"` condition only matters for consumers on `moduleResolution: node`,
  who cannot read an `exports` map at all regardless. attw's `esm-only`
  profile (already a build-time gate above) is the authority on exactly this
  resolution question and reports zero problems against the generated shape.
  The added `"./package.json"` export is additive and commonly recommended
  so tooling can read the manifest.
- **Why "it's already published" doesn't gate this decision.**
  `storyproof@0.0.1-alpha.1` (Task 9) is a name-reservation placeholder under
  the `alpha` dist-tag with zero consumers — its own README says outright it
  isn't a usable release. A resolution-contract change here costs nothing
  until real users exist, which is exactly what the `0.1.0-next.*`
  prerelease gate (Task 11) exists to manage. Treating an unconsumed alpha
  as a frozen contract was the error in the first rejection of this change.
- **`customExports` was considered and rejected.** tsdown's `customExports`
  callback could reconstruct the old `{types, import}` object shape, but
  that only relocates the duplication into `tsdown.config.ts` instead of
  deriving it from `entry` — no improvement over hand-authoring, and it
  would still need `packageJson: false` to suppress the added export for no
  real benefit.
- **Byte-stability, verified.** `pnpm --filter storyproof build` run twice
  in a row reproduces `package.json` byte-for-byte; the generated manifest
  is committed. This means the `package` CI job's existing
  `git diff --exit-code` (after packing, which always rebuilds via
  `prepack`) now also functions as a drift gate: editing `entry` without
  rebuilding and committing the result fails CI.
- **`test/build-contract.test.ts` updated, then deleted (2026-07-27,
  owner call).** It was first updated to assert the new shape directly
  (`toEqual` against the five expected bare-string entries) rather than the
  old `{types, import}` object form. On reflection it — and separately,
  `test/identifier-contract.test.ts` (Task 1) — were both change-detector
  tests: each read a config value or constant and asserted it against a
  hardcoded copy of itself, which can only fail when someone edits the
  thing (who already knows they did) and never catches a real defect.
  Packaging correctness is verified behaviorally instead: publint and attw
  (build-time gates), `test/pack-inventory.test.ts` (a real pack asserting
  real shipped files and entry points), and the packed-consumer CI matrix
  (Task 8 — a real project installs the tarball and Storybook loads the
  addon through those exports). The identifier scan for legacy
  (`llame`/`@workspace`) branding was a rebrand-migration guard, made moot
  by the 2026-07-26 extraction into this package's own repository. Neither
  test was replaced with a substitute assertion or snapshot.

### Task 7: Control and inspect the npm tarball

**Files:**

- Modify: `packages/storybook-addon-visual-tests/package.json`
- Create: a tarball-inventory assertion under
  `packages/storybook-addon-visual-tests/test/consumer/`

- [x] **Step 1: Reuse the artifact producer and add a read-only inspector**

  Reuse Task 6's `pack:artifact -- <absolute-tgz-path>` as the only command that
  creates an archive. Add `test:pack -- <absolute-tgz-path>` as a read-only
  inspector that rejects source, tests, stories, `.turbo`, `test-results`,
  temporary Storybook output, candidate/diff images, internal agent/design
  documents, or an archive over the explicit size budget. `test:pack` must never
  rebuild or repack.

  Implemented as a positive allowlist check (`scripts/pack-inventory.mjs`):
  every tarball entry must resolve to `package/dist/**`, `package/LICENSE`,
  `package/README.md`, or `package/package.json`, which by construction rejects
  every category above without a separate blocklist to keep in sync. Every
  entry's path segments must be canonical (never empty, `.`, or `..`) _before_
  that allowlist check runs — otherwise a member name such as
  `package/dist/../../AGENTS.md` passes a naive `startsWith("package/dist/")`
  prefix test while its resolved path escapes `dist` entirely. Entry names are
  taken verbatim from `tar -tzf`, never trimmed, since trimming would let a
  real archive entry with a leading/trailing space (a valid tar filename,
  though npm/pnpm pack never produce one) collide with — and pass as — the
  canonical name it merely resembles after trimming. The allowlist only bounds
  the archive from above, so a second check (`findMissingRequiredEntries`)
  bounds it from below: LICENSE, README.md, package.json, and at least one
  `dist` entry must all be present, or the inspector fails naming what is
  missing — otherwise an allowlisted-but-empty archive (e.g. just
  `package.json`) would pass. Size is checked separately against
  `MAX_PACKED_ARCHIVE_SIZE_BYTES` (150 KiB packed); this catches bloat _within_
  the allowlist (a stray asset in `dist`, a runaway sourcemap) — the allowlist
  itself, not the size budget, is what catches a real source/test/docs leak,
  since gzip can compress a leaked text tree back under the budget. Entry
  listing shells out to the system `tar -tzf` (present on Ubuntu 24.04 and
  macOS), a new non-JS tool dependency in the release path worth Task 10's CI
  awareness.

- [x] **Step 2: Verify the current package fails**

  **Deviation (2026-07-26):** this step assumed the `files` allowlist did not
  yet exist. It landed early with the manual `0.0.1-alpha.1` name-claim publish
  (Task 9 Step 2's deviation note), so the real package already packs clean —
  running `pack:artifact` + `test:pack` against the current package produces a
  passing (not failing) result:

  ```bash
  pnpm --filter storyproof pack:artifact -- \
    /tmp/storybook-addon-visual-tests/pack-baseline.tgz
  pnpm --filter storyproof test:pack -- \
    /tmp/storybook-addon-visual-tests/pack-baseline.tgz
  # /tmp/storybook-addon-visual-tests/pack-baseline.tgz: 83 entries, 46311
  # bytes (within 153600-byte budget)
  ```

  A missing script is still not an acceptable red result, so the red evidence
  instead comes from the inspector's own test suite
  (`test/consumer/pack-inventory.test.mjs`, `test/consumer/test-pack.test.mjs`):
  before the inspector exists, every case that calls it fails for the expected
  "module not found" / "not a function" reason (one CLI-level case — the
  "archive is untouched" assertion — passes trivially regardless, since it
  does not depend on the inspector existing). Once implemented, a
  negative-control fixture — a synthetic tarball containing
  `package/src/index.ts`, `package/test/runner.test.ts`,
  `package/.turbo/turbo-build.log`, `package/AGENTS.md`,
  `package/docs/2026-07-24-public-preview-release-plan.md`, and
  `package/__screenshots__/story/candidate.png` alongside legitimate entries —
  proves the inspector rejects a polluted archive and names every offending
  entry; a second fixture with only allowlisted entries but incompressible
  random content over budget proves the size gate independently; and two more
  fixtures (metadata with no `dist`, and `dist` with no LICENSE) prove the
  required-entries lower bound independently of the allowlist.

- [x] **Step 3: Add a strict `files` allowlist and `prepack` gate**

  Ship only compiled output, README, package metadata required by npm, and
  LICENSE when present. Task 9 adds the license and makes its presence mandatory
  before publication.

  The `files` allowlist (`dist`, `LICENSE`, `README.md`) already existed (see
  Step 2's deviation note) and needed no widening — the inspector found no
  leak. Added `"prepack": "pnpm build"`: `pnpm pack` (and therefore
  `pack:artifact`) always runs the package's lifecycle `prepack` script first,
  confirmed empirically before implementation, so a stale or missing `dist`
  can never be packed. `prepack` intentionally does not run `test:pack` —
  `pnpm pack` already invokes `prepack`, so a `prepack` that itself packed
  would recurse; the correct minimal gate is build-before-pack, with
  inspection as a separate, explicit step.

- [x] **Step 4: Inspect the resulting archive**

  ```bash
  pnpm --filter storyproof pack:artifact -- \
    /tmp/storybook-addon-visual-tests/pack-green.tgz
  pnpm --filter storyproof test:pack -- \
    /tmp/storybook-addon-visual-tests/pack-green.tgz
  # /tmp/storybook-addon-visual-tests/pack-green.tgz: 83 entries, 46311 bytes
  # (within 153600-byte budget)
  ```

  Expected: the assertion inspects the supplied archive without mutating it,
  every file is allowlisted, and the archive stays within the documented size
  budget. Confirmed: about 46 kB packed (46,311 bytes on the measuring run;
  pack output is not byte-deterministic), comfortably under the 150 KiB
  (153600 byte) budget, which keeps more than 3x headroom over the measured
  baseline for legitimate growth while still catching a real leak.

- [x] **Step 5: Commit**

  ```bash
  git add packages/storybook-addon-visual-tests/package.json \
    packages/storybook-addon-visual-tests/test/consumer
  git commit -m "build(storybook-addon): constrain the published tarball"
  ```

**Deviation (2026-07-26):** by owner decision, the bespoke
`scripts/pack-inventory.mjs` allowlist plus its `test:pack`/`test:exports`
CLI scripts and `test/consumer/*.test.mjs` unit tests were replaced with one
conventional vitest test, `test/pack-inventory.test.ts`. It packs the
package itself (`pnpm pack --json --pack-destination <tmpdir>`, which always
reruns `build` via `prepack` first, so a stale `dist` still can never be
packed) and asserts the resulting file list is exactly `dist/**` plus
`LICENSE`, `README.md`, and `package.json`, that the four public entry
points and their declarations are present, and that the tarball stays under
the same 150 KiB budget. The traversal/canonical-path-segment hardening the
old allowlist needed (`hasCanonicalSegments`, rejecting entries like
`package/dist/../../AGENTS.md`) is no longer necessary: that hardening
existed because the old test parsed raw `tar -tzf` entry names, which an
adversarial archive could craft; the new test reads `pnpm pack --json`'s own
file list, which pnpm derives directly from its `files` allowlist resolution
against the real filesystem, not from parsing archive member names. The
guarantee is unchanged — nothing but the allowlisted entries ships, within
budget — only the mechanism (and the entry-name attack surface it needed to
defend against) changed. The exact packed-size baseline moved slightly, from
about 46 kB to about 53 kB (still measured non-deterministically), because
tsdown's bundled output now includes a shared chunk file and updated
sourcemap content shape versus the old per-module `tsc` emission; the 150
KiB budget was not changed and still keeps comfortable headroom.

A second test restores the one runtime guarantee the deleted
`scripts/test-exports.mjs` carried that nothing else in this PR replaced:
it runs `pnpm build`, then `import()`s the built `dist/preset.js` directly,
asserting `managerEntries()`/`previewAnnotations()` resolve to real,
existing `dist/manager.js`/`dist/preview.js` files — never `.ts`/`.tsx`
source. This is the only place in the surviving suite that exercises
`preset.ts`'s `compiled === true` branch: `test/server.test.ts` imports
`src/preset.ts` directly, so it only ever runs the source-mode branch, and
attw's resolution analysis is static and never imports the package.

An earlier version of this test installed the packed tarball into an
isolated consumer project via a real `pnpm add` before importing the
preset, mirroring `test-exports.mjs`'s approach — deliberately, but
unnecessarily: `preset.ts` resolves both entries purely from its own
`import.meta.url` (see `src/preset.ts`), never through `node_modules`
resolution, so the install proved nothing a direct import of the build
output doesn't already prove for this code path, at the cost of a real
network-dependent package-manager install (resolving `playwright` and the
addon's other runtime deps) inside a unit test — which is also what pushed
the test past vitest's default timeout on one Node minor in CI and not
another. Genuine installed-package `node_modules` resolution belongs to
Task 8's real external-project harness, not a packaging unit test.

### Task 8: Run an in-repo fixture outside the workspace

**Files:**

- Create: `packages/storybook-addon-visual-tests/test/fixtures/consumer/`
- Create: `packages/storybook-addon-visual-tests/test/consumer/`
- Modify: `packages/storybook-addon-visual-tests/package.json`
- Modify: `packages/storybook-addon-visual-tests/playwright.config.ts`
- Modify: `packages/storybook-addon-visual-tests/turbo.json`

- [x] **Step 1: Create a minimal React-Vite Storybook fixture template**

  Keep fixture dependencies explicit. It must not reference `workspace:*`,
  root catalogs, llame source aliases, or a TypeScript runtime loader for addon
  code.

- [x] **Step 2: Add the executable `test:consumer -- <absolute-tgz-path>` harness**

  The fixture template lives in-repo, but execution must:

  1. create a directory with `mktemp -d` under `/tmp`;
  2. use the repository's pinned Corepack/pnpm version;
  3. copy only the consumer fixture template;
  4. receive the absolute path of the exact `.tgz` created by `pack:artifact`;
  5. install that archive through an absolute `file:` dependency;
  6. install Playwright Chromium for the fixture;
  7. assert the resolved addon package and every public export live below the
     temporary project's `node_modules`, never the llame workspace;
  8. run Storybook dev, browser acceptance, and Storybook static build;
  9. clean the temporary directory on success, failure, and interruption.

- [x] **Step 3: Prove workspace-isolation detection with a negative control**

  Point a dedicated negative-control fixture dependency at the workspace package
  rather than the supplied archive and assert that the harness rejects its
  resolved path before starting Storybook. Restore the real fixture immediately;
  this validates the isolation guard without inventing a product defect that
  Task 6 already fixed. Run:

  ```bash
  pnpm --filter storyproof test:consumer:negative
  ```

  Expected: a specific assertion identifies the workspace-resolved addon.
  Harness/bootstrap failure is not an acceptable result.

  **Superseded by the 2026-07-27 deviation below**: there is no separate
  negative-control fixture. CI copies an example out of the workspace before
  any install has happened, installs the packed tarball there, and asserts
  `import.meta.resolve('storyproof')` resolves under that copy's own
  `node_modules` — a positive assertion of the thing that matters, not a
  simulated failure of a defect Task 6 already fixed.

- [x] **Step 4: Run the reusable acceptance specification against the tarball**

  Run Task 5's browser-visible specification without copying it. Cover dev
  startup, run, review, approve, changed diff, rerun pass, and static-build
  unavailable behavior. Through the installed manager/provider exports, initiate
  testing-widget run-all over at least two stories, include one disabled/error
  result, and assert aggregate completion.

- [x] **Step 5: Run the complete package gate**

  Rewritten for the Task 6/7 tsdown migration (`pack:artifact`/`test:exports`/
  `test:pack`/`test:consumer` no longer exist):

  ```bash
  pnpm --filter storyproof build
  pnpm --filter storyproof pack --out /tmp/storyproof-ci/package.tgz
  pnpm --filter storyproof test
  VISUAL_TEST_PROJECT_DIR=<copy of an example, outside the workspace> \
    pnpm --filter storyproof test:visual
  pnpm --filter storyproof typecheck
  pnpm --filter storyproof lint
  ```

  Expected: the acceptance suite (`test:visual`) runs against the packed
  archive once it is installed into a copy of an example made outside this
  workspace (see the deviation note); the two fault-injection-only
  scenarios (simulated hang, forced connection failure) skip on that copy
  since it carries no `control/` fixture, and pass unmodified against
  `test/fixtures/project` in the `visual` job.

- [x] **Step 6: Run the target combination locally**

  Parameterize the consumer harness over the Storybook 10.0 and 10.5
  boundaries and both supported framework integrations (react-vite and
  nextjs-vite) under Node 22. Assert installation emits no unexpected
  peer-dependency warnings. This proves the harness locally; Task 10 owns the
  Ubuntu 24.04 CI matrix evidence (including Node 24) and final support
  wording.

  **Superseded by the CI matrix below**: this WSL2 development host cannot run
  Playwright (missing browser system libraries), so "locally" is the CI
  `consumer` job's three matrix cells (react-vite-sb10.5, react-vite-sb10.0,
  nextjs-vite-sb10.5) rather than a developer machine command. The published
  package's `peerDependencies.storybook` is `"^10.5.0"`, narrower than the
  release plan's `^10.0.0` target — real packed-consumer evidence for Task 10
  to reconcile when it finalizes peer ranges. With examples now on
  `storyproof: workspace:*` (see the deviation note), pnpm does not surface
  an unmet-peer warning for a workspace-linked dependency in the local dev
  loop — but the `consumer` job's copy-out-of-tree install (`pnpm pkg set
dependencies.storyproof=file:<tarball>` then `pnpm install
--ignore-workspace`, verified empirically against a `react-vite-sb10.0`
  copy) is a fully standalone `file:` install again, and the warning
  reappears there exactly as it did when the example depended on the
  published version directly. The `consumer` job's own output is therefore
  still the canonical evidence for Task 10, unaffected by the local dev-loop
  change.

- [x] **Step 7: Commit**

  ```bash
  git add packages/storyproof examples pnpm-workspace.yaml .github/workflows/ci.yml
  git commit -m "test(storyproof): verify the packed consumer boundary"
  ```

**Deviation (2026-07-27):** by owner decision, this task shipped without any
bespoke orchestrator script (`test:consumer`, `pack:artifact`, a
`test/consumer/` harness) or a separate `test/fixtures/consumer/` template —
consistent with Task 6/7's replacement of hand-rolled build/pack/verify
scripts with conventional tooling. This section also records two reversed
intermediate decisions in full, because the reasoning is durable even though
the specific calls it corrects aren't worth re-litigating in future PRs.

- **Examples are workspace members for development; CI proves the packed
  artifact by copying out.** Root `examples/react-vite-sb10.5`,
  `examples/react-vite-sb10.0`, and `examples/nextjs-vite-sb10.5` are real
  pnpm workspace members (`examples/*` added to `pnpm-workspace.yaml`)
  depending on `storyproof: workspace:*`, matching how comparable projects
  (loki, Vite's own playgrounds) link their examples: a contributor who
  clones the repo, runs `pnpm install` at the root, and `cd`s into an
  example sees their own working tree, not a stale published build. That
  link proves nothing about the packed npm tarball, which is Task 8's actual
  subject, so the `consumer` CI job copies an example directory _out_ of the
  workspace (`cp -r`, before any `pnpm install` has run anywhere in the
  checkout, so the copy carries no node_modules of any kind) into a
  `mktemp -d` temporary directory, points it at the exact tarball the
  `package` job built (`pnpm pkg set dependencies.storyproof=file:<tarball>`
  — a first-class pnpm command, no script or JSON surgery), and installs it
  there with `pnpm install --ignore-workspace`. Being outside the repository
  (and thus outside the pnpm workspace) is what makes the install meaningful
  and doubles as the isolation guarantee — see the negative-control note
  below. An earlier version of this task had examples depend directly on the
  published `storyproof@0.0.1-alpha.1` with CI overlaying the tarball
  in-place; that was corrected because it meant a contributor's local
  `pnpm storybook` would run against an old published build instead of their
  own changes, which defeats an example's purpose as a dev loop.
- **Examples carry the full scenario story set, organized as
  documentation-by-example, minus fault injection.** For a visual-testing
  tool, the edge cases are the product: a developer who clones an example
  and finds a stale-approval rejection, a malformed baseline, a story
  outside `storyRoots`, disabled capture, viewport-vs-content framing, and
  portal capture learns what the addon actually does, which two demo
  buttons would not teach. Each example therefore carries both a plain demo
  (`Button` / `NavLink`) _and_ the same `visual-fixture`/`outside-fixture`
  scenario stories as `test/fixtures/project` — every scenario story carries
  a short code comment describing what it demonstrates and what storyproof
  should do, and `.storybook/preview.ts`'s `storySort` orders the sidebar so
  the plain demo reads first. Fault injection (the `control/state.json`
  -driven simulated hang and forced connection-failure story) is the one
  exclusion: that's harness machinery that would be nonsense in a demo
  project ("here's a story that deliberately breaks the capture"), so it
  stays only in the workspace's `test/fixtures/project`, exercised by the
  existing `visual` job. An earlier version of this task considered running
  a reduced "core" acceptance suite against the examples (split by
  precondition from a "scenario" suite covering fault injection) to avoid
  duplicating the elaborate stories into a "quickstart" — corrected in favor
  of just putting the full non-fault-injection scenario set in the examples
  directly once it was clear the scenarios are documentation value, not test
  scaffolding to hide.
- **`registerAddonAcceptanceSuite`'s two fault-injection tests skip on
  precondition, not on a CI-side filter.** Since examples carry no
  `control/` fixture, `test/acceptance/addon-suite.ts` gained a
  `hasControlFixture(projectRoot)` check (existence of
  `control/state.json`): the two tests requiring the `Controlled` story
  (`"cancels completed partial results..."`, `"reports a browser connection
failure..."`) call `test.skip(!(await hasControlFixture(projectRoot)), ...)`,
  and `resetFixtureState`'s per-test control-state write is skipped
  the same way. This keeps the suite in one file with one set of
  preconditions per test, visible as explicit skips in the Playwright report
  rather than a title-matched `--grep-invert` filter in CI YAML (which would
  silently stop enforcing coverage if a test were ever retitled).
- **Artifact reuse from the `package` job.** The existing `package` CI job
  uploads the tarball it already builds (`actions/upload-artifact`); the new
  `consumer` job downloads that exact archive rather than repacking.
- **`--ignore-workspace` is required, empirically confirmed**, for the
  temporary copy's `pnpm install`: a plain `pnpm install` run inside a
  directory that still has an ancestor `pnpm-workspace.yaml` silently no-ops
  (reports "Scope: all N workspace projects" / "Done" without installing
  anything for that directory), and a plain `pnpm add` there resolves
  against and rewrites the _root_ `pnpm-lock.yaml` instead of the target
  directory's own. The `mktemp -d` copy has no such ancestor once it's
  actually outside the repository, but the flag is kept for defense in
  depth against exactly the workspace-bleed this job exists to rule out.
- **No smoke/full tiering, no test tagging.** `registerAddonAcceptanceSuite`
  runs as one suite everywhere; what varies is which tests are eligible
  given each target's fixture content (see the precondition-skip note
  above), not a tier or a tag.
- **No negative-control fixture.** Copying out of the workspace before any
  install has happened anywhere in the checkout is itself the isolation
  proof: there is nothing for a resolved dependency to symlink back to
  source even if the packed tarball were somehow broken, so the CI job's
  one assertion — `import.meta.resolve('storyproof')` resolves under the
  copy's own `node_modules` — is a positive check of the thing that matters,
  not a simulated failure of a defect Task 6 already fixed.
- **Single Node version in the `consumer` matrix** (the `.node-version`
  floor): Node 22/24 coverage is already proven by the `test` and `visual`
  jobs; this matrix's only dimension is Storybook minor × framework
  integration, per the release plan's stated scope for Task 8.

**Defect found and fixed by this task's harness (2026-07-27):** the first
real `consumer` run failed on all three matrix cells — every scenario
timed out waiting for the "Visual tests" tab to appear. Root-caused (not
guessed at) by loading the manager UI in an actual browser, something no
prior CI job or test had ever done: `src/manager.tsx`'s automatic JSX
transform compiles `dist/manager.js` to import `react/jsx-runtime`, and
Storybook's manager builder does not extend its `"react"`/`"react-dom"`
global-aliasing to that subpath, so a fresh copy gets bundled per addon
whose `ReactSharedInternals` is never initialized by a matching React
build — throwing `Cannot read properties of undefined (reading
'recentlyCreatedOwnerStacks')`, a React 19 dev-mode-only internal field,
the instant the panel tried to render. Confirmed present regardless of
package manager or install topology (reproduced identically via
`workspace:*`, a packed tarball installed with pnpm, and the same tarball
installed with npm) — it is purely about loading the _compiled_ manager
entry through _any_ normal package resolution, which only Task 8's
harness ever exercised; `test/fixtures/project` bypasses `dist/` entirely
via a source-relative `import.meta.resolve`. This means the addon's
manager UI has likely never worked for a real installed consumer. Fixed
in `tsconfig.build.json` (`"jsx": "react"`, scoped to the build surface,
not the root tsconfig which stories/tests still need on the automatic
runtime) — see the package CHANGELOG's `Fixed` entry for the full
diagnosis and fix rationale. Verified fixed against both framework
integrations by loading the manager UI directly (Chrome browser
automation, not Playwright — this development host cannot run Playwright)
before and after the change.

**Second defect found by the same harness (2026-07-27):** with the
jsx-runtime crash fixed, `consumer(react-vite-sb10.0)` still failed —
`react-vite-sb10.5` and `nextjs-vite-sb10.5` passed. The panel rendered
completely (confirmed by loading it directly, not inferred from the test
failure): the failure was a real accessibility defect, not a rendering
one. `PanelView.tsx`'s and `TestProviderRow.tsx`'s icon-only Run/Stop
buttons name themselves solely via `storybook/internal/components`'
`Button`'s `ariaLabel` prop. That prop does not exist on Storybook
10.0.8's `Button` at all — confirmed by grepping its shipped `dist/`
directly (zero occurrences, versus 49 in 10.5.4's, one of them a
Storybook-11 deprecation notice for the prop's later replacement) — so the
buttons rendered with no accessible name on exactly the floor version this
package claims to support, `^10.0.0`. Fixed by adding a visually-hidden
text child (the standard clip-rect pattern) to every icon-only button in
both files, so the accessible name comes from real text content
independent of whether the host `Button` recognizes `ariaLabel` at all;
`ariaLabel` is kept too since newer Storybook already deprecates omitting
it. See the package CHANGELOG's `Fixed` entry for the full diagnosis.
Verified via the accessibility tree (`getAttribute('aria-label')` /
`textContent`-derived accessible name), not just the failing test's
selector, on both the 10.0.8 floor and the 10.5.x ceiling.

**The pattern, stated plainly:** neither defect was visible to publint,
attw, the unit suite, or a Playwright run against `test/fixtures/project`
compiled straight from source — all of which passed throughout. Both
required a real packed install, loaded through a real browser's
accessibility tree, on the actual floor Storybook version, to surface at
all. That is the argument for keeping the `consumer` matrix a required CI
gate rather than an optional or advisory one: it is currently the only
check in this repository capable of catching this entire class of defect.

## Chunk 4: Prepare and publish the preview

### Task 9: Add public metadata, license, and release documentation

**Files:**

- Modify: `packages/storybook-addon-visual-tests/package.json`
- Modify: `packages/storybook-addon-visual-tests/README.md`
- Create: `packages/storybook-addon-visual-tests/LICENSE` or use the repository
  root license if its grant and npm inclusion are explicit
- Create: package-specific changelog/release notes only if the chosen release
  process requires them

- [ ] **Step 1: Choose the final package name and license**

  The name is decided: **`storyproof`**, published unscoped (not
  `storybook-addon-storyproof`; the catalog requires the `storybook-addons`
  keyword, not a name prefix). `storyproof.dev` is registered to the author;
  `storyproof.js.org` is claimed only once a content-bearing docs page exists.
  The license is decided too: MIT, with the grant text committed at
  `packages/storybook-addon-visual-tests/LICENSE` and `"license": "MIT"`
  recorded in `package.json`; Task 7's tarball inventory must assert the
  LICENSE file ships in the archive. Remaining in this step: verify the
  authenticated npm identity and package access — registry lookup alone does
  not prove publish permission. The `storybook.icon` metadata URL
  (`https://storyproof.dev/icon.svg`) must resolve to a real asset before
  publication.

- [ ] **Step 2: Complete npm metadata**

  Add version, description, keywords, repository/directory, homepage, bugs,
  author/contributors as appropriate, engines, license, and
  `publishConfig.access: "public"`. Deviation from the original sequencing,
  by owner decision (2026-07-26): `private: true` was removed early and a
  `0.0.1-alpha.1` placeholder published manually to acquire the npm name
  before the release gates exist. The placeholder ships only
  `dist`/`LICENSE`/`README.md` via a minimal `files` allowlist and must be
  published under the `alpha` dist-tag, never `latest`. Task 7's inventory
  gate and Task 10's protected workflow still govern the real preview
  release; nothing else may publish until they exist.

  **The implication, stated explicitly so it doesn't get re-litigated:**
  `0.0.1-alpha.1` is a name reservation, not a contract. It has zero known
  consumers, is unreachable except by explicit exact-version install (no
  `latest`, no `^`/`~` range would resolve to it as a default), and its own
  README says outright it isn't a usable release. Breaking changes to the
  addon's public shape (an `exports` map, a preset option, a peer range)
  are free to make until real users exist behind `0.1.0-next.*` and
  `0.1.0` — that's precisely what the prerelease gates in Tasks 10–11 exist
  to manage. Do not let "but it's already published" veto a decision on its
  own; if a change is otherwise correct, the alpha placeholder is not the
  reason to reject it. (This reasoning was learned the expensive way during
  Task 8: `exports: true` was rejected, then adopted, partly because of an
  initial over-weighting of this exact premise — see Task 6's 2026-07-27
  deviation note.)

- [ ] **Step 3: Rewrite onboarding around the packed consumer**

  Include installation, browser prerequisites, five-minute configuration,
  supported versions, trusted-interface warning, artifact ignores, Playwright
  upgrade/rebaseline policy, and troubleshooting.

- [ ] **Step 4: Verify registry and tarball metadata**

  ```bash
  npm whoami
  npm access list packages leon0399
  pnpm --filter storyproof pack:artifact -- \
    /tmp/storybook-addon-visual-tests/metadata.tgz
  pnpm --filter storyproof test:pack -- \
    /tmp/storybook-addon-visual-tests/metadata.tgz
  ```

  Expected: the publishing identity controls the target scope/package, package
  metadata validates, and LICENSE is present in the asserted real archive.

- [ ] **Step 5: Run all package checks**

  ```bash
  pnpm --filter storyproof build
  pnpm --filter storyproof pack:artifact -- \
    /tmp/storybook-addon-visual-tests/release-candidate.tgz
  pnpm --filter storyproof test:exports -- \
    /tmp/storybook-addon-visual-tests/release-candidate.tgz
  pnpm --filter storyproof test:pack -- \
    /tmp/storybook-addon-visual-tests/release-candidate.tgz
  pnpm --filter storyproof test
  pnpm --filter storyproof test:visual
  pnpm --filter storyproof test:consumer -- \
    /tmp/storybook-addon-visual-tests/release-candidate.tgz
  pnpm --filter storyproof typecheck
  pnpm --filter storyproof lint
  pnpm format:check
  ```

  Expected: all pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/storybook-addon-visual-tests
  git commit -m "chore(storybook-addon): prepare public preview metadata"
  ```

### Task 10: Add protected trusted publishing

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release-storybook-addon-visual-tests.yml`
- Modify: `packages/storybook-addon-visual-tests/package.json`
- Modify: `packages/storybook-addon-visual-tests/README.md`
- Modify: `packages/storybook-addon-visual-tests/docs/configuration.md`
- Modify: `packages/storybook-addon-visual-tests/docs/capture-contract.md`

- [ ] **Step 1: Make package and compatibility gates required in CI**

  For pull requests and canonical-branch pushes, one producer job builds and
  packs an archive once, records its SRI, and uploads it. Every inventory,
  exports, consumer, peer-warning, and compatibility job downloads that exact
  artifact by producing run/job identity and verifies the SRI before use. On
  an explicit `ubuntu-24.04` x64 runner, exercise the supported floor and
  current target — Node 22 and 24, Storybook 10.0 and 10.5, react-vite and
  nextjs-vite — without implying support outside those ranges. Every
  packed-consumer job must use one of the two supported Vite-based framework
  integrations, the bundled Chromium build, and direct loopback HTTP. These CI
  artifacts are test
  inputs only and must never be consumed by a privileged publication workflow.

- [ ] **Step 2: Finalize support metadata and remove `private`**

  After the required Ubuntu 24.04 CI matrix proves the target combinations,
  update peer ranges, the Node engine range, and documentation from target to
  verified support. Drop the `react` peer dependency: the manager consumes
  Storybook's bundled React, the preview bridge is renderer-agnostic, and
  `storybook` is the only real peer — before removing it, confirm the static
  manager build resolves the addon's React the same globalized way the dev
  manager does. `private: true` was already removed for the name-claim
  placeholder; this step verifies the final manifest instead. Rerun package
  checks and the required CI matrix on this final manifest before tagging.

- [ ] **Step 3: Add one protected tag-triggered release workflow**

  Run only for a protected package tag in the canonical repository. In one
  workflow run, verify the dereferenced tag commit and package version, build,
  pack the final archive exactly once, record its npm-compatible SRI, and run
  inventory, exports, consumer smoke, peer checks, and the full Ubuntu 24.04
  compatibility matrix against that archive. Every packed-consumer matrix job
  must exercise one of the two supported Vite-based framework integrations
  (react-vite or nextjs-vite), bundled Chromium, and direct loopback HTTP. A
  dependent publish job in the same run downloads the artifact by the producing
  job's artifact ID, verifies its SRI, requires environment approval, and
  publishes:

  ```bash
  npm publish <tested-artifact>.tgz --tag next --provenance
  ```

  Do not use `workflow_run`, accept an artifact from a pull-request run, rebuild,
  repack, or publish the package directory.

- [ ] **Step 4: Enforce workflow security**

  Set default `permissions: {}` or `contents: read`; grant `id-token: write`
  only to the publish job. Pin third-party actions to full commit SHAs, use
  pinned Node/npm versions that support trusted publishing, require protected
  package tags and the canonical repository owner, bind the artifact to the
  dereferenced tag SHA and successful producing jobs in the same workflow run,
  and ensure no `NPM_TOKEN` or equivalent long-lived registry credential is
  present.

- [ ] **Step 5: Validate workflow syntax and security**

  ```bash
  actionlint
  zizmor .github/workflows/
  ```

  Expected: no errors; any accepted warning is documented with a precise reason.

- [ ] **Step 6: Verify the release candidate locally**

  ```bash
  pnpm --filter storyproof pack:artifact -- \
    /tmp/storybook-addon-visual-tests/workflow-candidate.tgz
  pnpm --filter storyproof test:pack -- \
    /tmp/storybook-addon-visual-tests/workflow-candidate.tgz
  pnpm --filter storyproof test:exports -- \
    /tmp/storybook-addon-visual-tests/workflow-candidate.tgz
  pnpm --filter storyproof test:consumer -- \
    /tmp/storybook-addon-visual-tests/workflow-candidate.tgz
  git diff --exit-code
  ```

  Expected: controlled archive, green isolated consumer, clean generated state.

- [ ] **Step 7: Commit**

  ```bash
  git add .github/workflows/ci.yml \
    .github/workflows/release-storybook-addon-visual-tests.yml \
    packages/storybook-addon-visual-tests/package.json \
    packages/storybook-addon-visual-tests/README.md \
    packages/storybook-addon-visual-tests/docs
  git commit -m "ci(storybook-addon): add trusted preview publishing"
  ```

### Task 11: Publish and verify a prerelease

**Files:**

- Modify only version/release-note files required by the chosen release process.

- [ ] **Step 1: Cut a prerelease version**

  Use `0.1.0-next.0` or the equivalent agreed prerelease. Do not assign `latest`.

- [ ] **Step 2: Trigger the protected release workflow**

  Verify the workflow publishes the exact CI-tested `.tgz` with `--tag next`
  and provenance. It must not rebuild or repack.

- [ ] **Step 3: Install from the registry in a fresh fixture**

  Repeat the consumer smoke using `<package>@0.1.0-next.0`, not the local
  tarball. Also create a separate fresh npm-managed verification fixture with a
  `package-lock.json` using the pinned npm CLI.

- [ ] **Step 4: Verify dist-tag, integrity, metadata, and provenance**

  ```bash
  npm view storyproof@0.1.0-next.0
  npm view storyproof@0.1.0-next.0 dist.integrity
  npm dist-tag ls storyproof
  npm --prefix /tmp/storybook-addon-npm-verification audit signatures
  ```

  Expected: `next` points to the prerelease; `latest` is absent or unchanged;
  registry integrity exactly equals the recorded npm-compatible SRI of the
  tested artifact;
  metadata is correct; the pinned npm CLI verifies registry signatures and
  provenance. Installed export behavior is proven by Step 3, not `npm view`.

- [ ] **Step 5: Collect external installation feedback**

  Promote to `0.1.0` only after at least one clean project outside llame
  completes installation, capture, approval, and rerun.

## Chunk 5: Optional repository extraction

### Task 12: Extract only when independent maintenance is justified

**Files:**

- Create in the extracted repository: standalone `package.json`, pnpm workspace
  configuration if retained, lockfile, TypeScript/build/lint/test configuration,
  CI/release workflows, contribution/security files, and repository metadata.
- Modify package-relative scripts only where monorepo root tooling was previously
  inherited.

- [ ] **Step 1: Decide whether extraction has measurable value**

  Require a concrete independent lifecycle: separate maintainers, issue
  tracking, release cadence, or contributor audience. npm publication alone is
  not sufficient justification.

- [ ] **Step 2: Produce the candidate history**

  Prefer `git subtree split`; use `git filter-repo` when precise history
  filtering is required. Do not use deprecated `git filter-branch`.

- [ ] **Step 3: Scaffold the standalone repository**

  Generate and commit a standalone lockfile and every root configuration the
  package previously inherited. Do not claim the subtree alone is installable.

- [ ] **Step 4: Run release gates in the extracted checkout**

  ```bash
  pnpm install --frozen-lockfile
  pnpm run build
  pnpm run pack:artifact -- \
    /tmp/storybook-addon-visual-tests/extracted-candidate.tgz
  pnpm run test:exports -- \
    /tmp/storybook-addon-visual-tests/extracted-candidate.tgz
  pnpm run test:pack -- \
    /tmp/storybook-addon-visual-tests/extracted-candidate.tgz
  pnpm run test
  pnpm run test:visual
  pnpm run test:consumer -- \
    /tmp/storybook-addon-visual-tests/extracted-candidate.tgz
  pnpm run typecheck
  pnpm run lint
  pnpm run format:check
  ```

  Expected: the extracted repository passes without llame workspaces, catalogs,
  scripts, or aliases.

- [ ] **Step 5: Move publication authority deliberately**

  Update repository metadata, trusted-publisher configuration, tags, issue
  routing, and security reporting before the extracted repository becomes
  authoritative.

## Deferred feature backlog

These features are valuable only after the public package boundary is proven:

1. read-only CI runner and machine-readable output;
2. named viewport modes;
3. theme/global variants;
4. component/directory sidebar-scoped runs;
5. required-resource failure contracts;
6. capture phase selection;
7. deterministic masking/ignored regions;
8. Firefox and WebKit;
9. Storybook 9.x compatibility (floor 9.1 — 9.0 lacks the
   `experimental_devServer` hook; API presence registry-verified for 9.1.20,
   behavior unproven; support claim only if the packed-consumer acceptance
   passes unmodified);
10. non-React renderers (vue3-vite, svelte-vite — runtime plausibly works
    once the `react` peer is dropped, but capture framing and fixtures need
    per-renderer validation).

Each requires a separate design because it expands baseline identity, review
semantics, or execution topology. None belongs in the initial preview release.

## Revision history

- **v1 (2026-07-24):** Initial package-local public preview plan after the
  release-readiness sweep and executable-plan review.
- **v2 (2026-07-24):** Fixed round-1 refinement findings: corrected focused test
  commands; added preset-option validation, testing-widget run-all coverage, and
  cross-OS baseline-transfer evidence; assigned final `private` removal; replaced
  unsafe cross-workflow artifact reuse with a single protected tag workflow; and
  added an npm-lockfile signature-verification fixture.
- **v3 (2026-07-24):** Fixed round-2 refinement findings: added testing-widget
  run-all to the packed consumer; specified complete runtime option validation;
  made one-OS support the deterministic portability fallback; separated the
  local transfer-harness negative control from real cross-OS CI evidence; and
  required one CI producer artifact with SRI verification in every matrix job.
- **v4 (2026-07-25):** Addressed PR review feedback by separating strict runtime
  branding checks from temporarily workspace-scoped fixtures and making
  React-Vite, bundled Chromium, and direct loopback HTTP mandatory invariants in
  every packed-consumer compatibility job.
- **v5 (2026-07-26):** Reconciled the merged contract/correctness tasks and
  narrowed the preview to Ubuntu 24.04 x64, Node 22, Storybook 10.5, and React 19;
  moved broader OS support after preview; made browser acceptance reusable
  across source and packed fixtures; corrected the identifier test command;
  added the missing Turborepo build-output requirement; and made Task 7 reuse
  Task 6's single archive producer.
- **v6 (2026-07-26):** Decided the public name `storyproof` (unscoped npm
  package; verified free on npm, js.org, and GitHub, with `storyproof.dev`
  registered) and rebranded ahead of Tasks 7–8 so the tarball scripts,
  consumer fixtures, and workflows never carry the interim namespace: runtime
  identifiers, the preview bridge global, the artifact route, the workspace
  package name, and public metadata (description, keywords, homepage,
  repository, catalog `storybook` field) now use `storyproof`. Recorded the
  MIT license decision and, by owner decision, the early `private: true`
  removal and manual `0.0.1-alpha.1` name-claim publication under a minimal
  `files` allowlist. npm-identity verification stays with Task 9; the
  protected release workflow stays with Task 10.
- **v7 (2026-07-26):** Widened the compatibility target from one Storybook
  minor to the whole 10.x major (the four experimental APIs the addon uses —
  status store, test-provider store, server channel, dev server — are
  registry-verified present since 10.0.0), added `@storybook/nextjs-vite` as
  a supported framework integration (exercised daily by this repository's own
  Storybook), added Node 24 to the release matrix, and reframed consumer
  React and framework as fixture evidence rather than runtime requirements:
  the manager consumes Storybook's bundled React, the preview bridge is
  renderer-agnostic, and the `react` peer is scheduled for removal at Task
  10's metadata finalization. Scheduled an evidence-gated Storybook 9.x
  compatibility investigation with a 9.1 floor.
- **v8 (2026-07-26):** By owner decision, replaced Task 6/7's bespoke
  build/pack/verify scripts with conventional tooling: **tsdown** (with
  publint and attw as build-time gates) instead of `scripts/build.mjs`'s
  `tsc -p tsconfig.build.json` wrapper, one vitest test
  (`test/pack-inventory.test.ts`) instead of `scripts/pack-inventory.mjs` +
  `test:pack`/`test:exports` + `test/consumer/*.test.mjs`, and **TypeScript
  7.0.2** (exact) instead of `@typescript/native-preview`, with
  `isolatedDeclarations` scoped to `tsconfig.build.json` so tsdown's `.d.ts`
  generation takes the oxc-transform backend rather than the TypeScript
  compiler fallback (TS 7.0 ships no programmatic compiler API until 7.1).
  See the deviation notes under Task 6 and Task 7 for the guarantee-by-
  guarantee mapping. CI's `pack`/`inventory`/`exports` producer-consumer
  trio collapsed into one `build-and-package` job.
- **v9 (2026-07-27):** Shipped Task 8 (the packed-consumer harness): root
  `examples/**` are real pnpm workspace members depending on
  `storyproof: workspace:*` for local development, and each also carries the
  same scenario stories as `test/fixtures/project` (minus fault injection),
  so they double as documentation-by-example and as CI's acceptance fixture
  without a second tree to keep in sync. CI's `consumer` job proves the
  actual packed npm tarball by copying an example _out_ of the workspace
  before installing it (`pnpm pkg set` + `pnpm install --ignore-workspace`),
  which also gives the isolation guarantee for free — no negative-control
  fixture. Matrixed over Storybook minor × framework integration
  (react-vite-sb10.5, react-vite-sb10.0, nextjs-vite-sb10.5) at a single Node
  version. See the deviation note under Task 8. Also adopted tsdown's
  `exports: true` (deviation note under Task 6) to derive `package.json`'s
  `exports` map from `tsdown.config.ts`'s `entry` list instead of hand-syncing
  both.

## Final release gate

Do not publish the preview unless all of the following are true:

- runtime identifiers are generic;
- the support and trust contract is explicit;
- manager payload types match serialized payloads;
- package unit, visual, type, and lint checks pass;
- the compiled tarball contains only allowlisted files;
- a temporary non-workspace project installs and exercises that tarball;
- the exact inspected and consumer-tested `.tgz` is the workflow artifact that
  publication consumes, with matching recorded and registry SRI;
- the Ubuntu 24.04 x64 support matrix — Node 22 and 24 × Storybook 10.0 and
  10.5 × react-vite and nextjs-vite — passes without unexpected peer warnings,
  with every job exercising bundled Chromium and direct loopback HTTP;
- the testing-widget run-all path completes correctly over multiple stories;
- roots confinement, stale approval, cancellation, and capture-origin failures
  have consumer-visible negative coverage;
- public metadata and a license grant ship in the tarball;
- publication uses least-privilege, SHA-pinned, protected trusted publishing
  without a long-lived npm token;
- the prerelease is published under `next`, while `latest` remains absent or
  unchanged;
- the registry artifact passes a post-publication smoke test.
