// Prompt 30 "Test:" line against a real database: after seeding, one client has exactly
// 26 logs, weekly from 2026-05-11 to 2026-11-02, weight trending the right way; a re-run adds 0.
// Never runs against a Render database. Skipped when DATABASE_URL is not set (runs in CI).
// The demo loads into the signed-in test coach's account (Prompt 45).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const url = process.env.DATABASE_URL ?? "";
const isRenderDb = /render\.com|dpg-/.test(url);
const tag = `seed-six-month-${Date.now()}`;

describe.skipIf(!url || isRenderDb)("six-month demo seed (database)", () => {
  let coachId = "";
  let api: ReturnType<typeof asCoach>;

  beforeAll(async () => {
    coachId = (await prisma.coach.create({ data: { name: "Test", email: `${tag}@example.com`, passwordHash: "x" } })).id;
    api = asCoach(app, coachId);
  });
  afterAll(async () => {
    // Deleting the coach cascades to its clients and everything under them.
    await prisma.coach.deleteMany({ where: { id: coachId } });
    await prisma.$disconnect();
  });

  it("creates 10 clients; Sarah has 26 weekly logs trending down; a re-run adds nothing", async () => {
    const first = await api.post("/api/seed/six-month-demo");
    expect(first.status).toBe(201);
    expect(first.body).toHaveLength(10);

    const sarah = (first.body as { id: string; name: string }[]).find((c) => c.name === "Sarah Mitchell")!;
    const logs = (await api.get(`/api/clients/${sarah.id}/progress`)).body as { date: string; weightKg: number }[];
    expect(logs).toHaveLength(26);
    expect(logs[0].date).toBe("2026-05-11");
    expect(logs[25].date).toBe("2026-11-02");
    for (let i = 1; i < 26; i++) {
      const gap = new Date(`${logs[i].date}T00:00:00Z`).getTime() - new Date(`${logs[i - 1].date}T00:00:00Z`).getTime();
      expect(gap).toBe(7 * 86_400_000);
    }
    expect(logs[0].weightKg).toBe(82);
    expect(logs[25].weightKg).toBe(74.1);

    const again = await api.post("/api/seed/six-month-demo");
    expect(again.status).toBe(200);
    expect(again.body).toEqual([]);
    expect((await api.get("/api/clients")).body).toHaveLength(10);
    expect((await api.get(`/api/clients/${sarah.id}/progress`)).body).toHaveLength(26);
  });
});
