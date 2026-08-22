import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against an already-running portal.
 *
 * No `webServer` block: the suite needs a real database behind it, so bringing
 * the server up is a deliberate step (see docs/TESTING.md) rather than
 * something a test run does implicitly and then fails at confusingly.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 90_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3210",
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
