@AGENTS.md

## Claude Code Specific Rules

Close out a non-trivial change with `/code-review:code-review --fix`, and
`/simplify` when the diff added more than it removed. Both are worth running on
single-language changes — the value is a second pass over the diff, not
cross-stack coverage.

Opt-outs: typo, doc-only, dependency bump, format-only.
