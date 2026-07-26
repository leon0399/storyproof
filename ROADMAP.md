# Roadmap

Forward-only work for storyproof. Completed work belongs in the package's
version-keyed [CHANGELOG](packages/storyproof/CHANGELOG.md) (Keep a Changelog
format; repo-only chores may skip it), not here. The implementation sequence
and verification gates live in
[the public preview release plan](packages/storyproof/docs/2026-07-24-public-preview-release-plan.md).

The repository was extracted from the llame monorepo on 2026-07-26 (ahead of
the plan's original "optional and last" sequencing, by owner decision: the
announcement creates the independent lifecycle, and release workflows should
be built once in their final home). The package boundary is still tested by
installing the packed tarball into an isolated temporary fixture.

## P0 — Publishable package boundary

- [ ] Finalize the preview contract only after packed consumer evidence:
      Ubuntu 24.04 x64, Node 22 and 24, Storybook `^10.0.0` verified at the
      10.0 and 10.5 boundaries, the `@storybook/react-vite` and
      `@storybook/nextjs-vite` framework integrations (React 19 fixtures;
      consumer React is not a runtime dependency), bundled Chromium, and
      direct loopback HTTP.
- [ ] Pack once, record the archive's npm-compatible SHA-512 SRI, and carry that
      same `.tgz` through inventory, consumer tests, workflow artifact upload,
      and publication without rebuilding or repacking.
- [ ] Add an in-repository consumer fixture that installs the exact packed
      tarball in a temporary non-workspace project and verifies Storybook dev,
      capture/review/approval/rerun, changed diffs, testing-widget run-all with
      aggregate mixed results, and static build.
- [ ] Make the packed-consumer fixture a required CI check.

## P1 — Consumer-visible confidence

- [ ] Run the reusable browser acceptance specification against the packed
      non-workspace consumer without copying the workspace-source scenarios.
- [ ] Test Storybook 9.x compatibility with the same packed-consumer
      acceptance, unmodified. The floor is 9.1: 9.0 lacks the
      `experimental_devServer` hook the artifact route requires. API presence
      is registry-verified for 9.1.20; behavior is not. Promote 9.x to a
      support claim only if the suite passes without addon changes; otherwise
      record the incompatibility and stay 10.x-only.
- [ ] Add configurable HTTPS/proxy/container capture topology only when a
      demonstrated consumer requires it.

## P2 — Public prerelease

- [ ] Verify the authenticated npm identity and package access for the decided
      name `storyproof` (the MIT license grant, public metadata, repository
      links, and public-access configuration already landed with the rebrand);
      finalize engines and peer ranges from packed-consumer evidence,
      including dropping the `react` peer dependency — the manager consumes
      Storybook's bundled React and the preview bridge is renderer-agnostic,
      so `storybook` is the only real peer.
- [ ] Rewrite README/configuration/troubleshooting around the verified packed
      consumer, including browser installation, artifact ignores, trust
      boundary, Ubuntu-only support, and Playwright upgrade policy.
- [ ] Adopt Changesets for version/changelog automation (decided 2026-07-26,
      over semantic-release: monorepo-native, and it separates versioning from
      publishing so the protected tag-triggered publisher below stays as
      designed). Integrate no later than the first `0.1.0-next.*` prerelease;
      until then the package CHANGELOG's `[Unreleased]` section is maintained
      by hand in Keep a Changelog format.
- [ ] Add protected npm trusted publishing with provenance, package-scoped
      version/tag validation, least-privilege permissions, SHA-pinned actions,
      exact-artifact publication from the same protected tag workflow run, and
      post-publication smoke. Never consume pull-request workflow artifacts in
      the privileged publisher.
- [ ] Publish a prerelease such as `0.1.0-next.0`; promote to `0.1.0` only after
      the registry artifact succeeds in at least one clean external project.
      Publish under the `next` dist-tag and verify `latest` remains absent or
      unchanged.

## P3 — Complete the extraction (split done 2026-07-26)

The subtree split, monorepo scaffolding, and metadata move landed with the
extraction. Remaining:

- [ ] Run the same build, pack, isolated-consumer, visual, type, lint, and format
      gates in this checkout's CI before moving publication authority.
- [ ] Move publication authority deliberately: npm trusted-publisher
      configuration points at this repository's release workflow (P2), and
      llame switches to consuming the published package (removal PR in llame).
- [ ] Decide issue routing and security reporting for this repository
      (SECURITY.md / private vulnerability reporting) before the public
      announcement.

## P4 — Post-preview feature leverage

- [ ] Add a read-only CI runner against a built or already-running Storybook,
      reusing the capture/comparison core and never approving baselines.
- [ ] Project visual status into machine-readable CI output and artifact uploads
      without introducing a second review model.
- [ ] Add named viewport modes with independent environment keys and baseline
      paths.
- [ ] Add explicit theme/global variants after the UI can review and approve
      multiple candidates per story.
- [ ] Add component/directory sidebar-scoped runs after the public package
      contract stabilizes.
- [ ] Add an explicit required-resource contract before treating network
      failures as capture errors.
- [ ] Add an opt-in capture phase for stories whose `play` function destroys the
      state that needs capture.
- [ ] Add narrowly scoped masking only for demonstrated nondeterminism; prefer
      deterministic stories and `play` functions.
- [ ] Add another operating system or Linux distribution only after exact
      Ubuntu-approved baseline files transfer to it and pass the fixed comparator
      without approval. Per-platform environment identities require a separate
      design.
- [ ] Add Firefox and WebKit only after multi-environment identity and review
      semantics are proven by viewport/theme modes.
