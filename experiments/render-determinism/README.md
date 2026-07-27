# Render determinism experiment — TEMPORARY

**This directory and `.github/workflows/render-determinism.yml` are throwaway.
Delete both once the question below is answered.** What should survive is a dated
note in the environment-identity design doc, not this harness.

## The question

storyproof's baseline path key is `chromium-1280x720@1x` — browser name,
viewport, scale. It carries **no platform and no architecture**, so a baseline
captured on one machine is compared pixel-for-pixel against a candidate captured
on another. `compatibleMetadata` in `src/node/compare.ts` records `platform` in
baseline metadata but never compares it, so nothing catches the mismatch.

Before deciding what belongs in that key, three things need measuring rather
than assuming:

| Comparison                     | Question                               | Why it changes the design                                                                                                                           |
| ------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| amd64 vs arm64, same container | Does architecture alone change pixels? | If not, Apple Silicon developers run a native arm64 container and container-based capture is fast. If so, they need amd64 emulation and it is slow. |
| container vs bare Linux        | Does the container change anything?    | If not, a Linux-only team needs no container at all.                                                                                                |
| Linux vs macOS                 | Does the OS change pixels?             | Evidence for (or against) putting platform in the key.                                                                                              |

## What it captures

A single fixed HTML page with no network dependencies: `system-ui` text at
several sizes and weights, a border radius, and a rotated element for
antialiased diagonals. Text rasterization and edge antialiasing are where
platform differences appear; a small page keeps any difference readable instead
of producing a wall of red.

This measures **Chromium's rasterization of that page**. A real app with custom
webfonts, canvas, or video could still diverge where this does not. It narrows
the risk; it does not eliminate it.

## Running it

Automatically on push, per `.github/workflows/render-determinism.yml`. Locally:

```bash
cd experiments/render-determinism
pnpm install --ignore-workspace
pnpm exec playwright install chromium
LABEL=local node capture.mjs
```
