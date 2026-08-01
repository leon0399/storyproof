# Contributing to storyproof

Thanks for taking the time. Issues, reproductions, and PRs are all welcome —
including "this was confusing", which is a real bug for a tool whose whole job
is making a diff obvious.

## The loop

Node ≥ 22.12 (development pin: [`.node-version`](.node-version)) and pnpm 10.

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
That is the product; if a change doesn't show up there, it isn't done.

Editing addon source rebuilds it and restarts every Storybook — necessary,
because Storybook compiles its manager bundle once at startup and cannot
hot-reload an addon.

Before pushing, run `lint`, `typecheck`, `test`, and `format`. When you touch
capture, comparison, or approval, run `test:visual` too — and
`STORYPROOF_CONTAINER=1 pnpm dev` (needs Docker) if the change could move
pixels. CI runs all of it plus a packed-tarball consumer check, so a green
local run predicts CI without guaranteeing it.

## Conventions

- **Conventional commits** (`feat:`, `fix:`, `build:`, `docs:`). No monorepo
  scope needed — the addon is the default subject; use `website:` for the site.
- **Changesets**: if your PR changes the published package, run
  `pnpm changeset` and commit the file it writes. It records which version
  bump the change deserves, and its markdown body becomes the
  [CHANGELOG](packages/storyproof/CHANGELOG.md) entry — write it for users.
  Repo-only chores need none, and don't worry if you forget; a maintainer
  will add it. You do not need to understand the release process
  ([RELEASING.md](RELEASING.md) if you're curious).
- **Rationale goes in the code.** This repository keeps no design docs: the
  "why" behind a non-obvious decision belongs in a comment at the decision
  site, where the next person to touch that line will actually read it.
- **Baselines are committed images.** Approving one writes a PNG into the
  repository, so it gets reviewed like any other file. That is the trust
  boundary — see [the package README](packages/storyproof/README.md) — and
  changes near `src/node/paths.ts`, the artifact route, or the approval flow
  are weighed accordingly.

Architecture — the node/manager process split, the examples' two-tier design,
and the decisions that are expensive to rediscover — lives in
[AGENTS.md](AGENTS.md) and
[packages/storyproof/AGENTS.md](packages/storyproof/AGENTS.md) (`CLAUDE.md`
and `GEMINI.md` are symlinks to the former). Those files import this one, so
an agent working here starts with the same contract you just read: one set of
rules, not a human copy and a machine copy that drift apart.

## AI-assisted contributions

AI assistance is **allowed and disclosed**, not banned and not invisible. This
project is itself built with heavy agent use, so a ban would be dishonest.
Three rules:

**1. Disclose it, per commit.** Add an `Assisted-by:` trailer naming the tool
and model:

```
Assisted-by: claude-code/claude-opus-5
Assisted-by: codex/gpt-5.4
```

Use `Generated-by:` instead when a substantial portion of the diff was written
by the agent rather than edited by you. This matches the convention converging
across [OpenSSL](https://openssl-library.org/policies/general/ai-policy/), the
[Linux kernel](https://docs.kernel.org/process/coding-assistants.html), and the
[OpenInfra Foundation](https://openinfra.org/legal/ai-policy/). Note what it is
_not_: `Co-authored-by:` and `Signed-off-by:` stay reserved for humans, because
they carry authorship and legal attestation an agent cannot give.

Mention it in the PR description too, briefly — which parts, which tool, what
you checked yourself.

**2. You own the diff.** A human must have read every line, understood why it
works, and be able to defend it in review without re-consulting the agent. If
you cannot explain a change, do not open a PR with it; that is the line
between assisted work and **vibe-coding** — prompting until output looks
plausible, shipping without comprehension. Vibe-coded PRs get closed, not
reviewed, and that is the one place we are strict: review time is the scarce
resource an unreviewed patch spends on everyone's behalf.

Non-trivial work should start with a plan or a written intent, not a prompt.
The failure mode we care about is not "an agent wrote it" — it is "nobody
decided what it should do."

**3. Verify claims, especially confident ones.** Agents fabricate APIs,
versions, and rationale fluently. Check anything an agent asserts about
library behavior against the actual installed package, and anything about
measurements by running the measurement. Several comments in this codebase
exist precisely because a plausible-sounding claim turned out to be wrong when
someone ran it.

Optional but appreciated: [`git-ai`](https://github.com/git-ai-project/git-ai)
records line-level attribution in Git notes (`git ai blame`, `git ai stats`),
so which lines came from which agent survives rebases and squashes rather than
living in a trailer someone has to trust. It needs no per-repo setup.

## Pull requests

`main` is protected: pull requests only, all CI checks green, every review
thread resolved, squash merges. Review is auto-requested from the maintainer
via [`.github/CODEOWNERS`](.github/CODEOWNERS) — and only a maintainer can
press Merge, so an outside pull request always waits for one.

Small and focused beats large and complete. Describe what changed and how you
verified it — for visual behavior, a screenshot of the panel says more than a
paragraph. Draft PRs are welcome for early feedback.

Expect review comments to ask "what did you measure?" on anything involving
rendering determinism. That is not distrust; identical-looking machines have
been measured rendering differently, which is why the addon records a render
fingerprint at all.

## Reporting bugs

Open an issue with the Storybook version, framework (`react-vite`,
`nextjs-vite`, …), OS, and whether capture ran on the host or in a container.
A minimal reproduction on top of one of the [examples](examples) is the fastest
path to a fix.

Security issues: please don't open a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/leon0399/storyproof/security/advisories/new).

## Code of conduct

Be decent. Assume good faith, accept that people are working with different
context than you, and take disagreements to the technical merits.
