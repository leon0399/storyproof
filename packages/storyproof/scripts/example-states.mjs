// Repo tooling for examples/**, not part of the published package (the
// tarball ships dist/** only — see test/pack-inventory.test.ts). It lives
// here because it needs this package's playwright dependency to resolve.
//
// The examples commit container-captured baselines
// (examples/*/src/__screenshots__/**/container-chromium-…) staged so the
// Visual tests panel demonstrates every state out of the box:
//
//   passed   Button (Primary/Secondary/Danger/Small/Disabled), Header ×2
//   changed  Page ×2 — the committed baseline predates a deliberate source
//            edit (Cartwright Co.'s invoice was settled; see the comment in
//            examples/*/src/Page.tsx)
//   new      Button/Large — left unapproved so the approve flow can be
//            exercised on a fresh checkout
//
// This script drives a RUNNING example Storybook over the same manager
// channel the panel uses. Start one first:
//
//   STORYPROOF_CONTAINER=1 pnpm --filter ./examples/react-vite-sb10.5 run dev
//
// then, from packages/storyproof:
//
//   node scripts/example-states.mjs --port 6106 --mode verify
//     assert the committed baselines still produce the staged states
//     (CI runs this for both examples; requires Docker)
//
//   node scripts/example-states.mjs --port 6106 --mode approve
//     re-approve the "passed" set after an intentional demo change —
//     run it for BOTH examples, then re-stage the Page difference
//     (or approve Page too and make a fresh one-edit difference)
import { parseArgs } from "node:util";

import { chromium } from "playwright";

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "verify" },
    port: { type: "string", default: "6106" },
  },
});
if (values.mode !== "verify" && values.mode !== "approve") {
  throw new Error(`unknown --mode ${values.mode} (use verify | approve)`);
}

// The approved ("passed") set. Everything staged is asserted by EXPECTED.
const APPROVE = [
  "ledgerline-button--primary",
  "ledgerline-button--secondary",
  "ledgerline-button--danger",
  "ledgerline-button--small",
  "ledgerline-button--disabled",
  "ledgerline-header--logged-out",
  "ledgerline-header--logged-in",
  "ledgerline-page--logged-out",
  "ledgerline-page--logged-in",
];
const EXPECTED = new Map([
  ["ledgerline-button--primary", "passed"],
  ["ledgerline-button--secondary", "passed"],
  ["ledgerline-button--danger", "passed"],
  ["ledgerline-button--small", "passed"],
  ["ledgerline-button--disabled", "passed"],
  ["ledgerline-header--logged-out", "passed"],
  ["ledgerline-header--logged-in", "passed"],
  ["ledgerline-page--logged-out", "changed"],
  ["ledgerline-page--logged-in", "changed"],
  ["ledgerline-button--large", "new"],
]);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (message) => {
  if (message.text().startsWith("[example-states]"))
    console.log(message.text());
});
await page.goto(`http://localhost:${values.port}/`, {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(
  () => globalThis.__STORYBOOK_ADDONS_CHANNEL__,
  null,
  { timeout: 60_000 },
);

await page.evaluate(() => {
  const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;
  globalThis.__states = [];
  channel.on("storyproof/state", (state) => globalThis.__states.push(state));
  channel.on("storyproof/command-error", (error) =>
    console.log("[example-states] command-error", JSON.stringify(error)),
  );
});
const latest = () =>
  page.evaluate(() => globalThis.__states[globalThis.__states.length - 1]);

// A still-running server keeps its previous run's results, so remember the
// old runId and wait for a NEW completed run.
await page.evaluate(() => {
  globalThis.__STORYBOOK_ADDONS_CHANNEL__.emit("storyproof/command", {
    type: "get-state",
  });
});
await page.waitForFunction(() => globalThis.__states.length > 0, null, {
  timeout: 30_000,
});
const previousRunId = (await latest())?.runId;
await page.evaluate(() => {
  globalThis.__STORYBOOK_ADDONS_CHANNEL__.emit("storyproof/command", {
    type: "run",
    scope: "all",
  });
});
await page.waitForFunction(
  (previous) => {
    const state = globalThis.__states[globalThis.__states.length - 1];
    return (
      state &&
      state.running === false &&
      state.results.length > 0 &&
      state.runId &&
      state.runId !== previous
    );
  },
  previousRunId ?? null,
  { timeout: 600_000, polling: 1000 },
);

const state = await latest();
console.log("environment:", state.environment?.key);
for (const result of [...state.results].sort((a, b) =>
  a.storyId.localeCompare(b.storyId),
)) {
  console.log(`  ${result.storyId} = ${result.status}`);
}

if (values.mode === "approve") {
  let approved = 0;
  for (const storyId of APPROVE) {
    const result = state.results.find((entry) => entry.storyId === storyId);
    // Already matching its baseline: nothing to approve, and emitting an
    // approve command anyway would throw stale-approval (the runner only
    // holds approval candidates for new/changed results) — skipping keeps
    // re-runs of this mode idempotent.
    if (result?.status === "passed") continue;
    if (!result?.candidateSha256) {
      console.error(
        `no candidate for ${storyId} (status ${result?.status ?? "missing"})`,
      );
      process.exitCode = 1;
      continue;
    }
    approved += 1;
    await page.evaluate(
      (command) => {
        globalThis.__STORYBOOK_ADDONS_CHANNEL__.emit(
          "storyproof/command",
          command,
        );
      },
      {
        type: "approve",
        runId: state.runId,
        storyId,
        environmentKey: result.environmentKey,
        candidateSha256: result.candidateSha256,
      },
    );
  }
  await page.waitForFunction(
    (ids) => {
      const current = globalThis.__states[globalThis.__states.length - 1];
      return (
        current &&
        ids.every(
          (id) =>
            current.results.find((entry) => entry.storyId === id)?.status ===
            "passed",
        )
      );
    },
    APPROVE,
    { timeout: 60_000, polling: 500 },
  );
  console.log(
    `approved: ${approved} newly, ${APPROVE.length - approved} already passed`,
  );
} else {
  let failed = false;
  for (const [storyId, expected] of EXPECTED) {
    const actual = state.results.find(
      (entry) => entry.storyId === storyId,
    )?.status;
    if (actual !== expected) {
      console.error(`MISMATCH ${storyId}: expected ${expected}, got ${actual}`);
      failed = true;
    }
  }
  if (failed) {
    process.exitCode = 1;
  } else {
    console.log(`verify: all ${EXPECTED.size} staged states match`);
  }
}

await browser.close();
