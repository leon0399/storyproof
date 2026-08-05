# Agent instructions — storyproof

Why the repository is shaped the way it is — the decisions that are expensive to
rediscover. `GEMINI.md` is a symlink to this file; `CLAUDE.md` imports it and
adds its own rules.

## Documentation

- @README.md — what storyproof is, and where everything lives
- @CONTRIBUTING.md — setup, the checks to run, commit and changeset conventions,
  the AI-assistance policy
- [RELEASING.md](RELEASING.md) — the release process; maintainers only, nothing
  publishes from a developer machine
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Contributor Covenant 3.0
- [SECURITY.md](SECURITY.md) — what counts as a vulnerability, and where to
  report it

## Where rationale lives

The most local place that can hold it:

1. **A comment at the decision site** — the default. The person about to break a
   decision is editing that line, not browsing documentation.
2. **The nearest `AGENTS.md`** — when a decision is cross-cutting and no single
   file owns it, or when the code it explains no longer exists (a rejected
   approach, a negative result).
3. **The issue tracker** — anything forward-looking. No roadmaps or release
   plans in the repository.

Write the second tier as a present-day constraint, not a story: "no example pins
Storybook 10.0.x, and none should — it never registers the `storyIndexGenerator`
preset the addon requires" rather than "we tried 10.0.x and removed it."

## Layout

pnpm workspace monorepo (Node >= 22.12, development pin in `.node-version`;
pnpm 10) on Turborepo.

| Path                  | Role                                                             | Own instructions                           |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `packages/storyproof` | The addon — the only published npm package (`storyproof`)        | [AGENTS.md](packages/storyproof/AGENTS.md) |
| `examples/*`          | Storybook examples: the dev loop, and CI's acceptance fixture    | [AGENTS.md](examples/AGENTS.md)            |
| `apps/website`        | storyproof.dev site (placeholder, private, framework not chosen) | —                                          |

Those files are the authority for their areas — don't restate them here.

**The task graph is real, not ceremony.** `examples/*` need
`packages/storyproof` to have been **built**, not merely linked, and Storybook
cannot hot-reload an addon (its manager bundle compiles once at startup) —
`turbo watch` is what rebuilds and restarts it.

## Toolchain decisions

The parts of the command list that look wrong until you know why.

- **A 7-day release cooldown gates dependency resolution** (`minimumReleaseAge`,
  `pnpm-workspace.yaml`), so a compromised release has a detection window before
  it can enter the lockfile. Prefer ranges over exact pins: a range degrades to
  the newest mature version, an exact pin on a young release fails closed.
- **`pnpm pack` always rebuilds first** (`prepack` lifecycle script), and
  `test/pack-inventory.test.ts` asserts the tarball allowlist and size budget.
- **ESM-only is permanent product intent, not an accident.** No CJS build ships
  and none is planned unless a demonstrated consumer requires one. Hence
  `tsdown.config.ts` gating on attw's `esm-only` profile, and
  `exports: true`-derived subpaths as bare strings with no explicit `"types"`
  condition (TypeScript resolves the sibling `.d.ts`; attw passing is the
  authority). Do not "helpfully" add a CJS output without that evidence.

## Finishing pass

Run the checks from [the loop](CONTRIBUTING.md#the-loop) before declaring work
done, not merely before pushing. Add `test:visual` when the diff touches
capture, comparison, or approval, and a container run when it could move pixels.

**Never hand-edit `baseline.png` or `baseline.json`**: they are bound to a
candidate hash, so editing either makes the next run report stale-approval.
Re-approve through a running example ([examples/AGENTS.md](examples/AGENTS.md)).

## Frequent problems

Each of these cost real time at least once, because the symptom does not name
the cause.

**`visual - node 24 - webkit - host` red, other engines green.** Not your diff:
webkit fails on roughly half of all runs, while chromium and firefox have not
failed once in the same window. It is a required check, so it blocks merges for
no signal — worth fixing rather than waiting out.

**`ERR_PNPM_NO_MATURE_MATCHING_VERSION` naming a package you never touched.**
The release cooldown re-validates the whole graph on any resolution, so the
package it names is rarely the one you edited. Look instead for a range whose
_entire_ satisfying set is younger than the cooldown, which is usually a caret
whose floor is a fresh release: `^16.3.0` published yesterday has nothing mature
to fall back to. Lower the floor rather than adding an exclusion.

**Every baseline reports "changed" after a Playwright bump, and every PNG is
byte-identical.** The environment identity moved, not the pixels —
`baseline.json` records the Playwright version, and a mismatch is reported
rather than diffed. Re-approve in container mode.

## Commits

[Conventional commits](https://www.conventionalcommits.org/), and the same for
pull request titles, since `main` squash-merges. The type is the part worth
copying, because the mapping here is not the obvious one:

```text
build: gate dependency resolution behind a 7-day release cooldown
test: re-approve example baselines for playwright 1.62.0
ci: fail fast when the playwright catalog entry cannot be read
feat: make playwright a peer dependency
fix: key the container npm cache by playwright version
docs: give examples/ its own agent instructions and trim the rest
```

Dependencies and toolchain are `build:`; `chore:` is housekeeping that changes
neither. Baselines are `test:` — fixtures, whatever the extension. Subjects say
what the change does; bodies say why.

Trailers, `Generated-by:` when the agent wrote most of the diff:

```text
Assisted-by: claude-code/claude-opus-5
Assisted-by: codex/gpt-5.6-terra
Assisted-by: github-copilot/gpt-5.4
Generated-by: cursor/composer-2.5
```

`Co-authored-by:` and `Signed-off-by:` are for humans only.

## AI assistance

Allowed, and disclosed in every commit and PR description.

- **A human owns every line** and must be able to defend it without
  re-consulting you.
- **Verify confident claims** — library behavior against the installed package,
  measurements by running them.

Full policy:
[CONTRIBUTING.md § AI-assisted contributions](CONTRIBUTING.md#ai-assisted-contributions).

## Invariants

Neither is negotiable in a routine change:

- **The trust boundary.** Approval writes repository files; development
  Storybook is a trusted local interface; Git/PR review is the authorization
  path. Weigh any change touching the artifact route, the path guards
  (`src/node/paths.ts`), or the approval flow accordingly.
- **Nothing publishes from a developer machine.** Releases run from a tag
  through an approval-gated workflow.
