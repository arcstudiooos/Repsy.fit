// Prompt 73 against a real database (CI only): deletion actually removes everything.
// This is the test that matters for the privacy promise, and it can only be proved against real
// Postgres cascades, so it cannot run locally without DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";
import { hashPassword } from "../src/auth/password.js";

const tag = `del-${Date.now()}`;

/** Fills one client with a row in every table that hangs off a client, and returns their id. */
async function fullClient(api: ReturnType<typeof asCoach>, name: string): Promise<string> {
  const clientId = (await api.post("/api/clients").send({ name, notes: "private note" })).body.id as string;
  const assignment = (await api.post(`/api/clients/${clientId}/assignments`).send({ type: "Workout", title: "Legs", details: "Squat", date: "2026-11-10" })).body.id;
  await api.patch(`/api/clients/${clientId}/assignments/${assignment}`).send({ status: "Done" });
  await api.post(`/api/clients/${clientId}/progress`).send({ date: "2026-11-10", weightKg: 70, adherence: 80, workoutsDone: 3 });
  await api.post(`/api/clients/${clientId}/measurements`).send({ date: "2026-11-10", waistCm: 80 });
  await api.post(`/api/clients/${clientId}/checkins`).send({ date: "2026-11-10", energy: 3, mood: 3 });
  const habit = (await api.post(`/api/clients/${clientId}/habits`).send({ name: "Walk" })).body.id;
  await api.put(`/api/clients/${clientId}/habits/${habit}/logs/2026-11-10`).send({ done: true });
  await api.post(`/api/clients/${clientId}/messages`).send({ body: "hello there" });
  await api.post(`/api/clients/${clientId}/chat`).send({ message: "plan something" }).catch(() => undefined);
  await api.put(`/api/clients/${clientId}/plan`).send({ planName: "Monthly", priceAmount: 4999, billingCycle: "Monthly", startDate: "2026-11-01" });
  await api.post(`/api/clients/${clientId}/plan/payments`).send({ amount: 4999, paidOn: "2026-11-01", method: "UPI" });
  await api.post("/api/appointments").send({
    clientId,
    title: "Session",
    type: "Session",
    startsAt: "2026-11-20T04:30:00.000Z",
    endsAt: "2026-11-20T05:30:00.000Z",
  });
  const invited = await api.post(`/api/clients/${clientId}/invite`).send({ email: `${tag}-${name.replace(/\W/g, "").toLowerCase()}@example.com` });
  // Fail loudly here rather than letting a silent 400 make the cascade assertions vacuous.
  if (invited.status !== 200 && invited.status !== 201) throw new Error(`invite failed: ${invited.status} ${JSON.stringify(invited.body)}`);
  return clientId;
}

/** Every table that holds client-owned rows, counted by clientId. */
async function childCounts(clientId: string) {
  const [assignments, progress, measurements, checkIns, habits, habitLogs, threadMessages, chatMessages, plans, payments, appointments, invites, reviewItems] =
    await Promise.all([
      prisma.assignment.count({ where: { clientId } }),
      prisma.progressLog.count({ where: { clientId } }),
      prisma.measurement.count({ where: { clientId } }),
      prisma.dailyCheckIn.count({ where: { clientId } }),
      prisma.habit.count({ where: { clientId } }),
      prisma.habitLog.count({ where: { habit: { clientId } } }),
      prisma.threadMessage.count({ where: { clientId } }),
      prisma.chatMessage.count({ where: { clientId } }),
      prisma.clientPlan.count({ where: { clientId } }),
      prisma.payment.count({ where: { clientId } }),
      prisma.appointment.count({ where: { clientId } }),
      prisma.clientInvite.count({ where: { clientId } }),
      prisma.reviewItem.count({ where: { clientId } }),
    ]);
  return { assignments, progress, measurements, checkIns, habits, habitLogs, threadMessages, chatMessages, plans, payments, appointments, invites, reviewItems };
}

const ZERO = {
  assignments: 0,
  progress: 0,
  measurements: 0,
  checkIns: 0,
  habits: 0,
  habitLogs: 0,
  threadMessages: 0,
  chatMessages: 0,
  plans: 0,
  payments: 0,
  appointments: 0,
  invites: 0,
  reviewItems: 0,
};

describe.skipIf(!process.env.DATABASE_URL)("deletion removes everything (database)", () => {
  const coachIds: string[] = [];
  let api: ReturnType<typeof asCoach>;
  let keptCoachId = "";
  let keptClientId = "";

  beforeAll(async () => {
    for (const n of ["victim", "kept"]) {
      coachIds.push(
        (await prisma.coach.create({ data: { name: "Test", email: `${tag}-${n}@example.com`, passwordHash: await hashPassword("right-password-1") } })).id,
      );
    }
    api = asCoach(app, coachIds[0]);
    keptCoachId = coachIds[1];
    keptClientId = await fullClient(asCoach(app, keptCoachId), "Kept Client");
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } });
    await prisma.$disconnect();
  });

  it("deleting ONE client removes every record that belongs to them", async () => {
    const clientId = await fullClient(api, "Doomed Client");
    const before = await childCounts(clientId);
    // The client really did have data in the tables that matter, or the test proves nothing.
    expect(before.assignments).toBeGreaterThan(0);
    expect(before.progress).toBeGreaterThan(0);
    expect(before.measurements).toBeGreaterThan(0);
    expect(before.checkIns).toBeGreaterThan(0);
    expect(before.habits).toBeGreaterThan(0);
    expect(before.habitLogs).toBeGreaterThan(0);
    expect(before.threadMessages).toBeGreaterThan(0);
    expect(before.plans).toBeGreaterThan(0);
    expect(before.payments).toBeGreaterThan(0);
    expect(before.appointments).toBeGreaterThan(0);
    expect(before.invites).toBeGreaterThan(0);

    expect((await api.delete(`/api/clients/${clientId}`)).status).toBe(204);
    expect(await prisma.client.count({ where: { id: clientId } })).toBe(0);
    expect(await childCounts(clientId)).toEqual(ZERO);
  });

  it("deleting the ACCOUNT removes the coach, their clients and all child rows, and nothing else", async () => {
    const a = await fullClient(api, "Account Client A");
    const b = await fullClient(api, "Account Client B");
    await api.post("/api/templates").send({ name: "Push day", exercises: [{ name: "Bench", sets: 3, reps: "8", rest: 90 }] });
    await api.post("/api/meals").send({ name: "Oats", calories: 400, proteinG: 20, carbsG: 50, fatG: 10 });
    const coachId = coachIds[0];

    const res = await api.delete("/api/auth/account").send({ password: "right-password-1", confirm: "DELETE" });
    expect(res.status).toBe(204);

    expect(await prisma.coach.count({ where: { id: coachId } })).toBe(0);
    expect(await prisma.client.count({ where: { coachId } })).toBe(0);
    for (const clientId of [a, b]) expect(await childCounts(clientId)).toEqual(ZERO);
    expect(await prisma.workoutTemplate.count({ where: { coachId } })).toBe(0);
    expect(await prisma.meal.count({ where: { coachId } })).toBe(0);
    expect(await prisma.weeklySummary.count({ where: { coachId } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { coachId } })).toBe(0);

    // The other coach is untouched: deletion is scoped, not a sweep.
    expect(await prisma.coach.count({ where: { id: keptCoachId } })).toBe(1);
    expect(await prisma.client.count({ where: { id: keptClientId } })).toBe(1);
    const kept = await childCounts(keptClientId);
    expect(kept.assignments).toBeGreaterThan(0);
    expect(kept.payments).toBeGreaterThan(0);
    expect(kept.threadMessages).toBeGreaterThan(0);
  });

  it("a wrong password deletes nothing", async () => {
    const other = asCoach(app, keptCoachId);
    const res = await other.delete("/api/auth/account").send({ password: "not-the-password", confirm: "DELETE" });
    expect(res.status).toBe(400);
    expect(await prisma.coach.count({ where: { id: keptCoachId } })).toBe(1);
  });
});
