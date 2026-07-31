# Changesets

This directory holds pending release intents. Each file records **which
version bump** a merged change deserves; the human-readable record of _what
changed_ stays in
[packages/storyproof/CHANGELOG.md](../packages/storyproof/CHANGELOG.md),
which is written by hand in Keep a Changelog form. That split is deliberate
and is why `changelog` is `false` in `config.json` — Changesets owns
versioning and publishing, not prose.

Add one from the repository root when a PR changes the published package:

```bash
pnpm changeset          # pick storyproof, pick patch/minor/major
```

The release flow, including the prerelease (`next`) sequence, is documented
in the repository [AGENTS.md](../AGENTS.md#releasing).
