"use client";

import { Page } from "../src/Page";

// The demo app is the same Ledgerline Page the stories exercise — the app
// server and Storybook render one source of truth. Client component because
// Page holds state; extensionless import because Next's webpack does not
// apply TypeScript's .js->.tsx extension aliasing the way Vite and tsc do.
export default function Home() {
  return <Page />;
}
