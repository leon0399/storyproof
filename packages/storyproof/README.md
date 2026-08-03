# Storyproof

Local visual regression testing for Storybook. Storyproof captures Chromium
screenshots of your stories, shows baseline/candidate/diff images inside
Storybook itself, and approves baselines as PNG files committed next to your
story source — no cloud service, no accounts, reviewed like any other change in
your repository. Run the full visual suite from Storybook's testing widget or a
single story from its panel, then approve the exact captured candidate.

- Website: [storyproof.dev](https://storyproof.dev)
- [Configuration](docs/configuration.md)
- [Capture contract](docs/capture-contract.md)

## Install

```bash
pnpm add -D storyproof playwright
pnpm exec playwright install chromium
```

**You own the Playwright version.** It is a peer dependency, not something
storyproof pins for you, because the Playwright version is part of a baseline's
identity: a baseline captured with a different one is refused and must be
re-reviewed. Owning it means _you_ choose when every baseline in your
repository is re-approved, rather than inheriting that from storyproof's
release cadence — a storyproof patch release can never invalidate your
baselines. It also keeps a single Playwright copy and a single browser
download shared with any Playwright you already run for end-to-end tests.

## Preview support target

The first public preview is a narrow tool, not a general visual-testing
platform. The table below is the **target** the release must prove. Nothing in
it is verified support yet: every row stays a target until the packed-consumer
CI matrix in the
release pipeline passes against
the packed release artifact. "Exercised" means the combination runs today inside this
repository — it is local evidence, not a support claim.

| Dimension             | Preview target (not yet verified)                                                                                                                                                                                             | Evidence today (not a support claim)                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js               | `>=22.12` (22 LTS and 24 LTS in the release matrix)                                                                                                                                                                           | Exercised on 22.x (repository `.node-version` is `22.12.0`)                                                                                                                                                                                                                                                                                                                                                                                    |
| Storybook             | `^10.5.0`                                                                                                                                                                                                                     | Exercised on 10.5.0; `~10.0.0` was tried and abandoned as a floor — the packed-consumer matrix showed the addon's own manager UI working correctly there, but every visual-test run submitted through it never completed. Root cause (2026-07-27): Storybook 10.0.x never registers a `storyIndexGenerator` preset, so the addon now fails closed at startup with a named error there instead; 9.x is a tracked investigation with a 9.1 floor |
| React                 | not a runtime dependency — the panel consumes Storybook's bundled manager React and the preview bridge is renderer-agnostic; fixtures use React 19                                                                            | Fixtures exercised on 19.2.7                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Framework integration | `@storybook/react-vite` and `@storybook/nextjs-vite` (the preset uses only builder-agnostic core hooks)                                                                                                                       | react-vite exercised on 10.5.0; nextjs-vite exercised daily by this repository's own Storybook                                                                                                                                                                                                                                                                                                                                                 |
| Browser               | Chromium from the `playwright` you install (peer dependency, `^1.55.1`; 1.55.1 is what CI exercises); `capture.browser` selects Firefox or WebKit, each keeping its own baselines — WebKit on Linux is the engine, not Safari | Chromium exercised throughout; Firefox and WebKit exercised by the acceptance suite in CI                                                                                                                                                                                                                                                                                                                                                      |
| Operating system      | Ubuntu 24.04 x64                                                                                                                                                                                                              | Exercised on GitHub-hosted Ubuntu x64                                                                                                                                                                                                                                                                                                                                                                                                          |
| Storybook mode        | local development server                                                                                                                                                                                                      | Exercised; static builds report visual testing unavailable                                                                                                                                                                                                                                                                                                                                                                                     |
| Capture topology      | direct loopback HTTP in the same network namespace                                                                                                                                                                            | Exercised                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Peer and engine ranges in `package.json` are provisional. The current Node
engine is only a minimum-install floor, not a support claim. These ranges are
finalized — and the wording here changes from target to verified — only after
the release CI matrix supplies evidence.

### Baselines carry an environment identity

A baseline is only valid for the environment that rendered it — measured, not
assumed: bare macOS and bare Linux render different pixels, and even two
Linux machines with identical platform, browser build, and font metrics have
been measured rasterizing differently (see
the [capture contract](docs/capture-contract.md)).
storyproof therefore records identity in two layers:

- **The environment key** (`linux-chromium-1280x720@1x`) leads with the
  platform the browser renders on, so different platforms keep coexisting
  baselines instead of overwriting each other. Architecture is deliberately
  omitted — amd64 and arm64 render byte-identically.
- **The render fingerprint** in `baseline.json`: the hash of a fixed probe
  page rendered by the capturing browser. A baseline captured in a different
  environment reports a message naming the mismatch — never a false pixel
  diff.

For one developer on one machine, none of this needs configuring. A team on
mixed machines chooses between per-platform baselines (the default) and one
shared baseline set captured
[inside the version-matched Playwright container](docs/configuration.md#container-capture-capturecontainer)
(`capture: { container: true }`, requires Docker) — every machine then
captures under the shared `container-…` key and produces identical pixels,
which was likewise measured rather than assumed.

### Not in the preview

Two different kinds of exclusion, and the difference matters — one is a
statement about the implementation, the other only about scope:

- **Out of reach today.** HTTPS capture origins and reverse-proxy path
  prefixes. These are not merely untested: the capture origin is not
  configurable, so the implementation cannot reach a Storybook it does not
  share a loopback interface with — the one exception being the built-in
  [container capture mode](docs/configuration.md#container-capture-capturecontainer),
  whose topology the addon itself owns. The
  [capture contract](docs/capture-contract.md) holds the itemized list and the
  reason for each.
- **Deliberately deferred, not precluded.** Remote approval, reviewing one
  story across several engines in a single run, viewport matrices, theme
  matrices, masking, and a CI runner. Each is
  an ordinary scope decision, and each
  needs its own design because it expands baseline identity, review semantics,
  or execution topology.

## Trust boundary

Development Storybook is a **trusted local interface**, and the addon relies on
that assumption instead of adding its own authentication:

- Any party that can reach the development manager channel can request runs and
  approvals. The addon does not authenticate the party issuing a command.
- Approval **writes files into your repository** — the baseline PNG and its
  metadata, beside the story source.
- Candidate SHA-256 hashes bind an approval to the exact captured bytes. They
  establish **integrity, not human identity**, and reject stale approvals; they
  are not an authorization check.
- Authorization for a committed baseline change is **Git diff, commit review,
  and pull-request review** — the same review path as any other repository
  change.

Run the development server on loopback only, and treat exposing it on a shared
network as granting repository write access.

## Storage

Artifacts stay beside their story source:

```text
button.stories.tsx
__screenshots__/
  button.stories.tsx.visual/
    button--primary/
      chromium-1280x720@1x/
        baseline.png
        baseline.json
        candidate.png
        diff.png
```

Commit `baseline.png` and `baseline.json`. Candidate, diff, result, and atomic
temporary files are gitignored. The `.visual` suffix prevents Storybook's story
glob from mistaking an artifact directory for a story file.

## Capture contract

The initial environment is fixed: Chromium from your own `playwright`
install, `1280x720`, DPR
1, `en-US`, UTC, and reduced motion. Capture waits for Storybook's finished
event, including the story `play` function. Normal component stories are
cropped to their visible content, including body portals. Fullscreen stories
retain the viewport. A story or component can override that choice or disable
visual capture through `parameters.visualTests`.

See the [capture contract](docs/capture-contract.md) for exact framing semantics
and [configuration](docs/configuration.md) for component and story examples.

The addon is development-only because approval writes repository files. Static
Storybook builds keep the panel visible but mark visual testing unavailable.

## Verification

```bash
pnpm --filter storyproof test
pnpm --filter storyproof typecheck
pnpm --filter storyproof lint
pnpm test:visual
```

`pnpm test:visual` is the addon integration smoke test; normal visual test runs
start from the Storybook panel, not from a CLI runner.
