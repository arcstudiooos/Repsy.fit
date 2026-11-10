// Clients API - see "API contract" in CLAUDE.md.
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

/** Placeholder coach until login exists. Every record belongs to this coach. */
export const DEFAULT_COACH_ID = "default-coach";

export const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

const NewClientSchema = z.object({
  name: z.string({ required_error: "Name is required." }).trim().min(1, "Name is required.").max(100),
  goal: z.string().trim().min(1, "Goal can't be empty.").max(100).optional(), // free text; default "General fitness"
  level: z.enum(LEVELS).optional(),
  age: z.number().int().min(1).max(120).nullable().optional(),
  weightKg: z.number().positive().max(500).nullable().optional(),
  heightCm: z.number().positive().max(300).nullable().optional(),
  focus: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(), // notes for AI
});

/** First validation problem, in plain words: "level: Invalid enum value..." */
export function validationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

// Express 4 does not catch errors from async handlers; pass them to the error handler.
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** This coach's client with this id, or null (other coaches' clients are never returned). */
export function findClient(clientId: string) {
  return prisma.client.findFirst({ where: { id: clientId, coachId: DEFAULT_COACH_ID } });
}

export const clientsRouter = Router();

// GET /api/clients - this coach's clients, oldest first.
clientsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const clients = await prisma.client.findMany({
      where: { coachId: DEFAULT_COACH_ID },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    res.json(clients);
  }),
);

// POST /api/clients - create a client. coachId is always set by the server.
clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = NewClientSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const client = await prisma.client.create({ data: { ...parsed.data, coachId: DEFAULT_COACH_ID } });
    res.status(201).json(client);
  }),
);

// GET /api/clients/:clientId - one client.
clientsRouter.get(
  "/:clientId",
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findFirst({
      where: { id: req.params.clientId, coachId: DEFAULT_COACH_ID },
    });
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json(client);
  }),
);

// DELETE /api/clients/:clientId - deletes the client and (via ON DELETE CASCADE) all of
// their assignments, chat messages and progress logs.
clientsRouter.delete(
  "/:clientId",
  asyncHandler(async (req, res) => {
    const { count } = await prisma.client.deleteMany({
      where: { id: req.params.clientId, coachId: DEFAULT_COACH_ID },
    });
    if (count === 0) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.status(204).end();
  }),
);
