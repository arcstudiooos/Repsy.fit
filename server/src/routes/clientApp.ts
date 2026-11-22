// The client app's own plans (Prompt 79) - see "API contract" in CLAUDE.md. Mounted at /api/client-auth.
// Every route uses requireActiveClient: a signed-in, APPROVED client, reading only their OWN assignments.
// Paused plans are never shown. A client can only mark a plan done / not done (with effort and a note) -
// never change its title, details, date, type or anything else the coach wrote.
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { rateLimit } from "../auth/rateLimit.js";
import { clientAccountIdOf, requireActiveClient } from "../auth/clientSession.js";
import { isDateString } from "./assignments.js";
import { asyncHandler } from "./clients.js";
import { strictWith } from "../validation.js";

export const MAX_WINDOW_DAYS = 62;
export const NOT_FOUND = "Plan not found";

/** What a client sees of a plan: no coach id, no source (AI / manual), nothing about other clients. */
export const CLIENT_ASSIGNMENT_SELECT = {
  id: true,
  type: true,
  title: true,
  details: true,
  reasoning: true,
  status: true,
  date: true,
  completedAt: true,
  completedBy: true,
  clientEffort: true,
  clientNote: true,
  clientSetLog: true,
} as const;

const dayIndex = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;

export const clientAppRouter = Router();

// GET /api/client-auth/my-assignments?from=YYYY-MM-DD&to=YYYY-MM-DD -> own Active + Done plans in the
// window (inclusive, at most 62 days), oldest first.
clientAppRouter.get(
  "/my-assignments",
  requireActiveClient,
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    if (typeof from !== "string" || typeof to !== "string" || !isDateString(from) || !isDateString(to)) {
      return void res.status(400).json({ error: "from and to must be real dates in YYYY-MM-DD form." });
    }
    if (to < from) return void res.status(400).json({ error: "from must not be after to." });
    if (dayIndex(to) - dayIndex(from) + 1 > MAX_WINDOW_DAYS) {
      return void res.status(400).json({ error: `Please ask for ${MAX_WINDOW_DAYS} days or fewer at a time.` });
    }
    const assignments = await prisma.assignment.findMany({
      where: { clientId: clientAccountIdOf(req), status: { in: ["Active", "Done"] }, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: CLIENT_ASSIGNMENT_SELECT,
    });
    res.json(assignments);
  }),
);

// GET /api/client-auth/my-assignments/:id -> one own Active / Done plan; 404 otherwise (also Paused,
// and any other client's plan).
clientAppRouter.get(
  "/my-assignments/:id",
  requireActiveClient,
  asyncHandler(async (req, res) => {
    const row = await prisma.assignment.findFirst({
      where: { id: req.params.id, clientId: clientAccountIdOf(req), status: { in: ["Active", "Done"] } },
      select: { ...CLIENT_ASSIGNMENT_SELECT, mealIds: true, coachId: true },
    });
    if (!row) return void res.status(404).json({ error: NOT_FOUND });
    // Prompt 80: a Nutrition plan's meals, from the plan's own coach's library only.
    const { mealIds, coachId, ...a } = row;
    const ids = mealIds ?? [];
    const meals =
      ids.length > 0 && coachId
        ? await prisma.meal.findMany({
            where: { id: { in: ids }, coachId },
            select: { id: true, name: true, mealType: true, calories: true, proteinG: true, carbsG: true, fatG: true },
          })
        : [];
    // Keep the coach's order.
    meals.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));

    res.json({ ...a, meals });
  }),
);

/** One set the client actually did. Weights are kg; the client app converts for display. */
const LoggedSetSchema = z.object({
  done: z.boolean({ error: "Each set's done must be true or false." }),
  reps: z.string({ error: "Logged reps must be text." }).trim().max(24, "Please keep logged reps under 24 characters.").nullable(),
  weightKg: z
    .number({ error: "Logged weight must be a number in kg." })
    .min(0, "Logged weight must be between 0 and 1000 kg.")
    .max(1000, "Logged weight must be between 0 and 1000 kg.")
    .nullable(),
});

/** The whole workout's log. Bounded so a client cannot post an unbounded blob. */
const SetLogSchema = z.object({
  exercises: z
    .array(
      z.object({
        seq: z.number().int().min(1).max(200),
        name: z.string().trim().max(120),
        plannedSets: z.number().int().min(0).max(30),
        plannedReps: z.string().trim().max(24),
        plannedWeightKg: z.number().min(0).max(1000).nullable(),
        sets: z.array(LoggedSetSchema).max(30, "Please log 30 sets or fewer per exercise."),
      }),
    )
    .max(40, "Please log 40 exercises or fewer."),
});

const DoneSchema = strictWith(
z
  .object({
    done: z.boolean({ error: "done must be true or false." }),
    effort: z
      .number({ error: "Effort must be a whole number from 1 to 10." })
      .int("Effort must be a whole number from 1 to 10.")
      .min(1, "Effort must be a whole number from 1 to 10.")
      .max(10, "Effort must be a whole number from 1 to 10.")
      .nullable()
      .optional(),
    note: z.string({ error: "The note must be text." }).trim().max(500, "Please keep the note under 500 characters.").optional(),
    setLog: SetLogSchema.nullable().optional(),
  })
, "Only done, effort, note and setLog can be sent.");

// POST /api/client-auth/my-assignments/:id/done { done, effort?, note?, setLog? } -> the updated plan.
//   done: true  -> status Done, completedAt now, completedBy "client", the effort, note and per-set
//                  log saved (an already-Done plan is returned unchanged)
//   done: false -> status Active, completion, effort, note and the per-set log cleared
clientAppRouter.post(
  "/my-assignments/:id/done",
  requireActiveClient,
  rateLimit("client-done", { keyOf: (req) => `client:${req.clientAccountId}`, max: 120 }),
  asyncHandler(async (req, res) => {
    const parsed = DoneSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const { done, effort, note, setLog } = parsed.data;
    const clientId = clientAccountIdOf(req);
    // One conditional write: only this client's own, not-Paused plan can change (no read-then-write gap).
    // Marking done only completes a plan that is still Active: an already-Done plan keeps who finished it
    // (the coach or the client) and when.
    const result = await prisma.assignment.updateMany({
      where: { id: req.params.id, clientId, status: done ? "Active" : { in: ["Active", "Done"] } },
      data: done
        ? { status: "Done", completedAt: new Date(), completedBy: "client", clientEffort: effort ?? null, clientNote: note ?? "", clientSetLog: setLog ? (setLog as Prisma.InputJsonValue) : Prisma.DbNull }
        : { status: "Active", completedAt: null, completedBy: null, clientEffort: null, clientNote: "", clientSetLog: Prisma.DbNull },
    });
    if (result.count !== 1) {
      const already = done
        ? await prisma.assignment.findFirst({ where: { id: req.params.id, clientId, status: "Done" }, select: CLIENT_ASSIGNMENT_SELECT })
        : null;
      if (already) return void res.json(already);
      return void res.status(404).json({ error: NOT_FOUND });
    }
    const a = await prisma.assignment.findFirst({ where: { id: req.params.id, clientId }, select: CLIENT_ASSIGNMENT_SELECT });
    res.json(a);
  }),
);
