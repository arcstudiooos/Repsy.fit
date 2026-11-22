// Assignments API - see "API contract" in CLAUDE.md.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { allowedExerciseIds, deriveStructure, writeSections } from "../workouts/persist.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient, validationMessage } from "./clients.js";
import {
  StructureSchema,
  estimateSeconds,
  parseDetails,
  renderDetails,
  type SectionInput,
} from "../workouts/structure.js";

export const ASSIGNMENT_TYPES = ["Workout", "Nutrition", "Habit", "Recovery"] as const;
export const ASSIGNMENT_SOURCES = ["ai", "manual"] as const;
export const ASSIGNMENT_STATUSES = ["Active", "Done", "Paused"] as const;

/** Today as "YYYY-MM-DD" (UTC). */
export const today = () => new Date().toISOString().slice(0, 10);

/** True for a real calendar date in "YYYY-MM-DD" form (rejects e.g. 2026-02-30). */
export function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const NewAssignmentSchema = z.object({
  type: z.enum(ASSIGNMENT_TYPES, { error: "type is required." }),
  title: z.string({ error: "title is required." }).trim().min(1, "title can't be empty."),
  details: z.string({ error: "details is required." }).trim().min(1, "details can't be empty."),
  reasoning: z.string().trim().default(""),
  source: z.enum(ASSIGNMENT_SOURCES).default("manual"),
  status: z.enum(ASSIGNMENT_STATUSES).default("Active"),
  /** Prompt 80: meals from the coach's own library, for Nutrition plans only (checked against the coach). */
  mealIds: z.array(z.string().min(1).max(40), { error: "mealIds must be a list of meal ids." }).max(10, "Attach at most 10 meals.").optional(),
  date: z
    .string()
    .refine(isDateString, "date must be a real date in YYYY-MM-DD form.")
    .default(today),
});

const StatusSchema = z.object({
  status: z.enum(ASSIGNMENT_STATUSES, { error: "status is required." }),
});

/** Nov 2026: the Plans "Edit" form. Only these four fields; type, source, status, client and coach never change here. */
const EditSchema = z
  .object({
    title: z.string().trim().min(1, "title can't be empty.").max(200, "title can be up to 200 characters."),
    details: z.string().trim().min(1, "details can't be empty.").max(6000, "details can be up to 6000 characters."),
    reasoning: z.string().trim().max(2000, "reasoning can be up to 2000 characters."),
    date: z.string().refine(isDateString, "date must be a real date in YYYY-MM-DD form."),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Send a status, or a title, details, reasoning or date to change.");

/**
 * This client's assignment with this id, or a 404 already sent (client checked first, then
 * the assignment must belong to that client and coach).
 */
async function findClientAssignment(req: Request, res: Response) {
  const { clientId, assignmentId } = req.params as { clientId: string; assignmentId: string };
  const coachId = coachIdOf(req);
  const client = await findClient(clientId, coachId);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return null;
  }
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, clientId: client.id, coachId },
  });
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return null;
  }
  return assignment;
}

// Mounted at /api/clients/:clientId/assignments
export const assignmentsRouter = Router({ mergeParams: true });

// GET /api/clients/:clientId/assignments - that client's assignments, newest first.
assignmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { clientId } = req.params as { clientId: string };
    const coachId = coachIdOf(req);
    const client = await findClient(clientId, coachId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const assignments = await prisma.assignment.findMany({
      where: { clientId: client.id, coachId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    res.json(assignments);
  }),
);

// POST /api/clients/:clientId/assignments - create one assignment for that client.
// clientId comes from the path and coachId is set by the server (never from the body).
assignmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = NewAssignmentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { clientId } = req.params as { clientId: string };
    const coachId = coachIdOf(req);
    const client = await findClient(clientId, coachId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const mealIds = [...new Set(parsed.data.mealIds ?? [])];
    if (mealIds.length > 0) {
      if (parsed.data.type !== "Nutrition") {
        res.status(400).json({ error: "Meals can only be attached to a Nutrition plan." });
        return;
      }
      // Only this coach's own meals: another coach's meal id is the same 400 as an unknown one.
      const owned = await prisma.meal.count({ where: { id: { in: mealIds }, coachId } });
      if (owned !== mealIds.length) {
        res.status(400).json({ error: "One of the meals was not found in your library." });
        return;
      }
    }
    const { mealIds: _ignored, ...fields } = parsed.data;
    const assignment = await prisma.assignment.create({
      data: { ...fields, ...(mealIds.length > 0 ? { mealIds } : {}), clientId: client.id, coachId },
    });
    // Inspo A1/A2: if the words already read as a structured workout - which is how the AI writes
    // them - give it real structure too, so the builder opens on it. Best-effort by design: it
    // never rewrites `details` and never fails the save.
    await deriveStructure(assignment);
    res.status(201).json(assignment);
  }),
);

// PATCH /api/clients/:clientId/assignments/:assignmentId - returns the full assignment. Two kinds of body:
// with `status` it changes the status only (Active / Done / Paused; any other field is ignored, as before);
// without `status` it edits `title`, `details`, `reasoning` and / or `date` (at least one, nothing else).
assignmentsRouter.patch(
  "/:assignmentId",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (typeof body === "object" && body !== null && !("status" in body)) {
      const edit = EditSchema.safeParse(body);
      if (!edit.success) {
        res.status(400).json({ error: validationMessage(edit.error) });
        return;
      }
      const found = await findClientAssignment(req, res);
      if (!found) return;
      const { title, details, reasoning, date } = edit.data;
      const edited = await prisma.assignment.update({
        where: { id: found.id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(details !== undefined ? { details } : {}),
          ...(reasoning !== undefined ? { reasoning } : {}),
          ...(date !== undefined ? { date } : {}),
        },
      });
      res.json(edited);
      return;
    }
    const parsed = StatusSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const assignment = await findClientAssignment(req, res);
    if (!assignment) return;
    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      // Prompt 79: record who completed it. Re-marking Done keeps the original completion (and the
      // client's effort / note); moving it out of Done clears who / when and the client's effort / note.
      data:
        parsed.data.status === "Done"
          ? assignment.status === "Done"
            ? { status: "Done" }
            : { status: "Done", completedAt: new Date(), completedBy: "coach" }
          : { status: parsed.data.status, completedAt: null, completedBy: null, clientEffort: null, clientNote: "", clientSetLog: Prisma.DbNull },
    });
    res.json(updated);
  }),
);

// DELETE /api/clients/:clientId/assignments/:assignmentId - 204, no body.
assignmentsRouter.delete(
  "/:assignmentId",
  asyncHandler(async (req, res) => {
    const assignment = await findClientAssignment(req, res);
    if (!assignment) return;
    await prisma.assignment.delete({ where: { id: assignment.id } });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Structured workouts (Inspo W3, Nov 2026)
// ---------------------------------------------------------------------------

/** Rows -> the SectionInput shape the schema and renderer speak. */
const toSectionInput = (s: {
  protocol: string;
  sets: number;
  restSec: number;
  durationSec: number | null;
  notes: string;
  exercises: {
    exerciseId: string | null;
    name: string;
    repsPerSet: number[];
    loadPerSet: string[];
    durationSec: number | null;
    distanceM: number | null;
    rpe: number | null;
    restSec: number;
    notes: string;
    recordFields: string[];
  }[];
}): SectionInput =>
  ({
    protocol: s.protocol,
    sets: s.sets,
    restSec: s.restSec,
    durationSec: s.durationSec,
    notes: s.notes,
    exercises: s.exercises.map((e) => ({ ...e })),
  }) as SectionInput;

// GET /api/clients/:clientId/assignments/:assignmentId/structure
//
// Always answers with a structure. When the assignment has no stored sections - every plan written
// before Nov 2026, and every AI/prose plan - `details` is parsed on demand instead, so the
// structured view works for the whole back catalogue. `stored` says which happened.
assignmentsRouter.get(
  "/:assignmentId/structure",
  asyncHandler(async (req, res) => {
    const assignment = await findClientAssignment(req, res);
    if (!assignment) return;
    const rows = await prisma.workoutSection.findMany({
      where: { assignmentId: assignment.id },
      orderBy: { order: "asc" },
      include: { exercises: { orderBy: { order: "asc" } } },
    });
    const stored = rows.length > 0;
    const sections = stored ? rows.map(toSectionInput) : parseDetails(assignment.details);
    res.json({ stored, sections, estimatedSeconds: estimateSeconds(sections) });
  }),
);

// PUT /api/clients/:clientId/assignments/:assignmentId/structure
//
// Replaces the structure wholesale and REGENERATES `details` from it, so every older reader (the
// client app checklist, exports, the AI) keeps seeing a plan it understands. Sending an empty
// section list clears the structure and leaves `details` alone - `details` goes back to being the
// source of truth for that assignment.
assignmentsRouter.put(
  "/:assignmentId/structure",
  asyncHandler(async (req, res) => {
    const assignment = await findClientAssignment(req, res);
    if (!assignment) return;
    const parsed = StructureSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      // Not validationMessage(): its "sections.0.exercises.0.name:" prefix is meaningless to a
      // coach. Every message in StructureSchema is already a whole sentence, so send just that,
      // naming the section when there is more than one to look at.
      const issue = parsed.error.issues[0];
      const sectionNo = typeof issue.path[1] === "number" ? issue.path[1] + 1 : null;
      const where = sectionNo && (parsed.error.issues.length > 1 || sectionNo > 1) ? ` (section ${sectionNo})` : "";
      res.status(400).json({ error: `${issue.message}${where}` });
      return;
    }
    const { sections } = parsed.data;

    // Any exerciseId must be one this coach can actually see: their own, or Repsy stock. An id that
    // is not is kept as a plain name rather than rejected, so one stale id never fails the save.
    const allowed = await allowedExerciseIds(assignment.coachId, sections);

    const details = renderDetails(sections);
    await prisma.$transaction(async (tx) => {
      // Replace rather than diff: a workout is small, and this keeps `order` contiguous for free.
      await writeSections(tx, assignment.id, sections, allowed);
      // Only overwrite `details` when there is something to render: clearing the structure must not
      // wipe the words a coach typed.
      if (sections.length) {
        await tx.assignment.update({ where: { id: assignment.id }, data: { details } });
      }
    });

    res.json({
      stored: sections.length > 0,
      sections,
      estimatedSeconds: estimateSeconds(sections),
      details: sections.length ? details : assignment.details,
    });
  }),
);
