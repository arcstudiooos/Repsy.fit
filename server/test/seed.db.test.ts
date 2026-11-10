// Prompt 29 "Test:" line against a real database: on an empty database the seed creates
// 3 clients with logs; running it twice creates nothing new.
// It empties the clients table first, so it must never run against a real (Render) database.
// Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const url = process.env.DATABASE_URL ?? "";
const isRenderDb = /render\.com|dpg-/.test(url);

describe.skipIf(!url || isRenderDb)("quick demo seed (database)", () => {
  beforeAll(async () => {
    await prisma.client.deleteMany({ where: { coachId: "default-coach" } });
  });
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { coachId: "default-coach" } });
    await prisma.$disconnect();
  });

  it("creates 3 clients with logs on an empty database, and nothing on a second run", async () => {
    const first = await request(app).post("/api/seed/demo");
    expect(first.status).toBe(201);
    expect(first.body).toHaveLength(3);

    const clients = await request(app).get("/api/clients");
    expect(clients.body.map((c: { name: string }) => c.name)).toEqual(["Maya Patel", "Arjun Mehta", "Casey Jordan"]);
    for (const c of clients.body as { id: string }[]) {
      const logs = await request(app).get(`/api/clients/${c.id}/progress`);
      expect(logs.body).toHaveLength(3);
      const plans = await request(app).get(`/api/clients/${c.id}/assignments`);
      expect(plans.body.map((a: { title: string }) => a.title)).toEqual(["Demo starter plan"]);
    }

    const second = await request(app).post("/api/seed/demo");
    expect(second.status).toBe(200);
    expect(second.body).toEqual([]);
    const after = await request(app).get("/api/clients");
    expect(after.body).toHaveLength(3);
  });

  it("two seeds at the same time still create exactly 3 clients", async () => {
    await prisma.client.deleteMany({ where: { coachId: "default-coach" } });
    const [a, b] = await Promise.all([request(app).post("/api/seed/demo"), request(app).post("/api/seed/demo")]);
    expect([a.body.length, b.body.length].sort()).toEqual([0, 3]);
    const after = await request(app).get("/api/clients");
    expect(after.body).toHaveLength(3);
  });
});
