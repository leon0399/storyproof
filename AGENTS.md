# Agent instructions — storyproof

Storyproof is local visual regression testing for Storybook: capture Chromium
screenshots, review baseline/candidate/diff images inside Storybook itself, and
approve baselines as PNG files committed next to the story source. No cloud
service. `CLAUDE.md` and `GEMINI.md` are symlinks to this file.

Extracted from the llame monorepo on 2026-07-26 with history
(`github.com/leon0399/llame`, `packages/storybook-addon-visual-tests`); llame's
CHANGELOG holds the pre-extraction shipped record.

## Layout

pnpm workspace monorepo (Node >= 22.12, pinned in `.node-version`; pnpm 10)
orchestrated by Turborepo. The graph is real, not ceremony: `examples/*` need
`packages/storyproof` to have been **built**, not merely linked, and Storybook
cannot hot-reload an addon (its manager bundle compiles once at startup) —
so `turbo watch` is what rebuilds and restarts it.

| Path                  | Role                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `packages/storyproof` | The addon — the only published npm package (`storyproof`). Has its own `AGENTS.md`. |
| `apps/website`        | storyproof.dev docs/marketing site (placeholder, private, framework not yet chosen) |
| `examples/*`          | Storybook examples/quickstarts (workspace members); see below.                      |

## Commands (from repo root)

```bash
pnpm install                           # also builds the addon, via the root `prepare` hook
pnpm dev                               # turbo watch dev — every example at once (see Examples)
pnpm build                             # tsdown (ESM + declarations; publint + attw gates)
pnpm test                              # vitest unit tests, incl. the pack-inventory snapshot
pnpm typecheck                         # tsc --noEmit (TypeScript 7)
pnpm lint                              # oxlint --deny-warnings
pnpm format / pnpm format:check        # prettier, repo-wide (not a turbo task)
pnpm --filter storyproof test:visual   # playwright integration smoke (needs Chromium + system libs)
```

`turbo` is pinned to an exact version rather than a caret range: a
`minimumReleaseAge` policy in the maintainer's pnpm config rejects
freshly-published releases, so a caret resolving to a days-old turbo fails
`pnpm install` outright.

`pnpm pack` always rebuilds first (via the `prepack` lifecycle script) and
the tarball allowlist/size budget is asserted by
`test/pack-inventory.test.ts` — see `packages/storyproof/AGENTS.md`.

**ESM-only is permanent product intent, not an accident.** The addon ships
no CJS build and none is planned unless a demonstrated consumer requires
one. This is why `tsdown.config.ts` runs attw's `esm-only` profile as a
build-time gate, why `exports: true`-derived subpaths are bare strings with
no explicit `"types"` condition (TypeScript resolves the sibling `.d.ts`;
attw passing is the authority), and why a CJS output should not be "helpfully" added later
without that evidence.

## Examples

`examples/react-vite-sb10.5` and `examples/nextjs-vite-sb10.5` are two things
at once, deliberately, and both matter — this is a two-tier design, not
redundancy to simplify away (a third example pinning Storybook `~10.0.0` was
tried and removed: 10.0.x never registers the `storyIndexGenerator` preset
the addon requires, so it fails closed there by design):

1. **A real dev loop.** Each is a genuine pnpm workspace member
   (`examples/*` is in `pnpm-workspace.yaml`'s `packages:` list) depending on
   `storyproof: workspace:*`. Run one locally:

   ```bash
   pnpm install               # from the repository root
   pnpm dev                   # every example at once: 6006, 6007, …
   ```

   A contributor sees their own working tree, not a stale published build.

   `pnpm dev` is `turbo watch dev`. Editing addon source rebuilds it **and
   restarts every Storybook** — necessary because Storybook compiles its
   manager bundle once at startup and never rebuilds it, so nothing about the
   addon can hot-reload. Editing a story still hot-reloads normally; the `dev`
   task's `inputs` are scoped to `.storybook/**` precisely so story edits don't
   trigger restarts.

   To run one example instead of all of them, note that `pnpm` swallows
   `--filter` as its own flag — call turbo directly:

   ```bash
   pnpm turbo watch dev --filter=./examples/react-vite-sb10.5
   ```

   Running an example directly (`cd examples/… && pnpm dev`) works, because the
   root `prepare` hook builds the addon at install time — but it is a
   **frozen-addon mode**: no turbo, so no rebuild and no restart. Use it to look
   at an example, never to develop the addon.

   **Ports are assigned explicitly, and a new example must claim the next
   free index in both blocks**: Storybooks at 6106+ (6106 react-vite, 6107
   nextjs-vite, 6108 next) and the examples' real app servers at 6206+ (6206
   react-vite's Vite app, 6207 nextjs-vite's Next app, 6208 next). `pnpm dev`
   launches both blocks (`turbo watch dev dev:app`).

   Two reasons they are pinned rather than left to Storybook: concurrent starts
   race for an auto-selected port, and auto-restart would move the URL out from
   under an open tab. The reason the block is **6106 and not Storybook's default
   6006** is that 6006 is routinely occupied by another Storybook on a developer
   machine (llame's, for instance) — and when the requested port is taken,
   `storybook dev` does not quietly relocate, it asks an interactive
   yes/no question (`build-dev.ts`, guarded by `!options.ci`). Under `turbo watch`
   that prompt blocks a persistent task waiting on stdin. Staying off the default
   means the question never gets asked.

2. **The packed-artifact proof, separately.** A `workspace:*` link proves
   nothing about the actual npm tarball. CI's `consumer` job copies an example directory _out_ of the
   workspace (`cp -r`, before any `pnpm install` has populated
   `node_modules` anywhere in the checkout) into a temporary directory,
   points it at the exact tarball the `package` job built
   (`pnpm pkg set dependencies.storyproof=file:<tarball>`), and installs it
   there with `pnpm install --ignore-workspace`. Being outside the
   repository (and thus outside the pnpm workspace) is what makes that
   install meaningful — and `--ignore-workspace` is load-bearing even there:
   without it, a plain install in a non-member directory under a workspace
   silently no-ops, and `pnpm add` rewrites the ROOT lockfile.

**Examples are documentation-by-example — that's the acceptance bar for what
goes in one.** They exist to teach the addon by showing it; being CI's
acceptance fixture is a consequence of that, not the purpose. Each carries
the **Ledgerline** demo (Button/Header/Page, derived from Storybook's
official scaffold, styled as a small invoicing dashboard) _and_ the same
`visual-fixture`/`outside-fixture` scenario stories as
`packages/storyproof/test/fixtures/project` (minus fault injection — see
below), each with a short code comment describing what it demonstrates and
what storyproof should do; `.storybook/preview.ts`'s `storySort` orders the
sidebar so the demo reads first. **The two examples' demo sources are one
design maintained as verbatim copies** (a shared workspace package would
break the consumer job's out-of-workspace copy); the only sanctioned
divergence is the framework type-import in `*.stories.tsx`, and CI's lint
job diffs the trees to enforce it. Demo content must stay deterministic:
system font stacks, no animation in captured states, fixed data. The bar for adding a new example or
scenario story: **it earns its place by teaching something a real user would
encounter** — changed pixels, a disabled story, viewport-vs-content framing,
portal capture, a story outside `storyRoots`, stale-approval rejection,
malformed baseline metadata. The one exclusion is fault injection: a story
that hangs or fails its connection on command is harness machinery, not
something a user hits, so it stays only in
`packages/storyproof/test/fixtures/project`, exercised by CI's `visual` job.

## Key documentation

**User-facing docs only — by owner decision (2026-07-28).** No roadmaps,
release plans, or design documents live in this repository: the "why" behind
every non-obvious decision belongs in a code comment at the decision site,
and git history is the archive (the deleted plans and design records last
existed at the commits that removed them). Do not reintroduce the pattern.

- [packages/storyproof/CHANGELOG.md](packages/storyproof/CHANGELOG.md) — the
  package changelog (Keep a Changelog, version-keyed; deliberately NOT the
  llame-style dated work-log)
- [packages/storyproof/README.md](packages/storyproof/README.md) — the npm-published
  README: support target, trust boundary, storage, capture contract links
- [packages/storyproof/docs/configuration.md](packages/storyproof/docs/configuration.md)
  and [packages/storyproof/docs/capture-contract.md](packages/storyproof/docs/capture-contract.md)
  — the user-facing options reference and capture semantics

## Conventions

- Conventional commits (`feat:`, `fix:`, `build:`, `docs:`; no monorepo scope
  needed — the addon is the default subject, use `website:` scope for the site).
- Update the package CHANGELOG in the same PR that ships the work:
  user-visible package changes go under `## [Unreleased]` in the Keep a
  Changelog sections (Added/Changed/Fixed/Removed) and are rolled into a
  version heading at release time. Repo-only chores (website, CI plumbing)
  don't need a changelog entry.
- A PR that changes the published package also carries a **changeset**
  (`pnpm changeset`) declaring its bump — see [Releasing](#releasing).
- The trust boundary is a product invariant: approval writes repository files;
  development Storybook is a trusted local interface; Git/PR review is the
  authorization path. Weigh any change that touches the artifact route, path
  guards (`src/node/paths.ts`), or approval flow accordingly.

## Releasing

Maintainer process, including the prerelease flow and one-time npm setup:
[RELEASING.md](RELEASING.md). What matters while writing code: a PR that
changes the published package carries a changeset (`pnpm changeset`), and
nothing publishes from a developer machine.
