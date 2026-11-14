// Prompt 54 against a real database (CI only): add up to 8, tick days, streaks, archive keeps history.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { addDays } from "../src/habits.js";
import supertest from "supertest";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `habit-${Date.now()}`;
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!process.env.DATABASE_URL)("habit tracker (database)", () => {
  const coachIds: string[] = [];
  let api: ReturnType<typeof asCoach>;
  let otherApi: ReturnType<typeof asCoach>;
  let clientId = "";
  let habitId = "";

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    api = asCoach(app, coachIds[0]);
    otherApi = asCoach(app, coachIds[1]);
    clientId = (await api.post("/api/clients").send({ name: "Habit Probe" })).body.id;
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades
    await prisma.$disconnect();
  });

  it("adds a habit, ticks days, and reports the streaks", async () => {
    const created = await api.post(`/api/clients/${clientId}/habits`).send({ name: "Drink water" });
    expect(created.status).toBe(201);
    habitId = created.body.id;

    // done yesterday and the day before; today not logged yet -> streak still 2
    for (const d of [addDays(today, -2), addDays(today, -1)]) {
      const tick = await api.put(`/api/clients/${clientId}/habits/${habitId}/logs/${d}`).send({ done: true });
      expect(tick.status).toBe(200);
    }
    const grid = await api.get(`/api/clients/${clientId}/habits?date=${today}`);
    expect(grid.status).toBe(200);
    expect(grid.body.days).toHaveLength(7);
    expect(grid.body.habits[0]).toMatchObject({ id: habitId, name: "Drink water", currentStreak: 2, bestStreak: 2 });
    expect(grid.body.habits[0].week).toEqual([false, false, false, false, true, true, false]);

    // un-ticking yesterday breaks it
    await api.put(`/api/clients/${clientId}/habits/${habitId}/logs/${addDays(today, -1)}`).send({ done: false });
    const after = await api.get(`/api/clients/${clientId}/habits?date=${today}`);
    expect(after.body.habits[0]).toMatchObject({ currentStreak: 0, bestStreak: 1 });
    expect(await prisma.habitLog.count({ where: { habitId } })).toBe(2); // still one row per day
  });

  it("allows 8 active habits, not a 9th; archiving frees a slot but keeps the history", async () => {
    for (let i = 2; i <= 8; i++) {
      expect((await api.post(`/api/clients/${clientId}/habits`).send({ name: `Habit ${i}` })).status).toBe(201);
    }
    const ninth = await api.post(`/api/clients/${clientId}/habits`).send({ name: "Ninth" });
    expect(ninth.status).toBe(400);

    const renamed = await api.patch(`/api/clients/${clientId}/habits/${habitId}`).send({ name: "Water 2L" });
    expect(renamed.body.name).toBe("Water 2L");

    const archived = await api.patch(`/api/clients/${clientId}/habits/${habitId}`).send({ active: false });
    expect(archived.body.active).toBe(false);
    const grid = await api.get(`/api/clients/${clientId}/habits?date=${today}`);
    expect(grid.body.habits).toHaveLength(7);
    expect(await prisma.habit.count({ where: { id: habitId } })).toBe(1); // kept
    expect(await prisma.habitLog.count({ where: { habitId } })).toBe(2); // history kept
    expect((await api.post(`/api/clients/${clientId}/habits`).send({ name: "Ninth" })).status).toBe(201);
  });

  it("two adds at the same moment can never leave 9 active habits", async () => {
    // The limit is enforced inside a transaction holding a per-client advisory lock, so when the
    // client is one slot from full, two simultaneous adds end with exactly one winner.
    const fresh = (await api.post("/api/clients").send({ name: "Race Probe" })).body.id as string;
    for (let i = 1; i <= 7; i++) {
      expect((await api.post(`/api/clients/${fresh}/habits`).send({ name: `Habit ${i}` })).status).toBe(201);
    }
    const [a, b] = await Promise.all([
      api.post(`/api/clients/${fresh}/habits`).send({ name: "Eighth A" }),
      api.post(`/api/clients/${fresh}/habits`).send({ name: "Eighth B" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await prisma.habit.count({ where: { clientId: fresh, active: true } })).toBe(8);
  });

  it("belongs to one coach only, and signed out is 401", async () => {
    expect((await otherApi.get(`/api/clients/${clientId}/habits`)).status).toBe(404);
    expect((await otherApi.post(`/api/clients/${clientId}/habits`).send({ name: "x" })).status).toBe(404);
    const tick = await otherApi.put(`/api/clients/${clientId}/habits/${habitId}/logs/${today}`).send({ done: true });
    expect(tick.status).toBe(404);
    expect((await otherApi.patch(`/api/clients/${clientId}/habits/${habitId}`).send({ active: false })).status).toBe(404);

    // No session at all: every habit route answers 401, not 404.
    const anon = supertest(app);
    expect((await anon.get(`/api/clients/${clientId}/habits`)).status).toBe(401);
    expect((await anon.post(`/api/clients/${clientId}/habits`).send({ name: "x" })).status).toBe(401);
    expect((await anon.patch(`/api/clients/${clientId}/habits/${habitId}`).send({ name: "x" })).status).toBe(401);
    expect((await anon.put(`/api/clients/${clientId}/habits/${habitId}/logs/${today}`).send({ done: true })).status).toBe(401);
  });
});
