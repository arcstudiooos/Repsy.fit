// Macro calculator (Prompt 61) - see "API contract" in CLAUDE.md. Stateless: nothing is stored.
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, validationMessage } from "./clients.js";
import { ACTIVITY_LEVELS, calculateMacros, MacroInputError, SEXES } from "../macros.js";

const num = (label: string, max: number) =>
  z
    .number({ required_error: `${label} is required.`, invalid_type_error: `${label} must be a number.` })
    .positive(`${label} must be above 0.`)
    .max(max, `${label} must be ${max} or less.`);

const MacroSchema = z.object({
  weightKg: num("weightKg", 500),
  heightCm: num("heightCm", 300),
  age: z
    .number({ required_error: "age is required.", invalid_type_error: "age must be a whole number." })
    .int("age must be a whole number.")
    .min(1, "age must be a whole number from 1 to 120.")
    .max(120, "age must be a whole number from 1 to 120."),
  sex: z.enum(SEXES, { errorMap: () => ({ message: "sex must be Female or Male." }) }),
  activity: z.enum(ACTIVITY_LEVELS, {
    errorMap: () => ({ message: "activity must be Sedentary, Light, Moderate, Active or Athlete." }),
  }),
  goal: z.string({ required_error: "goal is required." }).trim().min(1, "goal is required.").max(100, "goal must be 100 characters or fewer."),
});

// Mounted at /api/macros (behind requireCoach)
export const macrosRouter = Router();

// POST /api/macros - 200 { bmr, tdee, calories, proteinG, carbsG, fatG }. 400 for bad input or an age under 18.
macrosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = MacroSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    try {
      res.json(calculateMacros(parsed.data));
    } catch (err) {
      if (err instanceof MacroInputError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);
