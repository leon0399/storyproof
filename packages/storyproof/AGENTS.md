# packages/storybook-addon-visual-tests

Repo-local, Chromium-first visual testing addon for Storybook, named
**`storyproof`** (its future public npm name; the directory keeps the old
descriptive name until extraction). The whole workflow lives inside dev
Storybook: run the suite (widget) or the selected story (panel), inspect its
baseline/candidate/diff images, and approve the exact captured candidate.
Approval writes repository files, so the addon is **development-only** — static
builds keep the panel visible but mark visual testing unavailable.

Product-facing detail (storage layout, capture contract, config) lives in
[README.md](README.md) and [docs/](docs/); this file is the engineering map.

## Commands

```bash
pnpm --filter storyproof build       # tsdown (ESM + declarations; publint + attw gates)
pnpm --filter storyproof test        # vitest run (node unit tests, incl. the pack-inventory snapshot)
pnpm --filter storyproof test:visual # playwright integration smoke
pnpm --filter storyproof typecheck   # tsc --noEmit (TypeScript 7)
pnpm --filter storyproof lint        # oxlint --deny-warnings
```

Normal visual runs start from the Storybook **Visual tests** panel/widget, not a
CLI. `test:visual` is the isolated addon smoke test. It runs
`test/acceptance/addon-suite.ts` (the reusable acceptance specification,
shared with the packed-consumer harness) against `test/fixtures/project`
copied to `test/.tmp/project` by `test/fixture-server.ts`. Setting
`VISUAL_TEST_PROJECT_DIR=<absolute-or-relative-path>` points the same
command at a real installed project instead — no copy, and the child
Storybook process's `cwd` becomes that directory so `storyproof/preset`
resolves from its real `node_modules`, not workspace source. CI's `consumer`
job sets this to a temporary copy of an `examples/**` project, made outside
this workspace with the packed tarball installed into it (root `AGENTS.md`'s
Examples section). The two
fault-injection scenarios in `addon-suite.ts` (simulated hang, forced
connection failure) skip automatically when the target has no
`control/state.json` — only `test/fixtures/project` carries that fixture.

`pnpm pack` (and therefore `pnpm --filter storyproof pack`) always reruns
`build` via the `prepack` lifecycle script first, so a stale `dist` can never
be packed. `test/pack-inventory.test.ts` packs the package itself and asserts
the tarball ships only `dist/**`, `LICENSE`, `README.md`, and `package.json`
within a 150 KiB budget — there is no separate inventory script or CLI flag.

## Structure

Split by execution environment — the boundary is load-bearing:

- `src/node/` — runs on the Storybook server side (Node). `runner.ts`
  (`VisualTestRunner`: run/cancel/approve state machine), `capture.ts` (Chromium
  session + content-clip + render-fingerprint probe), `environment.ts`
  (environment key, platform resolution, probe page), `container.ts`
  (containerized capture: version-matched Playwright image, loopback-only ws,
  gateway-IP rewrite; the measured rationale is in its comments), `compare.ts` (pixelmatch policy + environment
  compatibility, baseline metadata schema 2), `paths.ts` (artifact-path
  resolution + security guards), `approval.ts`, `story-index.ts`, `server.ts`
  (artifact HTTP route + command endpoint).
- `src/manager/` — runs in the browser (Storybook manager UI). `PanelView.tsx`
  (pure view), `Panel.tsx`/`TestProviderRow.tsx` (wiring), `state.ts`.
- `src/shared/` — types crossing the boundary: `protocol.ts` (commands),
  `results.ts` (`VisualResult`/`VisualRunState`), `capture.ts`.
- Entry points: `index.ts`, `manager.tsx`, `preset.ts`, `preview.ts` (see the
  `exports` map in `package.json`).
- `test/` — vitest node unit tests; `test/smoke/` — playwright integration.

## Gotchas

- **`node/` code never imports `manager/` code and vice versa** — they run in
  different processes. Shared shapes go through `src/shared/`.
- **Artifact paths are a security surface.** `paths.ts` (`assertPathSegment`,
  `isWithin`, `normalizeImportPath`) exists to keep every write/read inside the
  source-adjacent `__screenshots__/…` tree; a story id or import path is
  attacker-adjacent input. Never build an artifact path bypassing these guards.
- **`VisualTestRunner` holds two coupled stores**: the public `state.results`
  (what the UI renders) and the private `completed` map (approval candidates,
  keyed by `runId\0storyId\0environmentKey`). `approve()` requires a matching
  `completed` entry and a candidate-hash match, or it throws stale-approval —
  keep the two in sync when changing run/approve logic.
- **Dev-only by construction**: approval writes files, so the panel reports
  "unavailable" in static builds. Don't add a code path that writes from a
  non-dev context.
- The `.visual` suffix on artifact directories keeps Storybook's story glob from
  mistaking an artifact dir for a story file — don't rename it.
