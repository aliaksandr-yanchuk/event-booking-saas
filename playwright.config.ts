import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // Tests book real seats in the seeded database, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // CI tests the production build; locally the dev server is faster to start.
    command: isCI ? "npm run start" : `npm run dev -- --port ${PORT}`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
