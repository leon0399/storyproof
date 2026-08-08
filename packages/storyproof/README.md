# Storyproof

Local visual regression testing for Storybook. Storyproof captures browser
screenshots of your stories, shows baseline/candidate/diff images inside
Storybook itself, and approves baselines as PNG files committed next to your
story source — no cloud service, no accounts, reviewed like any other change in
your repository. Run the full visual suite from Storybook's testing widget or a
single story from its panel, then approve the exact captured candidate.

[![npm](https://img.shields.io/npm/v/storyproof)](https://www.npmjs.com/package/storyproof)
[![npm next](https://img.shields.io/npm/v/storyproof/next)](https://www.npmjs.com/package/storyproof?activeTab=versions)
[![downloads](https://img.shields.io/npm/dm/storyproof)](https://www.npmjs.com/package/storyproof)
[![node](https://img.shields.io/node/v/storyproof)](https://github.com/leon0399/storyproof/blob/main/.node-version)
[![license](https://img.shields.io/npm/l/storyproof)](https://github.com/leon0399/storyproof/blob/main/LICENSE)

**[storyproof.dev](https://storyproof.dev)** ·
[Source](https://github.com/leon0399/storyproof)

- [Configuration](docs/configuration.md)
- [Capture contract](docs/capture-contract.md)
- [Changelog](CHANGELOG.md)

## Install

```bash
pnpm add -D storyproof playwright
pnpm exec playwright install chromium
```

or with npm:

```bash
npm install -D storyproof playwright
npx playwright install chromium
```

Add the preset to your `.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  addons: [
    {
      name: "storyproof/preset",
      options: {
        storyRoots: ["src"],
      },
    },
  ],
};

export default config;
```

Start Storybook, pick a story, and open the **Visual tests** panel.

**You own the Playwright version.** It is a peer dependency, not something
storyproof pins for you, because the Playwright version is part of a baseline's
identity: a baseline captured with a different one is refused and must be
re-reviewed. Owning it means _you_ choose when every baseline in your repository
is re-approved, rather than inheriting that from storyproof's release cadence —
a storyproof patch release can never invalidate your baselines. It also keeps a
single Playwright copy and a single browser download shared with any Playwright
you already run for end-to-end tests.

## Supported versions

| Dimension     | Supported                                             |
| ------------- | ----------------------------------------------------- |
| Node.js       | `>=22.12`; CI verifies 22 and 24                      |
| Storybook     | `^10.5.0`                                             |
| Framework     | `@storybook/react-vite`, `@storybook/nextjs-vite`     |
| Playwright    | `>=1.45.0 <2`, a peer dependency you install          |
| Browser       | Chromium (default), Firefox, WebKit                   |
| Storybook run | local development server; static builds are read-only |

CI verifies on the `ubuntu-latest` GitHub Actions runner (currently Ubuntu 24.04
x64).

## Baselines carry an environment identity

A baseline is only valid for the environment that rendered it — measured, not
assumed: bare macOS and bare Linux render different pixels, and even two Linux
machines with identical platform, browser build, and font metrics have been
measured rasterizing differently (see the
[capture contract](docs/capture-contract.md)). storyproof therefore records
identity in two layers:

- **The environment key** (`linux-chromium-1280x720@1x`) leads with the platform
  the browser renders on, so different platforms keep coexisting baselines
  instead of overwriting each other. Architecture is deliberately omitted —
  amd64 and arm64 render byte-identically.
- **The render fingerprint** in `baseline.json`: the hash of a fixed probe page
  rendered by the capturing browser. A baseline captured in a different
  environment reports a message naming the mismatch — never a false pixel diff.

For one developer on one machine, none of this needs configuring. A team on
mixed machines chooses between per-platform baselines (the default) and one
shared baseline set captured
[inside the version-matched Playwright container](docs/configuration.md#container-capture-capturecontainer)
(`capture: { container: true }`, requires Docker) — every machine then captures
under the shared `container-…` key and produces identical pixels, which was
likewise measured rather than assumed.

## Not supported

- **Cannot work today.** HTTPS capture origins and reverse-proxy path prefixes:
  the capture origin is not configurable, so the addon must share a loopback
  interface with Storybook. The one exception is
  [container capture](docs/configuration.md#container-capture-capturecontainer),
  whose topology the addon owns. The
  [capture contract](docs/capture-contract.md) itemizes them.
- **Deferred, not precluded.** Remote approval, several engines in one run,
  viewport and theme matrices, masking, and a CI runner. Each expands baseline
  identity, review semantics, or execution topology, so each needs its own
  design.

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
      linux-chromium-1280x720@1x/
        baseline.png
        baseline.json
        candidate.png
        diff.png
```

Commit `baseline.png` and `baseline.json`. Candidate, diff, result, and atomic
temporary files are gitignored. The `.visual` suffix prevents Storybook's story
glob from mistaking an artifact directory for a story file.

## Capture contract

The initial environment is fixed: Chromium (default; Firefox and WebKit are
configurable) from your own `playwright` install, `1280x720`, DPR 1, `en-US`,
UTC, and reduced motion. Capture waits for Storybook's finished event, including
the story `play` function. Normal component stories are cropped to their visible
content, including body portals. Fullscreen stories retain the viewport. A story
or component can override that choice or disable visual capture through
`parameters.visualTests`.

See the [capture contract](docs/capture-contract.md) for exact framing semantics
and [configuration](docs/configuration.md) for component and story examples.

The addon is development-only because approval writes repository files. Static
Storybook builds keep the panel visible but mark visual testing unavailable —
this is not yet a CI runner.

## Troubleshooting

**"The chromium capture browser could not start"** (or firefox, webkit) —
Playwright's browser binary is not installed. Run
`pnpm exec playwright install chromium` (or the engine you configured).

**"Storybook does not expose this capability via storyIndexGenerator"** — your
Storybook version is below 10.5. Upgrade to `storybook@^10.5.0`.

**Every baseline reports "changed" after a Playwright upgrade, but PNGs look
identical** — the environment identity moved, not the pixels. `baseline.json`
records the Playwright version; a mismatch is reported rather than diffed.
Re-approve through a running example.

**Render-fingerprint mismatch between two machines on the same platform** —
fonts or rasterization differ below what version numbers can express. Capture
through the
[shared container](docs/configuration.md#container-capture-capturecontainer) so
every machine produces identical pixels, or let each platform keep its own
baselines.

**Container capture fails: "Docker CLI not found"** — the Docker CLI must be on
`PATH`. Install Docker or Docker Desktop. Podman's `podman-docker` shim is
untested; see
[configuration](docs/configuration.md#container-capture-capturecontainer).

**HTTPS origins or reverse-proxy path prefixes** — not supported. The capture
origin is `http://127.0.0.1:<port>`, so the addon must share a loopback
interface with Storybook. See the
[capture contract](docs/capture-contract.md#capture-origin).

## Contributing

Issues and pull requests are welcome — see
[CONTRIBUTING.md](https://github.com/leon0399/storyproof/blob/main/CONTRIBUTING.md).
There are runnable
[examples](https://github.com/leon0399/storyproof/tree/main/examples) for each
supported framework, which are also the fastest way to file a reproduction.

## License

[MIT](https://github.com/leon0399/storyproof/blob/main/LICENSE) © 2026 Leonid
Meleshin.

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software […] THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
> OF ANY KIND.
