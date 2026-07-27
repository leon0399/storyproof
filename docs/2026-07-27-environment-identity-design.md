# Environment identity and reproducible capture (2026-07-27)

Why a baseline is only valid for the environment that rendered it, what
storyproof now records about that environment, and how container capture makes
every machine render identically.

Companion evidence: `experiments/render-determinism/` (temporary harness; its
README carries the raw hashes). This document is the durable record.

## The measurements this design rests on

Six results, all from 2026-07-27, Chromium `140.0.7339.186` in every cell:

1. **Architecture does not change pixels.** amd64 and arm64 running the same
   container image produced byte-identical PNGs. Architecture therefore does
   NOT belong in the environment key — it would fragment baselines along a
   dimension that provably does not affect rendering — and Apple Silicon needs
   no emulation.
2. **The OS does.** Bare macOS and bare Linux rendered different pixels.
3. **The font stack does.** Bare Linux differs from containerized Linux on the
   same machine; the container pins fonts the host does not.
4. **Two "identical" Linux hosts disagree.** Bare WSL2 and a bare
   `ubuntu-24.04` runner — same platform, same arch, same Chromium build,
   byte-identical font metrics — produced different pixels. Whatever differs
   (hinting, antialiasing configuration) is invisible to every attribute a
   tool could enumerate.
5. **The container erases that disagreement.** The same two hosts produced
   byte-identical output inside the same image, including through Docker
   Desktop's VM (hypervisor-mediated Docker matched native Linux Docker).
6. **How the container starts is irrelevant** (`container:` key vs
   `docker run`): the image fully determines the output on a Linux host.

Consequences, in one line each:

- Platform belongs in the baseline path (coexistence + named mismatches).
- Architecture must stay out of it.
- No enumerable metadata can prove two environments render alike — only a
  rendered probe can (result 4).
- One shared container is the only mechanism that makes developer machines
  agree (result 5), and it is affordable everywhere (results 1, 5).

## The three mechanisms

### 1. Platform in the environment key

`chromium-1280x720@1x` → **`linux-chromium-1280x720@1x`** (or `darwin-…`,
`win32-…`). The key is resolved at runtime (`src/node/environment.ts`); the
platform component describes where the **browser** renders — in container mode
that is `linux` regardless of the host, which is exactly the point: a macOS
and a Linux developer capturing through the container share one baseline set.

The key holds only stable, coexistence-worthy dimensions: platform, browser
name, viewport, scale. Churning dimensions (browser build, font stack) live in
metadata, where a change means "re-approve", not "new parallel directory".

This is a **reversal of a deliberate earlier decision**, not a bug fix: the
original design recorded platform as provenance only and had a test asserting
cross-platform comparisons pass. Results 2–3 are the evidence that overturned
it.

### 2. The render fingerprint (baseline metadata schema 2)

At the start of every capture session the browser renders a fixed probe page
(`RENDER_PROBE_HTML`: system-ui text at several weights, a border radius, a
rotation, a gradient — the places environments actually diverge) and its PNG's
SHA-256 goes into every candidate's `baseline.json` as `renderFingerprint`.

Comparison order in `compare.ts` — most explanatory reason first: platform,
browser name, browser version, Playwright version, viewport/scale, and only
then the fingerprint, which is the catch-all for result 4: differences nothing
enumerable can name. Every mismatch is a **named incompatibility**
(`status: "changed"` with a message, no diff image), never a false pixel diff.

Schema-1 baselines (llame has 394) fail closed with a migration message
("uses storyproof schema 1 … re-approve"), not a generic "malformed".

Limit, stated rather than discovered: the fingerprint is as good as the probe.
It covers text rasterization and edge antialiasing; content the probe does not
exercise (canvas, video, WebGL) could still diverge undetected. That failure
mode leaves you exactly where the tool was before fingerprints existed.

### 3. Container capture (`capture.container`)

Opt-in preset option. storyproof starts the version-matched Playwright image
(`mcr.microsoft.com/playwright:v<installed>-noble`), runs
`npx -y playwright@<exact same version> run-server` inside it, connects over
WebSocket, and captures there. The addon's Node side — approval, path guards,
the artifact route — stays on the host; **the trust boundary does not move**.

Topology, each leg measured (see the checks recorded 2026-07-27):

- **Bridge network + `host.docker.internal:host-gateway`**, not
  `--network host`: host networking fails on Docker Desktop (the daemon lives
  in a VM), while the gateway alias reaches a host-loopback server from both
  Docker Desktop and native Linux.
- **Story URLs are rewritten to the gateway's resolved IP, not the
  hostname.** Found the empirical way — the first container suite failed
  systemically with 403s: Vite's DNS-rebinding protection rejects Host
  headers with unknown hostnames but exempts IP literals (measured:
  `Host: host.docker.internal` → 403, `Host: 172.17.0.1` and
  `Host: 192.168.65.254` → 200). The container resolves
  `host.docker.internal` itself at startup and prints the IP; the browser
  navigates by IP, so no Vite `allowedHosts` configuration is needed from
  the consumer and no allowlist is widened. **IPv4 explicitly**
  (`getent ahostsv4`): the second failed suite showed default resolution
  preferring the IPv6 alias (`fdc4:…::254`), which is unreachable from the
  container on Docker Desktop (`ERR_ADDRESS_UNREACHABLE`) while the IPv4
  leg (`192.168.65.254`) returns 200 — both measured directly.
- **WebSocket port published to `127.0.0.1` only** — the browser server never
  becomes a network service.
- **Exact-version `npx` install at container start**: the image ships
  browsers but not the npm package (verified against v1.55.1-noble), and the
  Playwright wire protocol is version-locked.
- **One shared container per image per dev-server process**, health-checked
  via `isConnected()` and replaced if it died; stopped best-effort on process
  exit, `--rm` + a `storyproof` label make leftovers visible and
  self-cleaning. A container per run would cost 10–20 s per panel click.

Failure modes are named, fail-closed errors: no docker CLI, container exited
before ready (with stderr tail), readiness timeout (with a pre-pull hint —
first use pulls ~2 GB).

## What local capture remains for

Local (host-browser) capture stays the default. For a solo developer or a
single-OS team, what you see in the preview is what gets captured, and that
DevEx is a feature. Container capture is what a mixed macOS/WSL/Linux team
opts into — accepting that the capture environment's fonts differ from their
live preview's, which the panel now labels (`linux · chromium 140… ·
container`) so the difference is a stated fact rather than a support ticket.

The known cost, honestly: with `system-ui`-styled components the
container-vs-preview font difference is large (a 12% text-width delta was
measured). Apps that self-host their webfonts collapse that gap to hinting
subtleties.

## Compatibility

Pre-`0.1.0`, zero real consumers of the published package (the alpha's panel
never rendered), so this is the window where identity can change:

- **Baseline paths move** (`<key>` gains the platform prefix). Existing trees
  re-baseline: run + approve; stale directories are inert and get deleted
  manually.
- **`baseline.json` schema 1 → 2.** Old files produce the migration message.
- llame (394 baseline files) migrates by re-approving after it bumps.

## Verification

- 134 unit tests including: key derivation, container argument topology,
  endpoint parsing/rebasing, URL rewriting, capture-option validation,
  platform/fingerprint/schema-1 comparison messages.
- Acceptance suite (host capture) green locally on WSL2.
- Acceptance suite (container capture) — `STORYPROOF_CONTAINER=1`, exercised
  locally against Docker Desktop and by CI's `visual-container` job on native
  Linux Docker, which covers both `host-gateway` implementations.
