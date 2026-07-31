# Releasing

For maintainers. Contributors never need this file — see
[CONTRIBUTING.md](CONTRIBUTING.md).

Changesets decides the version; two workflows do the rest. **Nothing publishes
from a developer machine, and no npm token exists in this repository** — the
publish job authenticates with npm trusted publishing (OIDC).

## The loop

1. A PR that changes the published package adds a changeset
   (`pnpm changeset`). It records the bump only — the prose lives in
   [packages/storyproof/CHANGELOG.md](packages/storyproof/CHANGELOG.md), which
   is why `changelog` is `false` in `.changeset/config.json`. A PR that
   arrives without one is fine; add it before releasing.
2. Merging to `main` runs `release.yml`, which opens (or refreshes) a
   **"chore: version packages"** PR: bumped manifest, changesets consumed,
   and `## [Unreleased]` rolled into a dated version heading
   (`scripts/roll-changelog.mjs`, run by `pnpm version-packages`). The prose
   itself stays hand-written in feature PRs — review the version PR, don't
   edit it.
3. Merging the version PR runs `release.yml` again. With no changesets left,
   `changeset tag` tags any released version that has no tag yet
   (`storyproof@<version>`) and hands each new tag to `publish.yml` — the
   hand-off is an explicit dispatch because GitHub never triggers workflows
   from refs created with `GITHUB_TOKEN`. The tag is the only way a release
   starts, which is what keeps npm and the GitHub releases from drifting
   apart.
4. The tag triggers `publish.yml`: after your approval on the `release`
   environment, one job packs, publishes those bytes with provenance, checks
   the registry serves the same digest, and attaches the same file to a
   GitHub release. It re-verifies nothing — the tagged commit already passed
   the full CI on `main` (inventory test, packed-consumer acceptance), so
   **approve only when that commit's CI is green**; the approval is the
   checkpoint.

Two merges and one approval click; everything else is automatic.

## Prereleases

Changesets' pre mode. The dist-tag follows the version, so a prerelease can
never land on `latest`:

```bash
pnpm exec changeset pre enter next   # commit .changeset/pre.json
pnpm changeset                       # ...then the loop above
pnpm exec changeset pre exit         # when the line goes stable
```

Pre mode continues the _existing_ prerelease counter rather than restarting at
`.0` — measured with `@changesets/cli` 2.31.1, where a minor bump from
`0.0.1-alpha.1` resolves to `0.1.0-next.2`. Edit the version in the version PR
if an exact number matters.

## One-time setup

Before the first release:

- npmjs.com → `storyproof` → Settings → **Trusted publisher**: this
  repository, workflow `.github/workflows/publish.yml`, allowed action
  `npm publish`.
- A GitHub environment named **`release`** with a required reviewer, so the
  publish job pauses for human approval.
- Deprecate the placeholder: `npm deprecate storyproof@0.0.1-alpha.1 "…"`.
- Seed the placeholder's tag so `changeset tag` knows it is already
  released (at the root commit, which predates `publish.yml`, so pushing it
  triggers nothing):
  `git tag storyproof@0.0.1-alpha.1 $(git rev-list --max-parents=0 HEAD) && git push origin storyproof@0.0.1-alpha.1`
- After the first stable release, repoint the default tag explicitly:
  `npm dist-tag add storyproof@<version> latest`.

## When a release goes wrong

- **Publish job failed before `npm publish`** — nothing shipped. Fix and
  re-run the workflow from the Actions tab (or delete the tag and let the
  next merge to `main` re-create it).
- **Published, but the artifact is bad** — npm versions are immutable. Ship a
  new patch; `npm deprecate` the bad one. Do not unpublish.
- **Tag exists but no release ran** — re-run `publish.yml` from the Actions
  tab. npm refuses to overwrite an existing version, so a re-run after a
  successful publish fails at the publish step — that is the guard working.
- **Published, but the GitHub release step failed** — the exact tarball is
  saved as the run's `storyproof-release` artifact; create the release by
  hand with that file rather than repacking.
