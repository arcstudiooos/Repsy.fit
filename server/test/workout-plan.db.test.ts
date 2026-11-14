// Prompt 23 "Test:" line against a real database: save the 2-exercise workout as a numbered
// plan and read the stored details back from the API - character for character. Skipped when
// DATABASE_URL is not set (runs in CI).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const PLAN = "1. Back Squat — 4 sets × 6 reps · Rest 120s\n2. Romanian Deadlift — 3 sets × 8 reps · Rest 90s";
const tag = `workout-plan-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("numbered workout plan (database)", () => {
  let coachId = "";
  let api: ReturnType<typeof asCoach>;

  beforeAll(async () => {
    coachId = (await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}@example.com`, passwordHash: "x" } })).id;
    api = asCoach(app, coachId);
  });

  afterAll(async () => {
    // Deleting the coach cascades to its clients and everything under them.
    await prisma.coach.deleteMany({ where: { id: coachId } });
    await prisma.$disconnect();
  });

  it("stores the generated exercise list exactly as sent", async () => {
    const created = await api.post("/api/clients").send({ name: "Workout Plan Test Client" });
    expect(created.status).toBe(201);
    const clientId: string = created.body.id;
    const url = `/api/clients/${clientId}/assignments`;

    const saved = await api
      .post(url)
      .send({ type: "Workout", title: "Lower body strength", details: PLAN, reasoning: "", source: "manual" });
    expect(saved.status).toBe(201);
    expect(saved.body.details).toBe(PLAN);

    const list = await api.get(url);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].details).toBe(PLAN);
    expect(list.body[0].details.split("\n")).toEqual([
      "1. Back Squat — 4 sets × 6 reps · Rest 120s",
      "2. Romanian Deadlift — 3 sets × 8 reps · Rest 90s",
    ]);
  });
});
