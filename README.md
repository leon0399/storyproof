# Storyproof

Local visual regression testing for Storybook. Storyproof captures Chromium
screenshots of your stories, shows baseline/candidate/diff images inside
Storybook itself, and approves baselines as PNG files committed next to your
story source — no cloud service, no accounts, reviewed like any other change
in your repository.

- **Package**: [`packages/storyproof`](packages/storyproof) — published to npm
  as [`storyproof`](https://www.npmjs.com/package/storyproof) (public preview:
  `0.1.0-next.x`)
- **Website**: [storyproof.dev](https://storyproof.dev) (in progress —
  [`apps/website`](apps/website))
- [Support target and trust boundary](packages/storyproof/README.md)
- [Changelog](packages/storyproof/CHANGELOG.md)

Extracted with history from [llame](https://github.com/leon0399/llame), where
it was built and is dogfooded against a 226-story Storybook.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) — setup, checks, and conventions.
Maintainers: [RELEASING.md](RELEASING.md).

## License

[MIT](packages/storyproof/LICENSE)
