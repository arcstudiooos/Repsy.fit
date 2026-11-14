// Prompt 83 against a real database: a client deleting their account removes the client row and every
// record that cascades from it; the coach and their other clients are untouched. Skipped without
// DATABASE_URL (runs in CI).
import supertest from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { CLIENT_SESSION_COOKIE, signClientSession } from "../src/auth/clientSession.js";
import { asCoach } from "./helpers/authedRequest.js";

const stamp = Date.now();
const coachEmail = `acct83-${stamp}@example.com`;

describe.skipIf(!process.env.DATABASE_URL)("client account deletion (database)", () => {
  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { email: coachEmail } });
    await prisma.$disconnect();
  });

  it("cascades the client's records and leaves the coach and other clients alone", async () => {
    const coach = await prisma.coach.create({ data: { planTier: "Pro100", email: coachEmail, name: "Coach 83", passwordHash: "x" } });
    const passwordHash = await hashPassword("client-password-1");
    const maya = await prisma.client.create({ data: { coachId: coach.id, name: "Maya", loginEmail: `maya-83-${stamp}@example.com`, passwordHash } });
    const sam = await prisma.client.create({ data: { coachId: coach.id, name: "Sam" } });
    const today = new Date().toISOString().slice(0, 10);
    const plan = await prisma.clientPlan.create({ data: { coachId: coach.id, clientId: maya.id, planName: "Monthly", priceAmount: 4999, billingCycle: "Monthly", startDate: today, nextDueDate: today, anchorDay: 1 } });
    await Promise.all([
      prisma.assignment.create({ data: { coachId: coach.id, clientId: maya.id, type: "Workout", title: "Legs", details: "Squat", date: today } }),
      prisma.threadMessage.create({ data: { coachId: coach.id, clientId: maya.id, sender: "client", body: "hi" } }),
      prisma.progressLog.create({ data: { coachId: coach.id, clientId: maya.id, date: today, weightKg: 70 } }),
      prisma.measurement.create({ data: { coachId: coach.id, clientId: maya.id, date: today, waistCm: 80 } }),
      prisma.payment.create({ data: { coachId: coach.id, clientId: maya.id, clientPlanId: plan.id, amount: 4999, paidOn: today, method: "UPI" } }),
      prisma.assignment.create({ data: { coachId: coach.id, clientId: sam.id, type: "Habit", title: "Walk", details: "", date: today } }),
      prisma.dailyCheckIn.create({ data: { coachId: coach.id, clientId: maya.id, date: today, mood: 4 } }),
      prisma.habit.create({ data: { coachId: coach.id, clientId: maya.id, name: "Steps", logs: { create: { date: today, done: true } } } }),
      prisma.chatMessage.create({ data: { coachId: coach.id, clientId: maya.id, role: "user", content: "plan?" } }),
      prisma.appointment.create({ data: { coachId: coach.id, clientId: maya.id, title: "PT", type: "Session", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) } }),
      prisma.reviewItem.create({ data: { coachId: coach.id, clientId: maya.id, kind: "checkin", title: "Check-in" } }),
      prisma.clientInvite.create({ data: { coachId: coach.id, clientId: maya.id, email: `inv-83-${stamp}@example.com`, tokenHash: `h-${stamp}`, expiresAt: new Date(Date.now() + 86_400_000) } }),
      prisma.clientPasswordResetToken.create({ data: { clientId: maya.id, tokenHash: `r-${stamp}`, expiresAt: new Date(Date.now() + 3_600_000) } }),
    ]);
    const cookie = `${CLIENT_SESSION_COOKIE}=${signClientSession(maya.id, 0)}`;

    const payments = await supertest(app).get("/api/client-auth/my-payments").set("Cookie", cookie);
    expect(payments.body).toEqual([{ id: expect.any(String), paidOn: today, amount: 4999, currency: "INR", method: "UPI", planName: "Monthly" }]);

    expect((await supertest(app).delete("/api/client-auth/me").set("Cookie", cookie).send({ password: "wrong", confirm: "DELETE" })).status).toBe(400);
    expect(await prisma.client.count({ where: { id: maya.id } })).toBe(1);
    expect((await supertest(app).delete("/api/client-auth/me").set("Cookie", cookie).send({ password: "client-password-1", confirm: "DELETE" })).status).toBe(204);

    expect(await prisma.client.count({ where: { id: maya.id } })).toBe(0);
    for (const n of await Promise.all([
      prisma.assignment.count({ where: { clientId: maya.id } }),
      prisma.threadMessage.count({ where: { clientId: maya.id } }),
      prisma.progressLog.count({ where: { clientId: maya.id } }),
      prisma.measurement.count({ where: { clientId: maya.id } }),
      prisma.payment.count({ where: { clientId: maya.id } }),
      prisma.clientPlan.count({ where: { clientId: maya.id } }),
      prisma.dailyCheckIn.count({ where: { clientId: maya.id } }),
      prisma.habit.count({ where: { clientId: maya.id } }),
      prisma.habitLog.count({ where: { habit: { clientId: maya.id } } }),
      prisma.chatMessage.count({ where: { clientId: maya.id } }),
      prisma.appointment.count({ where: { clientId: maya.id } }),
      prisma.reviewItem.count({ where: { clientId: maya.id } }),
      prisma.clientInvite.count({ where: { clientId: maya.id } }),
      prisma.clientPasswordResetToken.count({ where: { clientId: maya.id } }),
    ])) expect(n).toBe(0);
    // The coach sees the client gone; Sam and his plan are untouched.
    const list = await asCoach(app, coach.id).get("/api/clients");
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["Sam"]);
    expect(await prisma.assignment.count({ where: { clientId: sam.id } })).toBe(1);
    // The old session is dead.
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", cookie)).status).toBe(401);
  });
});
