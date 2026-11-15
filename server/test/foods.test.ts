// The food catalogue (Inspo N1, Nov 2026).
//
// The two rules that carry weight: a STOCK food is read-only (copy it to change it), and `scaled`
// is the ONLY place a quantity is applied, so a portion means the same thing everywhere.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOOD_CATEGORIES, scaled, totalFor } from "../src/routes/foods.js";

const { prisma } = vi.hoisted(() => ({
  prisma: { food: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() } },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const ROTI = {
  id: "fd_roti_whole_wheat",
  coachId: null,
  name: "Roti (whole wheat)",
  category: "Grains",
  servingLabel: "1 roti",
  servingG: 40,
  calories: 104,
  proteinG: 3.4,
  carbsG: 20,
  fatG: 1,
  fiberG: 2.7,
};
const MINE = { ...ROTI, id: "fd1", coachId: TEST_COACH_ID, name: "My protein shake" };

const BODY = {
  name: "Besan chilla",
  category: "Pulses",
  servingLabel: "2 chilla",
  servingG: 120,
  calories: 240,
  proteinG: 12,
  carbsG: 28,
  fatG: 9,
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.food.findMany.mockResolvedValue([]);
  prisma.food.findFirst.mockResolvedValue(null);
  prisma.food.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "fd-new", ...data }));
  prisma.food.updateMany.mockResolvedValue({ count: 1 });
  prisma.food.deleteMany.mockResolvedValue({ count: 1 });
});

describe("scaled: a portion means the same thing everywhere", () => {
  it("gives one serving unchanged", () => {
    expect(scaled(ROTI, 1)).toEqual({ calories: 104, proteinG: 3.4, carbsG: 20, fatG: 1, fiberG: 2.7 });
  });

  it("multiplies, rounding so a coach never sees 23.400000000000002", () => {
    expect(scaled(ROTI, 3)).toEqual({ calories: 312, proteinG: 10.2, carbsG: 60, fatG: 3, fiberG: 8.1 });
  });

  it("handles a half serving", () => {
    // 2.7 g of fibre halved is 1.35, which rounds to 1.4 at one decimal place.
    expect(scaled(ROTI, 0.5)).toEqual({ calories: 52, proteinG: 1.7, carbsG: 10, fatG: 0.5, fiberG: 1.4 });
  });

  it("treats nonsense as nothing rather than NaN", () => {
    for (const q of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = scaled(ROTI, q);
      expect(Object.values(out).every((n) => Number.isFinite(n)), String(q)).toBe(true);
      expect(out.calories).toBe(0);
    }
  });
});

describe("totalFor", () => {
  it("adds a meal up", () => {
    const total = totalFor([
      { food: ROTI, servings: 2 },
      { food: { calories: 265, proteinG: 18.3, carbsG: 1.2, fatG: 20.8, fiberG: 0 }, servings: 1 },
    ]);
    expect(total).toEqual({ calories: 473, proteinG: 25.1, carbsG: 41.2, fatG: 22.8, fiberG: 5.4 });
  });

  it("is all zeroes for an empty meal, never NaN", () => {
    expect(totalFor([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
  });

  it("does not accumulate floating-point dust across many items", () => {
    const total = totalFor(Array.from({ length: 10 }, () => ({ food: ROTI, servings: 1 })));
    expect(total.proteinG).toBe(34);
    expect(String(total.fiberG)).not.toContain("0000");
  });
});

describe("GET /api/foods", () => {
  it("returns stock and the coach's own, without leaking coachId", async () => {
    prisma.food.findMany.mockResolvedValue([MINE, ROTI]);
    const res = await request(app).get("/api/foods");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ name: "My protein shake", stock: false });
    expect(res.body[1]).toMatchObject({ name: "Roti (whole wheat)", stock: true });
    expect(res.body[0]).not.toHaveProperty("coachId");
  });

  it("never asks for another coach's foods", async () => {
    await request(app).get("/api/foods");
    expect(prisma.food.findMany.mock.calls[0][0].where.OR).toEqual([{ coachId: TEST_COACH_ID }, { coachId: null }]);
  });

  it("searches by name, case-insensitively", async () => {
    await request(app).get("/api/foods?search=ROTI");
    expect(prisma.food.findMany.mock.calls[0][0].where.name).toEqual({ contains: "ROTI", mode: "insensitive" });
  });

  it("filters by a known category and ignores an invented one", async () => {
    await request(app).get("/api/foods?category=Grains");
    expect(prisma.food.findMany.mock.calls[0][0].where.category).toBe("Grains");

    vi.clearAllMocks();
    prisma.food.findMany.mockResolvedValue([]);
    await request(app).get("/api/foods?category=Elvish");
    expect(prisma.food.findMany.mock.calls[0][0].where.category).toBeUndefined();
  });

  it("puts the coach's own foods first and bounds the list", async () => {
    await request(app).get("/api/foods");
    const args = prisma.food.findMany.mock.calls[0][0];
    expect(args.orderBy[0]).toEqual({ coachId: "desc" });
    expect(args.take).toBeLessThanOrEqual(200);
  });
});

describe("POST /api/foods", () => {
  it("creates one owned by the signed-in coach, ignoring a coachId in the body", async () => {
    const res = await request(app).post("/api/foods").send({ ...BODY, coachId: "someone-else" });
    expect(res.status).toBe(201);
    expect(prisma.food.create.mock.calls[0][0].data.coachId).toBe(TEST_COACH_ID);
    // Fibre defaults rather than blocking the save.
    expect(prisma.food.create.mock.calls[0][0].data.fiberG).toBe(0);
  });

  it("asks what a serving IS, in words, because a gram figure alone is unusable", async () => {
    const res = await request(app).post("/api/foods").send({ ...BODY, servingLabel: "  " });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("1 roti");
  });

  it("refuses a nameless food and an unknown category", async () => {
    expect((await request(app).post("/api/foods").send({ ...BODY, name: " " })).body.error).toBe("Give the food a name.");
    expect((await request(app).post("/api/foods").send({ ...BODY, category: "Elvish" })).status).toBe(400);
    expect(prisma.food.create).not.toHaveBeenCalled();
  });

  it("refuses a serving weight that cannot be real", async () => {
    for (const servingG of [0, -10, 99999]) {
      const res = await request(app).post("/api/foods").send({ ...BODY, servingG });
      expect(res.status, String(servingG)).toBe(400);
    }
  });

  it("refuses a duplicate name in plain words rather than a database error", async () => {
    prisma.food.findFirst.mockResolvedValue(MINE);
    const res = await request(app).post("/api/foods").send(BODY);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("You already have a food with that name.");
  });

  it("accepts every category it offers", async () => {
    for (const category of FOOD_CATEGORIES) {
      vi.clearAllMocks();
      prisma.food.findFirst.mockResolvedValue(null);
      prisma.food.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "x", ...data }));
      expect((await request(app).post("/api/foods").send({ ...BODY, category })).status, category).toBe(201);
    }
  });
});

describe("a stock food is read-only", () => {
  it("PUT on a stock food is 404, not an edit", async () => {
    prisma.food.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).put("/api/foods/fd_roti_whole_wheat").send(BODY);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not one of yours");
  });

  it("DELETE on a stock food is 404 and deletes nothing", async () => {
    prisma.food.deleteMany.mockResolvedValue({ count: 0 });
    expect((await request(app).delete("/api/foods/fd_roti_whole_wheat")).status).toBe(404);
  });

  it("every write is scoped to this coach, so there is no 'is it stock?' check to forget", async () => {
    await request(app).delete("/api/foods/fd1");
    expect(prisma.food.deleteMany.mock.calls[0][0].where).toEqual({ id: "fd1", coachId: TEST_COACH_ID });
  });

  it("but it can be copied, and the copy is the coach's own", async () => {
    prisma.food.findFirst.mockResolvedValueOnce(ROTI).mockResolvedValue(null);
    const res = await request(app).post("/api/foods/fd_roti_whole_wheat/copy");
    expect(res.status).toBe(201);
    const data = prisma.food.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ coachId: TEST_COACH_ID, name: "Roti (whole wheat) (copy)", calories: 104, fiberG: 2.7 });
  });

  it("numbers a second copy instead of failing on the unique name", async () => {
    prisma.food.findFirst
      .mockResolvedValueOnce(ROTI) // the source
      .mockResolvedValueOnce(MINE) // "(copy)" is taken
      .mockResolvedValue(null); // "(copy 2)" is free
    await request(app).post("/api/foods/fd_roti_whole_wheat/copy");
    expect(prisma.food.create.mock.calls[0][0].data.name).toBe("Roti (whole wheat) (copy 2)");
  });

  it("404s copying a food that does not exist", async () => {
    prisma.food.findFirst.mockResolvedValue(null);
    expect((await request(app).post("/api/foods/nope/copy")).status).toBe(404);
  });
});
