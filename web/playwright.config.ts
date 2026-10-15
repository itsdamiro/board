import { defineConfig } from "@playwright/test";

// ADR 006: Chromium only, one worker (each test starts its own server on a fresh sample vault), nothing built here.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["line"]],
  use: { browserName: "chromium", trace: "off" },
});
