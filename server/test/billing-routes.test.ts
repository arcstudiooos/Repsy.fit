// The billing routes and the PayPal webhook (Nov 2026).
//
// The important tests here are the hostile ones. A subscription id arrives from a browser, which
// can say anything, so: an invented id, someone else's id, and a plan that isn't ours all have to
// be refused, and an unverified webhook must write nothing.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("../src/billing/current.js");

const { prisma } = vi.hoisted(() => ({
  prisma: {
    coach: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { getSubscription, cancelSubscription, verifyWebhook } = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  verifyWebhook: vi.fn(),
}));
vi.mock("../src/billing/paypal.js", async (orig) => {
  const actual = await orig<typeof import("../src/billing/paypal.js")>();
  return { ...actual, getSubscription, cancelSubscription, verifyWebhook };
});

const { app } = await import("../src/app.js");

const DAY = 86_400_000;
const SOLO = "P-SOLO-TEST";
const row = (over: Record<string, unknown> = {}) => ({
  planTier: "Solo",
  billingStatus: "trialing",
  trialEndsAt: new Date(Date.now() + 3 * DAY),
  periodEndsAt: null,
  pastDueSince: null,
  paypalSubscriptionId: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  process.env.PAYPAL_PLAN_SOLO = SOLO;
  process.env.PAYPAL_WEBHOOK_ID = "WH-TEST";
  prisma.coach.findUnique.mockResolvedValue(row());
  prisma.coach.findFirst.mockResolvedValue(null);
  prisma.coach.update.mockResolvedValue({});
});

describe("GET /api/billing/me", () => {
  it("reports the trial and hands over the public plan ids", async () => {
    const res = await request(app).get("/api/billing/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "trialing", canWrite: true, needsSubscription: true });
    expect(res.body.paypal.plans.Solo).toBe(SOLO);
    expect(res.body.paypal.environment).toBe("sandbox");
    // The checkout stamps this onto the subscription, which is how PayPal records the owner.
    expect(res.body.paypal.customId).toBe(TEST_COACH_ID);
    // The secret must never leave the server.
    expect(JSON.stringify(res.body)).not.toContain("test-secret");
  });
});

describe("POST /api/billing/confirm", () => {
  it("stores the plan PayPal reports, not the one the browser claims", async () => {
    getSubscription.mockResolvedValue({
      id: "I-REAL",
      status: "ACTIVE",
      planId: SOLO,
      nextBillingAt: new Date(Date.now() + 30 * DAY),
      customId: TEST_COACH_ID,
    });
    // The route re-reads the row after writing it, and that read is the response.
    prisma.coach.findUnique.mockResolvedValue(
      row({ billingStatus: "active", periodEndsAt: new Date(Date.now() + 30 * DAY), paypalSubscriptionId: "I-REAL" }),
    );
    const res = await request(app).post("/api/billing/confirm").send({ subscriptionId: "I-REAL" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "active", canWrite: true });
    expect(prisma.coach.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ planTier: "Solo", billingStatus: "active" }) }),
    );
  });

  it("refuses an id PayPal does not recognise, and writes nothing", async () => {
    getSubscription.mockResolvedValue(null);
    const res = await request(app).post("/api/billing/confirm").send({ subscriptionId: "I-MADE-THIS-UP" });
    expect(res.status).toBe(400);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });

  it("refuses a subscription that belongs to another coach", async () => {
    getSubscription.mockResolvedValue({
      id: "I-SOMEONE-ELSE",
      status: "ACTIVE",
      planId: SOLO,
      nextBillingAt: new Date(),
      customId: "another-coach-id",
    });
    const res = await request(app).post("/api/billing/confirm").send({ subscriptionId: "I-SOMEONE-ELSE" });
    expect(res.status).toBe(409);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });

  it("refuses a subscription for a plan that is not ours", async () => {
    getSubscription.mockResolvedValue({
      id: "I-OTHER-PRODUCT",
      status: "ACTIVE",
      planId: "P-SOMEONE-ELSES-PRODUCT",
      nextBillingAt: new Date(),
      customId: TEST_COACH_ID,
    });
    const res = await request(app).post("/api/billing/confirm").send({ subscriptionId: "I-OTHER-PRODUCT" });
    expect(res.status).toBe(400);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/cancel", () => {
  it("keeps access until the end of the period already paid for", async () => {
    const end = new Date(Date.now() + 12 * DAY);
    prisma.coach.findUnique
      .mockResolvedValueOnce(row({ billingStatus: "active", periodEndsAt: end, paypalSubscriptionId: "I-REAL" }))
      .mockResolvedValue(row({ billingStatus: "cancelled", periodEndsAt: end, paypalSubscriptionId: "I-REAL" }));
    cancelSubscription.mockResolvedValue(true);
    const res = await request(app).post("/api/billing/cancel").send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ canWrite: true, daysLeft: 12 });
    expect(res.body.message).toContain("ends in 12 days");
  });

  it("says so when PayPal refuses, instead of pretending", async () => {
    prisma.coach.findUnique.mockResolvedValue(row({ paypalSubscriptionId: "I-REAL" }));
    cancelSubscription.mockResolvedValue(false);
    const res = await request(app).post("/api/billing/cancel").send({});
    expect(res.status).toBe(502);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });
});

describe("the PayPal webhook", () => {
  const send = (body: unknown) =>
    request(app).post("/api/paypal/webhook").set("Content-Type", "application/json").send(JSON.stringify(body));

  it("writes nothing when the signature does not verify", async () => {
    verifyWebhook.mockResolvedValue(false);
    const res = await send({ event_type: "BILLING.SUBSCRIPTION.CANCELLED", resource: { id: "I-REAL" } });
    expect(res.status).toBe(401);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });

  it("marks a suspended subscription past due and starts the grace period", async () => {
    verifyWebhook.mockResolvedValue(true);
    prisma.coach.findUnique.mockResolvedValue({ id: TEST_COACH_ID, pastDueSince: null });
    getSubscription.mockResolvedValue({ id: "I-REAL", status: "SUSPENDED", planId: SOLO, nextBillingAt: null, customId: TEST_COACH_ID });
    const res = await send({ event_type: "BILLING.SUBSCRIPTION.SUSPENDED", resource: { id: "I-REAL" } });
    expect(res.status).toBe(204);
    const data = prisma.coach.update.mock.calls[0][0].data;
    expect(data.billingStatus).toBe("past_due");
    expect(data.pastDueSince).toBeInstanceOf(Date);
  });

  it("does not restart the grace period on a second failure", async () => {
    verifyWebhook.mockResolvedValue(true);
    const firstFailure = new Date(Date.now() - 5 * DAY);
    prisma.coach.findUnique.mockResolvedValue({ id: TEST_COACH_ID, pastDueSince: firstFailure });
    getSubscription.mockResolvedValue({ id: "I-REAL", status: "SUSPENDED", planId: SOLO, nextBillingAt: null, customId: TEST_COACH_ID });
    await send({ event_type: "BILLING.SUBSCRIPTION.SUSPENDED", resource: { id: "I-REAL" } });
    expect(prisma.coach.update.mock.calls[0][0].data).not.toHaveProperty("pastDueSince");
  });

  it("clears the grace period when payment recovers", async () => {
    verifyWebhook.mockResolvedValue(true);
    prisma.coach.findUnique.mockResolvedValue({ id: TEST_COACH_ID, pastDueSince: new Date() });
    getSubscription.mockResolvedValue({
      id: "I-REAL",
      status: "ACTIVE",
      planId: SOLO,
      nextBillingAt: new Date(Date.now() + 30 * DAY),
      customId: TEST_COACH_ID,
    });
    await send({ event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-REAL" } });
    const data = prisma.coach.update.mock.calls[0][0].data;
    expect(data.billingStatus).toBe("active");
    expect(data.pastDueSince).toBeNull();
  });

  it("acknowledges an event for a subscription it has never seen, so PayPal stops retrying", async () => {
    verifyWebhook.mockResolvedValue(true);
    prisma.coach.findUnique.mockResolvedValue(null);
    const res = await send({ event_type: "BILLING.SUBSCRIPTION.CANCELLED", resource: { id: "I-UNKNOWN" } });
    expect(res.status).toBe(204);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });
});

describe("the paid-through date", () => {
  const send = (body: unknown) =>
    request(app).post("/api/paypal/webhook").set("Content-Type", "application/json").send(JSON.stringify(body));

  it("survives a cancellation, so a coach keeps the month they paid for", async () => {
    verifyWebhook.mockResolvedValue(true);
    prisma.coach.findUnique.mockResolvedValue({ id: TEST_COACH_ID, pastDueSince: null });
    // PayPal reports no next billing once cancelled; the date already paid through must stay.
    getSubscription.mockResolvedValue({ id: "I-REAL", status: "CANCELLED", planId: SOLO, nextBillingAt: null, customId: TEST_COACH_ID });
    await send({ event_type: "BILLING.SUBSCRIPTION.CANCELLED", resource: { id: "I-REAL" } });
    const data = prisma.coach.update.mock.calls[0][0].data;
    expect(data.billingStatus).toBe("cancelled");
    expect(data).not.toHaveProperty("periodEndsAt");
  });

  it("is still updated when PayPal gives a new one", async () => {
    verifyWebhook.mockResolvedValue(true);
    const next = new Date(Date.now() + 30 * DAY);
    prisma.coach.findUnique.mockResolvedValue({ id: TEST_COACH_ID, pastDueSince: null });
    getSubscription.mockResolvedValue({ id: "I-REAL", status: "ACTIVE", planId: SOLO, nextBillingAt: next, customId: TEST_COACH_ID });
    await send({ event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-REAL" } });
    expect(prisma.coach.update.mock.calls[0][0].data.periodEndsAt).toEqual(next);
  });
});
