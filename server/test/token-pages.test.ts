// Pages whose URL carries a one-time token never pass it on in a Referer header (Prompt 65 / 47 / 77).
// Needs a client build (dist/index.html); skipped when there is none (CI builds before the tests).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db.js", () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "1": 1 }]) } }));
const { app } = await import("../src/app.js");
const supertest = (await import("supertest")).default;
const built = fs.existsSync(path.resolve(import.meta.dirname, "../../client/dist/index.html"));

describe.skipIf(!built)("token pages", () => {
  it.each(["/client/set-password", "/reset-password", "/client/reset-password"])("%s sends Referrer-Policy: no-referrer", async (url) => {
    const res = await supertest(app).get(`${url}?token=abc`);
    expect(res.status).toBe(200);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
  it("other pages keep the default policy", async () => {
    const res = await supertest(app).get("/join/ANNA-7K2Q8M");
    expect(res.status).toBe(200);
    expect(res.headers["referrer-policy"]).not.toBe("no-referrer");
  });
});
