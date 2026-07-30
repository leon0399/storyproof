import { describe, expect, test } from "vitest";

import {
  containerRunArguments,
  parseGatewayAddress,
  parseListeningEndpoint,
  publishedWsEndpoint,
  rewriteToContainerHost,
} from "../src/node/container.js";
import {
  buildEnvironmentKey,
  defaultContainerImage,
  resolveEnvironment,
} from "../src/node/environment.js";
import { resolveCaptureOptions } from "../src/preset.js";

describe("resolveEnvironment", () => {
  test("local capture keys on this host's platform", () => {
    const environment = resolveEnvironment();
    expect(environment.platform).toBe(process.platform);
    expect(environment.key).toBe(`${process.platform}-chromium-1280x720@1x`);
    expect(environment.container).toBeUndefined();
  });

  test("container capture gets its own identity token regardless of the host", () => {
    const environment = resolveEnvironment({
      container: {},
      playwrightVersion: "1.55.1",
    });
    // "container", not "linux": bare Linux and the container render
    // differently on the same machine, so sharing the "linux" token would
    // make them clobber one baseline directory instead of coexisting.
    expect(environment.platform).toBe("container");
    expect(environment.key).toBe("container-chromium-1280x720@1x");
    expect(environment.container?.image).toBe(
      "mcr.microsoft.com/playwright:v1.55.1-noble",
    );
  });

  test("an official image pinned to a different Playwright version fails closed", () => {
    expect(() =>
      resolveEnvironment({
        container: { image: "mcr.microsoft.com/playwright:v1.54.0-noble" },
        playwrightVersion: "1.55.1",
      }),
    ).toThrow(
      /version-locked.*v1\.54\.0.*1\.55\.1|v1\.54\.0.*1\.55\.1.*version-locked/s,
    );
    // A registry mirror (e.g. an Artifactory proxy) keeps the image name
    // and version tag and changes only the prefix — same drift risk, same
    // fail-closed check.
    expect(() =>
      resolveEnvironment({
        container: {
          image: "artifactory.corp.example/mcr-remote/playwright:v1.54.0-noble",
        },
        playwrightVersion: "1.55.1",
      }),
    ).toThrow(/version-locked/);
    expect(() =>
      resolveEnvironment({
        container: {
          image: "artifactory.corp.example/mcr-remote/playwright:v1.55.1-noble",
        },
        playwrightVersion: "1.55.1",
      }),
    ).not.toThrow();
    // Images not named `playwright` cannot be version-checked from their
    // name and stay the user's responsibility.
    expect(() =>
      resolveEnvironment({
        container: { image: "example.com/custom:tag" },
        playwrightVersion: "1.55.1",
      }),
    ).not.toThrow();
    // ...including names that merely end with the word without being the
    // image name's final segment.
    expect(() =>
      resolveEnvironment({
        container: { image: "example.com/notplaywright:v1.54.0-x" },
        playwrightVersion: "1.55.1",
      }),
    ).not.toThrow();
  });

  test("an explicit image wins over the derived default", () => {
    const environment = resolveEnvironment({
      container: { image: "example.com/custom:tag" },
    });
    expect(environment.container?.image).toBe("example.com/custom:tag");
  });

  test("container without a resolvable image fails closed", () => {
    expect(() => resolveEnvironment({ container: {} })).toThrow(
      /explicit image or the installed Playwright version/,
    );
  });

  test("key format is a single path-safe segment", () => {
    const key = buildEnvironmentKey({
      platform: "win32",
      browserName: "chromium",
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 2,
    });
    expect(key).toBe("win32-chromium-800x600@2x");
    expect(key).not.toMatch(/[/\\]/);
  });

  test("derived image tracks the installed Playwright version", () => {
    expect(defaultContainerImage("9.9.9")).toBe(
      "mcr.microsoft.com/playwright:v9.9.9-noble",
    );
  });

  test("the engine leads the key after the platform", () => {
    expect(resolveEnvironment({ browser: "firefox" }).key).toBe(
      `${process.platform}-firefox-1280x720@1x`,
    );
    expect(
      resolveEnvironment({
        browser: "webkit",
        container: {},
        playwrightVersion: "1.55.1",
      }).key,
    ).toBe("container-webkit-1280x720@1x");
  });
});

describe("container plumbing", () => {
  test("docker arguments pin the topology the design depends on", () => {
    const args = containerRunArguments({
      name: "storyproof-test",
      image: "mcr.microsoft.com/playwright:v1.55.1-noble",
      playwrightVersion: "1.55.1",
    });
    // Loopback-only publish: the browser server must not become a network
    // service.
    expect(args.join(" ")).toContain("-p 127.0.0.1::4444");
    // The gateway alias is how the containerized browser reaches a
    // host-loopback Storybook — measured as the only portable route
    // (host networking fails on Docker Desktop).
    expect(args.join(" ")).toContain(
      "--add-host host.docker.internal:host-gateway",
    );
    expect(args.join(" ")).not.toContain("--network host");
    // Wire protocol is version-locked; the npx install must pin exactly.
    expect(args.at(-1)).toContain("playwright@1.55.1 run-server");
    expect(args.join(" ")).toContain("--label storyproof");
    // The command must resolve the gateway IP before the server starts: the
    // browser navigates by IP because Vite 403s unknown hostnames but
    // trusts IP-literal Host headers. IPv4 explicitly — the default
    // resolution order prefers the IPv6 alias, which is unreachable from
    // the container on Docker Desktop.
    expect(args.at(-1)).toContain("getent ahostsv4 host.docker.internal");
    expect(args.at(-1)).toContain("STORYPROOF_GATEWAY");
    // Firefox refuses to launch when $HOME isn't owned by the current user;
    // pinned so an image override or env-injecting wrapper can't break it.
    expect(args.join(" ")).toContain("-e HOME=/root");
    // The npm cache persists across containers so the exact-version npx
    // install pays its network cost once per machine, not per cold start.
    expect(args.join(" ")).toContain("-v storyproof-npm-cache:/root/.npm");
    expect(args.join(" ")).toContain("npm_config_prefer_offline=true");
  });

  test("recognizes the server's readiness line", () => {
    expect(
      parseListeningEndpoint("Listening on ws://0.0.0.0:4444/abc123\n"),
    ).toBe("ws://0.0.0.0:4444/abc123");
    expect(parseListeningEndpoint("npm warn something\n")).toBeUndefined();
  });

  test("recognizes the gateway-address line", () => {
    expect(
      parseGatewayAddress(
        "STORYPROOF_GATEWAY 192.168.65.254\nListening on ws://0.0.0.0:4444/\n",
      ),
    ).toBe("192.168.65.254");
    expect(parseGatewayAddress("no gateway here")).toBeUndefined();
  });

  test("rebases the printed endpoint onto the published loopback port", () => {
    expect(publishedWsEndpoint("ws://0.0.0.0:4444/token-path", "49321")).toBe(
      "ws://127.0.0.1:49321/token-path",
    );
    // The scheme survives: downgrading a wss:// endpoint to ws:// would
    // connect plaintext to a TLS port and time out opaquely.
    expect(publishedWsEndpoint("wss://0.0.0.0:4444/t", "49321")).toBe(
      "wss://127.0.0.1:49321/t",
    );
  });

  test("rewrites loopback story URLs to the resolved gateway IP", () => {
    // IP form is load-bearing: Vite's host check 403s the
    // `host.docker.internal` hostname but accepts IP-literal Hosts
    // (measured 2026-07-27: hostname → 403, gateway IP → 200).
    expect(
      rewriteToContainerHost(
        "http://127.0.0.1:6006/iframe.html",
        "192.168.65.254",
      ),
    ).toBe("http://192.168.65.254:6006/iframe.html");
    expect(rewriteToContainerHost("http://localhost:6006/", "172.17.0.1")).toBe(
      "http://172.17.0.1:6006/",
    );
    // IPv6 gateways need URL brackets.
    expect(rewriteToContainerHost("http://127.0.0.1:6006/", "fd00::1")).toBe(
      "http://[fd00::1]:6006/",
    );
    // Resolution failure falls back to the hostname (a non-Vite server
    // accepts it; a Vite server fails with the same visible 403 as before).
    expect(rewriteToContainerHost("http://127.0.0.1:6006/")).toBe(
      "http://host.docker.internal:6006/",
    );
    // Anything already non-loopback is left alone.
    expect(rewriteToContainerHost("http://192.168.1.5:6006/", "10.0.0.1")).toBe(
      "http://192.168.1.5:6006/",
    );
  });
});

describe("resolveCaptureOptions", () => {
  test("omitted and disabled forms mean host capture", () => {
    expect(resolveCaptureOptions(undefined)).toEqual({});
    expect(resolveCaptureOptions({ container: false })).toEqual({});
    expect(resolveCaptureOptions({})).toEqual({});
  });

  test("true and object forms enable the container", () => {
    expect(resolveCaptureOptions({ container: true })).toEqual({
      container: {},
    });
    expect(
      resolveCaptureOptions({ container: { image: "example.com/i:t" } }),
    ).toEqual({ container: { image: "example.com/i:t" } });
    expect(resolveCaptureOptions({ container: {} })).toEqual({
      container: {},
    });
  });

  test("browser is validated against the engine enum and composes with container", () => {
    expect(resolveCaptureOptions({ browser: "firefox" })).toEqual({
      browser: "firefox",
    });
    expect(
      resolveCaptureOptions({ browser: "webkit", container: true }),
    ).toEqual({ browser: "webkit", container: {} });
    expect(() => resolveCaptureOptions({ browser: "safari" })).toThrow(
      /expected one of "chromium", "firefox", "webkit"/,
    );
    expect(() => resolveCaptureOptions({ browser: 7 })).toThrow(
      /capture.browser/,
    );
  });

  test.each([
    ["a non-object", "container-mode", /expected an object/],
    ["an unknown capture key", { docker: true }, /unknown key "docker"/],
    [
      "a non-boolean non-object container",
      { container: "yes" },
      /expected true, false, or an object/,
    ],
    [
      "an unknown container key",
      { container: { tag: "latest" } },
      /unknown key "tag"/,
    ],
    [
      "an empty image",
      { container: { image: " " } },
      /expected a non-empty string/,
    ],
  ])("rejects %s", (_name, value, message) => {
    expect(() => resolveCaptureOptions(value)).toThrow(message);
  });
});
