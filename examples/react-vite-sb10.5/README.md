# storyproof + React + Vite (Storybook 10.5.x)

A Storybook project demonstrating [`storyproof`](https://storyproof.dev) with
the `@storybook/react-vite` framework integration, pinned to Storybook
`~10.5.0` — the canonical version this repository targets.

This example links the local `storyproof` workspace package (`workspace:*`),
so it always reflects your working tree, not a published release. CI proves
the actual packed npm tarball separately, outside this workspace — see
[the root AGENTS.md](../../AGENTS.md#examples).

## Run it

```bash
pnpm install     # from the repository root
pnpm dev         # runs every example; this one is http://localhost:6106
```

`pnpm dev` is `turbo watch dev`: editing addon source rebuilds it and restarts
this Storybook, which is required because Storybook cannot hot-reload an addon.

You can also run this example on its own:

```bash
cd examples/react-vite-sb10.5
pnpm dev
```

That works — the repository root's `prepare` hook builds the addon at install
time — but it is a **frozen-addon mode**: there is no turbo in that path, so the
addon never rebuilds and never restarts, no matter what you edit. Use it to look
at the example, not to develop the addon.

## Reproducible capture (optional)

By default, captures run in a browser on your machine and baselines are keyed
to your platform (`linux-chromium-…`, `darwin-chromium-…`). To capture inside
the version-matched Playwright container instead — identical pixels on every
machine, at the cost of the capture fonts differing from your live preview's:

```bash
STORYPROOF_CONTAINER=1 pnpm dev   # requires Docker
```

You can also capture with a different engine — baselines are keyed per
engine (`linux-firefox-…`), so each engine keeps its own set and switching
never overwrites anything:

```bash
STORYPROOF_BROWSER=firefox pnpm dev                        # host Firefox
STORYPROOF_BROWSER=firefox STORYPROOF_CONTAINER=1 pnpm dev # containerized
```

(Playwright's WebKit on Linux is the engine, not Safari — treat engine
captures as regression evidence, not fidelity claims.)

The panel labels which environment produced the images, and a baseline
captured elsewhere reports a named incompatibility instead of a false diff.

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
