// Runs as part of `pnpm version-packages` (see root package.json), i.e.
// inside the version PR that changesets/action opens on main. After
// `changeset version` bumps the manifest, this rolls the hand-written
// CHANGELOG: `## [Unreleased]` becomes a fresh empty section on top of a
// dated heading for the new version. The prose itself stays hand-written in
// feature PRs — only the mechanical roll is automated, so the version PR
// arrives complete and merging it needs no laptop.
//
// Idempotent: the action recreates the version branch from main on every
// push, so this always starts from a CHANGELOG whose entries sit under
// [Unreleased]; if the new version's heading somehow already exists, it
// leaves the file alone.
import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = new URL(
  "../packages/storyproof/package.json",
  import.meta.url,
);
const changelogPath = new URL(
  "../packages/storyproof/CHANGELOG.md",
  import.meta.url,
);

const { version } = JSON.parse(readFileSync(manifestPath, "utf8"));
const changelog = readFileSync(changelogPath, "utf8");

if (changelog.includes(`## [${version}]`)) {
  console.log(
    `CHANGELOG already has a heading for ${version} — nothing to do.`,
  );
  process.exit(0);
}
if (!changelog.includes("## [Unreleased]")) {
  console.error("CHANGELOG has no ## [Unreleased] section to roll.");
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
writeFileSync(
  changelogPath,
  changelog.replace(
    "## [Unreleased]",
    `## [Unreleased]\n\n## [${version}] - ${date}`,
  ),
);
console.log(`Rolled [Unreleased] into [${version}] - ${date}.`);
