export const ADDON_ID = "storyproof";
export const PANEL_ID: `${typeof ADDON_ID}/panel` = `${ADDON_ID}/panel`;
export const TEST_PROVIDER_ID: `${typeof ADDON_ID}/provider` = `${ADDON_ID}/provider`;
export const STATUS_TYPE_ID: `${typeof ADDON_ID}/status` = `${ADDON_ID}/status`;

export const COMMAND_EVENT: `${typeof ADDON_ID}/command` = `${ADDON_ID}/command`;
export const COMMAND_ERROR_EVENT: `${typeof ADDON_ID}/command-error` = `${ADDON_ID}/command-error`;
export const STATE_EVENT: `${typeof ADDON_ID}/state` = `${ADDON_ID}/state`;
export const BASELINE_EVENT: `${typeof ADDON_ID}/baseline` = `${ADDON_ID}/baseline`;
export const ARTIFACT_ROUTE = "/__storyproof__/artifact";

// No `key` here: the environment key includes the platform the browser
// renders on, so it is resolved at runtime by src/node/environment.ts's
// resolveEnvironment(), not fixed at build time.
export const DEFAULT_ENVIRONMENT = {
  browserName: "chromium",
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
} as const;
