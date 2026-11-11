// Workout templates (Prompt 58) - see "API contract" in CLAUDE.md.
// A coach's own reusable workouts: exercises in the Manual Planner's shape (name, sets, reps, rest
// seconds, in order). Coach-level data: not tied to a client, never shared between coaches.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, validationMessage } from "./clients.js";

/** Same limits as the Manual Planner's sets / rest controls (reps is free text: "AMRAP", "30 sec"). */
const ExerciseSchema = z.object({
  name: z.string({ required_error: "Each exercise needs a name." }).trim().min(1, "Each exercise needs a name.").max(100, "Exercise names must be 100 characters or fewer."),
  sets: z.number({ invalid_type_error: "sets must be a whole number from 1 to 10." }).int("sets must be a whole number from 1 to 10.").min(1, "sets must be a whole number from 1 to 10.").max(10, "sets must be a whole number from 1 to 10."),
  reps: z.string({ required_error: "Each exercise needs reps." }).trim().min(1, "Each exercise needs reps.").max(30, "reps must be 30 characters or fewer."),
  rest: z.number({ invalid_type_error: "rest must be whole seconds from 6 to 3600." }).int("rest must be whole seconds from 6 to 3600.").min(6, "rest must be whole seconds from 6 to 3600.").max(3600, "rest must be whole seconds from 6 to 3600."),
});

const TemplateSchema = z.object({
  name: z.string({ required_error: "name is required." }).trim().min(1, "name is required.").max(100, "name must be 100 characters or fewer."),
  focus: z.string().trim().max(100, "focus must be 100 characters or fewer.").default(""),
  exercises: z
    .array(ExerciseSchema, { required_error: "exercises are required." })
    .min(1, "Add at least one exercise.")
    .max(50, "A template can have up to 50 exercises."),
  notes: z.string().trim().max(2000, "notes must be 2000 characters or fewer.").default(""),
});

// Mounted at /api/templates (behind requireCoach)
export const templatesRouter = Router();

// GET /api/templates - this coach's templates, A-Z by name.
templatesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await prisma.workoutTemplate.findMany({
      where: { coachId: coachIdOf(req) },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    res.json(items);
  }),
);

// POST /api/templates - 201 with the full record. coachId comes from the session, never the body.
templatesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = TemplateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const item = await prisma.workoutTemplate.create({ data: { ...parsed.data, coachId: coachIdOf(req) } });
    res.status(201).json(item);
  }),
);

// PUT /api/templates/:templateId - replaces name, focus, exercises and notes.
templatesRouter.put(
  "/:templateId",
  asyncHandler(async (req, res) => {
    const parsed = TemplateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { templateId } = req.params as { templateId: string };
    const coachId = coachIdOf(req);
    const { count } = await prisma.workoutTemplate.updateMany({ where: { id: templateId, coachId }, data: parsed.data });
    const item = count === 0 ? null : await prisma.workoutTemplate.findFirst({ where: { id: templateId, coachId } });
    if (!item) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json(item);
  }),
);

// DELETE /api/templates/:templateId - 204, no body. Assignments already made from it are untouched.
templatesRouter.delete(
  "/:templateId",
  asyncHandler(async (req, res) => {
    const { templateId } = req.params as { templateId: string };
    const { count } = await prisma.workoutTemplate.deleteMany({ where: { id: templateId, coachId: coachIdOf(req) } });
    if (count === 0) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.status(204).end();
  }),
);
