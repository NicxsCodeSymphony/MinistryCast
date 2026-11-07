import { defineConfig, devices } from "@playwright/test";

/**
 * Network audit against a production build (no React StrictMode double effects,
 * so duplicate-call checks reflect what users actually send).
 *   pnpm test:network
 */
const port = 4173;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /network-audit\.spec\.ts/,
  timeout: 240_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "off", screenshot: "off" },
  webServer: {
    command: `pnpm exec vite build && pnpm exec vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
