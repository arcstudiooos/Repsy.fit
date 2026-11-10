import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Locally, read DATABASE_URL from .env (the server needs it to start). In CI it comes
// from the workflow. Existing environment variables are not overridden.
if (fs.existsSync(".env")) process.loadEnvFile(".env");

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Runs the production server (serves the built client). Run `npm run build` first.
  webServer: {
    command: "npm start",
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
