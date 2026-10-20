import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // Tests book real seats in the seeded database, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  // No retries: a retried test would find its seats already booked, and retries
  // would hide real flakiness instead of surfacing it.
  retries: 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // REST API contract tests: HTTP only, no browser.
    { name: "api", testMatch: /api\.spec\.ts/ },
    { name: "desktop", testIgnore: /api\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: /api\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // CI tests the production build; locally the dev server is faster to start.
    command: isCI ? "npm run start" : `npm run dev -- --port ${PORT}`,
    // The production build refuses to sign links without a secret; this one is for tests only.
    env: { PORT: String(PORT), BOOKING_LINK_SECRET: "e2e-only-booking-link-secret" },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
