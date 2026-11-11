// Prompt 31 "Test:" line against a real database: fresh database - quick demo gives 3,
// six-month gives 10 more (13 total, 50 assignments among the 10); re-running both adds 0.
// Never runs against a Render database. Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { SIX_MONTH_ROSTER } from "../src/routes/seed.js";

const url = process.env.DATABASE_URL ?? "";
const isRenderDb = /render\.com|dpg-/.test(url);

describe.skipIf(!url || isRenderDb)("both demo sets (database)", () => {
  beforeAll(async () => {
    await prisma.client.deleteMany({ where: { coachId: null } });
  });
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { coachId: null } });
    await prisma.$disconnect();
  });

  it("3 + 10 = 13 clients, 50 six-month assignments, and re-running both adds 0", async () => {
    expect((await request(app).post("/api/seed/demo")).body).toHaveLength(3);
    expect((await request(app).post("/api/seed/six-month-demo")).body).toHaveLength(10);
    expect((await request(app).get("/api/clients")).body).toHaveLength(13);

    const names = SIX_MONTH_ROSTER.map((c) => c.name);
    const sixMonth = { client: { coachId: null, name: { in: names } } };
    expect(await prisma.assignment.count({ where: sixMonth })).toBe(50);
    expect(await prisma.assignment.count({ where: { ...sixMonth, reasoning: "" } })).toBe(0);
    expect(await prisma.progressLog.count({ where: sixMonth })).toBe(260);

    expect((await request(app).post("/api/seed/demo")).body).toEqual([]);
    expect((await request(app).post("/api/seed/six-month-demo")).body).toEqual([]);
    expect((await request(app).get("/api/clients")).body).toHaveLength(13);
    expect(await prisma.assignment.count({ where: sixMonth })).toBe(50);
    expect(await prisma.progressLog.count({ where: sixMonth })).toBe(260);
  });
});
