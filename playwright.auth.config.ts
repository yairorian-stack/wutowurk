import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/auth-e2e",
  outputDir: "test-results-auth",
  workers: 2,
  fullyParallel: true,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node scripts/mock-auth-provider.mjs",
      url: "http://127.0.0.1:3101/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run start -- --port 3100",
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      env: {
        SUPABASE_URL: "http://127.0.0.1:3101",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
        PORTAL_ORIGIN: "http://127.0.0.1:3100",
      },
    },
  ],
});
