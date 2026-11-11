// Prompt 60 against a real database (CI only): create, list, edit, delete, coach isolation, Nutrition assignment.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `meal-${Date.now()}`;
const BODY = { name: "Oats & eggs", mealType: "Breakfast", calories: 450, proteinG: 30, carbsG: 45.5, fatG: 15, ingredients: "Oats, eggs", steps: "Cook." };

describe.skipIf(!process.env.DATABASE_URL)("meal library (database)", () => {
  const coachIds: string[] = [];
  let api: ReturnType<typeof asCoach>;
  let otherApi: ReturnType<typeof asCoach>;
  let mealId = "";

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { name: "Test", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    api = asCoach(app, coachIds[0]);
    otherApi = asCoach(app, coachIds[1]);
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades
    await prisma.$disconnect();
  });

  it("creates a meal and lists it with its macros", async () => {
    const created = await api.post("/api/meals").send(BODY);
    expect(created.status).toBe(201);
    mealId = created.body.id;
    const list = await api.get("/api/meals");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject(BODY);
  });

  it("another coach sees none and cannot edit or delete it", async () => {
    expect((await otherApi.get("/api/meals")).body).toEqual([]);
    expect((await otherApi.put(`/api/meals/${mealId}`).send(BODY)).status).toBe(404);
    expect((await otherApi.delete(`/api/meals/${mealId}`)).status).toBe(404);
    expect((await api.get("/api/meals")).body).toHaveLength(1);
  });

  it("edits a meal", async () => {
    const res = await api.put(`/api/meals/${mealId}`).send({ ...BODY, name: "Lunch bowl", mealType: "Lunch" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: mealId, name: "Lunch bowl", mealType: "Lunch" });
  });

  it("a meal can be used for a real Nutrition assignment with 'From meal library' reasoning", async () => {
    const client = (await api.post("/api/clients").send({ name: "Meal Probe" })).body;
    const res = await api.post(`/api/clients/${client.id}/assignments`).send({
      type: "Nutrition",
      title: "Lunch bowl",
      details: "Lunch bowl\n450 kcal",
      reasoning: "From meal library: Lunch bowl",
      source: "manual",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "Nutrition", reasoning: "From meal library: Lunch bowl" });
  });

  it("deletes it (204), then 'Meal not found'; an assignment made from it survives", async () => {
    // A meal is a starting point, not the plan: deleting it must never touch a saved assignment.
    const client = (await api.post("/api/clients").send({ name: "Meal Keep Probe" })).body;
    const assignment = (
      await api.post(`/api/clients/${client.id}/assignments`).send({
        type: "Nutrition",
        title: "Lunch bowl",
        details: "Lunch bowl\n450 kcal",
        reasoning: "From meal library: Lunch bowl",
        source: "manual",
      })
    ).body;

    expect((await api.delete(`/api/meals/${mealId}`)).status).toBe(204);
    const again = await api.delete(`/api/meals/${mealId}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: "Meal not found" });

    const kept = await api.get(`/api/clients/${client.id}/assignments`);
    expect(kept.body.map((a: { id: string }) => a.id)).toContain(assignment.id);
    expect(kept.body.find((a: { id: string }) => a.id === assignment.id)).toMatchObject({
      title: "Lunch bowl",
      reasoning: "From meal library: Lunch bowl",
    });
  });
});
