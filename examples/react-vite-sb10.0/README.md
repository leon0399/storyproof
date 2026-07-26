# storyproof + React + Vite (Storybook 10.0.x)

A minimal Storybook project demonstrating [`storyproof`](https://storyproof.dev)
with the `@storybook/react-vite` framework integration, pinned to Storybook
`~10.0.0` — the supported floor of the `^10.0.0` release contract.

## Run it

```bash
pnpm install --ignore-workspace
pnpm storybook
```

Open the **Visual tests** panel or the testing widget for the `Button` story
and click **Run visual tests** to capture a baseline, review it, and approve
it. Approved baselines are written next to the story as
`src/__screenshots__/Button.stories.tsx.visual/**`.

## Files

- `.storybook/main.ts` — registers `storyproof/preset` the same way any
  consumer would, per [the configuration docs](https://github.com/leon0399/storyproof/blob/main/packages/storyproof/docs/configuration.md).
- `src/Button.tsx` / `src/Button.stories.tsx` — the demo component and its
  two stories.
- `src/visual-fixture.stories.tsx`, `outside/outside-fixture.stories.tsx`,
  `control/state.json` — this example doubles as CI's packed-consumer
  fixture: storyproof's own reusable acceptance specification
  (`packages/storyproof/test/acceptance/addon-suite.ts`) runs against this
  project's real dev server in CI, installed from the published/packed
  `storyproof` tarball rather than workspace source. These stories exist to
  exercise specific reviewer behaviors (changed pixels, a story disabled for
  visual tests, exact viewport framing, a story outside the configured
  `storyRoots`, stale-approval rejection, malformed baseline metadata, and a
  controllable story for cancellation coverage) — ignore them if you're just
  here to see the Button demo.
