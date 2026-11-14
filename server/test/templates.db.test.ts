// Prompt 58 against a real database (CI only): create, list, edit, delete, and coach isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `tpl-${Date.now()}`;
const EXERCISES = [
  { name: "Back Squat", sets: 4, reps: "6", rest: 120 },
  { name: "Custom Sled Push", sets: 3, reps: "20 m", rest: 60 },
];

describe.skipIf(!process.env.DATABASE_URL)("workout templates (database)", () => {
  const coachIds: string[] = [];
  let api: ReturnType<typeof asCoach>;
  let otherApi: ReturnType<typeof asCoach>;
  let templateId = "";

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    api = asCoach(app, coachIds[0]);
    otherApi = asCoach(app, coachIds[1]);
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades
    await prisma.$disconnect();
  });

  it("creates a template and lists it with the exercises in order", async () => {
    const created = await api.post("/api/templates").send({ name: "Leg day", focus: "Legs", exercises: EXERCISES, notes: "Warm up" });
    expect(created.status).toBe(201);
    templateId = created.body.id;
    const list = await api.get("/api/templates");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: "Leg day", focus: "Legs", notes: "Warm up", exercises: EXERCISES });
  });

  it("another coach sees none and cannot edit or delete it", async () => {
    expect((await otherApi.get("/api/templates")).body).toEqual([]);
    expect((await otherApi.put(`/api/templates/${templateId}`).send({ name: "x", exercises: EXERCISES })).status).toBe(404);
    expect((await otherApi.delete(`/api/templates/${templateId}`)).status).toBe(404);
    expect((await api.get("/api/templates")).body).toHaveLength(1);
  });

  it("edits a template", async () => {
    const res = await api.put(`/api/templates/${templateId}`).send({ name: "Leg day v2", exercises: [EXERCISES[0]] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: templateId, name: "Leg day v2", focus: "", exercises: [EXERCISES[0]] });
  });

  it("deletes it (204), then 'Template not found'", async () => {
    expect((await api.delete(`/api/templates/${templateId}`)).status).toBe(204);
    const again = await api.delete(`/api/templates/${templateId}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: "Template not found" });
  });

  it("a template can be used for a real Workout assignment with 'From template' reasoning", async () => {
    const client = (await api.post("/api/clients").send({ name: "Template Probe" })).body;
    const res = await api.post(`/api/clients/${client.id}/assignments`).send({
      type: "Workout",
      title: "Leg day",
      details: "1. Back Squat — 4 sets × 6 reps · Rest 120s",
      reasoning: "From template: Leg day",
      source: "manual",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "Workout", reasoning: "From template: Leg day", source: "manual" });
  });
});
