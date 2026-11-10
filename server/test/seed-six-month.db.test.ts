// Prompt 30 "Test:" line against a real database: after seeding, one client has exactly
// 26 logs, weekly from 2026-05-11 to 2026-11-02, weight trending the right way; a re-run adds 0.
// Never runs against a Render database. Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const url = process.env.DATABASE_URL ?? "";
const isRenderDb = /render\.com|dpg-/.test(url);

describe.skipIf(!url || isRenderDb)("six-month demo seed (database)", () => {
  beforeAll(async () => {
    await prisma.client.deleteMany({ where: { coachId: "default-coach" } });
  });
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { coachId: "default-coach" } });
    await prisma.$disconnect();
  });

  it("creates 10 clients; Sarah has 26 weekly logs trending down; a re-run adds nothing", async () => {
    const first = await request(app).post("/api/seed/six-month-demo");
    expect(first.status).toBe(201);
    expect(first.body).toHaveLength(10);

    const sarah = (first.body as { id: string; name: string }[]).find((c) => c.name === "Sarah Mitchell")!;
    const logs = (await request(app).get(`/api/clients/${sarah.id}/progress`)).body as { date: string; weightKg: number }[];
    expect(logs).toHaveLength(26);
    expect(logs[0].date).toBe("2026-05-11");
    expect(logs[25].date).toBe("2026-11-02");
    for (let i = 1; i < 26; i++) {
      const gap = new Date(`${logs[i].date}T00:00:00Z`).getTime() - new Date(`${logs[i - 1].date}T00:00:00Z`).getTime();
      expect(gap).toBe(7 * 86_400_000);
    }
    expect(logs[0].weightKg).toBe(82);
    expect(logs[25].weightKg).toBe(74.1);

    const again = await request(app).post("/api/seed/six-month-demo");
    expect(again.status).toBe(200);
    expect(again.body).toEqual([]);
    expect((await request(app).get("/api/clients")).body).toHaveLength(10);
    expect((await request(app).get(`/api/clients/${sarah.id}/progress`)).body).toHaveLength(26);
  });
});
