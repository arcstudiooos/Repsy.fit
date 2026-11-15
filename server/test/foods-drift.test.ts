// The food catalogue must not drift between client and server (Inspo N1, Nov 2026).
//
// The client duplicates the category list for an instant picker, and duplicates `scaled` for a
// running total while the coach picks. Both are only safe while they agree with the server, which
// stays the authority for what is saved.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOOD_CATEGORIES, scaled } from "../src/routes/foods.js";

const clientTypes = readFileSync(new URL("../../client/src/types.ts", import.meta.url), "utf8");
const picker = readFileSync(new URL("../../client/src/components/FoodPicker.tsx", import.meta.url), "utf8");

describe("food categories: client and server agree", () => {
  it("holds the same categories, in the same order", () => {
    const block = clientTypes.match(/export const FOOD_CATEGORIES = \[([\s\S]*?)\] as const;/);
    expect(block, "FOOD_CATEGORIES is missing from the client's types.ts").not.toBeNull();
    const names = [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([...FOOD_CATEGORIES]);
  });

  it("starts with the categories an Indian coach reaches for first", () => {
    // Deliberate ordering, not alphabetical: a catalogue that opens with snacks is the wrong shape.
    expect(FOOD_CATEGORIES[0]).toBe("Grains");
    expect(FOOD_CATEGORIES[1]).toBe("Pulses");
  });
});

describe("scaling: the client's running total matches what the server would save", () => {
  // The client cannot be eval'd here (it is TypeScript), so this pins the RULES as text. Crude, and
  // it has caught drift: the same approach guards the workout estimate constants.
  const clientBody = picker.match(/export function scalePortion[\s\S]*?\n}/)?.[0] ?? "";

  it("has a copy of the scaling function at all", () => {
    expect(clientBody, "scalePortion is missing from FoodPicker.tsx").not.toBe("");
  });

  it("rounds macros to one decimal, exactly as the server does", () => {
    expect(clientBody).toContain("Math.round(n * q * 10) / 10");
  });

  it("rounds calories to whole numbers, exactly as the server does", () => {
    expect(clientBody).toContain("Math.round(food.calories * q)");
  });

  it("guards a silly quantity the same way, so a total is never NaN", () => {
    expect(clientBody).toContain("Number.isFinite(servings) && servings > 0 ? servings : 0");
  });

  it("and the server really does behave that way", () => {
    // Guards the guard: if these stopped being true, the text above would be pinning a fiction.
    const ROTI = { calories: 104, proteinG: 3.4, carbsG: 20, fatG: 1, fiberG: 2.7 };
    expect(scaled(ROTI, 0.5)).toEqual({ calories: 52, proteinG: 1.7, carbsG: 10, fatG: 0.5, fiberG: 1.4 });
    expect(scaled(ROTI, Number.NaN).calories).toBe(0);
  });
});
