# Changesets

Pending release intents: each file records which version bump a merged change
deserves, and its markdown body becomes the entry in
[packages/storyproof/CHANGELOG.md](../packages/storyproof/CHANGELOG.md)
(`@changesets/changelog-github`) — write it for users.

```bash
pnpm changeset   # from the repository root, when a PR changes the package
```

Release flow, including the prerelease (`next`) sequence:
[AGENTS.md](../AGENTS.md#releasing).
