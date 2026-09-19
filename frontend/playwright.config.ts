import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

const origin = "http://localhost:1420";

function devServerRunning() {
  try {
    execSync("curl -sf -g -o /dev/null --max-time 2 http://[::1]:1420", {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: origin,
    trace: "on",
    screenshot: "on",
    video: "on-first-retry",
  },
  webServer: devServerRunning()
    ? undefined
    : {
        command: "pnpm dev",
        url: origin,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
