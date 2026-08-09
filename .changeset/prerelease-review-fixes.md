---
"storyproof": patch
---

Harden artifact path handling so committed symlinks cannot redirect baseline
reads or candidate/diff writes outside the screenshots tree.

Make the manager's Clear All path authoritative, keep per-story status from
showing another story's run as active, and clear stale command errors when the
selected story changes.

Fix release-facing docs so the quickstart works for both supported frameworks
and the example walkthroughs match the runtime behavior for disabled and
outside-`storyRoots` stories.
