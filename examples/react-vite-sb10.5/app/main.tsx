import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Page } from "../src/Page";

// The demo app is the same Ledgerline Page the stories exercise — the app
// server and Storybook render one source of truth.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
