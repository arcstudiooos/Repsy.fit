// Prompt 29 "Test:" line against a real database: on an empty database the seed creates
// 3 clients with logs; running it twice creates nothing new.
// (Prompt 45: "empty" means the signed-in test coach has no clients; the demo lands in that coach's
// account.) Never runs against a Render database. Skipped when DATABASE_URL is not set (runs in CI).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const url = process.env.DATABASE_URL ?? "";
const isRenderDb = /render\.com|dpg-/.test(url);
const tag = `seed-${Date.now()}`;

describe.skipIf(!url || isRenderDb)("quick demo seed (database)", () => {
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

  it("creates 3 clients with logs on an empty database, and nothing on a second run", async () => {
    const first = await api.post("/api/seed/demo");
    expect(first.status).toBe(201);
    expect(first.body).toHaveLength(3);

    const clients = await api.get("/api/clients");
    expect(clients.body.map((c: { name: string }) => c.name)).toEqual(["Maya Patel", "Arjun Mehta", "Casey Jordan"]);
    for (const c of clients.body as { id: string }[]) {
      const logs = await api.get(`/api/clients/${c.id}/progress`);
      expect(logs.body).toHaveLength(3);
      const plans = await api.get(`/api/clients/${c.id}/assignments`);
      expect(plans.body.map((a: { title: string }) => a.title)).toEqual(["Demo starter plan"]);
    }

    const second = await api.post("/api/seed/demo");
    expect(second.status).toBe(200);
    expect(second.body).toEqual([]);
    const after = await api.get("/api/clients");
    expect(after.body).toHaveLength(3);
  });

  it("two seeds at the same time still create exactly 3 clients", async () => {
    await prisma.client.deleteMany({ where: { coachId } });
    const [a, b] = await Promise.all([api.post("/api/seed/demo"), api.post("/api/seed/demo")]);
    expect([a.body.length, b.body.length].sort()).toEqual([0, 3]);
    const after = await api.get("/api/clients");
    expect(after.body).toHaveLength(3);
  });
});
