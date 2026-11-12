// Prompt 68 against a real database (CI only): plans, recorded payments, the due-date advance,
// two payments at once, coach isolation, and the client's own "My plan" view.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";
import { CLIENT_SESSION_COOKIE, signClientSession } from "../src/auth/clientSession.js";
import { hashPassword } from "../src/auth/password.js";

const tag = `business-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("plans and payments (database)", () => {
  const coachIds: string[] = [];
  let coach: ReturnType<typeof asCoach>;
  let otherCoach: ReturnType<typeof asCoach>;
  let maya = "";
  let arjun = "";

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { name: "Coach", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    coach = asCoach(app, coachIds[0]);
    otherCoach = asCoach(app, coachIds[1]);
    maya = (await coach.post("/api/clients").send({ name: "Plan Probe Maya" })).body.id;
    arjun = (await coach.post("/api/clients").send({ name: "Plan Probe Arjun" })).body.id;
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades clients, plans, payments
    await prisma.$disconnect();
  });

  it("a payment advances the due date by the cycle, anchored on the plan's due day", async () => {
    const created = await coach.put(`/api/clients/${maya}/plan`).send({ planName: "Monthly coaching", priceAmount: 4999, billingCycle: "Monthly", startDate: "2026-01-31" });
    expect(created.status).toBe(201);
    expect(created.body.nextDueDate).toBe("2026-01-31");

    const p1 = await coach.post(`/api/clients/${maya}/plan/payments`).send({ amount: 4999, paidOn: "2026-01-31", method: "UPI" });
    expect(p1.status).toBe(201);
    expect(p1.body.plan.nextDueDate).toBe("2026-02-28");
    const p2 = await coach.post(`/api/clients/${maya}/plan/payments`).send({ amount: 4999, paidOn: "2026-02-27", method: "UPI" });
    expect(p2.body.plan.nextDueDate).toBe("2026-03-31"); // back to the 31st, no drift

    const list = await coach.get("/api/business/plans");
    const row = list.body.plans.find((p: { client: { id: string } }) => p.client.id === maya);
    expect(row.plan.nextDueDate).toBe("2026-03-31");
    expect(row.lastPayment).toMatchObject({ amount: 4999, paidOn: "2026-02-27" });
    expect(list.body.currency).toBe("INR");
  });

  it("two payments saved at the same moment advance the date twice (never lost)", async () => {
    await coach.put(`/api/clients/${arjun}/plan`).send({ planName: "Quarterly", priceAmount: 12000, billingCycle: "Quarterly", startDate: "2026-01-15" });
    const [a, b] = await Promise.all([
      coach.post(`/api/clients/${arjun}/plan/payments`).send({ amount: 12000, paidOn: "2026-01-15", method: "Bank" }),
      coach.post(`/api/clients/${arjun}/plan/payments`).send({ amount: 12000, paidOn: "2026-01-16", method: "Bank" }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const plan = await prisma.clientPlan.findUnique({ where: { clientId: arjun } });
    expect(plan?.nextDueDate).toBe("2026-07-15");
    expect(await prisma.payment.count({ where: { clientId: arjun } })).toBe(2);
  });

  it("a One-time plan does not advance", async () => {
    await coach.put(`/api/clients/${arjun}/plan`).send({ planName: "Starter pack", priceAmount: 5000, billingCycle: "One-time", startDate: "2026-05-01", nextDueDate: "2026-05-01" });
    const paid = await coach.post(`/api/clients/${arjun}/plan/payments`).send({ amount: 5000, paidOn: "2026-05-01", method: "Cash" });
    expect(paid.body.plan.nextDueDate).toBe("2026-05-01");
  });

  it("keeps the due date's own day (start Nov 1, due Nov 15 -> Dec 15); Ended plans refuse payments", async () => {
    const c = (await coach.post("/api/clients").send({ name: "Plan Probe Mid" })).body.id;
    await coach.put(`/api/clients/${c}/plan`).send({ planName: "Monthly", priceAmount: 100, billingCycle: "Monthly", startDate: "2026-11-01", nextDueDate: "2026-11-15" });
    const paid = await coach.post(`/api/clients/${c}/plan/payments`).send({ amount: 100, paidOn: "2026-11-15", method: "Cash" });
    expect(paid.body.plan.nextDueDate).toBe("2026-12-15");
    await coach.put(`/api/clients/${c}/plan`).send({ planName: "Monthly", priceAmount: 100, billingCycle: "Monthly", startDate: "2026-11-01", status: "Ended" });
    const refused = await coach.post(`/api/clients/${c}/plan/payments`).send({ amount: 100, paidOn: "2026-12-15", method: "Cash" });
    expect(refused.status).toBe(400);
    expect(await prisma.payment.count({ where: { clientId: c } })).toBe(1);
    // The edit without nextDueDate kept the advanced date.
    expect((await prisma.clientPlan.findUnique({ where: { clientId: c } }))?.nextDueDate).toBe("2026-12-15");
  });

  it("a due day of the 30th survives February (start Nov 1, first due Nov 30)", async () => {
    const c = (await coach.post("/api/clients").send({ name: "Plan Probe Month End" })).body.id;
    await coach.put(`/api/clients/${c}/plan`).send({ planName: "Monthly", priceAmount: 100, billingCycle: "Monthly", startDate: "2026-11-01", nextDueDate: "2026-11-30" });
    const dates: string[] = [];
    for (const paidOn of ["2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]) {
      dates.push((await coach.post(`/api/clients/${c}/plan/payments`).send({ amount: 100, paidOn, method: "Cash" })).body.plan.nextDueDate);
    }
    expect(dates).toEqual(["2026-12-30", "2027-01-30", "2027-02-28", "2027-03-30"]);
  });

  it("the coach's currency is a setting, not hard-coded", async () => {
    const res = await coach.patch("/api/auth/currency").send({ currency: "USD" });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("USD");
    expect((await coach.get("/api/business/plans")).body.currency).toBe("USD");
    expect((await coach.patch("/api/auth/currency").send({ currency: "EUR" })).status).toBe(400);
  });

  it("another coach sees none of it and cannot record a payment", async () => {
    expect((await otherCoach.get("/api/business/plans")).body.plans).toEqual([]);
    expect((await otherCoach.get(`/api/clients/${maya}/plan`)).status).toBe(404);
    expect((await otherCoach.post(`/api/clients/${maya}/plan/payments`).send({ amount: 1, paidOn: "2026-01-01", method: "Cash" })).status).toBe(404);
  });

  it("a client sees only their own plan and what they pay - never another client's", async () => {
    await prisma.client.update({ where: { id: maya }, data: { passwordHash: await hashPassword("client password 1"), loginEmail: `${tag}-maya@example.com` } });
    const cookie = `${CLIENT_SESSION_COOKIE}=${signClientSession(maya, 0)}`;
    const res = await supertest(app).get("/api/client-auth/my-plan").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      plan: { planName: "Monthly coaching", status: "Active", nextDueDate: "2026-03-31", priceAmount: 4999, billingCycle: "Monthly" },
      lastPaymentDate: "2026-02-27",
      lastPaymentAmount: 4999,
      currency: "USD", // the coach switched to USD in the test above; the client follows the coach's setting
    });
    // Arjun's (another client's) quarterly plan never shows.
    expect(JSON.stringify(res.body)).not.toContain("Quarterly");
    // And the client session cannot reach the coach's business data.
    expect((await supertest(app).get("/api/business/plans").set("Cookie", cookie)).status).toBe(401);
    expect((await supertest(app).get(`/api/clients/${arjun}/plan`).set("Cookie", cookie)).status).toBe(401);
  });
});
