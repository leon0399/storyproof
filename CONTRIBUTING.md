# Contributing to storyproof

Issues, reproductions, and PRs are welcome, including "this was confusing",
which is a real bug for a tool whose whole job is making a diff obvious.

One maintainer runs this, so reviews land in days rather than hours and scope
calls are one person's. Open an issue before a large change.

## The loop

Node ≥ 22.12 ([`.node-version`](.node-version)), pnpm 10.

```bash
pnpm install                           # also builds the addon, via the root `prepare` hook
pnpm dev                               # every example: Storybooks on 6106/6107, apps on 6206/6207
pnpm build                             # tsdown (ESM + declarations; publint + attw gates)
pnpm lint                              # oxlint --deny-warnings
pnpm typecheck                         # tsc --noEmit
pnpm test                              # vitest
pnpm format / pnpm format:check        # prettier, repo-wide
pnpm --filter storyproof test:visual   # playwright acceptance suite (needs Chromium)
```

Open <http://localhost:6106>, pick a story, and use the **Visual tests** panel.
That is the product; if a change doesn't show up there, it isn't done. Editing
addon source restarts every Storybook, because Storybook compiles its manager
bundle once at startup and cannot hot-reload an addon.

Run `lint`, `typecheck`, `test`, and `format` before pushing. Add `test:visual`
when you touch capture, comparison, or approval, and
`STORYPROOF_CONTAINER=1 pnpm dev` (needs Docker) if the change could move
pixels.

## Conventions

- **[Conventional commits](https://www.conventionalcommits.org/)**, and the same
  for pull request titles: `main` squash-merges, so the title is what lands on
  it. Scope is optional and the addon is the default subject, so use one only
  when a change is confined elsewhere, like `fix(website):`.
- **Changesets.** If your PR changes the published package, run `pnpm changeset`
  and commit the file it writes. Its body becomes the
  [changelog](packages/storyproof/CHANGELOG.md) entry, so write it for users.
  Repo-only chores need none, and a maintainer will add one if you forget.
- **Baselines are committed images.** Approving one writes a PNG into the
  repository, where it gets reviewed like any other file. Changes near
  `src/node/paths.ts`, the artifact route, or the approval flow are weighed
  against that trust boundary.

## AI-assisted contributions

Allowed and disclosed. This project is itself built with heavy agent use, so a
ban would be dishonest. Three rules:

**Disclose it, per commit**, with a `<coding-agent>/<model>` trailer, and in a
line of the PR description. Use `Generated-by:` instead of `Assisted-by:` when
the agent wrote a substantial portion rather than you editing its output:

```
Assisted-by: claude-code/claude-opus-5
Generated-by: codex/gpt-5.6-terra
```

`Co-authored-by:` and `Signed-off-by:` stay reserved for humans. They carry
authorship and legal attestation an agent cannot give. The convention is shared
with [OpenSSL](https://openssl-library.org/policies/general/ai-policy/), the
[Linux kernel](https://docs.kernel.org/process/coding-assistants.html), and the
[OpenInfra Foundation](https://openinfra.org/legal/ai-policy/).

**You own the diff.** A human must have read every line and be able to defend it
in review without re-consulting the agent. Prompting until the output looks
plausible and shipping without comprehension is vibe-coding; those PRs get
closed, not reviewed. Review time is the scarce resource an unreviewed patch
spends on everyone's behalf.

**Verify confident claims.** Agents fabricate APIs, versions, and rationale
fluently. Check anything asserted about library behavior against the installed
package, and anything about measurements by running the measurement.

## Pull requests

`main` is protected: pull requests only, CI green, review threads resolved,
squash merges.

Small and focused beats large and complete. Say what changed and how you
verified it. For visual behavior, a screenshot of the panel beats a paragraph.
Drafts are welcome. Expect "what did you measure?" on anything touching
rendering determinism: identical-looking machines have been measured rendering
differently, which is why the addon records a render fingerprint at all.

## Reporting bugs

Open an issue with the Storybook version, framework (`react-vite`,
`nextjs-vite`, …), OS, and whether capture ran on the host or in a container. A
minimal reproduction on top of an [example](examples) is the fastest path to a
fix.

Security issues: don't open a public issue — see [SECURITY.md](SECURITY.md).

## Code of conduct

Be decent, assume good faith, and take disagreements to the technical merits.
What counts as a violation, and how to report one (including when the report
concerns the maintainer), is the [Contributor Covenant 3.0](CODE_OF_CONDUCT.md).
