import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Locally, read DATABASE_URL from the repo-root .env (if present).
// Existing environment variables are not overridden, so CI's DATABASE_URL wins.
const envFile = path.resolve(import.meta.dirname, "../.env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Database-backed test files share one database (the seed test empties the clients
    // table), so test files run one at a time.
    fileParallelism: false,
  },
});
