---
"storyproof": patch
---

Fixes container capture failing after a Playwright upgrade with
`No matching version found for playwright@<version>`, naming a version that
plainly exists. The container's npm cache was shared across versions, so one
written before a release had no record of it — and no way to tell. The cache is
now per version, and the error names the volume to clear if it recurs.

A leftover `storyproof-npm-cache` volume is now unused:
`docker volume rm storyproof-npm-cache`.

The install inside the container also runs with lifecycle scripts disabled now,
so a package fetched at capture time cannot execute install hooks. It was
already pinned to an exact version. A custom `capture.container.image` must ship
the browsers itself — the official images do.
