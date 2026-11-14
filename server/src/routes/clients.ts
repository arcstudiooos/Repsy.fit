// Clients API - see "API contract" in CLAUDE.md.
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { coachIdOf } from "../auth/requireCoach.js";
import { prisma } from "../db.js";
import { refuseIfFull } from "../billing/limit.js";
import { strictWith } from "../validation.js";

// Every route here sits behind requireCoach (Prompt 45): all queries filter by the signed-in
// coach's id (coachIdOf(req)). Rows with coachId NULL (unclaimed demo data) are never returned.

export const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

const NewClientSchema = z.object({
  name: z.string({ error: "Name is required." }).trim().min(1, "Name is required.").max(100),
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
export function findClient(clientId: string, coachId: string) {
  return prisma.client.findFirst({ where: { id: clientId, coachId } });
}

export const clientsRouter = Router();

// GET /api/clients - this coach's ACTIVE clients, oldest first. Clients waiting for approval or declined
// (Prompt 84) are listed separately by GET /api/clients/waiting, so they never show up in the planner,
// AI Coach or client strip by accident.
clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const clients = await prisma.client.findMany({
      where: { coachId, joinStatus: "active" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (clients.length === 0) return void res.json(clients);
    // Client cards (Nov 2026): the last check-in day and recent adherence, from three grouped queries
    // for the whole roster (never one query per client).
    const ids = clients.map((c) => c.id);
    const since = new Date(Date.now() - ADHERENCE_CARD_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [daily, logs, adherence] = await Promise.all([
      prisma.dailyCheckIn.groupBy({ by: ["clientId"], where: { coachId, clientId: { in: ids } }, _max: { date: true } }),
      prisma.progressLog.groupBy({ by: ["clientId"], where: { coachId, clientId: { in: ids } }, _max: { date: true } }),
      prisma.progressLog.groupBy({
        by: ["clientId"],
        where: { coachId, clientId: { in: ids }, adherence: { not: null }, date: { gte: since } },
        _avg: { adherence: true },
      }),
    ]);
    const lastDaily = new Map(daily.map((r) => [r.clientId, r._max.date]));
    const lastLog = new Map(logs.map((r) => [r.clientId, r._max.date]));
    const avg = new Map(adherence.map((r) => [r.clientId, r._avg.adherence]));
    res.json(
      clients.map((c) => {
        const a = lastDaily.get(c.id) ?? null;
        const b = lastLog.get(c.id) ?? null;
        const mean = avg.get(c.id);
        return {
          ...c,
          lastCheckIn: a && b ? (a > b ? a : b) : (a ?? b),
          adherence: mean == null ? null : Math.round(mean),
        };
      }),
    );
  }),
);

/** Client cards show the average adherence of the progress logs dated within this many days. */
export const ADHERENCE_CARD_DAYS = 14;

// ---------- Prompt 84: approving clients who joined with the code ----------

export const ONLY_PENDING = "Only a client who is waiting for approval can be approved or declined.";
const WAITING_SELECT = { id: true, name: true, loginEmail: true, joinStatus: true, joinedVia: true, createdAt: true } as const;

// GET /api/clients/waiting -> [{ id, name, loginEmail, joinStatus: "pending" | "declined", joinedVia, createdAt }]
// Pending first (oldest first, so nobody waits longest), then declined.
clientsRouter.get(
  "/waiting",
  asyncHandler(async (req, res) => {
    const rows = await prisma.client.findMany({
      where: { coachId: coachIdOf(req), joinStatus: { in: ["pending", "declined"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: WAITING_SELECT,
    });
    res.json([...rows.filter((r) => r.joinStatus === "pending"), ...rows.filter((r) => r.joinStatus === "declined")]);
  }),
);

/** POST /api/clients/:clientId/approve | /decline -> the client. Only a pending client of this coach. */
function decide(to: "active" | "declined") {
  return asyncHandler(async (req, res) => {
    const { clientId } = req.params as { clientId: string };
    // Accepting someone is what fills a seat, so the limit is checked here rather than at the door.
    // Declining is always allowed: a coach at their limit must still be able to clear the queue.
    if (to === "active" && (await refuseIfFull(coachIdOf(req), res))) return;
    // One conditional update: a double click or two tabs can't flip a decided client again.
    const { count } = await prisma.client.updateMany({
      where: { id: clientId, coachId: coachIdOf(req), joinStatus: "pending" },
      data: { joinStatus: to },
    });
    if (count === 0) {
      const exists = await prisma.client.findFirst({ where: { id: clientId, coachId: coachIdOf(req) }, select: { id: true } });
      return void res.status(exists ? 409 : 404).json({ error: exists ? ONLY_PENDING : "Client not found" });
    }
    res.json(await prisma.client.findUnique({ where: { id: clientId }, select: WAITING_SELECT }));
  });
}
clientsRouter.post("/:clientId/approve", decide("active"));
clientsRouter.post("/:clientId/decline", decide("declined"));

// POST /api/clients - create a client. coachId is always set by the server.
clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = NewClientSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    // The plan's client limit. Refused BEFORE anything is written, so a full roster never leaves a
    // half-created client behind.
    if (await refuseIfFull(coachIdOf(req), res)) return;
    const client = await prisma.client.create({ data: { ...parsed.data, coachId: coachIdOf(req) } });
    res.status(201).json(client);
  }),
);

// GET /api/clients/:clientId - one client.
clientsRouter.get(
  "/:clientId",
  asyncHandler(async (req, res) => {
    const client = await findClient(req.params.clientId, coachIdOf(req));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json(client);
  }),
);

// DELETE /api/clients/:clientId - deletes the client and, by ON DELETE CASCADE, every record that
// belongs to them: assignments, AI chat messages, coach-client thread messages, progress logs,
// daily check-ins, habits (and their logs), measurements, invites, the plan (and its payments),
// payments, appointments and review items. Verified against the migration SQL in Prompt 73.
clientsRouter.delete(
  "/:clientId",
  asyncHandler(async (req, res) => {
    const { count } = await prisma.client.deleteMany({
      where: { id: req.params.clientId, coachId: coachIdOf(req) },
    });
    if (count === 0) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.status(204).end();
  }),
);

// PATCH /api/clients/:clientId/targets { calorieTarget, proteinTargetG } (Prompt 80) -> the client.
// The coach saves the macro calculator's result as the client's daily targets; null clears one. The ranges
// cover everything the calculator can produce (Prompt 80 review).
const TargetsSchema = strictWith(
z
  .object({
    calorieTarget: z
      .number({ error: "calorieTarget must be a whole number from 300 to 15000." })
      .int("calorieTarget must be a whole number from 300 to 15000.")
      .min(300, "calorieTarget must be a whole number from 300 to 15000.")
      .max(15000, "calorieTarget must be a whole number from 300 to 15000.")
      .nullable()
      .optional(),
    proteinTargetG: z
      .number({ error: "proteinTargetG must be a number from 0 to 1000." })
      .min(0, "proteinTargetG must be a number from 0 to 1000.")
      .max(1000, "proteinTargetG must be a number from 0 to 1000.")
      .nullable()
      .optional(),
  })
, "Only calorieTarget and proteinTargetG can be changed here.")
  .refine((v) => v.calorieTarget !== undefined || v.proteinTargetG !== undefined, "Nothing to change.");

clientsRouter.patch(
  "/:clientId/targets",
  asyncHandler(async (req, res) => {
    const parsed = TargetsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const client = await findClient(String(req.params.clientId), coachIdOf(req));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json(await prisma.client.update({ where: { id: client.id }, data: parsed.data }));
  }),
);
