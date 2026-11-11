import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Locally, read DATABASE_URL from .env (the server needs it to start). In CI it comes
// from the workflow. Existing environment variables are not overridden.
if (fs.existsSync(".env")) process.loadEnvFile(".env");

// The browser tests DELETE ALL CLIENTS to set up each test. Never run them against the
// real (Render) database - use a local or CI test database.
if (/render\.com|dpg-/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Refusing to run browser tests against a Render database. Point DATABASE_URL at a test database.");
}

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  // Tests share one database and reset its clients, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  // Registers one coach and saves its session cookie (every route now needs sign-in).
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: "e2e/.auth/coach.json",
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
