import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

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

describe("packed tarball inventory", () => {
  test("ships exactly dist/**, LICENSE, README.md, and package.json within the size budget", async () => {
    const destination = await mkdtemp(path.join(tmpdir(), "storyproof-pack-"));
    try {
      const packed = spawnSync(
        "pnpm",
        ["pack", "--json", "--pack-destination", destination],
        { cwd: packageRoot, encoding: "utf8" },
      );
      expect(packed.status, packed.stderr || packed.stdout).toBe(0);

      const result = parseTrailingJson(packed.stdout);
      const paths = result.files.map((file) => file.path).sort();

      const disallowed = paths.filter(
        (entryPath) =>
          entryPath !== "LICENSE" &&
          entryPath !== "README.md" &&
          entryPath !== "package.json" &&
          !entryPath.startsWith("dist/"),
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

      // Runtime coverage for preset.ts's compiled/source directory detection
      // (`path.basename(directory) === "dist"`): nothing else in this suite
      // exercises that branch, since test/server.test.ts imports src/preset.ts
      // directly and only ever runs the source-mode branch. Install the exact
      // tarball just packed into an isolated project (mirroring what the
      // deleted scripts/test-exports.mjs did) so the compiled branch runs
      // against the real published artifact -- a bare tar extraction is not
      // enough, since the compiled preset's dependency graph imports real
      // dependencies (pixelmatch, pngjs, playwright) that only resolve once
      // installed.
      const consumerRoot = path.join(destination, "consumer");
      await mkdir(consumerRoot);
      await writeFile(
        path.join(consumerRoot, "package.json"),
        `${JSON.stringify({ name: "storyproof-pack-inventory-consumer", private: true, type: "module" }, null, 2)}\n`,
      );
      const installed = spawnSync(
        "pnpm",
        [
          "add",
          "--prefer-offline",
          "--ignore-workspace",
          "--ignore-scripts",
          "--save-exact",
          result.filename,
        ],
        { cwd: consumerRoot, encoding: "utf8" },
      );
      expect(installed.status, installed.stderr || installed.stdout).toBe(0);

      const presetPath = path.join(
        consumerRoot,
        "node_modules",
        "storyproof",
        "dist",
        "preset.js",
      );
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

      const consumerNodeModules = path.join(consumerRoot, "node_modules");
      for (const entryPath of [...managerEntries, ...previewEntries]) {
        expect(path.isAbsolute(entryPath)).toBe(true);
        expect(entryPath.endsWith(".js")).toBe(true);
        // The compiled branch must never resolve back to TypeScript source
        // (that's exactly what regresses if a build-config change moves
        // where dist/preset.js lands relative to its siblings).
        expect(entryPath.endsWith(".ts") || entryPath.endsWith(".tsx")).toBe(
          false,
        );
        const relativeToNodeModules = path.relative(
          consumerNodeModules,
          entryPath,
        );
        expect(
          relativeToNodeModules !== "" &&
            !relativeToNodeModules.startsWith("..") &&
            !path.isAbsolute(relativeToNodeModules),
          `${entryPath} must resolve inside the installed package's node_modules`,
        ).toBe(true);
        const entryStat = await stat(entryPath);
        expect(entryStat.isFile()).toBe(true);
      }
      expect(managerEntries[0]).toMatch(/\/manager\.js$/);
      expect(previewEntries[0]).toMatch(/\/preview\.js$/);
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
  });
});
