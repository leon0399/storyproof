# Agent instructions — storyproof

Storyproof is local visual regression testing for Storybook: capture Chromium
screenshots, review baseline/candidate/diff images inside Storybook itself, and
approve baselines as PNG files committed next to the story source. No cloud
service. `CLAUDE.md` and `GEMINI.md` are symlinks to this file.

Extracted from the llame monorepo on 2026-07-26 with history
(`github.com/leon0399/llame`, `packages/storybook-addon-visual-tests`); llame's
CHANGELOG holds the pre-extraction shipped record.

## Layout

pnpm workspace monorepo (Node >= 22.12, pinned in `.node-version`; pnpm 10). No
Turborepo — two workspaces with no cross-dependencies don't need a task graph.

| Path                  | Role                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `packages/storyproof` | The addon — the only published npm package (`storyproof`). Has its own `AGENTS.md`. |
| `apps/website`        | storyproof.dev docs/marketing site (placeholder, private, framework not yet chosen) |

## Commands (from repo root)

```bash
pnpm install
pnpm --filter storyproof build         # tsdown (ESM + declarations; publint + attw gates)
pnpm --filter storyproof test          # vitest unit tests, incl. the pack-inventory snapshot
pnpm --filter storyproof test:visual   # playwright integration smoke (needs Chromium + system libs)
pnpm --filter storyproof typecheck     # tsc --noEmit (TypeScript 7)
pnpm --filter storyproof lint          # oxlint --deny-warnings
pnpm format / pnpm format:check        # prettier, repo-wide
```

`pnpm pack` always rebuilds first (via the `prepack` lifecycle script) and
the tarball allowlist/size budget is asserted by
`test/pack-inventory.test.ts` — see `packages/storyproof/AGENTS.md`.

## Key documentation

- [ROADMAP.md](ROADMAP.md) — forward-only unshipped work
- [packages/storyproof/CHANGELOG.md](packages/storyproof/CHANGELOG.md) — the
  package changelog (Keep a Changelog, version-keyed; deliberately NOT the
  llame-style dated work-log)
- [packages/storyproof/docs/2026-07-24-public-preview-release-plan.md](packages/storyproof/docs/2026-07-24-public-preview-release-plan.md)
  — the authoritative release plan (tasks, gates, deviations)
- [packages/storyproof/README.md](packages/storyproof/README.md) — the npm-published
  README: support target, trust boundary, storage, capture contract links

## Conventions

- Conventional commits (`feat:`, `fix:`, `build:`, `docs:`; no monorepo scope
  needed — the addon is the default subject, use `website:` scope for the site).
- Update ROADMAP.md and the package CHANGELOG in the same PR that ships the
  work: user-visible package changes go under `## [Unreleased]` in the Keep a
  Changelog sections (Added/Changed/Fixed/Removed) and are rolled into a
  version heading at release time. Repo-only chores (website, CI plumbing)
  don't need a changelog entry.
- The trust boundary is a product invariant: approval writes repository files;
  development Storybook is a trusted local interface; Git/PR review is the
  authorization path. Weigh any change that touches the artifact route, path
  guards (`src/node/paths.ts`), or approval flow accordingly.
