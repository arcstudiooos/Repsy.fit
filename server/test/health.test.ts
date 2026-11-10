// GET /api/health also checks the database (Prompt 32). Prisma is mocked, so no database needed.
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/health", () => {
  it("200 { ok: true, db: true } when the database answers", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it("503 { ok: false, db: false } when the database is down, with no error details", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=secret"));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: false });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|secret|stack/);
  });

  it("503 when the database doesn't answer within 3 seconds", async () => {
    prisma.$queryRaw.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: false });
    expect(Date.now() - started).toBeLessThan(4_500);
  }, 8_000);
});

describe("production error handling", () => {
  it("an unknown /api route is JSON 404, never the client page", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("bad JSON gets a plain 400 with no stack trace", async () => {
    const res = await request(app).post("/api/clients").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Request body is not valid JSON." });
  });
});
