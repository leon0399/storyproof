# storyproof + React + Vite (Storybook 10.0.x)

A Storybook project demonstrating [`storyproof`](https://storyproof.dev) with
the `@storybook/react-vite` framework integration, pinned to Storybook
`~10.0.0` — the supported floor of the `^10.0.0` release contract.

This example links the local `storyproof` workspace package (`workspace:*`),
so it always reflects your working tree, not a published release. CI proves
the actual packed npm tarball separately, outside this workspace — see
[the root AGENTS.md](../../AGENTS.md#examples).

## Run it

```bash
pnpm install     # from the repository root
cd examples/react-vite-sb10.0
pnpm storybook
```

## Stories

Open the **Visual tests** panel or the testing widget on any story and click
**Run visual tests** to capture a baseline, review it, and approve it.
Approved baselines are written next to the story as
`src/__screenshots__/<story file>.visual/**`.

- **Button** — a plain component with no storyproof-specific behavior. Start
  here.
- **Visual Fixture** / **Outside Fixture** — each story demonstrates one real
  reviewer behavior (changed pixels, a disabled story, exact viewport
  framing, portal capture, a story outside the configured `storyRoots`,
  stale-approval rejection, malformed baseline metadata) with a short
  description in its source of what it shows and what storyproof should do.
  Read `src/visual-fixture.stories.tsx` and
  `outside/outside-fixture.stories.tsx` directly — that's the documentation.

## Files

- `.storybook/main.ts` — registers `storyproof/preset` the same way any
  consumer would, per [the configuration docs](https://github.com/leon0399/storyproof/blob/main/packages/storyproof/docs/configuration.md).
- `.storybook/preview.ts` — orders the sidebar so Button reads before the
  scenario stories.
