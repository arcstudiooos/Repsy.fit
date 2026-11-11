// Assignments API - see "API contract" in CLAUDE.md.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient, validationMessage } from "./clients.js";

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
  type: z.enum(ASSIGNMENT_TYPES, { required_error: "type is required." }),
  title: z.string({ required_error: "title is required." }).trim().min(1, "title can't be empty."),
  details: z.string({ required_error: "details is required." }).trim().min(1, "details can't be empty."),
  reasoning: z.string().trim().default(""),
  source: z.enum(ASSIGNMENT_SOURCES).default("manual"),
  status: z.enum(ASSIGNMENT_STATUSES).default("Active"),
  date: z
    .string()
    .refine(isDateString, "date must be a real date in YYYY-MM-DD form.")
    .default(today),
});

const StatusSchema = z.object({
  status: z.enum(ASSIGNMENT_STATUSES, { required_error: "status is required." }),
});

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
    const assignment = await prisma.assignment.create({
      data: { ...parsed.data, clientId: client.id, coachId },
    });
    res.status(201).json(assignment);
  }),
);

// PATCH /api/clients/:clientId/assignments/:assignmentId - change the status only
// (Active / Done / Paused); returns the full assignment.
assignmentsRouter.patch(
  "/:assignmentId",
  asyncHandler(async (req, res) => {
    const parsed = StatusSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const assignment = await findClientAssignment(req, res);
    if (!assignment) return;
    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: parsed.data.status },
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
