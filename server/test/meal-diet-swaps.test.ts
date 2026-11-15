// Diet type and alternative meals (Inspo N3/N8, Nov 2026).
//
// Both are additive: "Any" is what every meal saved before this means, and an empty swap list is
// what every meal had. The interesting behaviour is that a swap is a SUGGESTION - a stale id is
// dropped, never an error, and deleting a meal is never blocked by one.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIET_TYPES } from "../src/routes/meals.js";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    meal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const BODY = { name: "Paneer bhurji", mealType: "Lunch", calories: 420, proteinG: 24, carbsG: 18, fatG: 28 };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.meal.findMany.mockResolvedValue([]);
  prisma.meal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "m-new", ...data }));
  prisma.meal.updateMany.mockResolvedValue({ count: 1 });
  prisma.meal.findFirst.mockResolvedValue({ id: "m1", coachId: TEST_COACH_ID, ...BODY });
});

describe("diet type (Inspo N3)", () => {
  it("defaults to Any, which is what every older meal means", async () => {
    const res = await request(app).post("/api/meals").send(BODY);
    expect(res.status).toBe(201);
    expect(prisma.meal.create.mock.calls[0][0].data.dietType).toBe("Any");
  });

  it("accepts every diet it offers", async () => {
    for (const dietType of DIET_TYPES) {
      vi.clearAllMocks();
      prisma.meal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "m", ...data }));
      const res = await request(app).post("/api/meals").send({ ...BODY, dietType });
      expect(res.status, dietType).toBe(201);
      expect(prisma.meal.create.mock.calls[0][0].data.dietType).toBe(dietType);
    }
  });

  it("covers the diets that matter in India, where 'vegetarian' alone is not an answer", async () => {
    for (const needed of ["Vegetarian", "Eggetarian", "Vegan", "Jain", "Halal"]) {
      expect(DIET_TYPES, needed).toContain(needed);
    }
  });

  it("refuses a diet it does not know, in plain words", async () => {
    const res = await request(app).post("/api/meals").send({ ...BODY, dietType: "Pescatarian-ish" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("dietType must be one of");
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });
});

describe("alternative meals (Inspo N8)", () => {
  it("defaults to no alternatives", async () => {
    await request(app).post("/api/meals").send(BODY);
    expect(prisma.meal.create.mock.calls[0][0].data.swapIds).toEqual([]);
    // Nothing is looked up when there is nothing to check.
    expect(prisma.meal.findMany).not.toHaveBeenCalled();
  });

  it("keeps the coach's own meals as alternatives, in the order given", async () => {
    prisma.meal.findMany.mockResolvedValue([{ id: "m-chicken" }, { id: "m-tofu" }]);
    await request(app).post("/api/meals").send({ ...BODY, swapIds: ["m-tofu", "m-chicken"] });
    expect(prisma.meal.findMany.mock.calls[0][0].where).toMatchObject({ coachId: TEST_COACH_ID });
    // The coach's order, not the database's.
    expect(prisma.meal.create.mock.calls[0][0].data.swapIds).toEqual(["m-tofu", "m-chicken"]);
  });

  it("DROPS an id that is not the coach's, rather than failing the save", async () => {
    // A swap is a suggestion: one stale id must not cost the coach their whole meal.
    prisma.meal.findMany.mockResolvedValue([{ id: "m-chicken" }]);
    const res = await request(app).post("/api/meals").send({ ...BODY, swapIds: ["m-chicken", "someone-elses"] });
    expect(res.status).toBe(201);
    expect(prisma.meal.create.mock.calls[0][0].data.swapIds).toEqual(["m-chicken"]);
  });

  it("drops a dangling id left behind by a deleted meal", async () => {
    prisma.meal.findMany.mockResolvedValue([]);
    const res = await request(app).post("/api/meals").send({ ...BODY, swapIds: ["m-deleted-last-week"] });
    expect(res.status).toBe(201);
    expect(prisma.meal.create.mock.calls[0][0].data.swapIds).toEqual([]);
  });

  it("never lets a meal be its own alternative", async () => {
    prisma.meal.findMany.mockResolvedValue([{ id: "m-other" }]);
    await request(app).put("/api/meals/m1").send({ ...BODY, swapIds: ["m1", "m-other"] });
    expect(prisma.meal.updateMany.mock.calls[0][0].data.swapIds).toEqual(["m-other"]);
  });

  it("deduplicates", async () => {
    prisma.meal.findMany.mockResolvedValue([{ id: "m-chicken" }]);
    await request(app).post("/api/meals").send({ ...BODY, swapIds: ["m-chicken", "m-chicken"] });
    expect(prisma.meal.create.mock.calls[0][0].data.swapIds).toEqual(["m-chicken"]);
  });

  it("refuses an unreasonable number of alternatives", async () => {
    const many = Array.from({ length: 11 }, (_, i) => `m${i}`);
    const res = await request(app).post("/api/meals").send({ ...BODY, swapIds: many });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("at most 10 alternatives");
  });

  it("does not block deleting a meal that others point at", async () => {
    // The ids are a plain list, not a relation, exactly so this cannot happen.
    prisma.meal.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app).delete("/api/meals/m-chicken");
    expect(res.status).toBe(204);
  });
});
