# Security policy

## Reporting a vulnerability

Use GitHub's
[private vulnerability reporting](https://github.com/leon0399/storyproof/security/advisories/new).
It is enabled on this repository and is the preferred channel, because it keeps
the report, the discussion, and the resulting advisory in one place. Please
don't open a public issue for a suspected vulnerability.

One maintainer reads these, so replies aren't immediate. A confirmed report is
fixed in the next release and credited in the published advisory unless you'd
rather not be.

## Supported versions

Only the latest published `0.x` version gets fixes. There are no maintained
release branches.

## Scope

Storyproof is a **development-only** addon. It runs inside a local Storybook
development server, and approving a baseline writes files into your repository.
That shapes what counts as a vulnerability here.

In scope:

- Escaping the artifact root — a story id, import path, or symlink that gets the
  addon to read or write outside the source-adjacent `__screenshots__` tree,
  bypassing `assertPathConfined` in `packages/storyproof/src/node/paths.ts`.
- The artifact HTTP route serving a file outside that tree.
- Containerized capture reaching past the loopback-published port it opens.
- Command or code execution triggered by story metadata or configuration.

Out of scope, because it is the documented
[trust boundary](packages/storyproof/README.md#trust-boundary) rather than a
flaw:

- The development manager channel does not authenticate the party issuing a
  command. Anyone who can reach your development server can request runs and
  approvals; the addon is built on that assumption.
- Consequences of exposing that server on a non-loopback interface. Treat doing
  so as granting write access to your repository.
- Candidate hashes establish integrity, not identity. They reject stale
  approvals; they are not an authorization check.
