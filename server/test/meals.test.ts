// Prompt 60: meal library endpoints (mocked database).
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  meal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;

const BODY = { name: "Oats & eggs", mealType: "Breakfast", calories: 450, proteinG: 30, carbsG: 45, fatG: 15, ingredients: "Oats, eggs", steps: "Cook." };
const row = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  coachId: "coach-1",
  ...BODY,
  createdAt: new Date("2026-11-11T08:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.meal.findMany.mockResolvedValue([row()]);
  prismaMock.meal.findFirst.mockResolvedValue(row());
  prismaMock.meal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(row(data)));
  prismaMock.meal.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.meal.deleteMany.mockResolvedValue({ count: 1 });
});

describe("GET /api/meals", () => {
  it("lists only the signed-in coach's meals; every method needs a session", async () => {
    const res = await request(app).get("/api/meals");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prismaMock.meal.findMany).toHaveBeenCalledWith({
      where: { coachId: "coach-1" },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    const anon = supertest(app);
    expect((await anon.get("/api/meals")).status).toBe(401);
    expect((await anon.post("/api/meals").send(BODY)).status).toBe(401);
    expect((await anon.put("/api/meals/m1").send(BODY)).status).toBe(401);
    expect((await anon.delete("/api/meals/m1")).status).toBe(401);
  });
});

describe("POST /api/meals", () => {
  it("saves a meal (201) owned by the signed-in coach, ignoring a coachId in the body", async () => {
    const res = await request(app).post("/api/meals").send({ ...BODY, name: "  Oats & eggs ", coachId: "evil" });
    expect(res.status).toBe(201);
    expect(prismaMock.meal.create).toHaveBeenCalledWith({ data: { ...BODY, coachId: "coach-1" } });
    expect(Object.keys(res.body).sort()).toEqual(
      ["calories", "carbsG", "coachId", "createdAt", "fatG", "id", "ingredients", "mealType", "name", "proteinG", "steps"],
    );
  });

  it("ingredients and steps default to empty text", async () => {
    const { ingredients, steps, ...min } = BODY;
    void ingredients;
    void steps;
    await request(app).post("/api/meals").send(min);
    expect(prismaMock.meal.create).toHaveBeenCalledWith({ data: { ...min, ingredients: "", steps: "", coachId: "coach-1" } });
  });

  it("rejects a missing name, a bad meal type and bad macro values", async () => {
    for (const bad of [
      { name: "" },
      { name: "   " },
      { mealType: "Brunch" },
      { mealType: undefined },
      { calories: -1 },
      { calories: 10001 },
      { calories: 450.5 },
      { calories: undefined },
      { proteinG: -2 },
      { proteinG: 1001 },
      { carbsG: "lots" },
      { fatG: undefined },
      { ingredients: "x".repeat(2001) },
      { steps: "x".repeat(4001) },
    ]) {
      const res = await request(app).post("/api/meals").send({ ...BODY, ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(typeof res.body.error).toBe("string");
    }
    expect(prismaMock.meal.create).not.toHaveBeenCalled();
  });
});

describe("PUT /api/meals/:mealId", () => {
  it("replaces the meal, scoped to the coach", async () => {
    const res = await request(app).put("/api/meals/m1").send({ ...BODY, name: "Bowl", mealType: "Lunch" });
    expect(res.status).toBe(200);
    expect(prismaMock.meal.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", coachId: "coach-1" },
      data: { ...BODY, name: "Bowl", mealType: "Lunch" },
    });
  });

  it("another coach's / unknown meal -> 'Meal not found'", async () => {
    prismaMock.meal.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).put("/api/meals/other").send(BODY);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Meal not found" });
  });
});

describe("DELETE /api/meals/:mealId", () => {
  it("deletes one (204), scoped to the coach", async () => {
    const res = await request(app).delete("/api/meals/m1");
    expect(res.status).toBe(204);
    expect(prismaMock.meal.deleteMany).toHaveBeenCalledWith({ where: { id: "m1", coachId: "coach-1" } });
  });

  it("unknown meal -> 'Meal not found'", async () => {
    prismaMock.meal.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app).delete("/api/meals/zzz");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Meal not found" });
  });
});
