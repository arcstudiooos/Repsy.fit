// Prompt 25 "Test:" line against a real database: 3 logs added out of date order come back
// date-sorted; adherence 120 is rejected with 400; client A's logs never appear for client B.
// Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const createdIds: string[] = [];

describe.skipIf(!process.env.DATABASE_URL)("progress logs (database)", () => {
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("sorts by date, rejects adherence 120, and keeps clients apart", async () => {
    const a = await request(app).post("/api/clients").send({ name: "Progress Client A" });
    const b = await request(app).post("/api/clients").send({ name: "Progress Client B" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const clientA: string = a.body.id;
    const clientB: string = b.body.id;
    createdIds.push(clientA, clientB);

    // Increasing dates, added out of order.
    for (const [date, weightKg] of [
      ["2026-11-09", 67.2],
      ["2026-10-26", 68.4],
      ["2026-11-02", 67.8],
    ] as const) {
      const res = await request(app)
        .post(`/api/clients/${clientA}/progress`)
        .send({ date, weightKg, adherence: 80, workoutsDone: 4 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ clientId: clientA, date, weightKg, note: "" });
    }

    const list = await request(app).get(`/api/clients/${clientA}/progress`);
    expect(list.status).toBe(200);
    expect(list.body.map((l: { date: string }) => l.date)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);

    const tooHigh = await request(app).post(`/api/clients/${clientA}/progress`).send({ date: "2026-11-10", adherence: 120 });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error).toEqual(expect.any(String));

    // Client B sees none of client A's logs, and can't delete them through its own path.
    const bList = await request(app).get(`/api/clients/${clientB}/progress`);
    expect(bList.status).toBe(200);
    expect(bList.body).toEqual([]);
    const firstLogId: string = list.body[0].id;
    const wrongDelete = await request(app).delete(`/api/clients/${clientB}/progress/${firstLogId}`);
    expect(wrongDelete.status).toBe(404);
    expect(wrongDelete.body).toEqual({ error: "Progress log not found" });

    const del = await request(app).delete(`/api/clients/${clientA}/progress/${firstLogId}`);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/api/clients/${clientA}/progress`);
    expect(after.body.map((l: { date: string }) => l.date)).toEqual(["2026-11-02", "2026-11-09"]);
  });
});
