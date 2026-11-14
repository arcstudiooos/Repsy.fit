// Exercise library (Inspo W1, Nov 2026) - see "API contract" in CLAUDE.md.
//
// The catalogue a structured workout is built from. Two kinds of row live in one table:
//   - STOCK: coachId NULL. Seeded by migration, shared by every coach, read-only to them.
//   - OWN:   coachId set. The coach's own movements, editable and deletable.
// A coach always sees both; `scope` narrows it. Nothing here is client-specific.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, validationMessage } from "./clients.js";

/** Equipment tags. The UI renders these as filter pills, so the order is the order shown. */
export const EQUIPMENT = [
  "Bodyweight",
  "Barbell",
  "Dumbbell",
  "Kettlebell",
  "Machine",
  "Cable",
  "Resistance band",
  "Pull up bar",
  "Medicine ball",
  "Other",
] as const;

/** Muscle groups, same deal. "Full body" is the default because it is never wrong. */
export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Glutes",
  "Core",
  "Full body",
  "Cardio",
  "Mobility",
] as const;

const ExerciseSchema = z.object({
  name: z
    .string({ error: "name is required." })
    .trim()
    .min(1, "name is required.")
    .max(100, "name must be 100 characters or fewer."),
  equipment: z.enum(EQUIPMENT, { error: `equipment must be one of: ${EQUIPMENT.join(", ")}.` }).default("Bodyweight"),
  muscleGroup: z
    .enum(MUSCLE_GROUPS, { error: `muscleGroup must be one of: ${MUSCLE_GROUPS.join(", ")}.` })
    .default("Full body"),
  // A link only. Repsy never hosts, proxies or embeds the video, so CSP is unaffected: the UI
  // renders it as a plain link that opens in a new tab.
  mediaUrl: z
    .string()
    .trim()
    .max(500, "mediaUrl must be 500 characters or fewer.")
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "mediaUrl must start with https:// .")
    .default(""),
  instructions: z.string().trim().max(2000, "instructions must be 2000 characters or fewer.").default(""),
});

// Mounted at /api/exercises (behind requireCoach)
export const exercisesRouter = Router();

/** The shape every endpoint returns. `stock` tells the UI whether the edit controls apply. */
const publicExercise = (e: {
  id: string;
  coachId: string | null;
  name: string;
  equipment: string;
  muscleGroup: string;
  mediaUrl: string;
  instructions: string;
}) => ({
  id: e.id,
  name: e.name,
  equipment: e.equipment,
  muscleGroup: e.muscleGroup,
  mediaUrl: e.mediaUrl,
  instructions: e.instructions,
  stock: e.coachId === null,
});

// GET /api/exercises?scope=all|stock|mine&q=&equipment=&muscleGroup=
// A-Z by name. Search matches the name, case-insensitively, anywhere in it.
exercisesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const scope = String(req.query.scope ?? "all");
    const q = String(req.query.q ?? "").trim();
    const equipment = String(req.query.equipment ?? "").trim();
    const muscleGroup = String(req.query.muscleGroup ?? "").trim();

    // "mine" = this coach's rows; "stock" = the shared catalogue; "all" = both, never another coach's.
    const owner =
      scope === "mine" ? { coachId } : scope === "stock" ? { coachId: null } : { OR: [{ coachId }, { coachId: null }] };

    const items = await prisma.exercise.findMany({
      where: {
        ...owner,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        ...(equipment ? { equipment } : {}),
        ...(muscleGroup ? { muscleGroup } : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    res.json(items.map(publicExercise));
  }),
);

// POST /api/exercises - 201 with the new exercise. Always the coach's own; stock is seed-only.
exercisesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = ExerciseSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const coachId = coachIdOf(req);
    const clash = await prisma.exercise.findFirst({ where: { coachId, name: parsed.data.name } });
    if (clash) {
      res.status(409).json({ error: "You already have an exercise with that name." });
      return;
    }
    const item = await prisma.exercise.create({ data: { ...parsed.data, coachId } });
    res.status(201).json(publicExercise(item));
  }),
);

// PUT /api/exercises/:exerciseId - replaces every field. Own exercises only.
exercisesRouter.put(
  "/:exerciseId",
  asyncHandler(async (req, res) => {
    const parsed = ExerciseSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const coachId = coachIdOf(req);
    const { exerciseId } = req.params;
    // Scoped by coachId, so a stock row (coachId NULL) or another coach's row simply is not found.
    const existing = await prisma.exercise.findFirst({ where: { id: exerciseId, coachId } });
    if (!existing) {
      res.status(404).json({ error: "That exercise is not one of yours." });
      return;
    }
    const clash = await prisma.exercise.findFirst({
      where: { coachId, name: parsed.data.name, id: { not: exerciseId } },
    });
    if (clash) {
      res.status(409).json({ error: "You already have an exercise with that name." });
      return;
    }
    const item = await prisma.exercise.update({ where: { id: exerciseId }, data: parsed.data });
    res.json(publicExercise(item));
  }),
);

// DELETE /api/exercises/:exerciseId - 204. Own exercises only; the stock catalogue cannot be deleted.
exercisesRouter.delete(
  "/:exerciseId",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const existing = await prisma.exercise.findFirst({ where: { id: req.params.exerciseId, coachId } });
    if (!existing) {
      res.status(404).json({ error: "That exercise is not one of yours." });
      return;
    }
    await prisma.exercise.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

// POST /api/exercises/:exerciseId/copy - copy a stock exercise into the coach's own library so they
// can tweak it. The usual way a coach "edits" a stock movement without the stock set ever changing.
exercisesRouter.post(
  "/:exerciseId/copy",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const source = await prisma.exercise.findFirst({
      where: { id: req.params.exerciseId, OR: [{ coachId }, { coachId: null }] },
    });
    if (!source) {
      res.status(404).json({ error: "That exercise no longer exists." });
      return;
    }
    // "Bench Press" -> "Bench Press (copy)", then "(copy 2)", so copying twice never 409s.
    let name = `${source.name} (copy)`.slice(0, 100);
    for (let n = 2; await prisma.exercise.findFirst({ where: { coachId, name } }); n++) {
      name = `${source.name} (copy ${n})`.slice(0, 100);
    }
    const item = await prisma.exercise.create({
      data: {
        coachId,
        name,
        equipment: source.equipment,
        muscleGroup: source.muscleGroup,
        mediaUrl: source.mediaUrl,
        instructions: source.instructions,
      },
    });
    res.status(201).json(publicExercise(item));
  }),
);
