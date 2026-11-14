// Prompt 71 against a real database: streak, habit %, workouts this week, ranking, and coach scoping.
// Skipped when DATABASE_URL is not set (runs in CI).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `engagement-${Date.now()}`;
const TODAY = "2026-11-12"; // Thursday; the week is 2026-11-09 .. 2026-11-15

describe.skipIf(!process.env.DATABASE_URL)("engagement (database)", () => {
  const coachIds: string[] = [];
  let api: ReturnType<typeof asCoach>;
  let otherApi: ReturnType<typeof asCoach>;

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    api = asCoach(app, coachIds[0]);
    otherApi = asCoach(app, coachIds[1]);
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } });
    await prisma.$disconnect();
  });

  it("ranks by check-in streak then habit %, shows the three numbers, and never leaks another coach's clients", async () => {
    const mk = async (who: typeof api, name: string) => (await who.post("/api/clients").send({ name })).body.id as string;
    const strong = await mk(api, "Strong Streak");
    const habitual = await mk(api, "Habit Hero");
    const fresh = await mk(api, "Brand New");
    await mk(otherApi, "Stranger");

    for (const date of ["2026-11-12", "2026-11-11", "2026-11-10"]) {
      await api.post(`/api/clients/${strong}/checkins`).send({ date, energy: 3, mood: 3 });
    }
    await api.post(`/api/clients/${habitual}/checkins`).send({ date: "2026-11-12", energy: 3, mood: 3 });
    const habit = (await api.post(`/api/clients/${habitual}/habits`).send({ name: "Walk" })).body.id as string;
    for (const date of ["2026-11-12", "2026-11-11"]) await api.put(`/api/clients/${habitual}/habits/${habit}/logs/${date}`).send({ done: true });

    const workout = (await api.post(`/api/clients/${strong}/assignments`).send({ type: "Workout", title: "Squat", details: "d", date: "2026-11-10" })).body.id as string;
    await api.patch(`/api/clients/${strong}/assignments/${workout}`).send({ status: "Done" });

    const res = await api.get(`/api/business/engagement?date=${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.clients).toEqual([
      { clientId: strong, clientName: "Strong Streak", rank: 1, checkInStreak: 3, habitPercent: null, workoutsThisWeek: 1, enoughData: true },
      // 2 done ticks / (1 active habit x 7 days) = 29%.
      { clientId: habitual, clientName: "Habit Hero", rank: 2, checkInStreak: 1, habitPercent: 29, workoutsThisWeek: 0, enoughData: true },
      { clientId: fresh, clientName: "Brand New", rank: null, checkInStreak: 0, habitPercent: null, workoutsThisWeek: 0, enoughData: false },
    ]);
  });
});
