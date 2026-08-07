import { spawnSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Packed-archive size budget in bytes. Measured 2026-07-26 with the tsdown
 * toolchain: the clean archive (dist + LICENSE + README.md + package.json,
 * including sourcemaps and declarations) packs to about 53 kB (pack output
 * is not byte-deterministic across runs -- gzip embeds mtimes -- so this is
 * an order-of-magnitude baseline, not an exact figure). 150 KiB keeps
 * comfortable headroom for legitimate growth (new modules, a bundled icon,
 * longer docs) while still catching a real leak: a stray source/test tree
 * bundled into the tarball would be many times this size.
 */
const MAX_PACKED_ARCHIVE_SIZE_BYTES = 150 * 1024;

interface PnpmPackResult {
  filename: string;
  files: { path: string }[];
}

/**
 * `pnpm pack --json` always runs the package's `prepack` (build) lifecycle
 * script first, and that script's own stdout precedes the JSON result on the
 * same stream -- so this takes the last top-level (column-0) `{` rather than
 * parsing stdout as a single document.
 */
function parseTrailingJson(stdout: string): PnpmPackResult {
  const jsonStart = stdout.lastIndexOf("\n{");
  return JSON.parse(stdout.slice(jsonStart + 1)) as PnpmPackResult;
}

describe("packed artifact", () => {
  let destination: string;
  let result: PnpmPackResult;

  // One pack for the whole file, shared by both tests below: `pnpm pack`
  // always reruns `build` via `prepack` first, so this is also what leaves
  // a fresh dist/preset.js on disk for the "compiled preset entry
  // resolution" test -- no second build needed.
  beforeAll(async () => {
    destination = await mkdtemp(path.join(tmpdir(), "storyproof-pack-"));
    const packed = spawnSync(
      "pnpm",
      ["pack", "--json", "--pack-destination", destination],
      { cwd: packageRoot, encoding: "utf8" },
    );
    expect(packed.status, packed.stderr || packed.stdout).toBe(0);
    result = parseTrailingJson(packed.stdout);
  });

  afterAll(async () => {
    await rm(destination, { recursive: true, force: true });
  });

  test("ships exactly dist/**, docs/**, CHANGELOG.md, LICENSE, README.md, and package.json within the size budget", async () => {
    const paths = result.files.map((file) => file.path).sort();

    const disallowed = paths.filter(
      (entryPath) =>
        entryPath !== "CHANGELOG.md" &&
        entryPath !== "LICENSE" &&
        entryPath !== "README.md" &&
        entryPath !== "package.json" &&
        !entryPath.startsWith("dist/") &&
        !entryPath.startsWith("docs/"),
    );
    expect(disallowed, "unallowlisted packed entries").toEqual([]);

    // The hashed shared-chunk filenames tsdown emits (e.g.
    // `dist/constants-DA4oGclz.js`) change with build content, so this
    // checks the stable, publicly-relied-upon entries rather than an
    // exact full-list snapshot.
    expect(paths).toEqual(
      expect.arrayContaining([
        "LICENSE",
        "README.md",
        "package.json",
        "dist/index.js",
        "dist/index.d.ts",
        "dist/manager.js",
        "dist/manager.d.ts",
        "dist/preset.js",
        "dist/preset.d.ts",
        "dist/preview.js",
        "dist/preview.d.ts",
      ]),
    );

    const { size } = await stat(result.filename);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(MAX_PACKED_ARCHIVE_SIZE_BYTES);
  });

  // The published artifact must never leak the pre-extraction internal
  // codenames ("llame", "@workspace") in code. This scans only dist/**
  // and package.json — documentation (CHANGELOG.md, docs/) legitimately
  // references the project's provenance.
  test("ships no pre-extraction internal codenames in code", () => {
    const codeFiles = result.files
      .map((file) => file.path)
      .filter((p) => p.startsWith("dist/") || p === "package.json");
    for (const filePath of codeFiles) {
      const extracted = spawnSync(
        "tar",
        ["-xzOf", result.filename, `package/${filePath}`],
        { cwd: destination, encoding: "utf8" },
      );
      expect(extracted.status, extracted.stderr).toBe(0);
      for (const codename of ["llame", "@workspace"]) {
        expect(
          extracted.stdout,
          `${filePath} contains "${codename}"`,
        ).not.toContain(codename);
      }
    }
  });

  // Runtime coverage for preset.ts's compiled/source directory detection
  // (`path.basename(directory) === "dist"`): nothing else in this suite
  // exercises that branch, since test/server.test.ts imports src/preset.ts
  // directly and only ever runs the source-mode branch.
  //
  // preset.ts resolves both entries purely from its own `import.meta.url`
  // (see src/preset.ts), never through node_modules resolution, so
  // importing the dist/preset.js the beforeAll pack above already produced
  // exercises the identical code path a real installed consumer hits, with
  // no separate build and no package install. Genuine node_modules
  // resolution against a real installed package is Task 8's concern.
  test("resolves manager and preview entries to real, existing built files", async () => {
    const presetPath = path.join(packageRoot, "dist", "preset.js");
    const preset = (await import(pathToFileURL(presetPath).href)) as {
      managerEntries: (existing?: string[]) => Promise<string[]>;
      previewAnnotations: (existing?: string[]) => Promise<string[]>;
    };
    expect(preset.managerEntries).toBeTypeOf("function");
    expect(preset.previewAnnotations).toBeTypeOf("function");

    const managerEntries = await preset.managerEntries();
    const previewEntries = await preset.previewAnnotations();
    expect(managerEntries).toHaveLength(1);
    expect(previewEntries).toHaveLength(1);

    for (const entryPath of [...managerEntries, ...previewEntries]) {
      expect(path.isAbsolute(entryPath)).toBe(true);
      expect(entryPath.endsWith(".js")).toBe(true);
      // The compiled branch must never resolve back to TypeScript source
      // (that's exactly what regresses if a build-config change moves where
      // dist/preset.js lands relative to its siblings).
      expect(entryPath.endsWith(".ts") || entryPath.endsWith(".tsx")).toBe(
        false,
      );
      const entryStat = await stat(entryPath);
      expect(entryStat.isFile()).toBe(true);
    }
    expect(managerEntries[0]).toMatch(/\/manager\.js$/);
    expect(previewEntries[0]).toMatch(/\/preview\.js$/);
  });
});
