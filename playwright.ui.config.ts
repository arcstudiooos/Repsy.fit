import { defineConfig, devices } from "@playwright/test";

// UI tests: the built client is served by `vite preview` and every /api call is mocked
// inside the browser (page.route) - no database, server or AI key needed.
// Run `npm run build` first. The database-backed browser tests live in playwright.config.ts.
const PORT = 4173;

export default defineConfig({
  testDir: "e2e-ui",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run preview -w client -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
