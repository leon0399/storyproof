# Changesets

Pending release intents: each file records which version bump a merged change
deserves. The prose lives in
[packages/storyproof/CHANGELOG.md](../packages/storyproof/CHANGELOG.md), which
is why `changelog` is `false` in `config.json`.

```bash
pnpm changeset   # from the repository root, when a PR changes the package
```

Release flow, including the prerelease (`next`) sequence:
[AGENTS.md](../AGENTS.md#releasing).
