// The paywall, end to end through the real guard (Nov 2026).
//
// The owner's rule is the point of this file: a lapsed plan stops NEW coaching work and nothing
// else. Reading, exporting, deleting, account settings and every client-side route keep working.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use the real billing lookup, not the shared test default.
vi.unmock("../src/billing/current.js");

const { prisma } = vi.hoisted(() => ({
  prisma: {
    coach: { findUnique: vi.fn() },
    client: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    assignment: { findMany: vi.fn(), create: vi.fn() },
    workoutTemplate: { create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const DAY = 86_400_000;
const billing = (over: Record<string, unknown> = {}) => ({
  planTier: "Solo",
  billingStatus: "trialing",
  trialEndsAt: new Date(Date.now() + 3 * DAY),
  periodEndsAt: null,
  pastDueSince: null,
  paypalSubscriptionId: null,
  ...over,
});

const PLAN = {
  type: "Workout",
  title: "Lower body A",
  details: "1. Back Squat — 4 sets × 6 reps · 60 kg · Rest 120s",
  reasoning: "Base strength.",
  source: "manual",
  date: "2026-11-14",
};

describe("the paywall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BILLING_ENFORCED = "true"; // off in production until the checkout flow ships
    prisma.client.findFirst.mockResolvedValue({ id: "client-1", coachId: TEST_COACH_ID, name: "Maya Patel" });
    prisma.client.findMany.mockResolvedValue([]);
    prisma.assignment.create.mockResolvedValue({ id: "a1" });
    prisma.assignment.findMany.mockResolvedValue([]);
  });

  it("lets a coach on a trial create a plan", async () => {
    prisma.coach.findUnique.mockResolvedValue(billing());
    const res = await request(app).post("/api/clients/client-1/assignments").send(PLAN);
    expect(res.status).toBe(201);
    expect(prisma.assignment.create).toHaveBeenCalled();
  });

  it("refuses a new plan with 402 once the trial has expired, and saves nothing", async () => {
    prisma.coach.findUnique.mockResolvedValue(billing({ trialEndsAt: new Date(Date.now() - DAY) }));
    const res = await request(app).post("/api/clients/client-1/assignments").send(PLAN);
    expect(res.status).toBe(402);
    expect(res.body.error).toContain("choose a plan");
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  it("still lets that coach READ their clients and plans", async () => {
    prisma.coach.findUnique.mockResolvedValue(billing({ trialEndsAt: new Date(Date.now() - DAY) }));
    expect((await request(app).get("/api/clients")).status).toBe(200);
    expect((await request(app).get("/api/clients/client-1/assignments")).status).toBe(200);
  });

  it("a failed payment inside the grace period can still write", async () => {
    prisma.coach.findUnique.mockResolvedValue(
      billing({ billingStatus: "past_due", pastDueSince: new Date(Date.now() - 2 * DAY), paypalSubscriptionId: "I-9" }),
    );
    const res = await request(app).post("/api/clients/client-1/assignments").send(PLAN);
    expect(res.status).toBe(201);
  });

  it("allows the write when the billing row cannot be read (fails open, never on a hiccup)", async () => {
    prisma.coach.findUnique.mockRejectedValue(new Error("db down"));
    const res = await request(app).post("/api/clients/client-1/assignments").send(PLAN);
    expect(res.status).toBe(201);
  });

  it("does nothing at all while the paywall is switched off", async () => {
    process.env.BILLING_ENFORCED = "false";
    prisma.coach.findUnique.mockResolvedValue(billing({ trialEndsAt: new Date(Date.now() - DAY) }));
    const res = await request(app).post("/api/clients/client-1/assignments").send(PLAN);
    expect(res.status).toBe(201);
  });
});
