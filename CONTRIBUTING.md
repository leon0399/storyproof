# Contributing to storyproof

Thanks for taking the time. Issues, reproductions, and PRs are all welcome —
including "this was confusing", which is a real bug for a tool whose whole job
is making a diff obvious.

## Getting set up

Node ≥ 22.12 (pinned in [`.node-version`](.node-version)) and pnpm 10.

```bash
pnpm install     # also builds the addon, via the root `prepare` hook
pnpm dev         # every example at once: Storybooks on 6106/6107, apps on 6206/6207
```

Open <http://localhost:6106>, pick a story, and use the **Visual tests** panel.
That is the product; if a change doesn't show up there, it isn't done.

Editing addon source rebuilds it and restarts every Storybook — necessary,
because Storybook compiles its manager bundle once at startup and cannot
hot-reload an addon.

## Before you push

```bash
pnpm lint          # oxlint --deny-warnings
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest
pnpm format        # prettier, repo-wide
```

The heavier suites need a browser and are worth running when you touch capture,
comparison, or approval:

```bash
pnpm --filter storyproof test:visual                    # playwright acceptance suite
STORYPROOF_CONTAINER=1 pnpm dev                         # container capture (needs Docker)
```

CI runs all of it, plus a packed-tarball consumer check, so a green local run
is a good predictor but not a guarantee.

## Conventions

- **Conventional commits** (`feat:`, `fix:`, `build:`, `docs:`). No monorepo
  scope needed — the addon is the default subject; use `website:` for the site.
- **Changelog**: user-visible changes to the package go under `## [Unreleased]`
  in [packages/storyproof/CHANGELOG.md](packages/storyproof/CHANGELOG.md).
  Repo-only chores don't need an entry.
- **Changesets**: if your PR changes the published package, run
  `pnpm changeset` and commit the file it writes — it records which version
  bump the change deserves. Don't worry if you forget; a maintainer will add
  it. You do not need to understand the release process
  ([RELEASING.md](RELEASING.md) if you're curious).
- **Rationale goes in the code.** This repository keeps no design docs: the
  "why" behind a non-obvious decision belongs in a comment at the decision
  site, where the next person to touch that line will actually read it.
- **Baselines are committed images.** Approving one writes a PNG into the
  repository, so it gets reviewed like any other file. That is the trust
  boundary — see [the package README](packages/storyproof/README.md) — and
  changes near `src/node/paths.ts`, the artifact route, or the approval flow
  are weighed accordingly.

Architecture, the node/manager process split, and the examples' two-tier design
are documented in [AGENTS.md](AGENTS.md) and
[packages/storyproof/AGENTS.md](packages/storyproof/AGENTS.md). They are
written for AI agents but are the accurate engineering map for humans too.

## Pull requests

Small and focused beats large and complete. Describe what changed and how you
verified it — for visual behavior, a screenshot of the panel says more than a
paragraph. Draft PRs are welcome for early feedback.

Expect review comments to ask "what did you measure?" on anything involving
rendering determinism. That is not distrust; identical-looking machines have
been measured rendering differently, which is why the addon records a render
fingerprint at all.

## Reporting bugs

Open an issue with the Storybook version, framework (`react-vite`,
`nextjs-vite`, …), OS, and whether capture ran on the host or in a container.
A minimal reproduction on top of one of the [examples](examples) is the fastest
path to a fix.

Security issues: please don't open a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/leon0399/storyproof/security/advisories/new).

## Code of conduct

Be decent. Assume good faith, accept that people are working with different
context than you, and take disagreements to the technical merits.
