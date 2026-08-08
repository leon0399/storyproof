---
"storyproof": patch
---

Harden the support contract for stable release.

- Drop React from peer dependencies — Storybook provides React to manager
  addons; `external: ["react"]` in the build config keeps the import external
  without requiring consumers to install it.
- Ship `docs/` and `CHANGELOG.md` in the npm tarball so installed documentation
  matches the version rather than tracking main's HEAD.
- Package README links are now relative, resolving against the shipped files.
- Add quickstart configuration example, npm installation commands, and a
  troubleshooting section to the package README.
- Fix Storybook catalog keyword order (`test` in the category position).
- Capture-contract documentation now distinguishes host capture, managed
  container capture, and unsupported arbitrary split topologies.
