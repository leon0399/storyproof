import { execFile, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { chromium, firefox, webkit } from "playwright";

import type { CaptureBrowserName } from "./environment.js";

const execFileAsync = promisify(execFile);

// `playwright run-server` is engine-generic; the CLIENT chooses the engine at
// connect time, so each engine needs its own connect entry point.
const CONNECTORS = { chromium, firefox, webkit } as const;

/**
 * Containerized capture: a version-matched Playwright browser server inside
 * the official image, with the addon's Node side staying on the host so
 * approval keeps writing host files through the existing path guards.
 *
 * Topology — each leg below carries its own measured justification
 * (all 2026-07-27):
 *
 * - **Bridge network + `host.docker.internal:host-gateway`**, NOT
 *   `--network host`: host networking fails on Docker Desktop (WSL2/macOS,
 *   where the daemon lives in a VM), while the gateway alias reaches a
 *   host-loopback server from both Docker Desktop and native Linux. The
 *   browser loads stories via the gateway's **resolved IP** (printed by the
 *   container at startup), not the hostname: Vite's DNS-rebinding
 *   protection 403s unknown hostnames but trusts IP-literal Host headers.
 * - **WebSocket port published to host loopback only** (`-p 127.0.0.1::…`),
 *   so nothing beyond this machine can drive the browser server.
 * - **`npx -y playwright@<exact local version> run-server`**: the image
 *   ships browsers but not the npm package, and the Playwright wire protocol
 *   requires client and server versions to match.
 *
 * The container is shared per image for the life of the dev-server process —
 * one run per panel click must not pay container startup every time. It is
 * stopped on process exit best-effort; `--rm` plus the `storyproof` label
 * make leftovers visible (`docker ps --filter label=storyproof`) and
 * self-cleaning once stopped.
 */

const CONTAINER_SERVER_PORT = 4444;
const READY_TIMEOUT_MS = 300_000; // first use may pull a ~2 GB image
const CONNECT_TIMEOUT_MS = 30_000;

export interface ContainerBrowserRequest {
  image: string;
  playwrightVersion: string;
  /** Engine to connect as; the image ships all three. Default chromium. */
  browser?: CaptureBrowserName;
}

// Structural view of what the capture session needs from a connected
// browser; playwright's Browser satisfies it.
export interface ConnectedBrowser {
  newContext(options: object): Promise<unknown>;
  close(): Promise<unknown>;
  version(): string;
  isConnected(): boolean;
}

export interface ContainerBrowser {
  browser: ConnectedBrowser;
  image: string;
  mapBaseUrl(url: string): string;
  /** Shared across runs; lets sessions reuse one probe per container. */
  fingerprintCache: FingerprintCache;
  /** Per-session close: keeps the shared browser and container alive. */
  release(): Promise<void>;
}

export function containerRunArguments(options: {
  name: string;
  image: string;
  playwrightVersion: string;
}): string[] {
  return [
    "run",
    "--rm",
    "--init",
    "--name",
    options.name,
    "--label",
    "storyproof",
    // Reaches a host-loopback Storybook from inside the bridge network; the
    // documented native-Linux mechanism, and verified to work on Docker
    // Desktop as well.
    "--add-host",
    "host.docker.internal:host-gateway",
    // Pin HOME to the user the container actually runs as. Firefox refuses
    // to launch when $HOME isn't owned by the current user (measured: this
    // exact refusal under GitHub's `container:` mechanism, which mounts a
    // runner-owned HOME). The Docker default happens to align today; an
    // image override or an env-injecting wrapper would break Firefox with a
    // confusing error, so make it true by construction rather than by luck.
    "-e",
    "HOME=/root",
    // Persist npm's cache across containers so the exact-version `npx`
    // install below downloads once per machine rather than on every
    // container start (measured biting: a slow registry moment pushed
    // first-capture past the acceptance suite's UI timeout in CI). The cache
    // is content-addressed (cacache) and integrity-checked, so concurrent
    // containers sharing it are safe.
    //
    // Keyed by playwright version, and that is the whole point rather than
    // tidiness. A single shared volume outlives its own correctness: npm
    // caches the package's version list, and one written before a given
    // playwright release has no record of it. Measured 2026-08-03 — a
    // volume created 2026-07-29 failed every capture after the 1.55.1 ->
    // 1.62.1 upgrade with "No matching version found for playwright@1.62.1",
    // blaming a version that plainly exists, and kept failing until the
    // volume was deleted by hand. Every user meets that on their first
    // upgrade, with nothing pointing at the cache. Per-version volumes make
    // it unreachable: a volume only ever serves the one version whose
    // install created it. Old ones are inert; `docker volume ls` finds them
    // by this prefix.
    "-v",
    `storyproof-npm-cache-${options.playwrightVersion}:/root/.npm`,
    // Safe again now the volume is version-scoped: the cached version list
    // can only ever be consulted for the version whose install wrote it, so
    // skipping the freshness check cannot hide a release from itself. Keeps
    // a warm start independent of the registry, which is the resilience the
    // measured CI timeout above was about.
    "-e",
    "npm_config_prefer_offline=true",
    // Lifecycle scripts stay off: this install is fetched from the network
    // at capture time, so its install hooks would be arbitrary code entering
    // from outside the pinned supply chain — the one part of container
    // capture not fixed by the image digest or the exact version. Verified
    // 2026-08-03 that `run-server` starts without them ("Listening on
    // ws://0.0.0.0:9999/"); the image already ships the browsers that
    // playwright's postinstall would otherwise fetch.
    "-e",
    "npm_config_ignore_scripts=true",
    // Host side stays loopback-only: the browser server is a local tool, not
    // a network service.
    "-p",
    `127.0.0.1::${String(CONTAINER_SERVER_PORT)}`,
    options.image,
    "sh",
    "-c",
    // Print the gateway's resolved IP before starting the server: the
    // browser must navigate to the Storybook by IP, not by the
    // `host.docker.internal` name — Vite's DNS-rebinding protection 403s
    // unknown hostnames but exempts IP-literal Host headers (measured
    // 2026-07-27: hostname → 403, gateway IP → 200). IPv4 explicitly
    // (`ahostsv4`): plain `getent hosts` prefers the IPv6 alias, which was
    // measured unreachable from the container on Docker Desktop
    // (ERR_ADDRESS_UNREACHABLE) while the IPv4 leg returns 200. Exact
    // playwright version: the wire protocol is version-locked, and the
    // image does not ship the npm package.
    `ip=$(getent ahostsv4 host.docker.internal | head -n1 | cut -d" " -f1); [ -n "$ip" ] || ip=$(getent hosts host.docker.internal | head -n1 | cut -d" " -f1); echo "STORYPROOF_GATEWAY $ip"; exec npx -y playwright@${options.playwrightVersion} run-server --host 0.0.0.0 --port ${String(CONTAINER_SERVER_PORT)}`,
  ];
}

export function parseListeningEndpoint(chunk: string): string | undefined {
  const match = /Listening on (wss?:\/\/\S+)/.exec(chunk);
  return match?.[1];
}

export function parseGatewayAddress(chunk: string): string | undefined {
  const match = /STORYPROOF_GATEWAY (\S+)/.exec(chunk);
  return match?.[1];
}

/** Rebase the endpoint the server printed (container-side host/port) onto the
 * host-published loopback port, keeping the scheme (parseListeningEndpoint
 * accepts wss:// too — silently downgrading it would connect plaintext to a
 * TLS port and time out opaquely) and any path/token. */
export function publishedWsEndpoint(
  printedEndpoint: string,
  hostPort: string,
): string {
  const url = new URL(printedEndpoint);
  const scheme = url.protocol === "wss:" ? "wss" : "ws";
  return `${scheme}://127.0.0.1:${hostPort}${url.pathname}${url.search}`;
}

/**
 * Rewrite a loopback story URL so the containerized browser can reach the
 * host's Storybook. `gatewayAddress` is the IP `host.docker.internal`
 * resolves to inside the container; the IP form matters because Vite's
 * host check trusts IP-literal Host headers and 403s the hostname. Falls
 * back to the hostname when resolution failed — a non-Vite server accepts
 * it, and a Vite server fails with the same visible 403 as before.
 */
export function rewriteToContainerHost(
  url: string,
  gatewayAddress?: string,
): string {
  const parsed = new URL(url);
  if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
    // IPv6 needs brackets in URLs; URL.hostname handles them when assigned.
    parsed.hostname =
      gatewayAddress && gatewayAddress.includes(":")
        ? `[${gatewayAddress}]`
        : (gatewayAddress ?? "host.docker.internal");
  }
  return parsed.toString();
}

export interface FingerprintCache {
  promise?: Promise<string>;
}

interface SharedContainer {
  browser: ConnectedBrowser;
  name: string;
  image: string;
  gatewayAddress?: string;
  // Owned by the shared entry so the render-probe cost is paid once per
  // container lifetime, not once per run — the shared browser's rendering
  // environment cannot change while it lives. A replaced (crashed) container
  // gets a fresh entry and therefore a fresh cache.
  fingerprintCache: FingerprintCache;
}

const shared = new Map<string, Promise<SharedContainer>>();
let exitHookInstalled = false;
const startedContainers = new Set<string>();

export async function acquireContainerBrowser(
  request: ContainerBrowserRequest,
): Promise<ContainerBrowser> {
  // Keyed by image AND engine: one dev server uses one engine, but two
  // Storybooks (say, the two examples) may run different ones concurrently.
  const key = `${request.image}\0${request.browser ?? "chromium"}`;
  let entry = shared.get(key);
  if (entry) {
    const existing = await entry.catch(() => undefined);
    // A crashed or manually stopped container must not poison every later
    // run; drop the cache entry and start fresh.
    if (!existing || !existing.browser.isConnected()) {
      shared.delete(key);
      entry = undefined;
    }
  }
  if (!entry) {
    entry = startContainer(request);
    shared.set(key, entry);
    entry.catch(() => shared.delete(key));
  }
  const container = await entry;
  return {
    browser: container.browser,
    image: container.image,
    mapBaseUrl: (url) => rewriteToContainerHost(url, container.gatewayAddress),
    fingerprintCache: container.fingerprintCache,
    release: async () => {
      // Shared across runs; the process-exit hook owns real teardown.
    },
  };
}

async function startContainer(
  request: ContainerBrowserRequest,
): Promise<SharedContainer> {
  const name = `storyproof-${randomUUID().slice(0, 8)}`;
  const child = spawn("docker", containerRunArguments({ name, ...request }), {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stderrTail: string[] = [];
  child.stderr.on("data", (data: Buffer) => {
    stderrTail.push(data.toString("utf8"));
    if (stderrTail.length > 40) stderrTail.shift();
  });

  installExitHook();
  startedContainers.add(name);
  child.on("exit", () => startedContainers.delete(name));

  try {
    const ready = await waitForEndpoint(child, stderrTail, request);
    const hostPort = await resolvePublishedPort(name);
    const wsEndpoint = publishedWsEndpoint(ready.endpoint, hostPort);
    const connector = CONNECTORS[request.browser ?? "chromium"];
    const browser = (await connector.connect(wsEndpoint, {
      timeout: CONNECT_TIMEOUT_MS,
    })) as unknown as ConnectedBrowser;
    return {
      browser,
      name,
      image: request.image,
      fingerprintCache: {},
      ...(ready.gatewayAddress ? { gatewayAddress: ready.gatewayAddress } : {}),
    };
  } catch (error) {
    stopContainer(name);
    child.kill();
    throw error;
  }
}

function waitForEndpoint(
  child: ReturnType<typeof spawn>,
  stderrTail: string[],
  request: ContainerBrowserRequest,
): Promise<{ endpoint: string; gatewayAddress?: string }> {
  return new Promise<{ endpoint: string; gatewayAddress?: string }>(
    (resolve, reject) => {
      let stdout = "";
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timed out waiting for the container browser server (${String(READY_TIMEOUT_MS / 1000)}s). First use pulls ${request.image} (~2 GB); pre-pull it with "docker pull ${request.image}" to avoid the wait.${tail(stderrTail)}`,
          ),
        );
      }, READY_TIMEOUT_MS);

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString("utf8");
        const endpoint = parseListeningEndpoint(stdout);
        if (endpoint) {
          clearTimeout(timer);
          resolve({
            endpoint,
            gatewayAddress: parseGatewayAddress(stdout),
          });
        }
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          error.code === "ENOENT"
            ? new Error(
                'Container capture requires the Docker CLI ("docker") on PATH. Install Docker (or Docker Desktop), or remove the capture.container option to capture with the host browser.',
              )
            : error,
        );
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(
          new Error(
            `The capture container exited before its browser server was ready (exit code ${String(code)}).${cacheHint(stderrTail, request)}${tail(stderrTail)}`,
          ),
        );
      });
    },
  );
}

async function resolvePublishedPort(name: string): Promise<string> {
  // `docker port` can lag the server's own readiness line by a beat, so
  // transient failures retry — but the LAST error is kept and surfaced,
  // because a persistent cause (a daemon-socket permission problem, say)
  // must not hide behind a generic port message for 5 seconds and then
  // point nowhere near the real fix.
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const { stdout } = await execFileAsync("docker", [
        "port",
        name,
        `${String(CONTAINER_SERVER_PORT)}/tcp`,
      ]);
      const match = /:(\d+)\s*$/m.exec(stdout);
      if (match?.[1]) return match[1];
      lastError = `docker port printed no host port: ${stdout.trim() || "(empty output)"}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Could not resolve the published WebSocket port for container "${name}".${lastError ? ` Last docker error: ${lastError.trim()}` : ""}`,
  );
}

function stopContainer(name: string): void {
  try {
    spawnSync("docker", ["stop", "-t", "2", name], { stdio: "ignore" });
  } catch {
    // Best effort; --rm cleans the stopped container up.
  }
}

function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", () => {
    for (const name of startedContainers) stopContainer(name);
  });
}

function tail(stderrTail: string[]): string {
  const text = stderrTail.join("").trim();
  return text ? `\nContainer output:\n${text.slice(-2000)}` : "";
}

/**
 * npm reports an unresolvable version as `ETARGET` / "No matching version
 * found", which reads as "that version does not exist" — so the one thing a
 * reader will not suspect is the npm cache. It can still be the cause: the
 * volume is version-scoped, but a first install attempted before the
 * registry served that version can leave a version list that lacks it, and
 * prefer-offline then keeps serving it. Recovery is one `docker volume rm`,
 * worth nothing at all if the message doesn't name the volume.
 */
export function cacheHint(
  stderrTail: string[],
  request: ContainerBrowserRequest,
): string {
  const text = stderrTail.join("");
  if (!text.includes("ETARGET") && !text.includes("No matching version")) {
    return "";
  }
  const volume = `storyproof-npm-cache-${request.playwrightVersion}`;
  return `\nplaywright@${request.playwrightVersion} exists on the registry, so this is most likely a stale npm cache rather than a missing version. Clear it with "docker volume rm ${volume}" and capture again.`;
}
