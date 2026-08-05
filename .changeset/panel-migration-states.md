---
"storyproof": patch
---

Fixes three panel states that made a baseline migration unreviewable.

- **A disabled story reported "Passed"** with a green dot, while also saying
  "Visual tests disabled for this story" — three contradictory signals at once.
  Disabled is now its own status: muted, no Accept, and a viewport that says the
  story opted out. (Consumers reading the Storybook status store see
  `status-value:unknown` for these instead of a false success.)
- **A finished story showed "Capturing this story…"** for as long as _any_ other
  story in the run was still going: the placeholder keyed off the suite's
  running flag rather than the story's own. It now follows the story.
- **A metadata-only change showed no pixel count**, because the panel rendered
  the metric only when it was non-zero. "Changed" with a dead Diff tab and no
  number reads as a broken panel; it now reads "Changed · 0 px", which is what
  tells a reviewer the images are byte-identical and only the metadata moved —
  the state every story lands in during a schema-1 baseline migration.
