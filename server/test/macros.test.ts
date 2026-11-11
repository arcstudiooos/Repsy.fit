// Prompt 61: macro calculator. The pure function (hand-checked people) and POST /api/macros.
// No database is used: the calculation is stateless.
import { describe, expect, it } from "vitest";
import supertest from "supertest";
import { app } from "../src/app.js";
import request from "./helpers/authedRequest.js";
import { calculateMacros, MacroInputError } from "../src/macros.js";

describe("calculateMacros (hand-checked)", () => {
  it("Person 1: woman, 68 kg, 165 cm, 29, Moderate, Fat loss", () => {
    // BMR = 10*68 + 6.25*165 - 5*29 - 161 = 1405.25; TDEE = 1405.25 * 1.55 = 2178.1375
    // Fat loss -20% = 1742.51 -> 1743 kcal. Protein 2*68 = 136 g (544 kcal).
    // Fat 25% = 435.75 kcal / 9 = 48.4 -> 48 g (432 kcal). Carbs = (1743 - 544 - 432) / 4 = 191.75 -> 192 g.
    expect(
      calculateMacros({ weightKg: 68, heightCm: 165, age: 29, sex: "Female", activity: "Moderate", goal: "Fat loss" }),
    ).toEqual({ bmr: 1405, tdee: 2178, calories: 1743, proteinG: 136, carbsG: 192, fatG: 48 });
  });

  it("Person 2: man, 80 kg, 180 cm, 30, Light, Muscle gain", () => {
    // BMR = 800 + 1125 - 150 + 5 = 1780; TDEE = 1780 * 1.375 = 2447.5; +10% = 2692.25 -> 2692 kcal.
    // Protein 160 g (640). Fat 2692 * .25 / 9 = 74.78 -> 75 g (675). Carbs = (2692 - 640 - 675) / 4 = 344.25 -> 344 g.
    expect(
      calculateMacros({ weightKg: 80, heightCm: 180, age: 30, sex: "Male", activity: "Light", goal: "Muscle gain" }),
    ).toEqual({ bmr: 1780, tdee: 2448, calories: 2692, proteinG: 160, carbsG: 344, fatG: 75 });
  });

  it("Person 3: man, 90 kg, 175 cm, 50, Athlete, Rehab & mobility (no goal adjustment)", () => {
    // BMR = 900 + 1093.75 - 250 + 5 = 1748.75; TDEE = 1748.75 * 1.9 = 3322.625 -> 3323 kcal.
    // Protein 180 g (720). Fat 3323 * .25 / 9 = 92.3 -> 92 g (828). Carbs = (3323 - 720 - 828) / 4 = 443.75 -> 444 g.
    expect(
      calculateMacros({ weightKg: 90, heightCm: 175, age: 50, sex: "Male", activity: "Athlete", goal: "Rehab & mobility" }),
    ).toEqual({ bmr: 1749, tdee: 3323, calories: 3323, proteinG: 180, carbsG: 444, fatG: 92 });
  });

  it("'Fat loss + strength' is treated as fat loss; unknown free-text goals get no adjustment", () => {
    const base = { weightKg: 68, heightCm: 165, age: 29, sex: "Female", activity: "Moderate" } as const;
    expect(calculateMacros({ ...base, goal: "Fat loss + strength" }).calories).toBe(1743);
    expect(calculateMacros({ ...base, goal: "Marathon prep + conditioning" }).calories).toBe(2178);
  });

  it("at extreme inputs carbs floor at 0 g (never negative) and protein is not cut", () => {
    const r = calculateMacros({ weightKg: 300, heightCm: 100, age: 90, sex: "Female", activity: "Sedentary", goal: "Fat loss" });
    expect(r.carbsG).toBe(0);
    expect(r.proteinG).toBe(600);
    expect(r.fatG).toBeGreaterThan(0);
    // The macros then add up to more than the target - the documented trade-off.
    expect(r.proteinG * 4 + r.fatG * 9).toBeGreaterThan(r.calories);
  });

  it("refuses anyone under 18 with a plain message, and accepts exactly 18", () => {
    const person = { weightKg: 60, heightCm: 165, age: 17, sex: "Female", activity: "Light", goal: "Fat loss" } as const;
    expect(() => calculateMacros(person)).toThrow(MacroInputError);
    expect(() => calculateMacros(person)).toThrow("Macros are only calculated for adults aged 18 or older.");
    expect(() => calculateMacros({ ...person, age: 18 })).not.toThrow();
  });
});

const BODY = { weightKg: 68, heightCm: 165, age: 29, sex: "Female", activity: "Moderate", goal: "Fat loss" };

describe("POST /api/macros", () => {
  it("returns the calculation (200) for a signed-in coach", async () => {
    const res = await request(app).post("/api/macros").send(BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bmr: 1405, tdee: 2178, calories: 1743, proteinG: 136, carbsG: 192, fatG: 48 });
  });

  it("needs a session", async () => {
    expect((await supertest(app).post("/api/macros").send(BODY)).status).toBe(401);
  });

  it("under 18 -> 400 with the plain message", async () => {
    const res = await request(app).post("/api/macros").send({ ...BODY, age: 17 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Macros are only calculated for adults aged 18 or older." });
  });

  it("rejects missing or out-of-range inputs", async () => {
    for (const bad of [
      { weightKg: 0 },
      { weightKg: 501 },
      { heightCm: undefined },
      { heightCm: 301 },
      { age: 29.5 },
      { age: 121 },
      { age: undefined },
      { sex: "Other" },
      { activity: "Extreme" },
      { goal: "" },
    ]) {
      const res = await request(app).post("/api/macros").send({ ...BODY, ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(typeof res.body.error).toBe("string");
    }
  });
});
