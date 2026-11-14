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
});

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
    const item = await prisma.meal.create({ data: { ...parsed.data, coachId: coachIdOf(req) } });
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
    const { count } = await prisma.meal.updateMany({ where: { id: mealId, coachId }, data: parsed.data });
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
