// The food catalogue (Inspo N1, Nov 2026) - see "Foods" in CLAUDE.md.
//
// Two kinds of row, exactly like the exercise library:
//   - STOCK: coachId NULL. Seeded, shared, read-only. Copy it to change it.
//   - OWN:   coachId set. The coach's own food.
//
// Numbers are PER SERVING. `scaled()` is the only place that multiplies them, so a quantity is
// applied one way everywhere.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler } from "./clients.js";

export const foodsRouter = Router();

/** The categories the catalogue is grouped by. Mirrored in client/src/types.ts (drift-tested). */
export const FOOD_CATEGORIES = [
  "Grains",
  "Pulses",
  "Dairy and eggs",
  "Meat and fish",
  "Vegetables",
  "Fruit",
  "Nuts and fats",
  "Supplements and drinks",
  "Snacks and sweets",
] as const;

const macro = (label: string) =>
  z
    .number({ error: (issue) => (issue.input === undefined ? `${label} is required.` : `${label} must be a number from 0 to 1000.`) })
    .min(0, `${label} must be a number from 0 to 1000.`)
    .max(1000, `${label} must be a number from 0 to 1000.`);

const FoodSchema = z.object({
  name: z.string({ error: "Give the food a name." }).trim().min(1, "Give the food a name.").max(80, "A name must be 80 characters or fewer."),
  category: z.enum(FOOD_CATEGORIES, { error: `A category must be one of: ${FOOD_CATEGORIES.join(", ")}.` }),
  servingLabel: z
    .string({ error: "Say what one serving is, like \"1 roti\" or \"1 cup\"." })
    .trim()
    .min(1, "Say what one serving is, like \"1 roti\" or \"1 cup\".")
    .max(40, "A serving must be 40 characters or fewer."),
  servingG: z
    .number({ error: (issue) => (issue.input === undefined ? "Say what one serving weighs in grams." : "A serving must weigh between 1 and 5000 grams.") })
    .min(1, "A serving must weigh between 1 and 5000 grams.")
    .max(5000, "A serving must weigh between 1 and 5000 grams."),
  calories: z
    .number({ error: (issue) => (issue.input === undefined ? "calories is required." : "calories must be a whole number from 0 to 5000.") })
    .int("calories must be a whole number from 0 to 5000.")
    .min(0, "calories must be a whole number from 0 to 5000.")
    .max(5000, "calories must be a whole number from 0 to 5000."),
  proteinG: macro("proteinG"),
  carbsG: macro("carbsG"),
  fatG: macro("fatG"),
  fiberG: macro("fiberG").default(0),
});

/** `coachId` never leaves the server; `stock` tells the UI whether the edit controls apply. */
const publicFood = (f: {
  id: string;
  coachId: string | null;
  name: string;
  category: string;
  servingLabel: string;
  servingG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}) => ({
  id: f.id,
  name: f.name,
  category: f.category,
  servingLabel: f.servingLabel,
  servingG: f.servingG,
  calories: f.calories,
  proteinG: f.proteinG,
  carbsG: f.carbsG,
  fatG: f.fatG,
  fiberG: f.fiberG,
  stock: f.coachId === null,
});

/**
 * One food's numbers at a given quantity of servings (Inspo N7).
 *
 * Rounded for display: calories to whole numbers, macros to one decimal. A coach comparing a plan
 * against a label does not want 23.400000000000002, and a meal total built from rounded parts is
 * close enough for coaching - these are published food values, not laboratory measurements.
 */
export function scaled(food: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number }, servings: number) {
  const q = Number.isFinite(servings) && servings > 0 ? servings : 0;
  const one = (n: number) => Math.round(n * q * 10) / 10;
  return {
    calories: Math.round(food.calories * q),
    proteinG: one(food.proteinG),
    carbsG: one(food.carbsG),
    fatG: one(food.fatG),
    fiberG: one(food.fiberG),
  };
}

/** Totals for a list of foods and quantities - what a meal built from foods adds up to. */
export function totalFor(items: { food: Parameters<typeof scaled>[0]; servings: number }[]) {
  return items.reduce(
    (sum, item) => {
      const part = scaled(item.food, item.servings);
      return {
        calories: sum.calories + part.calories,
        proteinG: Math.round((sum.proteinG + part.proteinG) * 10) / 10,
        carbsG: Math.round((sum.carbsG + part.carbsG) * 10) / 10,
        fatG: Math.round((sum.fatG + part.fatG) * 10) / 10,
        fiberG: Math.round((sum.fiberG + part.fiberG) * 10) / 10,
      };
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
}

// GET /api/foods?search=&category= - stock plus the coach's own, their own first, then A-Z.
foodsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const search = String(req.query.search ?? "").trim();
    const category = String(req.query.category ?? "").trim();
    const foods = await prisma.food.findMany({
      where: {
        OR: [{ coachId }, { coachId: null }],
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
        ...(category && (FOOD_CATEGORIES as readonly string[]).includes(category) ? { category } : {}),
      },
      // The coach's own first: they made them for a reason.
      orderBy: [{ coachId: "desc" }, { name: "asc" }, { id: "asc" }],
      // Bounded: the picker is a search box, not a scroll of everything.
      take: 200,
    });
    res.json(foods.map(publicFood));
  }),
);

// POST /api/foods - 201. Always the coach's own; stock foods are seed-only.
foodsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = FoodSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const coachId = coachIdOf(req);
    const existing = await prisma.food.findFirst({ where: { coachId, name: parsed.data.name } });
    if (existing) {
      res.status(400).json({ error: "You already have a food with that name." });
      return;
    }
    const food = await prisma.food.create({ data: { ...parsed.data, coachId } });
    res.status(201).json(publicFood(food));
  }),
);

// PUT /api/foods/:foodId - replaces every field. Own foods only; a stock food is 404.
foodsRouter.put(
  "/:foodId",
  asyncHandler(async (req, res) => {
    const parsed = FoodSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const coachId = coachIdOf(req);
    // Scoped by coachId, so a stock food and another coach's food are both simply absent.
    const { count } = await prisma.food.updateMany({ where: { id: req.params.foodId, coachId }, data: parsed.data });
    if (count === 0) {
      res.status(404).json({ error: "That food is not one of yours." });
      return;
    }
    const food = await prisma.food.findFirst({ where: { id: req.params.foodId, coachId } });
    res.json(food ? publicFood(food) : { error: "That food is not one of yours." });
  }),
);

// DELETE /api/foods/:foodId - 204. Own foods only. Meals already saved are untouched.
foodsRouter.delete(
  "/:foodId",
  asyncHandler(async (req, res) => {
    const { count } = await prisma.food.deleteMany({ where: { id: req.params.foodId, coachId: coachIdOf(req) } });
    if (count === 0) {
      res.status(404).json({ error: "That food is not one of yours." });
      return;
    }
    res.status(204).end();
  }),
);

// POST /api/foods/:foodId/copy - copy a stock food (or one of the coach's own) to edit.
foodsRouter.post(
  "/:foodId/copy",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const source = await prisma.food.findFirst({ where: { id: req.params.foodId, OR: [{ coachId }, { coachId: null }] } });
    if (!source) {
      res.status(404).json({ error: "That food no longer exists." });
      return;
    }
    // "Name (copy)", then "(copy 2)" - the same numbering the exercise library uses.
    const base = `${source.name} (copy)`.slice(0, 80);
    let name = base;
    for (let n = 2; await prisma.food.findFirst({ where: { coachId, name } }); n++) {
      name = `${source.name} (copy ${n})`.slice(0, 80);
    }
    const food = await prisma.food.create({
      data: {
        coachId,
        name,
        category: source.category,
        servingLabel: source.servingLabel,
        servingG: source.servingG,
        calories: source.calories,
        proteinG: source.proteinG,
        carbsG: source.carbsG,
        fatG: source.fatG,
        fiberG: source.fiberG,
      },
    });
    res.status(201).json(publicFood(food));
  }),
);
