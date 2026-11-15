// The shared stock meal library (Nov 2026).
//
// Meals were coach-owned only, so a new coach opened an empty library and had to type every recipe
// and macro before the diet side of Repsy was usable. Exercises and foods already had a shared
// catalogue; meals being the one exception was incoherent.
//
// The rules pinned here are the same two-row-kinds rules as exercises and foods: stock is visible,
// read-only, and copied to change.
import { beforeEach, describe, expect, it, vi } from "vitest";
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    meal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    coach: { findUnique: vi.fn() },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const STOCK = {
  id: "stkm_dal_chawal_ghee",
  coachId: null,
  name: "Dal Chawal with Ghee",
  mealType: "Lunch",
  calories: 488,
  proteinG: 17,
  carbsG: 78,
  fatG: 12,
  fiberG: 9,
  ingredients: "1 katori cooked toor dal (150 g), 1.5 katori cooked rice (200 g), 1 tsp ghee",
  steps: "Pressure cook the dal. Temper cumin in ghee and pour over. Serve with rice.",
  dietType: "Vegetarian",
  swapIds: [],
  createdAt: new Date("2026-11-16T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.meal.findMany.mockResolvedValue([]);
  prisma.meal.findFirst.mockResolvedValue(null);
  prisma.meal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: "new-meal",
    createdAt: new Date(),
    ...data,
  }));
});

describe("listing", () => {
  it("marks a NULL coachId as stock, so the UI never has to know what NULL means", async () => {
    prisma.meal.findMany.mockResolvedValue([STOCK, { ...STOCK, id: "mine", coachId: TEST_COACH_ID }]);
    const res = await request(app).get("/api/meals");
    expect(res.status).toBe(200);
    expect(res.body.map((m: { id: string; stock: boolean }) => [m.id, m.stock])).toEqual([
      ["stkm_dal_chawal_ghee", true],
      ["mine", false],
    ]);
  });

  it("defaults to showing own meals AND stock, because an empty library is useless on day one", async () => {
    await request(app).get("/api/meals");
    expect(prisma.meal.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ coachId: TEST_COACH_ID }, { coachId: null }],
    });
  });

  it("narrows to just stock or just mine on request", async () => {
    await request(app).get("/api/meals?scope=stock");
    expect(prisma.meal.findMany.mock.calls[0][0].where).toEqual({ coachId: null });
    vi.clearAllMocks();
    prisma.meal.findMany.mockResolvedValue([]);
    await request(app).get("/api/meals?scope=mine");
    expect(prisma.meal.findMany.mock.calls[0][0].where).toEqual({ coachId: TEST_COACH_ID });
  });

  it("treats an unknown scope as 'all' rather than erroring", async () => {
    await request(app).get("/api/meals?scope=nonsense");
    expect(prisma.meal.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ coachId: TEST_COACH_ID }, { coachId: null }],
    });
  });
});

describe("stock meals are read-only", () => {
  it("cannot be edited: the update is scoped to the coach, so a stock row is simply not found", async () => {
    prisma.meal.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).put("/api/meals/stkm_dal_chawal_ghee").send({
      name: "Hijacked",
      mealType: "Lunch",
      calories: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
    });
    expect(res.status).toBe(404);
    expect(prisma.meal.updateMany.mock.calls[0][0].where).toMatchObject({ coachId: TEST_COACH_ID });
  });

  it("cannot be deleted", async () => {
    prisma.meal.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app).delete("/api/meals/stkm_dal_chawal_ghee");
    expect(res.status).toBe(404);
    expect(prisma.meal.deleteMany.mock.calls[0][0].where).toMatchObject({ coachId: TEST_COACH_ID });
  });
});

describe("copying a stock meal", () => {
  it("creates the coach's own copy with every number carried over", async () => {
    prisma.meal.findFirst.mockResolvedValueOnce(STOCK).mockResolvedValue(null);
    const res = await request(app).post("/api/meals/stkm_dal_chawal_ghee/copy");
    expect(res.status).toBe(201);
    const data = prisma.meal.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      coachId: TEST_COACH_ID,
      name: "Dal Chawal with Ghee",
      calories: 488,
      proteinG: 17,
      fiberG: 9,
      dietType: "Vegetarian",
      ingredients: STOCK.ingredients,
      steps: STOCK.steps,
    });
    expect(res.body.stock).toBe(false);
  });

  it("does NOT carry the swaps over", async () => {
    // They point at the stock library's own ids; a copy quietly carrying another library's
    // suggestions is more confusing than one that starts clean.
    prisma.meal.findFirst.mockResolvedValueOnce({ ...STOCK, swapIds: ["stkm_rajma_chawal"] }).mockResolvedValue(null);
    await request(app).post("/api/meals/stkm_dal_chawal_ghee/copy");
    expect(prisma.meal.create.mock.calls[0][0].data.swapIds).toEqual([]);
  });

  it("numbers a second copy instead of failing", async () => {
    prisma.meal.findFirst
      .mockResolvedValueOnce(STOCK) // the source
      .mockResolvedValueOnce({ id: "existing" }) // the name is taken
      .mockResolvedValue(null); // "(2)" is free
    await request(app).post("/api/meals/stkm_dal_chawal_ghee/copy");
    expect(prisma.meal.create.mock.calls[0][0].data.name).toBe("Dal Chawal with Ghee (2)");
  });

  it("404s on a meal that is neither stock nor the coach's own", async () => {
    prisma.meal.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/meals/someone-elses/copy");
    expect(res.status).toBe(404);
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    const { default: supertest } = await import("supertest");
    expect((await supertest(app).post("/api/meals/stkm_dal_chawal_ghee/copy")).status).toBe(401);
  });
});
