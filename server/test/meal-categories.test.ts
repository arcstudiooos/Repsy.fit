// Meal categories and fibre (Inspo N2/N4, Nov 2026).
//
// The rule that matters most: `meals.mealType` is plain TEXT with no migration, so every one of the
// FOUR ORIGINAL NAMES must still be accepted. Expanding a validated list is only safe if the old
// values survive it - otherwise every meal a coach saved before today becomes unsaveable the next
// time they edit it.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIET_TYPES, MEAL_TYPES } from "../src/routes/meals.js";

const { prisma } = vi.hoisted(() => ({
  prisma: { meal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const base = { name: "Dal and rice", mealType: "Lunch", calories: 520, proteinG: 22, carbsG: 80, fatG: 9 };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.meal.findMany.mockResolvedValue([]);
  prisma.meal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data }));
});

describe("the four original meal types still work", () => {
  // If this ever fails, meals saved before Nov 2026 can no longer be edited.
  for (const mealType of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
    it(`accepts "${mealType}"`, async () => {
      const res = await request(app).post("/api/meals").send({ ...base, mealType });
      expect(res.status).toBe(201);
      expect(prisma.meal.create.mock.calls[0][0].data.mealType).toBe(mealType);
    });
  }

  it("keeps all four in MEAL_TYPES, spelled exactly as the database holds them", () => {
    for (const old of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
      expect(MEAL_TYPES).toContain(old);
    }
  });
});

describe("the new meal categories", () => {
  it("accepts every category in the list", async () => {
    for (const mealType of MEAL_TYPES) {
      vi.clearAllMocks();
      prisma.meal.create.mockResolvedValue({ id: "m1" });
      const res = await request(app).post("/api/meals").send({ ...base, mealType });
      expect(res.status, `${mealType} was refused`).toBe(201);
    }
  });

  it("covers the workout-relative slots a nutrition coach plans around", () => {
    for (const slot of ["Before workout", "During workout", "After workout", "Non-training day"]) {
      expect(MEAL_TYPES).toContain(slot);
    }
  });

  it("refuses a category that is not in the list, and says what is allowed", async () => {
    const res = await request(app).post("/api/meals").send({ ...base, mealType: "Second lunch" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Breakfast");
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });

  it("has not drifted from the client's copy", async () => {
    const types = await readFile(new URL("../../client/src/types.ts", import.meta.url), "utf8");
    const block = /export const MEAL_TYPES = \[([\s\S]*?)\] as const;/.exec(types);
    expect(block).toBeTruthy();
    const clientList = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(clientList).toEqual([...MEAL_TYPES]);
  });
});

describe("fibre", () => {
  it("is saved when given", async () => {
    await request(app).post("/api/meals").send({ ...base, fiberG: 12.5 });
    expect(prisma.meal.create.mock.calls[0][0].data.fiberG).toBe(12.5);
  });

  it("defaults to 0, so a meal saved without it is still valid", async () => {
    await request(app).post("/api/meals").send(base);
    expect(prisma.meal.create.mock.calls[0][0].data.fiberG).toBe(0);
  });

  it("is refused when it is not a sane number", async () => {
    for (const fiberG of [-1, 1001, "lots"]) {
      const res = await request(app).post("/api/meals").send({ ...base, fiberG });
      expect(res.status, `fiberG ${fiberG} was accepted`).toBe(400);
    }
  });
});

describe("diet types: client and server agree (Inspo N3)", () => {
  it("holds the same diets, in the same order", async () => {
    // The client duplicates the list for an instant picker, so drift would offer a diet the server
    // refuses - the save would fail on a field the coach cannot see is wrong.
    const types = await readFile(new URL("../../client/src/types.ts", import.meta.url), "utf8");
    const block = types.match(/export const DIET_TYPES = \[([^\]]+)\]/);
    expect(block, "DIET_TYPES is missing from the client's types.ts").not.toBeNull();
    const clientList = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(clientList).toEqual([...DIET_TYPES]);
  });

  it("keeps Any first, because it is the default", () => {
    expect(DIET_TYPES[0]).toBe("Any");
  });
});
