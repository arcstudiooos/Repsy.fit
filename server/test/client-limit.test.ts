// The client limit (owner, Nov 2026). This file is the promise the pricing makes, in code.
//
// Everyone is free forever with 2 clients; paying raises the limit and nothing else. The rules that
// must never quietly change: nobody loses access to data, no existing client is ever cut off, and
// only ADDING past the limit is refused.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    coach: { findUnique: vi.fn() },
    client: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    // The roster cards ask for last check-in and recent adherence in grouped queries.
    dailyCheckIn: { groupBy: vi.fn() },
    progressLog: { groupBy: vi.fn() },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");
const { clientLimitFor, PLANS } = await import("../src/billing/plans.js");

const NEW_CLIENT = { name: "Maya Patel", goal: "Fat loss", level: "Beginner" };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.client.create.mockResolvedValue({ id: "c1", name: "Maya Patel" });
  prisma.client.findMany.mockResolvedValue([]);
  prisma.dailyCheckIn.groupBy.mockResolvedValue([]);
  prisma.progressLog.groupBy.mockResolvedValue([]);
});

describe("the plan catalogue", () => {
  it("prices the tiers the owner chose", () => {
    expect(PLANS.map((p) => [p.key, p.clients, p.price])).toEqual([
      ["Free", 2, 0],
      ["Pro5", 5, 17],
      ["Pro10", 10, 25],
      ["Pro20", 20, 45],
      ["Pro50", 50, 90],
      ["Pro100", 100, 150],
    ]);
  });

  it("gives an unknown or missing plan the free limit, never an unlimited one", () => {
    expect(clientLimitFor("Free")).toBe(2);
    expect(clientLimitFor("Solo")).toBe(2); // an old tier name from before this pricing
    expect(clientLimitFor("")).toBe(2);
  });
});

describe("adding a client", () => {
  it("is allowed while there is room on the free plan", async () => {
    prisma.coach.findUnique.mockResolvedValue({ planTier: "Free" });
    prisma.client.count.mockResolvedValue(1);
    const res = await request(app).post("/api/clients").send(NEW_CLIENT);
    expect(res.status).toBe(201);
  });

  it("is refused at the limit, with a message that says what to do and promises nothing is lost", async () => {
    prisma.coach.findUnique.mockResolvedValue({ planTier: "Free" });
    prisma.client.count.mockResolvedValue(2);
    const res = await request(app).post("/api/clients").send(NEW_CLIENT);
    expect(res.status).toBe(402);
    expect(res.body.error).toContain("free plan covers 2 clients");
    expect(res.body.error).toContain("stays exactly as it is");
    expect(res.body).toMatchObject({ limit: 2, used: 2 });
    // Nothing half-created: the refusal happens before the write.
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it("uses the paid plan's limit, and says 'move up a plan' rather than 'choose a plan'", async () => {
    prisma.coach.findUnique.mockResolvedValue({ planTier: "Pro20" });
    prisma.client.count.mockResolvedValue(20);
    const res = await request(app).post("/api/clients").send(NEW_CLIENT);
    expect(res.status).toBe(402);
    expect(res.body.error).toContain("covers 20 clients");
    expect(res.body.error).toContain("Move up a plan");
  });

  it("counts neither demo clients nor people still waiting to be accepted", async () => {
    prisma.coach.findUnique.mockResolvedValue({ planTier: "Free" });
    prisma.client.count.mockResolvedValue(0);
    await request(app).post("/api/clients").send(NEW_CLIENT);
    expect(prisma.client.count).toHaveBeenCalledWith({
      where: { coachId: TEST_COACH_ID, isDemo: false, joinStatus: "active" },
    });
  });

  it("allows the client when the count cannot be read (a hiccup is not a full roster)", async () => {
    prisma.coach.findUnique.mockRejectedValue(new Error("db down"));
    const res = await request(app).post("/api/clients").send(NEW_CLIENT);
    expect(res.status).toBe(201);
  });
});

describe("a coach who is over their limit after a downgrade", () => {
  it("still sees and keeps every client", async () => {
    prisma.coach.findUnique.mockResolvedValue({ planTier: "Free" });
    prisma.client.count.mockResolvedValue(12);
    prisma.client.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it("can still decline someone waiting, so the queue can always be cleared", async () => {
    prisma.coach.findUnique.mockResolvedValue({ planTier: "Free" });
    prisma.client.count.mockResolvedValue(2);
    prisma.client.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.findUnique.mockResolvedValue({ id: "c9", name: "Sam", joinStatus: "declined" });
    const res = await request(app).post("/api/clients/c9/decline");
    expect(res.status).toBe(200);
  });

  it("cannot accept a new one until there is room", async () => {
    prisma.coach.findUnique.mockResolvedValue({ planTier: "Free" });
    prisma.client.count.mockResolvedValue(2);
    const res = await request(app).post("/api/clients/c9/approve");
    expect(res.status).toBe(402);
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
  });
});
