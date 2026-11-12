// /privacy and /terms are sent as prerendered HTML (client/scripts/prerender-legal.mjs), so the full
// text is in the response itself - Google's OAuth branding review does not run JavaScript.
// Needs a client build (dist/legal); skipped when there is none (CI builds before the tests).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db.js", () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "1": 1 }]) } }));
const { app } = await import("../src/app.js");
const supertest = (await import("supertest")).default;
const built = fs.existsSync(path.resolve(import.meta.dirname, "../../client/dist/legal/privacy.html"));

describe.skipIf(!built)("legal pages are server-rendered", () => {
  it("GET /privacy is the full policy in the HTML, Google user data section included", async () => {
    const res = await supertest(app).get("/privacy");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("<h1>Privacy Policy</h1>");
    expect(res.text).toContain("<h2>Google user data</h2>");
    expect(res.text).toContain("Limited Use requirements");
    expect(res.text).not.toContain("<script");
  });
  it("GET /terms is the full terms in the HTML", async () => {
    const res = await supertest(app).get("/terms");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<h1>Terms of Service</h1>");
    expect(res.text).toContain("<h2>Acceptable use</h2>");
  });
});
