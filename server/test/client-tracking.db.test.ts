// Prompt 80 against a real database: a client's habit tick, daily check-in and weekly check-in land on
// their own records under their coach, the weekly one in the coach's review queue; another client's
// habit cannot be ticked; plan meals come from the coach's library. Skipped without DATABASE_URL (runs in CI).
import supertest from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { CLIENT_SESSION_COOKIE, signClientSession } from "../src/auth/clientSession.js";
import { asCoach } from "./helpers/authedRequest.js";

const stamp = Date.now();
const coachEmail = `track80-${stamp}@example.com`;
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!process.env.DATABASE_URL)("client tracking (database)", () => {
  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { email: coachEmail } });
    await prisma.$disconnect();
  });

  it("writes only the client's own records and queues the weekly check-in for review", async () => {
    const coach = await prisma.coach.create({ data: { planTier: "Pro100", email: coachEmail, name: "Coach 80", passwordHash: "x" } });
    const [maya, sam] = await Promise.all(
      ["maya", "sam"].map((n) => prisma.client.create({ data: { coachId: coach.id, name: n, loginEmail: `${n}-80-${stamp}@example.com`, passwordHash: "$2b$12$x" } })),
    );
    const [mine, theirs] = await Promise.all([
      prisma.habit.create({ data: { coachId: coach.id, clientId: maya.id, name: "Steps" } }),
      prisma.habit.create({ data: { coachId: coach.id, clientId: sam.id, name: "Sleep" } }),
    ]);
    const cookie = `${CLIENT_SESSION_COOKIE}=${signClientSession(maya.id, 0)}`;
    const c = (m: "get" | "put" | "post" | "delete", url: string) => (supertest(app) as any)[m](url).set("Cookie", cookie);

    expect((await c("put", `/api/client-auth/my-habits/${mine.id}/${today}`).send({ done: true })).status).toBe(200);
    expect((await c("put", `/api/client-auth/my-habits/${theirs.id}/${today}`).send({ done: true })).status).toBe(404);
    expect(await prisma.habitLog.count({ where: { habitId: theirs.id } })).toBe(0);
    const grid = await c("get", `/api/client-auth/my-habits?date=${today}`);
    expect(grid.body.habits.map((h: { name: string }) => h.name)).toEqual(["Steps"]);

    expect((await c("put", `/api/client-auth/my-checkins/${today}`).send({ mood: 4 })).status).toBe(201);
    expect((await c("put", `/api/client-auth/my-checkins/${today}`).send({ mood: 5 })).status).toBe(200);
    expect(await prisma.dailyCheckIn.findMany({ where: { clientId: maya.id }, select: { mood: true, coachId: true } })).toEqual([{ mood: 5, coachId: coach.id }]);

    // A day the coach entered stays the coach's.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await asCoach(app, coach.id).post(`/api/clients/${maya.id}/checkins`).send({ date: yesterday, steps: 12000 });
    expect((await c("put", `/api/client-auth/my-checkins/${yesterday}`).send({ steps: 1 })).status).toBe(409);
    expect((await prisma.dailyCheckIn.findFirst({ where: { clientId: maya.id, date: yesterday } }))?.steps).toBe(12000);

    const log = await c("post", "/api/client-auth/my-progress").send({ date: today, weightKg: 68, adherence: 85 });
    expect(log.status).toBe(201);
    expect((await c("post", "/api/client-auth/my-progress").send({ date: today, weightKg: 68 })).status).toBe(409);
    expect(await prisma.reviewItem.count({ where: { coachId: coach.id, clientId: maya.id, kind: "checkin", sourceId: log.body.id, status: "Pending" } })).toBe(1);
    const queue = await asCoach(app, coach.id).get("/api/review-queue");
    expect(queue.body.pendingCount).toBe(1);

    // Prompt 81: measurements - the client deletes only their own.
    const coachM = await asCoach(app, coach.id).post(`/api/clients/${maya.id}/measurements`).send({ date: today, waistCm: 82 });
    const mine2 = await c("post", "/api/client-auth/my-measurements").send({ date: today, waistCm: 81 });
    expect(mine2.status).toBe(201);
    const listed = await c("get", "/api/client-auth/my-measurements");
    expect(listed.body.map((m: { createdBy: string }) => m.createdBy).sort()).toEqual(["client", "coach"]);
    expect((await c("delete", `/api/client-auth/my-measurements/${coachM.body.id}`)).status).toBe(404);
    expect((await c("delete", `/api/client-auth/my-measurements/${mine2.body.id}`)).status).toBe(204);
    expect(await prisma.measurement.count({ where: { clientId: maya.id } })).toBe(1);
    const samCookie = `${CLIENT_SESSION_COOKIE}=${signClientSession(sam.id, 0)}`;
    expect((await supertest(app).get("/api/client-auth/my-measurements").set("Cookie", samCookie)).body).toEqual([]);

    // Targets set by the coach show to the client; meals attach from the coach's library.
    await asCoach(app, coach.id).patch(`/api/clients/${maya.id}/targets`).send({ calorieTarget: 2100, proteinTargetG: 140 });
    expect((await c("get", "/api/client-auth/my-targets")).body).toMatchObject({ calorieTarget: 2100, proteinTargetG: 140 });
    const meal = await prisma.meal.create({ data: { coachId: coach.id, name: "Oats", mealType: "Breakfast", calories: 400, proteinG: 20, carbsG: 60, fatG: 8 } });
    const plan = await asCoach(app, coach.id).post(`/api/clients/${maya.id}/assignments`).send({ type: "Nutrition", title: "Day", details: "Eat", date: today, mealIds: [meal.id] });
    expect(plan.status).toBe(201);
    const seen = await c("get", `/api/client-auth/my-assignments/${plan.body.id}`);
    expect(seen.body.meals).toEqual([{ id: meal.id, name: "Oats", mealType: "Breakfast", calories: 400, proteinG: 20, carbsG: 60, fatG: 8 }]);
  });
});
