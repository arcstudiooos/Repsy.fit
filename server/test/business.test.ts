// Prompt 68: plans, payments and the due-date advance (mocked database for the routes).
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const mock: Record<string, any> = {
    client: { findFirst: vi.fn() },
    coach: { findUnique: vi.fn(), update: vi.fn() },
    clientPlan: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    payment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(mock)));
  return mock;
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;
const { advanceDueDate, dayOf, daysUntil } = await import("../src/billing.js");
const { CLIENT_SESSION_COOKIE, signClientSession } = await import("../src/auth/clientSession.js");

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel" };
const plan = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  coachId: "coach-1",
  clientId: "c1",
  planName: "Monthly coaching",
  priceAmount: 4999,
  billingCycle: "Monthly",
  startDate: "2026-01-31",
  nextDueDate: "2026-01-31",
  anchorDay: 31,
  status: "Active",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("advanceDueDate (the due-date rules)", () => {
  it("Monthly / Quarterly / Yearly move on by calendar months", () => {
    expect(advanceDueDate("2026-03-15", "Monthly", 15)).toBe("2026-04-15");
    expect(advanceDueDate("2026-03-15", "Quarterly", 15)).toBe("2026-06-15");
    expect(advanceDueDate("2026-03-15", "Yearly", 15)).toBe("2027-03-15");
  });

  it("One-time plans never advance", () => {
    expect(advanceDueDate("2026-03-15", "One-time", 15)).toBe("2026-03-15");
  });

  it("crosses the year end", () => {
    expect(advanceDueDate("2026-12-10", "Monthly", 10)).toBe("2027-01-10");
    expect(advanceDueDate("2026-11-10", "Quarterly", 10)).toBe("2027-02-10");
  });

  it("end of month: clamps to the last day, then returns to the anchor day (no drift)", () => {
    expect(advanceDueDate("2026-01-31", "Monthly", 31)).toBe("2026-02-28");
    expect(advanceDueDate("2026-02-28", "Monthly", 31)).toBe("2026-03-31");
    expect(advanceDueDate("2026-03-31", "Monthly", 31)).toBe("2026-04-30");
    expect(advanceDueDate("2028-01-31", "Monthly", 31)).toBe("2028-02-29"); // leap year
    expect(advanceDueDate("2026-11-30", "Quarterly", 30)).toBe("2027-02-28");
  });

  it("Yearly from Feb 29 lands on Feb 28, then back to Feb 29 in the next leap year", () => {
    expect(advanceDueDate("2028-02-29", "Yearly", 29)).toBe("2029-02-28");
    let d = "2028-02-29";
    for (let i = 0; i < 4; i++) d = advanceDueDate(d, "Yearly", 29);
    expect(d).toBe("2032-02-29");
  });

  it("a due day of 29-31 survives every short month (the plan stores its due day)", () => {
    // Start Nov 1, first due Nov 30: anchorDay 30, never stuck on the 28th.
    let d = "2026-11-30";
    const seen: string[] = [];
    for (let k = 0; k < 6; k++) seen.push((d = advanceDueDate(d, "Monthly", dayOf("2026-11-30"))));
    expect(seen).toEqual(["2026-12-30", "2027-01-30", "2027-02-28", "2027-03-30", "2027-04-30", "2027-05-30"]);
    // Start Jan 10, first due Jan 31.
    d = "2026-01-31";
    const s2: string[] = [];
    for (let k = 0; k < 3; k++) s2.push((d = advanceDueDate(d, "Monthly", 31)));
    expect(s2).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    // Due on the 30th in a leap February.
    expect(advanceDueDate("2028-01-30", "Monthly", 30)).toBe("2028-02-29");
    expect(advanceDueDate("2028-02-29", "Monthly", 30)).toBe("2028-03-30");
  });

  it("daysUntil counts whole days (negative = overdue)", () => {
    expect(daysUntil("2026-11-11", "2026-11-11")).toBe(0);
    expect(daysUntil("2026-11-08", "2026-11-11")).toBe(-3);
    expect(daysUntil("2026-11-18", "2026-11-11")).toBe(7);
    expect(daysUntil("2026-03-30", "2026-03-28")).toBe(2); // across a DST change in many zones
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.coach.findUnique.mockResolvedValue({ currency: "INR" });
  prismaMock.clientPlan.findUnique.mockResolvedValue(plan());
  prismaMock.clientPlan.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(plan(data)));
  prismaMock.clientPlan.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(plan(data)));
  prismaMock.payment.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "pay1", ...data }));
});

describe("POST /api/clients/:clientId/plan/payments", () => {
  it("records the payment and advances nextDueDate by one cycle, under a lock on the plan", async () => {
    const res = await request(app).post("/api/clients/c1/plan/payments").send({ amount: 4999, paidOn: "2026-02-02", method: "UPI", note: "Feb" });
    expect(res.status).toBe(201);
    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: { amount: 4999, paidOn: "2026-02-02", method: "UPI", note: "Feb", coachId: "coach-1", clientId: "c1", clientPlanId: "p1" },
    });
    // Anchored on the plan's due day (31st): Jan 31 -> Feb 28.
    expect(prismaMock.clientPlan.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { nextDueDate: "2026-02-28" } });
    expect(res.body.plan.nextDueDate).toBe("2026-02-28");
    const [sql] = prismaMock.$executeRaw.mock.calls[0] as [TemplateStringsArray];
    expect(sql.join("?")).toMatch(/FROM "client_plans" WHERE "clientId" = \? FOR UPDATE/);
  });

  it("a One-time plan records the payment but does not advance", async () => {
    prismaMock.clientPlan.findUnique.mockResolvedValue(plan({ billingCycle: "One-time", nextDueDate: "2026-03-01" }));
    const res = await request(app).post("/api/clients/c1/plan/payments").send({ amount: 15000, paidOn: "2026-03-01", method: "Cash" });
    expect(res.status).toBe(201);
    expect(prismaMock.clientPlan.update).not.toHaveBeenCalled();
    expect(res.body.plan.nextDueDate).toBe("2026-03-01");
  });

  it("an Ended plan refuses payments in plain words; a Paused plan records without advancing", async () => {
    prismaMock.clientPlan.findUnique.mockResolvedValue(plan({ status: "Ended" }));
    const ended = await request(app).post("/api/clients/c1/plan/payments").send({ amount: 10, paidOn: "2026-03-01", method: "Cash" });
    expect(ended.status).toBe(400);
    expect(ended.body.error).toBe("This plan has ended. Set it back to Active to record a payment.");
    expect(prismaMock.payment.create).not.toHaveBeenCalled();

    prismaMock.clientPlan.findUnique.mockResolvedValue(plan({ status: "Paused", nextDueDate: "2026-03-01" }));
    const paused = await request(app).post("/api/clients/c1/plan/payments").send({ amount: 10, paidOn: "2026-03-01", method: "Cash" });
    expect(paused.status).toBe(201);
    expect(prismaMock.payment.create).toHaveBeenCalled();
    expect(prismaMock.clientPlan.update).not.toHaveBeenCalled();
  });

  it("advances from the due date's own day (start Nov 1, due Nov 15 -> Dec 15)", async () => {
    prismaMock.clientPlan.findUnique.mockResolvedValue(plan({ startDate: "2026-11-01", nextDueDate: "2026-11-15", anchorDay: 15 }));
    const res = await request(app).post("/api/clients/c1/plan/payments").send({ amount: 4999, paidOn: "2026-11-15", method: "UPI" });
    expect(res.body.plan.nextDueDate).toBe("2026-12-15");
  });

  it("no plan yet -> plain-words 400 and nothing saved", async () => {
    prismaMock.clientPlan.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/clients/c1/plan/payments").send({ amount: 10, paidOn: "2026-03-01", method: "Cash" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("This client has no plan yet. Add a plan first.");
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ amount: 0, paidOn: "2026-03-01", method: "Cash" }, "Please enter an amount of at least 0.01."],
    [{ amount: 0.000000005, paidOn: "2026-03-01", method: "Cash" }, "Please enter an amount of at least 0.01."],
    [{ amount: 10.555, paidOn: "2026-03-01", method: "Cash" }, "Please use at most 2 decimals for the amount."],
    [{ amount: 10, paidOn: "01-03-2026", method: "Cash" }, "Please choose a real payment date."],
    [{ amount: 10, paidOn: "2026-03-01", method: "Crypto" }, "Please choose Cash, UPI, Card, Bank or Other."],
  ])("rejects bad input in plain words: %j", async (body, message) => {
    const res = await request(app).post("/api/clients/c1/plan/payments").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
  });

  it("0.1 + cents style amounts are accepted (float-safe 2-decimal check)", async () => {
    const res = await request(app).post("/api/clients/c1/plan/payments").send({ amount: 19.99, paidOn: "2026-03-01", method: "Card" });
    expect(res.status).toBe(201);
  });

  it("another coach's client is 404; signed out is 401", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    expect((await request(app).post("/api/clients/x/plan/payments").send({ amount: 10, paidOn: "2026-03-01", method: "Cash" })).status).toBe(404);
    expect((await supertest(app).post("/api/clients/c1/plan/payments").send({ amount: 10, paidOn: "2026-03-01", method: "Cash" })).status).toBe(401);
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });
});

describe("PUT /api/clients/:clientId/plan", () => {
  it("creates a plan (201); nextDueDate defaults to the start date, status to Active", async () => {
    prismaMock.clientPlan.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put("/api/clients/c1/plan")
      .send({ planName: "Quarterly coaching", priceAmount: 12000, billingCycle: "Quarterly", startDate: "2026-11-15" });
    expect(res.status).toBe(201);
    expect(prismaMock.clientPlan.create).toHaveBeenCalledWith({
      data: { planName: "Quarterly coaching", priceAmount: 12000, billingCycle: "Quarterly", startDate: "2026-11-15", coachId: "coach-1", clientId: "c1", nextDueDate: "2026-11-15", anchorDay: 15, status: "Active" },
    });
  });

  it("setting a due date sets the plan's due day; a start date after the stored due date is refused", async () => {
    await request(app)
      .put("/api/clients/c1/plan")
      .send({ planName: "Monthly coaching", priceAmount: 4999, billingCycle: "Monthly", startDate: "2026-01-31", nextDueDate: "2026-03-30" });
    expect(prismaMock.clientPlan.update.mock.calls[0][0].data).toMatchObject({ nextDueDate: "2026-03-30", anchorDay: 30 });
    const late = await request(app)
      .put("/api/clients/c1/plan")
      .send({ planName: "Monthly coaching", priceAmount: 4999, billingCycle: "Monthly", startDate: "2026-06-01" });
    expect(late.status).toBe(400);
    expect(late.body.error).toBe("The next due date can't be before the start date.");
  });

  it("updates the existing plan (200), e.g. pausing it", async () => {
    const res = await request(app)
      .put("/api/clients/c1/plan")
      .send({ planName: "Monthly coaching", priceAmount: 4999, billingCycle: "Monthly", startDate: "2026-01-31", status: "Paused" });
    expect(res.status).toBe(200);
    expect(prismaMock.clientPlan.update.mock.calls[0][0].data.status).toBe("Paused");
  });

  it("rejects an unknown billing cycle or status in plain words", async () => {
    const bad = await request(app).put("/api/clients/c1/plan").send({ planName: "X", priceAmount: 1, billingCycle: "Weekly", startDate: "2026-01-01" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Please choose Monthly, Quarterly, Yearly or One-time.");
  });

  it("a blank price and a due date before the start are refused in plain words (no field names)", async () => {
    const blank = await request(app).put("/api/clients/c1/plan").send({ planName: "X", priceAmount: 0, billingCycle: "Monthly", startDate: "2026-01-01" });
    expect(blank.body.error).toBe("Please enter a price of at least 0.01.");
    const early = await request(app)
      .put("/api/clients/c1/plan")
      .send({ planName: "X", priceAmount: 10, billingCycle: "Monthly", startDate: "2026-02-01", nextDueDate: "2026-01-15" });
    expect(early.status).toBe(400);
    expect(early.body.error).toBe("The next due date can't be before the start date.");
  });
});

describe("GET /api/business/plans", () => {
  it("lists this coach's plans with the client name, latest payment, and the coach's currency", async () => {
    prismaMock.coach.findUnique.mockResolvedValue({ currency: "USD" });
    prismaMock.clientPlan.findMany.mockResolvedValue([
      { ...plan(), client: { id: "c1", name: "Maya Patel" }, payments: [{ amount: 4999, paidOn: "2026-01-31", method: "UPI" }] },
    ]);
    const res = await request(app).get("/api/business/plans");
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("USD");
    expect(res.body.plans[0]).toMatchObject({
      client: { id: "c1", name: "Maya Patel" },
      plan: { planName: "Monthly coaching", nextDueDate: "2026-01-31" },
      lastPayment: { amount: 4999, paidOn: "2026-01-31" },
    });
    expect(prismaMock.clientPlan.findMany.mock.calls[0][0].where).toEqual({ coachId: "coach-1" });
  });
});

describe("GET /api/client-auth/my-plan (the client's own plan)", () => {
  const clientCookie = `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0)}`;
  beforeEach(() => {
    // client-session check: client c1 is current
    (prismaMock.client as Record<string, unknown>).findUnique = vi.fn().mockResolvedValue({ clientSessionVersion: 0, passwordHash: "$2b$12$x", joinStatus: "active" });
  });

  it("shows the client's own plan with what they pay (price, cycle, last payment) in the coach's currency", async () => {
    prismaMock.clientPlan.findUnique.mockResolvedValue({ planName: "Monthly coaching", status: "Active", nextDueDate: "2026-02-28", priceAmount: 4999, billingCycle: "Monthly" });
    prismaMock.payment.findFirst.mockResolvedValue({ paidOn: "2026-01-31", amount: 4999 });
    (prismaMock.client.findUnique as ReturnType<typeof vi.fn>).mockImplementation(async ({ select }: { select: Record<string, unknown> }) =>
      select.coach ? { coach: { currency: "INR" } } : { clientSessionVersion: 0, passwordHash: "$2b$12$x", joinStatus: "active" },
    );
    const res = await supertest(app).get("/api/client-auth/my-plan").set("Cookie", clientCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      plan: { planName: "Monthly coaching", status: "Active", nextDueDate: "2026-02-28", priceAmount: 4999, billingCycle: "Monthly" },
      lastPaymentDate: "2026-01-31",
      lastPaymentAmount: 4999,
      currency: "INR",
    });
    expect(prismaMock.clientPlan.findUnique.mock.calls[0][0].where).toEqual({ clientId: "c1" });
    expect(prismaMock.payment.findFirst.mock.calls[0][0]).toMatchObject({ where: { clientId: "c1" }, select: { paidOn: true, amount: true } });
    // The coach's private payment note is never selected.
    expect(prismaMock.payment.findFirst.mock.calls[0][0].select.note).toBeUndefined();
  });

  it("a coach session cannot use it", async () => {
    expect((await request(app).get("/api/client-auth/my-plan")).status).toBe(401);
  });
});
