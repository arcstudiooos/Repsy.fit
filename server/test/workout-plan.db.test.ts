// Prompt 23 "Test:" line against a real database: save the 2-exercise workout as a numbered
// plan and read the stored details back from the API - character for character. Skipped when
// DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const PLAN = "1. Back Squat — 4 sets × 6 reps · Rest 120s\n2. Romanian Deadlift — 3 sets × 8 reps · Rest 90s";
const createdIds: string[] = [];

describe.skipIf(!process.env.DATABASE_URL)("numbered workout plan (database)", () => {
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("stores the generated exercise list exactly as sent", async () => {
    const created = await request(app).post("/api/clients").send({ name: "Workout Plan Test Client" });
    expect(created.status).toBe(201);
    const clientId: string = created.body.id;
    createdIds.push(clientId);
    const url = `/api/clients/${clientId}/assignments`;

    const saved = await request(app)
      .post(url)
      .send({ type: "Workout", title: "Lower body strength", details: PLAN, reasoning: "", source: "manual" });
    expect(saved.status).toBe(201);
    expect(saved.body.details).toBe(PLAN);

    const list = await request(app).get(url);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].details).toBe(PLAN);
    expect(list.body[0].details.split("\n")).toEqual([
      "1. Back Squat — 4 sets × 6 reps · Rest 120s",
      "2. Romanian Deadlift — 3 sets × 8 reps · Rest 90s",
    ]);
  });
});
