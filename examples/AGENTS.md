# Agent instructions — examples/

Storybook example projects. Each is both a dev loop for the addon and CI's
acceptance fixture.

Repository map: [../AGENTS.md](../AGENTS.md). User-facing walkthrough: each
example's own `README.md`.

## Examples

| Directory            | Framework                | Storybook | SB port | App port |
| -------------------- | ------------------------ | --------- | ------- | -------- |
| `react-vite-sb10.5`  | `@storybook/react-vite`  | `~10.5.0` | 6106    | 6206     |
| `nextjs-vite-sb10.5` | `@storybook/nextjs-vite` | `~10.5.0` | 6107    | 6207     |

A new example claims the next free index in **both** port blocks (6106+, 6206+).

## Contents — identical in every example

- **Ledgerline demo** — Button/Header/Page, a small invoicing dashboard derived
  from Storybook's official scaffold.
- **Scenario stories** — `visual-fixture` (inside `storyRoots`),
  `outside-fixture` (outside it).
- `.storybook/preview.ts` — `storySort` puts the demo before the scenarios.

**Every example renders the same pixels.** Demo sources are verbatim copies; the
only sanctioned divergence is the framework type-import in `*.stories.tsx`.

**Do not factor the shared sources into a workspace package** — it would break
the tarball-install job's out-of-workspace copy.

## Rules

- **Documentation-by-example is the acceptance bar.** A realistic, minimal
  project, wired to storyproof the way a consumer would wire it. Nothing exists
  only to make a test pass.
- **A new story earns its place by teaching something a real user hits** —
  changed pixels, a disabled story, viewport-vs-content framing, portal capture,
  a story outside `storyRoots`, stale-approval rejection, malformed baseline
  metadata.
- **Each scenario story documents itself** in a source comment: what it shows,
  what storyproof should do.
- **Deterministic content only** — system font stacks, no animation in captured
  states, fixed data.
- **No fault injection.** A story that hangs or drops its connection on command
  is harness machinery; it lives only in
  `packages/storyproof/test/fixtures/project`.

## Two tiers

1. **Dev loop** — workspace members on `storyproof: workspace:*`, so a
   contributor sees their own tree. `turbo watch` rebuilds the addon and
   restarts every Storybook on a source edit; Storybook compiles its manager
   bundle once at startup and cannot hot-reload an addon.
2. **Packed-artifact proof** — CI's `tarball-install` job copies an example
   _out_ of the workspace, installs the built tarball with
   `pnpm install --ignore-workspace`, and runs the acceptance suite there. A
   `workspace:*` link proves nothing about the tarball.

**Note on running an example directly** (`cd examples/… && pnpm dev`): works via
the root `prepare` hook, but it is frozen-addon mode — no turbo, no rebuild, no
restart. Use it to look at an example, never to develop the addon.

**Note on ports**: pinned, never auto-selected. Concurrent starts race for a
free port, and auto-restart would move the URL out from under an open tab. The
block avoids Storybook's default 6006 because on a taken port `storybook dev`
asks an interactive yes/no question (`build-dev.ts`, guarded by `!options.ci`)
that blocks a `turbo watch` task on stdin.

**Note on Storybook 10.0.x**: no example pins it, and none should. 10.0.x never
registers the `storyIndexGenerator` preset the addon requires, so the addon
fails closed there by design.

## Baselines

Container-captured and committed, staged so the panel shows every state on a
fresh clone: most **Passed**, Page **Changed**, one **New**.

**One committed set per engine** — `container-{chromium,firefox,webkit}`. They
coexist rather than overwrite, which is the point: a fresh clone demonstrates
per-environment baselines, and opening an example in host mode shows the panel
naming the environments a baseline _does_ exist for.

**Container keys only, and that is not arbitrary.** A `linux-…` key is valid
only on machines matching its render fingerprint — two Linux hosts with
identical platform, browser build, and font metrics have been measured
rasterizing differently (`src/node/environment.ts`). Committing host keys would
show most contributors an incompatibility notice instead of the staged states.
Container keys reproduce anywhere, which is what makes them worth committing.

After changing demo components, re-approve for **every** engine and **every**
example, keeping the staged Page difference:

```bash
# per engine × example, with that example's Storybook port from the table above
STORYPROOF_CONTAINER=1 STORYPROOF_BROWSER=firefox \
  pnpm --filter ./examples/react-vite-sb10.5 run dev
node scripts/example-states.mjs --port 6106 --mode approve   # from packages/storyproof
```

The script reads the environment key off the live run, so it needs no engine
argument — start the Storybook with the engine you are approving for.

**Staging the Changed state.** `approve` covers the Page stories too, so it
leaves them Passed. The committed Page baseline has to predate the source edit
(`Page.tsx`: baseline shows INV-1042 paid, source says overdue). Reproducing it
for a new engine means approving with the source reverted to `paid`, then
restoring `overdue`.

CI runs the same script with `--mode verify` across all six combinations; drift
between demo sources and committed baselines fails the build.
