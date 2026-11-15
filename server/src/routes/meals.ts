// Meal library (Prompt 60) - see "API contract" in CLAUDE.md.
// A coach's own reusable meals. Every number is typed in by the coach: nothing is fetched from a food
// database or calculated from the ingredients. Coach-level data: not tied to a client, never shared.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, validationMessage } from "./clients.js";

/**
 * Inspo N4: when the meal is eaten, in the order of a day.
 *
 * The four original names - Breakfast, Lunch, Dinner, Snack - are KEPT EXACTLY, because every meal
 * saved before Nov 2026 holds one of them and `mealType` is plain TEXT with no migration. The rest
 * are the workout-relative and edge-of-day slots a nutrition coach actually plans around.
 */
export const MEAL_TYPES = [
  "On waking up",
  "Early morning",
  "Breakfast",
  "After breakfast",
  "Mid-morning",
  "Morning snack",
  "Lunch",
  "Snack",
  "Evening snack",
  "Dinner",
  "After dinner",
  "Bed time",
  "Before workout",
  "During workout",
  "Between workouts",
  "After workout",
  "Non-training day",
] as const;

/**
 * Inspo N3: which diet a meal suits. "Any" is the default and what every meal saved before this
 * existed means - no meal is reclassified retroactively.
 *
 * Jain and Halal are here because Repsy's first market is India, where "vegetarian" alone does not
 * answer the question a client is actually asking.
 */
export const DIET_TYPES = ["Any", "Vegetarian", "Eggetarian", "Vegan", "Jain", "Halal", "Non-vegetarian"] as const;

const macro = (label: string) =>
  z
    .number({ error: (issue) => (issue.input === undefined ? `${label} is required.` : `${label} must be a number from 0 to 1000.`) })
    .min(0, `${label} must be a number from 0 to 1000.`)
    .max(1000, `${label} must be a number from 0 to 1000.`);

const MealSchema = z.object({
  name: z.string({ error: "name is required." }).trim().min(1, "name is required.").max(100, "name must be 100 characters or fewer."),
  mealType: z.enum(MEAL_TYPES, { error: `mealType must be one of: ${MEAL_TYPES.join(", ")}.` }),
  calories: z
    .number({ error: (issue) => (issue.input === undefined ? "calories is required." : "calories must be a whole number from 0 to 10000.") })
    .int("calories must be a whole number from 0 to 10000.")
    .min(0, "calories must be a whole number from 0 to 10000.")
    .max(10000, "calories must be a whole number from 0 to 10000."),
  proteinG: macro("proteinG"),
  carbsG: macro("carbsG"),
  fatG: macro("fatG"),
  fiberG: macro("fiberG").default(0),
  ingredients: z.string().trim().max(2000, "ingredients must be 2000 characters or fewer.").default(""),
  steps: z.string().trim().max(4000, "steps must be 4000 characters or fewer.").default(""),
  dietType: z.enum(DIET_TYPES, { error: `dietType must be one of: ${DIET_TYPES.join(", ")}.` }).default("Any"),
  // Inspo N8: ids of meals this one can be swapped for. Deduped, and a meal cannot swap for itself.
  swapIds: z
    .array(z.string().trim().min(1))
    .max(10, "A meal can offer at most 10 alternatives.")
    .default([])
    .transform((ids) => [...new Set(ids)]),
});

/**
 * Keeps only the swap ids that are this coach's own meals, and never the meal itself.
 *
 * An id that is not theirs is DROPPED rather than rejected: a swap is a suggestion, so one stale id
 * from an older copy must not fail the whole save. Deleting a meal therefore leaves dangling ids
 * behind on purpose - cheaper than a relation, and harmless because reads resolve what they can.
 */
async function ownedSwapIds(ids: string[], coachId: string, selfId: string | null): Promise<string[]> {
  const wanted = ids.filter((id) => id !== selfId);
  if (wanted.length === 0) return [];
  const owned = await prisma.meal.findMany({ where: { id: { in: wanted }, coachId }, select: { id: true } });
  const keep = new Set(owned.map((m) => m.id));
  // Keep the coach's order, not the database's.
  return wanted.filter((id) => keep.has(id));
}

// Mounted at /api/meals (behind requireCoach)
export const mealsRouter = Router();

// GET /api/meals - this coach's meals, A-Z by name.
mealsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await prisma.meal.findMany({
      where: { coachId: coachIdOf(req) },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    res.json(items);
  }),
);

// POST /api/meals - 201 with the full record. coachId comes from the session, never the body.
mealsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = MealSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const coachId = coachIdOf(req);
    const swapIds = await ownedSwapIds(parsed.data.swapIds, coachId, null);
    const item = await prisma.meal.create({ data: { ...parsed.data, swapIds, coachId } });
    res.status(201).json(item);
  }),
);

// PUT /api/meals/:mealId - replaces every field.
mealsRouter.put(
  "/:mealId",
  asyncHandler(async (req, res) => {
    const parsed = MealSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { mealId } = req.params as { mealId: string };
    const coachId = coachIdOf(req);
    const swapIds = await ownedSwapIds(parsed.data.swapIds, coachId, mealId);
    const { count } = await prisma.meal.updateMany({ where: { id: mealId, coachId }, data: { ...parsed.data, swapIds } });
    const item = count === 0 ? null : await prisma.meal.findFirst({ where: { id: mealId, coachId } });
    if (!item) {
      res.status(404).json({ error: "Meal not found" });
      return;
    }
    res.json(item);
  }),
);

// DELETE /api/meals/:mealId - 204, no body. Assignments already made from it are untouched.
mealsRouter.delete(
  "/:mealId",
  asyncHandler(async (req, res) => {
    const { mealId } = req.params as { mealId: string };
    const { count } = await prisma.meal.deleteMany({ where: { id: mealId, coachId: coachIdOf(req) } });
    if (count === 0) {
      res.status(404).json({ error: "Meal not found" });
      return;
    }
    res.status(204).end();
  }),
);
