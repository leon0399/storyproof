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
| `examples/*`          | Storybook examples/quickstarts (workspace members); see below.                      |

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

**ESM-only is permanent product intent, not an accident.** The addon ships
no CJS build and none is planned unless a demonstrated consumer requires
one. This is why `tsdown.config.ts` runs attw's `esm-only` profile as a
build-time gate, why `exports: true`-derived subpaths are bare strings with
no explicit `"types"` condition (see the release plan's Task 6 2026-07-27
deviation note), and why a CJS output should not be "helpfully" added later
without that evidence.

## Examples

`examples/react-vite-sb10.5` and `examples/nextjs-vite-sb10.5` are two things
at once, deliberately, and both matter — this is a two-tier design, not
redundancy to simplify away (a third example pinning Storybook `~10.0.0` was
tried and removed — see the release plan's dated note next to Task 8):

1. **A real dev loop.** Each is a genuine pnpm workspace member
   (`examples/*` is in `pnpm-workspace.yaml`'s `packages:` list) depending on
   `storyproof: workspace:*`. Run one locally:

   ```bash
   pnpm install               # from the repository root
   cd examples/react-vite-sb10.5
   pnpm storybook
   ```

   A contributor sees their own working tree, not a stale published build.

2. **The packed-artifact proof, separately.** A `workspace:*` link proves
   nothing about the actual npm tarball, which is release plan Task 8's
   subject. CI's `consumer` job copies an example directory _out_ of the
   workspace (`cp -r`, before any `pnpm install` has populated
   `node_modules` anywhere in the checkout) into a temporary directory,
   points it at the exact tarball the `package` job built
   (`pnpm pkg set dependencies.storyproof=file:<tarball>`), and installs it
   there with `pnpm install --ignore-workspace`. Being outside the
   repository (and thus outside the pnpm workspace) is what makes that
   install meaningful — see the release plan's Task 8 2026-07-27 deviation
   note for the full mechanics and the empirically-confirmed reasons
   `--ignore-workspace` matters even there.

**Examples are documentation-by-example — that's the acceptance bar for what
goes in one.** They exist to teach the addon by showing it; being CI's
acceptance fixture is a consequence of that, not the purpose. Each carries a
plain demo component/story pair (`Button`, `NavLink`) _and_ the same
`visual-fixture`/`outside-fixture` scenario stories as
`packages/storyproof/test/fixtures/project` (minus fault injection — see
below), each with a short code comment describing what it demonstrates and
what storyproof should do; `.storybook/preview.ts`'s `storySort` orders the
sidebar so the plain demo reads first. The bar for adding a new example or
scenario story: **it earns its place by teaching something a real user would
encounter** — changed pixels, a disabled story, viewport-vs-content framing,
portal capture, a story outside `storyRoots`, stale-approval rejection,
malformed baseline metadata. The one exclusion is fault injection: a story
that hangs or fails its connection on command is harness machinery, not
something a user hits, so it stays only in
`packages/storyproof/test/fixtures/project`, exercised by CI's `visual` job.

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
