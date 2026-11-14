// The coach's profile: weight unit and country (owner, Nov 2026).
//
// The point of these fields, as tests: units changes how the coach reads weights (stored weights
// stay kg), and country sets the currency default without ever overriding a choice the coach made.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    coach: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));
// Registration claims any unclaimed demo data in the same transaction; its SQL is not what this
// file is about, so mock it the way the other auth tests do.
vi.mock("../src/auth/claimDemoData.js", () => ({ claimDemoData: vi.fn().mockResolvedValue({ claimed: false }) }));

const { app } = await import("../src/app.js");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  prisma.coach.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: "c1",
    name: data.name,
    email: data.email,
    createdAt: new Date(),
    currency: data.currency ?? "INR",
    units: data.units ?? "kg",
    country: data.country ?? null,
    sessionVersion: 1,
  }));
});

describe("register captures units and country", () => {
  it("stores the unit the coach picked and defaults the currency from their country", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Alex", email: "alex@example.com", password: "a-good-password-1", units: "lb", country: "us" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ units: "lb", country: "US", currency: "USD" });
    const data = prisma.coach.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ units: "lb", country: "US", currency: "USD" });
  });

  it("an Indian coach defaults to INR", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Priya", email: "priya@example.com", password: "a-good-password-1", country: "IN" });
    expect(res.body).toMatchObject({ country: "IN", currency: "INR", units: "kg" });
  });

  it("still works with no units or country (older client, Google sign-up)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Sam", email: "sam@example.com", password: "a-good-password-1" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ units: "kg", country: null });
  });

  it("refuses a unit that is not kg or lb", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Sam", email: "sam@example.com", password: "a-good-password-1", units: "stone" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("kg or lb");
    expect(prisma.coach.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/auth/profile", () => {
  it("changes the unit, and returns the updated coach", async () => {
    prisma.coach.findUnique.mockResolvedValue({ country: "IN", currency: "INR" });
    prisma.coach.update.mockResolvedValue({ id: TEST_COACH_ID, name: "Alex", email: "a@b.io", createdAt: new Date(), currency: "INR", units: "lb", country: "IN" });
    const res = await request(app).patch("/api/auth/profile").send({ units: "lb" });
    expect(res.status).toBe(200);
    expect(res.body.units).toBe("lb");
    expect(prisma.coach.update.mock.calls[0][0].data).toEqual({ units: "lb" });
  });

  it("setting a country for the first time suggests its currency", async () => {
    prisma.coach.findUnique.mockResolvedValue({ country: null, currency: "INR" });
    prisma.coach.update.mockResolvedValue({ id: TEST_COACH_ID, name: "Alex", email: "a@b.io", createdAt: new Date(), currency: "USD", units: "kg", country: "US" });
    await request(app).patch("/api/auth/profile").send({ country: "us" });
    expect(prisma.coach.update.mock.calls[0][0].data).toMatchObject({ country: "US", currency: "USD" });
  });

  it("never overrides a currency the coach already chose", async () => {
    // A coach living in India who deliberately bills in USD keeps it when they confirm their country.
    prisma.coach.findUnique.mockResolvedValue({ country: "IN", currency: "USD" });
    prisma.coach.update.mockResolvedValue({ id: TEST_COACH_ID, name: "Alex", email: "a@b.io", createdAt: new Date(), currency: "USD", units: "kg", country: "IN" });
    await request(app).patch("/api/auth/profile").send({ country: "in" });
    expect(prisma.coach.update.mock.calls[0][0].data).not.toHaveProperty("currency");
  });

  it("rejects an empty update and unknown keys", async () => {
    expect((await request(app).patch("/api/auth/profile").send({})).status).toBe(400);
    expect((await request(app).patch("/api/auth/profile").send({ name: "Hacker" })).status).toBe(400);
  });
});
