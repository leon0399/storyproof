# Releasing

For maintainers; contributors never need this file.

**Nothing publishes from a developer machine, and no npm token exists in this
repository.** `publish.yml` authenticates with npm trusted publishing (OIDC) and
pauses on the `release` environment for a human approval.

## The loop

1. A PR changing the published package adds a changeset. Its body becomes the
   changelog entry, so write it for users.
2. Merging to `main` opens a **"chore: version packages"** PR. Review it, don't
   edit it.
3. Merging that PR tags `storyproof@<version>` and dispatches `publish.yml`.
4. Approve the `release` environment — **only when the tagged commit's CI is
   green**, because the publish job re-verifies nothing.

Two merges and one approval; the rest is automatic.

## Prereleases

```bash
pnpm exec changeset pre enter next   # commit .changeset/pre.json
pnpm changeset                       # ...then the loop above
pnpm exec changeset pre exit         # when the line goes stable
```

Pre mode continues the existing prerelease counter rather than restarting at
`.0`. Edit the version in the version PR if an exact number matters.

`latest` points at `0.1.0-next.2`, moved there by hand because the package had
no usable stable release. Repoint it after the first one:
`npm dist-tag add storyproof@<version> latest`.

## Dependency updates

One rule: **did `packages/storyproof/package.json`'s `dependencies` or
`peerDependencies` change?** If so the PR needs a `patch` changeset. The groups
in [dependabot.yml](.github/dependabot.yml) exist to make that answer legible
from the PR title, and its comments explain each one.

Never auto-merge a dependency PR: the update window is the supply-chain attack
window, and review is the control.

## When a release goes wrong

- **Failed before `npm publish`** — nothing shipped. If the fix is in the
  workflow, re-running is not enough: a run uses `publish.yml` as of the tag's
  commit, so delete the tag and re-create it on a commit carrying the fix.
- **Published a bad artifact** — npm versions are immutable. Ship a patch and
  `npm deprecate` the bad one; never unpublish.
- **Tag exists, no release ran** — re-run `publish.yml` from the Actions tab.
  npm refuses to overwrite an existing version, so a re-run after a successful
  publish fails at the publish step. That is the guard working.
- **Published, GitHub release step failed** — the exact tarball is saved as the
  run's `storyproof-release` artifact. Create the release by hand with that file
  rather than repacking.
