---
"storyproof": patch
---

Fixes container capture breaking after a Playwright upgrade, and stops the
runtime install from executing lifecycle scripts.

Container capture starts a version-matched Playwright server inside the
image, and cached npm data was shared across every version. A cache written
before a given Playwright release has no record of it, so the first capture
after upgrading failed with `No matching version found for
playwright@<version>` — naming a version that plainly exists — and kept
failing until the Docker volume was deleted by hand. Nothing pointed at the
cache. The cache is now keyed by Playwright version, so a cache can only
ever be consulted for the version that created it.

The install that runs inside the container is fetched from the registry at
capture time. It was already pinned to an exact version; it now also runs
with lifecycle scripts disabled, so a package arriving at capture time
cannot execute install hooks. The image already ships the browsers that
Playwright's postinstall would otherwise download.

If you hit the old failure, any leftover `storyproof-npm-cache` volume is
now unused and can be removed: `docker volume rm storyproof-npm-cache`.
