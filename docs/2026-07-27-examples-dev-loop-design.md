# Monorepo dev loop for the examples (2026-07-27)

Design for a single repository-level entry point that builds the addon, runs
every example Storybook, and rebuilds/restarts them when the addon changes —
plus the CI migration that follows from adopting a task runner.

Scope: repository tooling and CI invocation. No change to the addon's runtime
behaviour, its published artifact, or its release process.

## Problem

Three defects, all verified on 2026-07-27 against this checkout.

**1. A clean clone cannot run any example.** `dist/` is gitignored,
`packages/storyproof` has no `prepare`/`postinstall`, and pnpm does not build
workspace links. With `dist/` moved aside, resolution from an example fails:

```
IMPORT FAILED: ERR_MODULE_NOT_FOUND
Cannot find module '.../node_modules/storyproof/dist/preset.js'
```

The loop documented in root `CLAUDE.md` and both example READMEs —
`pnpm install` → `cd examples/react-vite-sb10.5` → `pnpm storybook` — therefore
fails for every new contributor. It appears to work only where a build happened
at some point.

This is also the announcement's gating asset: "a quickstart that works in a
clean repo".

**2. No repository-level entry point.** Root `package.json` defines only
`format` and `format:check`.

**3. No rebuild path.** Nothing rebuilds the addon during development, and —
see below — nothing can hot-reload it either.

### The premise that expired

Root `CLAUDE.md` states: "No Turborepo — two workspaces with no
cross-dependencies don't need a task graph."

True when written, false now. `examples/*` depend on `packages/storyproof`
having been **built**, not merely linked. That is a cross-workspace task
dependency — exactly what a task graph expresses.

### Storybook cannot hot-reload an addon

Storybook's manager builder does not watch. From its own dev-mode generator
(`code/core/src/builder-manager/index.ts`, the `yield`-bearing `starter` path):

```
// TODO: this doesn't watch, we should change this to use the esbuild watch API
compilation = await instance({ ...config, minify: true });
```

The manager bundle is compiled once per Storybook start and never rebuilt.
`preset.ts` is server-side and equally needs a restart. `preview.ts` goes
through Vite, which by default does not watch `node_modules` and pre-bundles
dependencies (moderate confidence; the manager evidence is conclusive).

**Consequence: no part of storyproof hot-reloads into a running Storybook.** A
file watcher alone cannot deliver reload — only a restart can. This is why the
design below uses `turbo watch` with `interruptible` rather than a bundler
watch flag.

## Decision

Adopt Turborepo (pinned to `2.10.4`; see Supporting changes) following the house
pattern from the llame monorepo, with:

- a repository-wide `turbo watch dev` that runs every example concurrently,
- `interruptible: true` so Storybooks restart automatically when the addon
  rebuilds,
- the `watchUsingTaskInputs` future flag plus narrow `inputs` so story edits
  keep using Vite HMR instead of triggering restarts,
- CI migrated to invoke turbo, preserving its current parallel job structure.

Rejected alternatives:

- **Plain pnpm scripts with `--parallel` filters.** Verified workable and
  dependency-free, but needs per-example root scripts that rot as the examples
  set grows (Vue and Svelte are anticipated).
- **`tsdown --watch` plus manual restart.** Turbo re-runs `build` itself, making
  a second watcher redundant; and the manual step is not "restart one Storybook"
  but "tear down the whole `turbo watch` session", since turbo has no per-task
  restart and its TUI has no such keybinding.
- **`interruptible` without `watchUsingTaskInputs`.** `turbo watch` then operates
  at package level and re-runs every task in a changed package — so editing a
  `.stories.tsx` file would restart Storybook, destroying HMR for the single
  most common action in the tool.
- **Consuming `src` directly, skipping the build.** `preset.ts` runs in Node on
  Storybook's server, and this would make the contributor loop exercise a
  different artifact shape than the published one — the exact class of defect
  release plan Task 8 exists to catch.

## Design

### `turbo.json`

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalEnv": ["CI", "NODE_ENV"],
  "globalDependencies": [".node-version"],
  "ui": "tui",
  "futureFlags": {
    "watchUsingTaskInputs": true,
  },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
    },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "test:visual": { "dependsOn": ["^build"] },
    "dev": {
      "cache": false,
      "persistent": true,
      "interruptible": true,
      "dependsOn": ["^build"],
      "inputs": [".storybook/**"],
    },
  },
}
```

Divergences from llame's `turbo.json`:

- **`outputs: ["dist/**"]`** where llame has `outputs: []`. llame's packages are
  JIT source; storyproof emits real build output.
- **`dev` gains `dependsOn: ["^build"]`**, which llame does not need. This edge
  makes a clean clone work.
- **`interruptible` + `watchUsingTaskInputs` + narrow `inputs`**, which llame
  does not need because its apps hot-reload their dependencies. Storybook
  cannot.

llame's `transit` node is deliberately **not** copied. It exists to cache-bust
`typecheck`/`test` without forcing a dependency build. Here the examples
genuinely consume storyproof's emitted `dist` and `.d.ts`, so `^build` is the
honest edge.

The resulting behaviour:

| Edit                            | Result                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/storyproof/src/**`    | `build` re-runs; every Storybook restarts                                               |
| `examples/*/src/**.stories.tsx` | Vite HMR only — `inputs` does not match                                                 |
| `examples/*/.storybook/**`      | that example restarts (correct — Storybook does not reliably hot-reload its own config) |

Note that turbo forbids depending on a `persistent` task, so the examples' `dev`
depends on `^build` (one-shot), never on another `dev`.

### Scripts

Root `package.json`:

```json
"build":        "turbo run build",
"dev":          "turbo watch dev",
"lint":         "turbo run lint",
"typecheck":    "turbo run typecheck",
"test":         "turbo run test",
"prepare":      "pnpm --filter storyproof build",
"format":       "prettier --write .",
"format:check": "prettier --check ."
```

`packages/storyproof` needs **no** `dev` script — turbo re-runs its `build`.

Each example's existing `storybook` script is **renamed** to `dev` so turbo can
discover it; `build-storybook` is unchanged:

```json
"dev": "storybook dev -p 6006 --no-open"
```

The rename is safe — verified 2026-07-27 that nothing depends on the script
name. CI invokes only `pnpm --filter storyproof <task>`, and the acceptance
harness (`test/fixture-server.ts`) spawns the `storybook` **binary** through
`pnpm exec`, not a package script. It already passes `--no-open` itself.

### `prepare`

`prepare` exists so `cd examples/react-vite-sb10.5 && pnpm dev` starts at all on
a clean clone.

It invokes `pnpm --filter storyproof build` rather than turbo because
`pnpm install` is routinely run _while a dev session is active_ — adding a
dependency in a second terminal — and a turbo-invoking `prepare` would put a
second turbo process on the repository. ~2.3 s per install, measured.

**The direct path is a frozen-addon mode.** It runs bare `storybook dev` with no
turbo, so there is no rebuild and no restart: the addon stays at whatever `dist`
contained at install time. Both example READMEs must say so, or someone will
edit the addon in that mode and hunt a phantom bug.

Two consequences accepted for now:

- A broken build fails `pnpm install`, so `lint` and `format` CI jobs
  transitively depend on the build succeeding.
- Every CI job builds **twice** — once in `prepare`, once in the turbo task —
  because the `prepare` build is invisible to turbo's cache.

Note also that the ~2.3 s is almost entirely publish gates: only ~159 ms is the
bundle, while attw (~569 ms) and publint (~592 ms) dominate. Every install —
including every CI job — pays for two gates it has no use for.

**Follow-up (not now):** switching `prepare` to
`turbo run build --filter=./packages/storyproof` would remove the double build
_and_ let repeat installs skip the gates entirely via cache. It needs the
concurrent-turbo-process concern checked first.

If a git-hook manager (lefthook, as in llame) is added later, `prepare` must
chain both commands rather than being replaced.

### Ports

Each example gets an explicit, distinct port from **6106** upward — deliberately
_not_ Storybook's default 6006:

| Example                | Port |
| ---------------------- | ---- |
| `react-vite-sb10.5`    | 6106 |
| `nextjs-vite-sb10.5`   | 6107 |
| _(next example added)_ | 6108 |

**Storybook does not silently relocate when the port is taken — it asks.**
`build-dev.ts` compares the requested port to the resolved one and, unless
`--ci` or `--smoke-test` is set, raises an interactive confirm:

```js
if (!options.ci && !options.smokeTest && options.port != null && port !== options.port) {
  const shouldChangePort = await prompt.confirm({ ... });
  if (!shouldChangePort) process.exit(1);
}
```

Under `turbo watch`, a persistent task hitting that prompt blocks on stdin. So
port collisions are not a cosmetic annoyance here; they hang the dev loop.

Hence three properties, in order of importance:

1. **Stay off 6006.** A developer machine routinely has another Storybook on the
   default port (llame's, in this maintainer's case — observed 2026-07-27). The
   6106 block means the prompt never fires.
2. **Pin rather than auto-select.** `getServerPort` resolves a port _number_ and
   `build-dev.ts` binds later — check-then-bind, so two Storybooks starting
   together under one `turbo watch` can be handed the same one. And with
   `interruptible`, a restart could otherwise move the URL out from under an open
   tab.
3. **Documentation.** Each example README states a fixed URL, which is only
   truthful if the port is both pinned and free.

`--ci` would also suppress the prompt, and is **rejected**: it is a CI-semantics
flag ("CI mode (skip interactive prompts, don't open browser)") being borrowed
for a local port problem, and its behaviour is free to grow to cover things this
repo does not want in a dev loop.

All examples pass `--no-open`; several examples would otherwise spawn a tab each
on every `pnpm dev`.

**The port allocation is a rule, not an accident.** It belongs in root
`AGENTS.md` next to the existing bar for adding an example, or the fourth
example will silently collide with the third.

### Running a single example

Several concurrent Storybook + Vite servers is roughly 500 MB each plus a file
watcher, which is noticeable on WSL2. The escape hatch must be documented
verbatim, because the intuitive form is broken — pnpm consumes `--filter` as its
own flag before turbo sees it:

```bash
# Broken: pnpm intercepts --filter
pnpm dev --filter=./examples/react-vite-sb10.5

# Correct
pnpm turbo watch dev --filter=./examples/react-vite-sb10.5
```

### CI migration

CI moves to turbo in this same change, **keeping its current twelve parallel
jobs**. Consolidating into llame's single `checks` job is explicitly rejected:
sequential steps fail fast and mask every later error, costing a full CI round
per fix. Independent parallel jobs surface all failures in one run.

Per job, only the invocation changes — `pnpm --filter storyproof <task>` becomes
`pnpm exec turbo run <task>` — plus a cache step copied from llame's CI:

```yaml
- uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
  with:
    path: .turbo/cache
    key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}
    restore-keys: |
      turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
      turbo-${{ runner.os }}-
```

Playwright-dependent jobs get a separate cache key prefix, as llame does.

Two carve-outs:

- **The `consumer` jobs cannot use turbo.** They install a packed tarball into a
  copy made outside the workspace, where there is no turbo and no task graph.
- **The `package` job keeps `pnpm --filter storyproof pack`.** `pack` runs the
  `prepack` lifecycle and is not a turbo task.

### Supporting changes

- `.gitignore` gains `.turbo`.
- Root `devDependencies` gains **`turbo` pinned to `2.10.4`** (exact, matching
  llame's floor), not `^2.10.7`. The maintainer's pnpm enforces a
  `minimumReleaseAge` policy, and `turbo@2.10.7` (published 2026-07-25) falls
  inside the cutoff — a caret range resolving to it fails `pnpm install` with
  `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. Observed 2026-07-27.
- turbo requires a root `packageManager` (or `devEngines.packageManager`) field
  and refuses to resolve the workspace without one. This repo already has
  `pnpm@10.34.4`, so nothing to add — but do not remove it.

## Documentation this invalidates

- Root `CLAUDE.md` (and its `AGENTS.md`/`GEMINI.md` symlinks): the "No
  Turborepo" sentence is now false; the Commands section gains the turbo entry
  points.
- Both example READMEs: the "Run it" block documents a sequence that fails on a
  clean clone, and must state that the direct path is frozen-addon mode and that
  addon edits need the root `pnpm dev`.
- Root `AGENTS.md`: the port-allocation rule for new examples.

## Hazards

**tsdown writes into a tracked source file.** `exports: true` regenerates
`packages/storyproof/package.json`'s `exports` map on every build.

This was initially flagged as a risk to CI's `git diff --exit-code` drift gate
under turbo caching. **That concern was retracted:** both `package.json` and
`tsdown.config.ts` are inputs to `build`, so a changed entry list or a
hand-edited `exports` map busts the cache and forces a real rebuild. A cache hit
can only occur when there was nothing to regenerate. The gate holds.

It remains true that adding `package.json` to `outputs` would break this. Don't.

**`watchUsingTaskInputs` is a future flag.** Accepted because its blast radius is
the dev loop only — no CI job, no release workflow, and nothing about the
published artifact's correctness depends on it. If a turbo release changes its
behaviour, the symptom is "Storybook stopped auto-restarting" and the fallback
is dropping `interruptible`. A future flag anywhere near the publish path would
be a different matter.

**The `inputs` filter fails silently in both directions.** Too narrow and addon
changes stop restarting Storybook; too broad and story edits thrash it. It needs
an explicit test, not an eyeball.

**`turbo watch` retries a failing task in a tight loop.** Observed 2026-07-27: a
`build` that exits non-zero was re-executed continuously, producing ~1500 log
lines in two minutes with no backoff. So a broken addon build during a dev
session does not fail quietly — it spins and floods the TUI. Contributors should
expect this rather than assume a hung watcher, and it is worth a line in the
docs.

## Verification

### Step 0 — CONFIRMED 2026-07-27

The load-bearing assumption — that `turbo watch dev` re-runs a _dependency's_
`build` and then restarts the dependent `interruptible` task — was verified in a
throwaway two-package workspace (`lib` ← `app`, `app.dev` with
`inputs: ["config/**"]`), turbo 2.10.4:

| Change                                 | Dependency build re-ran | Dependent restarted |
| -------------------------------------- | ----------------------- | ------------------- |
| `app`'s own `src/**` (not in `inputs`) | no                      | **no**              |
| `lib`'s `src/**` (the dependency)      | **yes**                 | **yes**             |
| `app`'s `config/**` (in `inputs`)      | no                      | **yes**             |

All three are the specified behaviour. The design shape stands; no fallback to
`tsdown --watch` is needed.

### Shell-verifiable

Done 2026-07-27 in this repository:

- **`prepare` fires on install** — `pnpm install` ran the addon build.
- **Turbo caching works** — a second `pnpm build` reported `FULL TURBO` in 13 ms.
- **Concurrency.** `pnpm dev` brought both examples up together with zero error
  lines. (A first pass reported "HTTP 200 on 6006" — that reading was another
  project's Storybook already holding the default port, which is what prompted
  the move to the 6106 block. Re-checked against the assigned ports below.)
- **Rebuild + restart in the real repo.** Appending a line to
  `packages/storyproof/src/index.ts` doubled the build lines (34 → 68) and the
  Storybook start lines (2 → 4) — both examples restarted.
- **Gates.** `pnpm lint`, `pnpm typecheck` (2 tasks, build included),
  `pnpm test` (11 files / 115 tests), and `pnpm format:check` all pass.
  `actionlint` and `zizmor` report no findings on the migrated workflow.
- **No generated drift.** `packages/storyproof/package.json` is unmodified after
  a build, so the regenerated `exports` map is byte-stable.

Still open:

1. **Clean-clone simulation.** With `dist/`, `.turbo/`, and `node_modules/`
   removed: `pnpm install` then `pnpm dev` brings up both examples.
2. **Direct path.** `cd examples/react-vite-sb10.5 && pnpm dev` works after
   `pnpm install` alone, proving `prepare` did its job.
3. **Restart rebinds the port.** Repeated restarts re-bind 6006/6007 without
   transient `EADDRINUSE`.
4. **No interference.** `pnpm install` in a second terminal during a dev session
   completes without turbo daemon or cache errors.
5. **CI parity.** All twelve jobs stay green on the migrated workflow, and cache
   hits do not mask a real failure.

### Browser-only — not reachable from CI or the acceptance suite

These are interactive dev-loop properties. WSL2 cannot run Playwright locally,
and the acceptance suite does not cover them. They must be checked through the
Chrome MCP tools against a manually started session — the same route that
diagnosed all three Task 8 defects — or marked as hand-checked. **Do not tick
them off by assumption.**

7. **The Visual tests panel renders** in each example after a clean-clone start.
8. **HMR preserved.** Editing a `.stories.tsx` file hot-reloads and does **not**
   restart Storybook.
9. **Debounce.** Rapid successive saves do not thrash multiple restarts.

## Out of scope

- Adding the Vue or Svelte examples. This design makes them cheap to add;
  whether storyproof supports non-React renderers is open and tracked
  separately.
- Turborepo remote caching. `actions/cache` is sufficient here and has no token
  or supply-chain surface.
