// Daily check-ins (Prompt 53) - see "API contract" in CLAUDE.md.
// One row per client per day: saving the same date again UPDATES that day, so a client can never
// have two check-ins for one day. Coach-side in v2; the client's own entry arrives later.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient, validationMessage } from "./clients.js";
import { isDateString } from "./assignments.js";

export const CHECKIN_WINDOW_DAYS = 14;

// Mounted at /api/clients/:clientId/checkins
export const dailyCheckInsRouter = Router({ mergeParams: true });

const oneToFive = (field: string) =>
  z
    .number({ error: `${field} must be a whole number from 1 to 5.` })
    .int(`${field} must be a whole number from 1 to 5.`)
    .min(1, `${field} must be a whole number from 1 to 5.`)
    .max(5, `${field} must be a whole number from 1 to 5.`)
    .nullish();

const SLEEP_MESSAGE = "sleepHours must be a number of hours from 0 to 16, with at most one decimal.";

export const CheckInSchema = z.object({
  date: z
    .string({ error: "date is required." })
    .refine(isDateString, "date must be a real date in YYYY-MM-DD form."),
  energy: oneToFive("energy"),
  mood: oneToFive("mood"),
  sleepHours: z
    .number({ error: SLEEP_MESSAGE })
    .min(0, SLEEP_MESSAGE)
    .max(16, SLEEP_MESSAGE)
    .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, SLEEP_MESSAGE) // one decimal at most
    .nullish(),
  recoveryScore: oneToFive("recoveryScore"),
  waterLiters: z
    .number({ error: "waterLiters must be a number from 0 to 20." })
    .min(0, "waterLiters must be a number from 0 to 20.")
    .max(20, "waterLiters must be a number from 0 to 20.")
    .nullish(),
  steps: z
    .number({ error: "steps must be a whole number from 0 to 100000." })
    .int("steps must be a whole number from 0 to 100000.")
    .min(0, "steps must be a whole number from 0 to 100000.")
    .max(100_000, "steps must be a whole number from 0 to 100000.")
    .nullish(),
  foodNote: z.string().trim().max(1000, "foodNote must be 1000 characters or fewer.").optional(),
});

/** The client when it belongs to the signed-in coach; otherwise replies 404 and returns null. */
async function clientOr404(req: Request, res: Response) {
  const { clientId } = req.params as { clientId: string };
  const client = await findClient(clientId, coachIdOf(req));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return null;
  }
  return client;
}

const nullish = <T>(v: T | null | undefined) => (v === undefined ? null : v);

// GET /api/clients/:clientId/checkins?days=14 - newest first, the last N days (1-90, default 14).
dailyCheckInsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const raw = Number(req.query.days ?? CHECKIN_WINDOW_DAYS);
    const days = Number.isInteger(raw) && raw >= 1 && raw <= 90 ? raw : null;
    if (days === null) {
      res.status(400).json({ error: "days must be a whole number from 1 to 90." });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const checkIns = await prisma.dailyCheckIn.findMany({
      where: { clientId: client.id, coachId: coachIdOf(req) },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: days,
    });
    res.json(checkIns);
  }),
);

// POST /api/clients/:clientId/checkins - saves one day. The same date again updates that row
// (201 for a new day, 200 when it replaced an existing one), so there is never a second row.
dailyCheckInsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = CheckInSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const coachId = coachIdOf(req);
    const { date, foodNote, ...rest } = parsed.data;
    const values = {
      energy: nullish(rest.energy),
      mood: nullish(rest.mood),
      sleepHours: nullish(rest.sleepHours),
      recoveryScore: nullish(rest.recoveryScore),
      waterLiters: nullish(rest.waterLiters),
      steps: nullish(rest.steps),
      foodNote: foodNote ?? "",
    };
    const existing = await prisma.dailyCheckIn.findUnique({ where: { clientId_date: { clientId: client.id, date } } });
    const saved = await prisma.dailyCheckIn.upsert({
      where: { clientId_date: { clientId: client.id, date } },
      create: { clientId: client.id, coachId, date, ...values, enteredBy: "coach" },
      update: { ...values, enteredBy: "coach" },
    });
    res.status(existing ? 200 : 201).json(saved);
  }),
);
