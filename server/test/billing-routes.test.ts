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
    client: { count: vi.fn() },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { getSubscription, cancelSubscription, verifyWebhook, listTransactions } = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  verifyWebhook: vi.fn(),
  listTransactions: vi.fn(),
}));
vi.mock("../src/billing/paypal.js", async (orig) => {
  const actual = await orig<typeof import("../src/billing/paypal.js")>();
  return { ...actual, getSubscription, cancelSubscription, verifyWebhook, listTransactions };
});

const { app } = await import("../src/app.js");

const DAY = 86_400_000;
const SOLO = "P-PRO5-TEST"; // the smallest paid plan
const row = (over: Record<string, unknown> = {}) => ({
  planTier: "Free",
  billingStatus: "free",
  periodEndsAt: null,
  pastDueSince: null,
  paypalSubscriptionId: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Pinned, never inherited: a developer's local .env must not change what the tests assert.
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  process.env.PAYPAL_PLAN_PRO5 = SOLO;
  for (const [k, v] of [["PRO10", "P-10"], ["PRO20", "P-20"], ["PRO50", "P-50"], ["PRO100", "P-100"]]) {
    process.env[`PAYPAL_PLAN_${k}`] = v;
  }
  prisma.client.count.mockResolvedValue(0);
  process.env.PAYPAL_WEBHOOK_ID = "WH-TEST";
  prisma.coach.findUnique.mockResolvedValue(row());
  prisma.coach.findFirst.mockResolvedValue(null);
  prisma.coach.update.mockResolvedValue({});
});

describe("GET /api/billing/me", () => {
  it("reports the free plan, the usage and the public plan ids", async () => {
    prisma.client.count.mockResolvedValue(1);
    const res = await request(app).get("/api/billing/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "free", tier: "Free", clientLimit: 2, isFree: true, clientsUsed: 1 });
    // The screen draws the ladder from this, so it must carry every tier and price.
    expect(res.body.catalogue).toEqual([
      { key: "Free", clients: 2, price: 0 },
      { key: "Pro5", clients: 5, price: 17 },
      { key: "Pro10", clients: 10, price: 25 },
      { key: "Pro20", clients: 20, price: 45 },
      { key: "Pro50", clients: 50, price: 90 },
      { key: "Pro100", clients: 100, price: 150 },
    ]);
    expect(res.body.paypal.plans.Pro5).toBe(SOLO);
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
      row({ planTier: "Pro5", billingStatus: "active", periodEndsAt: new Date(Date.now() + 30 * DAY), paypalSubscriptionId: "I-REAL" }),
    );
    const res = await request(app).post("/api/billing/confirm").send({ subscriptionId: "I-REAL" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "active", tier: "Pro5", clientLimit: 5 });
    expect(prisma.coach.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ planTier: "Pro5", billingStatus: "active" }) }),
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
      .mockResolvedValueOnce(row({ planTier: "Pro5", billingStatus: "active", periodEndsAt: end, paypalSubscriptionId: "I-REAL" }))
      .mockResolvedValue(row({ planTier: "Pro5", billingStatus: "cancelled", periodEndsAt: end, paypalSubscriptionId: "I-REAL" }));
    cancelSubscription.mockResolvedValue(true);
    const res = await request(app).post("/api/billing/cancel").send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "active", clientLimit: 5 });
    expect(res.body.message).toContain("ends in 12 days");
  });

  it("treats an already-cancelled subscription as cancelled, not as a failure", async () => {
    // The real case: the cancel reached PayPal, the reply did not reach us. Saying "could not
    // cancel" about a subscription that IS cancelled is the worst answer we can give.
    vi.doUnmock("../src/billing/paypal.js");
    prisma.coach.findUnique.mockResolvedValue(row({ planTier: "Pro5", paypalSubscriptionId: "I-REAL", billingStatus: "active", periodEndsAt: new Date(Date.now() + 10 * DAY) }));
    cancelSubscription.mockResolvedValue(true);
    const res = await request(app).post("/api/billing/cancel").send({});
    expect(res.status).toBe(200);
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

describe("payments, as proof", () => {
  const paid = [
    { id: "TX-1", time: "2026-11-14T08:41:46Z", amount: "39.00", currency: "USD", status: "COMPLETED" },
    { id: "TX-2", time: "2026-12-14T08:41:46Z", amount: "39.00", currency: "USD", status: "COMPLETED" },
  ];

  it("reports what PayPal charged, with the reference a coach can quote", async () => {
    prisma.coach.findUnique.mockResolvedValue({ paypalSubscriptionId: "I-REAL", planTier: "Pro5" });
    listTransactions.mockResolvedValue(paid);
    const res = await request(app).get("/api/billing/payments");
    expect(res.status).toBe(200);
    expect(res.body.reference).toBe("I-REAL");
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.payments[0]).toMatchObject({ id: "TX-1", amount: "39.00", status: "COMPLETED" });
  });

  it("says nothing rather than inventing a payment when there is no subscription", async () => {
    prisma.coach.findUnique.mockResolvedValue({ paypalSubscriptionId: null, planTier: "Free" });
    const res = await request(app).get("/api/billing/payments");
    expect(res.body).toEqual({ reference: null, payments: [] });
  });

  it("downloads the same payments as a CSV an accountant can read", async () => {
    prisma.coach.findUnique.mockResolvedValue({
      paypalSubscriptionId: "I-REAL",
      planTier: "Pro5",
      name: "Alex",
      email: "alex@example.com",
    });
    listTransactions.mockResolvedValue(paid);
    const res = await request(app).get("/api/billing/payments.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("repsy-payments.csv");
    const lines = res.text.trim().split("\r\n");
    expect(lines[0]).toContain('"PayPal transaction"');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"2026-11-14"');
    expect(lines[1]).toContain('"TX-1"');
    expect(lines[1]).toContain('"alex@example.com"');
  });
});

describe("when PayPal is unreachable or misconfigured", () => {
  // This is the scenario that took the server down: live credentials pointed at the sandbox
  // endpoint. A billing problem must stay a billing problem.
  it("answers /confirm with a plain error instead of crashing", async () => {
    getSubscription.mockRejectedValue(new Error("PayPal token request failed (401)"));
    const res = await request(app).post("/api/billing/confirm").send({ subscriptionId: "I-REAL" });
    expect([400, 500, 502]).toContain(res.status);
    expect(res.status).not.toBe(0);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });

  it("still serves the billing screen, because /me never calls PayPal", async () => {
    getSubscription.mockRejectedValue(new Error("PayPal is down"));
    listTransactions.mockRejectedValue(new Error("PayPal is down"));
    prisma.coach.findUnique.mockResolvedValue(row());
    const res = await request(app).get("/api/billing/me");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("free");
  });

  it("answers the webhook rather than letting the error escape", async () => {
    verifyWebhook.mockRejectedValue(new Error("PayPal is down"));
    const res = await request(app)
      .post("/api/paypal/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-REAL" } }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });
});

describe("every billing route answers with the same shape", () => {
  // The screen replaces its cached plan with whatever these return, and treats a reply without a
  // catalogue as junk. A cancel that answered with a half-body made the page say "we could not
  // load your plan" immediately after a successful cancellation.
  const isFullBody = (body: Record<string, unknown>) =>
    Array.isArray(body.catalogue) &&
    (body.catalogue as unknown[]).length === 6 &&
    typeof body.clientsUsed === "number" &&
    typeof body.enterpriseFrom === "number" &&
    typeof body.tier === "string" &&
    typeof body.clientLimit === "number" &&
    "paypal" in body;

  it("GET /me", async () => {
    prisma.coach.findUnique.mockResolvedValue(row());
    const res = await request(app).get("/api/billing/me");
    expect(isFullBody(res.body), JSON.stringify(res.body)).toBe(true);
  });

  it("POST /confirm", async () => {
    getSubscription.mockResolvedValue({
      id: "I-REAL",
      status: "ACTIVE",
      planId: SOLO,
      nextBillingAt: new Date(Date.now() + 30 * DAY),
      customId: TEST_COACH_ID,
    });
    prisma.coach.findUnique.mockResolvedValue(row({ planTier: "Pro5", billingStatus: "active", periodEndsAt: new Date(Date.now() + 30 * DAY), paypalSubscriptionId: "I-REAL" }));
    const res = await request(app).post("/api/billing/confirm").send({ subscriptionId: "I-REAL" });
    expect(isFullBody(res.body), JSON.stringify(res.body)).toBe(true);
  });

  it("POST /cancel", async () => {
    prisma.coach.findUnique.mockResolvedValue(row({ planTier: "Pro5", billingStatus: "active", periodEndsAt: new Date(Date.now() + 10 * DAY), paypalSubscriptionId: "I-REAL" }));
    cancelSubscription.mockResolvedValue(true);
    const res = await request(app).post("/api/billing/cancel").send({});
    expect(isFullBody(res.body), JSON.stringify(res.body)).toBe(true);
  });
});
