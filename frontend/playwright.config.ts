import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests and screenshots against the running app (port 3001).
 * Sign-in uses a throwaway account from backend/scripts/ui_test_account.py,
 * passed in E2E_EMAIL and E2E_PASSWORD. Never a real student's account.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
  // Sign in once and reuse the session: the app limits sign-ins per IP,
  // and one sign-in per test would trip it.
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "e2e/.auth/student.json" },
    },
    { name: "phone", dependencies: ["setup"], use: { ...devices["Pixel 7"], storageState: "e2e/.auth/student.json" } },
  ],
});
