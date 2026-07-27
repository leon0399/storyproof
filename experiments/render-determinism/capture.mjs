// TEMPORARY — see README.md. Delete with the rest of experiments/.
//
// Captures one fixed page and prints a SHA-256 of the PNG bytes, so the same
// content can be hashed across architectures, container images, and operating
// systems. Deliberately avoids Storybook: the question is how Chromium
// rasterizes, and a smaller surface makes any difference readable.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const LABEL = process.env.LABEL ?? "unlabelled";

// No network requests, no webfonts: `system-ui` deliberately resolves to
// whatever the platform provides, because that is precisely the variable under
// test. Weights, sizes, a border radius, and a rotation cover text
// rasterization and edge antialiasing -- where platform differences surface.
const HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1280px; height: 720px; background: #ffffff;
        font-family: system-ui, sans-serif; color: #111111;
        padding: 40px; display: flex; flex-direction: column; gap: 24px;
      }
      .row { display: flex; align-items: center; gap: 32px; }
      .w300 { font-weight: 300; font-size: 32px; }
      .w400 { font-weight: 400; font-size: 24px; }
      .w700 { font-weight: 700; font-size: 18px; }
      .small { font-size: 11px; letter-spacing: 0.4px; }
      .chip {
        background: rgb(79, 70, 229); color: #ffffff;
        padding: 12px 24px; border-radius: 14px; font-weight: 600;
      }
      .ring {
        width: 120px; height: 120px; border-radius: 50%;
        border: 6px solid rgb(220, 38, 38);
      }
      .tilt {
        width: 180px; height: 60px; background: rgb(16, 185, 129);
        transform: rotate(11.5deg);
      }
      .grad {
        width: 300px; height: 60px;
        background: linear-gradient(90deg, #000000, #ffffff);
      }
    </style>
  </head>
  <body>
    <div class="w300">Rasterization probe &mdash; light 300</div>
    <div class="w400">The quick brown fox jumps over the lazy dog</div>
    <div class="w700">BOLD 700 &bull; kerning AVA To Wa &bull; 0O1lI</div>
    <div class="small">tracking test &mdash; abcdefghijklmnopqrstuvwxyz 0123456789</div>
    <div class="row">
      <div class="chip">Rounded chip</div>
      <div class="ring"></div>
      <div class="tilt"></div>
    </div>
    <div class="grad"></div>
  </body>
</html>`;

const browser = await chromium.launch({ headless: true });
try {
  // Mirrors DEFAULT_ENVIRONMENT in src/constants.ts so the result speaks to
  // the real capture settings rather than to Playwright's defaults.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(HTML, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const png = await page.screenshot({ type: "png" });
  const sha256 = createHash("sha256").update(png).digest("hex");

  mkdirSync("out", { recursive: true });
  writeFileSync(`out/${LABEL}.png`, png);

  // A font fingerprint. `getComputedStyle().fontFamily` is useless here -- it
  // echoes the *specified* family ("system-ui"), not what actually resolved --
  // so instead measure rendered text width, which changes whenever a different
  // face is selected. If two cells disagree on the hash, this is usually why,
  // and the hash alone would explain nothing.
  const fonts = await page.evaluate(() => {
    const measure = (family) => {
      const el = document.createElement("span");
      el.style.cssText = `font-family:${family};font-size:100px;white-space:pre;position:absolute;visibility:hidden`;
      el.textContent = "MMMWWWiii illegible 0O1lI";
      document.body.appendChild(el);
      const width = el.getBoundingClientRect().width;
      el.remove();
      return Math.round(width * 100) / 100;
    };
    return {
      systemUiWidth: measure("system-ui"),
      sansSerifWidth: measure("sans-serif"),
      serifWidth: measure("serif"),
      monospaceWidth: measure("monospace"),
    };
  });

  const result = {
    label: LABEL,
    sha256,
    platform: process.platform,
    arch: process.arch,
    browserVersion: browser.version(),
    bytes: png.length,
    fonts,
  };

  console.log(JSON.stringify(result, null, 2));

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `| \`${LABEL}\` | \`${sha256.slice(0, 16)}…\` | ${process.platform}/${process.arch} | ${browser.version()} | ${png.length} B |\n`,
    );
  }
} finally {
  await browser.close();
}
