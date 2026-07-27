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

## Results — 2026-07-27, run 30295727717

All four cells ran Chromium `140.0.7339.186`.

| Cell                    | SHA-256     | `system-ui` width |
| ----------------------- | ----------- | ----------------- |
| `linux-amd64-container` | `3c157705…` | 1190.44           |
| `linux-arm64-container` | `3c157705…` | 1190.44           |
| `linux-amd64-bare`      | `bec2dc20…` | 1352.34           |
| `macos-arm64-bare`      | `50f1ac62…` | 1165.44           |

**1. Architecture alone does not change pixels.** amd64 and arm64 in the same
container image produced **byte-identical** PNGs. Apple Silicon can run a native
arm64 container; amd64 emulation is unnecessary. This also means **architecture
does not belong in the environment key** — including it would fragment baselines
along a dimension that demonstrably does not affect rendering.

**2. The container changes everything.** Bare Linux differs from the same
architecture inside the container, with a font stack that measures 162px wider
on the probe string. The container is doing real work: it pins the fonts.

**3. macOS differs from Linux**, as expected — evidence for the key, replacing
assertion.

**4. The uncomfortable one: two Linux machines disagree.** An uncontrolled local
run on WSL2 (same `platform`/`arch`, same Chromium build) produced
`bc480c76…` — a _different hash from the bare CI runner_ despite an **identical**
`system-ui` width of 1352.34. Same OS family, same fonts by metric, same browser,
different pixels. Rasterization settings (hinting, antialiasing) differ below the
level anything in the key can see.

The consequence is important: **`platform` in the key is necessary but not
sufficient.** It fixes macOS-vs-Linux, and does nothing for Linux-vs-Linux. Only
containerized capture makes two developer machines agree — and result 1 says
that is now affordable for everyone, including Apple Silicon.

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
