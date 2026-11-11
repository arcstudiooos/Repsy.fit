// Progress logs API - see "API contract" in CLAUDE.md.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { isDateString } from "./assignments.js";
import { DEMO_COACH_ID, asyncHandler, findClient, validationMessage } from "./clients.js";

const NewProgressLogSchema = z.object({
  date: z
    .string({ required_error: "date is required." })
    .refine(isDateString, "date must be a real date in YYYY-MM-DD form."),
  weightKg: z.number().positive("weightKg must be more than 0.").max(500).nullable().optional(),
  adherence: z
    .number()
    .int("adherence must be a whole number.")
    .min(0, "adherence must be between 0 and 100.")
    .max(100, "adherence must be between 0 and 100.")
    .nullable()
    .optional(),
  workoutsDone: z
    .number()
    .int("workoutsDone must be a whole number.")
    .min(0, "workoutsDone must be between 0 and 14.")
    .max(14, "workoutsDone must be between 0 and 14.")
    .nullable()
    .optional(),
  note: z.string().trim().default(""),
});

/** The client from the path, or null with a 404 already sent. */
async function clientOr404(req: Request, res: Response) {
  const { clientId } = req.params as { clientId: string };
  const client = await findClient(clientId);
  if (!client) res.status(404).json({ error: "Client not found" });
  return client;
}

// Mounted at /api/clients/:clientId/progress
export const progressRouter = Router({ mergeParams: true });

// GET /api/clients/:clientId/progress - that client's logs, OLDEST first (charts read left to right).
progressRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    const logs = await prisma.progressLog.findMany({
      where: { clientId: client.id, coachId: DEMO_COACH_ID },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    res.json(logs);
  }),
);

// POST /api/clients/:clientId/progress - add one weekly check-in. clientId comes from the path
// and coachId is set by the server (never from the body).
progressRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = NewProgressLogSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const log = await prisma.progressLog.create({
      data: { ...parsed.data, clientId: client.id, coachId: DEMO_COACH_ID },
    });
    res.status(201).json(log);
  }),
);

// DELETE /api/clients/:clientId/progress/:logId - 204, no body. The log must belong to this client.
progressRouter.delete(
  "/:logId",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    const { logId } = req.params as { logId: string };
    // One scoped delete: a second delete of the same log (double tap, two tabs) gets 404, not 500.
    const { count } = await prisma.progressLog.deleteMany({
      where: { id: logId, clientId: client.id, coachId: DEMO_COACH_ID },
    });
    if (count === 0) {
      res.status(404).json({ error: "Progress log not found" });
      return;
    }
    res.status(204).end();
  }),
);
