# Storyproof

Local visual regression testing for Storybook. Storyproof captures browser
screenshots of your stories, shows baseline/candidate/diff images inside
Storybook itself, and approves baselines as PNG files committed next to your
story source — no cloud service, no accounts, reviewed like any other change in
your repository.

[![CI](https://github.com/leon0399/storyproof/actions/workflows/ci.yml/badge.svg)](https://github.com/leon0399/storyproof/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/storyproof)](https://www.npmjs.com/package/storyproof)
[![npm next](https://img.shields.io/npm/v/storyproof/next)](https://www.npmjs.com/package/storyproof?activeTab=versions)
[![downloads](https://img.shields.io/npm/dm/storyproof)](https://www.npmjs.com/package/storyproof)

[![license](https://img.shields.io/github/license/leon0399/storyproof)](LICENSE)
[![node](https://img.shields.io/node/v/storyproof)](packages/storyproof/README.md#supported-versions)
[![code of conduct](https://img.shields.io/badge/code_of_conduct-contributor_covenant_v3.0-ff69b4)](CODE_OF_CONDUCT.md)

**[storyproof.dev](https://storyproof.dev)** ·
[npm](https://www.npmjs.com/package/storyproof) ·
[Documentation](packages/storyproof/README.md) ·
[Configuration](packages/storyproof/docs/configuration.md) ·
[Changelog](packages/storyproof/CHANGELOG.md)

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

You own the Playwright version: it is a peer dependency, because it is part of a
baseline's identity. See [the package README](packages/storyproof/README.md) for
the support target, the trust boundary, and where baselines are stored.

## Repository

| Path                                         | What                                           |
| -------------------------------------------- | ---------------------------------------------- |
| [`packages/storyproof`](packages/storyproof) | The addon, published to npm as `storyproof`    |
| [`examples`](examples)                       | Runnable Storybook examples, one per framework |
| [`apps/website`](apps/website)               | storyproof.dev (in progress)                   |

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the checks to run, and the
conventions; [RELEASING.md](RELEASING.md) is for maintainers. By participating
you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go
through [SECURITY.md](SECURITY.md), never a public issue.

## License

[MIT](LICENSE) © 2026 Leonid Meleshin.

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software […] THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
> OF ANY KIND.
