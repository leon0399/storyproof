---
"storyproof": minor
---

`playwright` is now a peer dependency you install and own, instead of a version
storyproof pins for you.

```bash
pnpm add -D playwright        # alongside storyproof
pnpm exec playwright install chromium
```

Most package managers install a missing peer automatically, so an upgrade may
need nothing from you — but declaring it explicitly is what puts the version
under your control.

**Why this matters more than a dependency detail:** the Playwright version is
part of a baseline's identity. A baseline captured with a different one is
refused with "Review and re-approve after the Playwright upgrade". While
storyproof pinned Playwright, a storyproof release that happened to bump it
would invalidate every baseline in your repository — a full visual re-review you
never asked for, on storyproof's schedule. Now upgrading Playwright is your
decision, made when you have time to review what moved. It also means a single
Playwright copy and a single browser download shared with any Playwright you
already run for end-to-end tests.

The declared peer range is `>=1.45.0 <2`. 1.45.0 is the oldest version that
supports container capture (Noble images and `run-server --host`); CI exercises
both the floor and the current catalog version.
