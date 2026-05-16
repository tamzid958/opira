import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const authState = process.env.E2E_STORAGE_STATE;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ...(authState ? { storageState: authState } : {}),
  },
  projects: [
    {
      name: "iphone14",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "ipad-mini",
      use: { ...devices["iPad Mini"] },
    },
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 900 },
      },
    },
  ],
});

