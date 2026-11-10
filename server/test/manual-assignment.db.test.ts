// Prompt 20 "Test:" line against a real database: create one Nutrition and one Habit
// assignment by hand; both are saved with source "manual" beside an AI plan, and empty
// details are rejected. Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const createdIds: string[] = [];

describe.skipIf(!process.env.DATABASE_URL)("manual assignments (database)", () => {
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("saves Nutrition and Habit plans with source manual beside AI plans; empty details is rejected", async () => {
    const created = await request(app).post("/api/clients").send({ name: "Manual Assign Test Client" });
    expect(created.status).toBe(201);
    const clientId: string = created.body.id;
    createdIds.push(clientId);
    const url = `/api/clients/${clientId}/assignments`;

    const ai = await request(app)
      .post(url)
      .send({ type: "Workout", title: "AI squat day", details: "Back squat 4x6", reasoning: "Strength.", source: "ai" });
    expect(ai.status).toBe(201);

    const nutrition = await request(app).post(url).send({
      type: "Nutrition",
      title: "1800 kcal high-protein day",
      details: "Breakfast: 3 eggs, oats 60g",
      reasoning: "",
      source: "manual",
      date: "2026-11-12",
    });
    expect(nutrition.status).toBe(201);
    const habit = await request(app)
      .post(url)
      .send({ type: "Habit", title: "Daily 10k steps", details: "Walk after lunch", source: "manual", date: "2026-11-12" });
    expect(habit.status).toBe(201);

    const empty = await request(app)
      .post(url)
      .send({ type: "Habit", title: "No details", details: "  ", source: "manual" });
    expect(empty.status).toBe(400);
    expect(empty.body).toEqual({ error: expect.any(String) });

    const list = await request(app).get(url);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(3);
    const byId = (id: string) => list.body.find((a: { id: string }) => a.id === id);
    expect(byId(habit.body.id)).toMatchObject({ type: "Habit", source: "manual", status: "Active", clientId, coachId: "default-coach" });
    expect(byId(nutrition.body.id)).toMatchObject({ type: "Nutrition", source: "manual", date: "2026-11-12", reasoning: "" });
    expect(byId(ai.body.id)).toMatchObject({ type: "Workout", source: "ai" });
  });
});
