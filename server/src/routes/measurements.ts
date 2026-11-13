// Body measurements (Prompt 56) - see "API contract" in CLAUDE.md.
// The coach logs waist / chest / arm / hip (cm), body fat (%) and a note for one client on a date.
// Weight is not stored here: the chart reads it from the progress logs. Coach-side in v2.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient, validationMessage } from "./clients.js";
import { isDateString } from "./assignments.js";

/** Largest tape measurement accepted (cm) and largest body-fat figure accepted (%): catches typos. */
export const MAX_TAPE_CM = 300;
export const MAX_BODY_FAT_PERCENT = 75;

const tape = (name: string) =>
  z
    .number({ error: `${name} must be a number.` })
    .positive(`${name} must be more than 0 and at most ${MAX_TAPE_CM}.`)
    .max(MAX_TAPE_CM, `${name} must be more than 0 and at most ${MAX_TAPE_CM}.`)
    .nullable()
    .optional();

export const NewMeasurementSchema = z.object({
  date: z
    .string({ error: "date is required." })
    .refine(isDateString, "date must be a real date in YYYY-MM-DD form."),
  waistCm: tape("waistCm"),
  chestCm: tape("chestCm"),
  armCm: tape("armCm"),
  hipCm: tape("hipCm"),
  bodyFatPercent: z
    .number({ error: "bodyFatPercent must be a number." })
    .positive(`bodyFatPercent must be more than 0 and at most ${MAX_BODY_FAT_PERCENT}.`)
    .max(MAX_BODY_FAT_PERCENT, `bodyFatPercent must be more than 0 and at most ${MAX_BODY_FAT_PERCENT}.`)
    .nullable()
    .optional(),
  note: z.string().trim().max(500, "note must be 500 characters or fewer.").default(""),
});

/** The client from the path, or null with a 404 already sent. */
async function clientOr404(req: Request, res: Response) {
  const { clientId } = req.params as { clientId: string };
  const client = await findClient(clientId, coachIdOf(req));
  if (!client) res.status(404).json({ error: "Client not found" });
  return client;
}

// Mounted at /api/clients/:clientId/measurements
export const measurementsRouter = Router({ mergeParams: true });

// GET /api/clients/:clientId/measurements - that client's measurements, NEWEST first.
measurementsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    const items = await prisma.measurement.findMany({
      where: { clientId: client.id, coachId: coachIdOf(req) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    res.json(items);
  }),
);

// POST /api/clients/:clientId/measurements - add one (201). clientId comes from the path and coachId
// from the session, never from the body.
measurementsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = NewMeasurementSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const item = await prisma.measurement.create({
      data: { ...parsed.data, clientId: client.id, coachId: coachIdOf(req), createdBy: "coach" },
    });
    res.status(201).json(item);
  }),
);

// DELETE /api/clients/:clientId/measurements/:measurementId - 204, no body.
measurementsRouter.delete(
  "/:measurementId",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    const { measurementId } = req.params as { measurementId: string };
    // One scoped delete: a second delete of the same row (double tap, two tabs) gets 404, not 500.
    const { count } = await prisma.measurement.deleteMany({
      where: { id: measurementId, clientId: client.id, coachId: coachIdOf(req) },
    });
    if (count === 0) {
      res.status(404).json({ error: "Measurement not found" });
      return;
    }
    res.status(204).end();
  }),
);
