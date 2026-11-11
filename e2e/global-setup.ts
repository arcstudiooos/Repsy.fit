// Prompt 45: /app and every data route need a signed-in coach, so the browser tests register one
// throwaway coach once and every test (page and request fixture) reuses its session cookie.
import fs from "node:fs";
import path from "node:path";
import { expect, request, type FullConfig } from "@playwright/test";

// Relative to the repo root (Playwright runs from there; the root package is CommonJS, so no import.meta).
export const STORAGE_STATE = path.resolve(process.cwd(), "e2e/.auth/coach.json");

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  const api = await request.newContext({ baseURL });
  const res = await api.post("/api/auth/register", {
    data: { name: "E2E Coach", email: `e2e-${Date.now().toString(36)}@example.com`, password: "e2e-test-password-1" },
  });
  expect(res.status(), "registering the browser-test coach").toBe(201);
  await api.storageState({ path: STORAGE_STATE });
  await api.dispose();
}
