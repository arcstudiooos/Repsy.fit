// Reports and export (Prompt 70) - see "CSV exports" and the API contract in CLAUDE.md.
// Everything is read through the same coach-scoped queries as the rest of the app (clientId AND coachId).
// Never included: photos, coach notes (client notes / focus, log and measurement notes) or AI chat.
import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { CLIENT_EXPORT_TYPES, CSV_COLUMNS, toCsv, type ClientExportType } from "../csv.js";
import { asyncHandler, findClient } from "./clients.js";
import { isDateString } from "./assignments.js";

const ASSIGNMENT_TYPES = ["Workout", "Nutrition", "Habit", "Recovery"] as const;

export const reportsRouter = Router();

type Range = { from?: string; to?: string };

/** `from` / `to` (both optional, YYYY-MM-DD, inclusive), or null with a 400 already sent. */
function rangeOr400(req: Request, res: Response): Range | null {
  const range: Range = {};
  for (const key of ["from", "to"] as const) {
    const value = req.query[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || !isDateString(value)) {
      res.status(400).json({ error: `Please choose a real ${key === "from" ? "start" : "end"} date.` });
      return null;
    }
    range[key] = value;
  }
  if (range.from && range.to && range.from > range.to) {
    res.status(400).json({ error: "The start date can't be after the end date." });
    return null;
  }
  return range;
}

/** Prisma filter for a YYYY-MM-DD string column. */
const dateFilter = (field: string, { from, to }: Range) =>
  from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

async function clientOr404(req: Request, res: Response) {
  const { clientId } = req.params as { clientId: string };
  const client = await findClient(clientId, coachIdOf(req));
  if (!client) res.status(404).json({ error: "Client not found" });
  return client;
}

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(csv);
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";
const today = () => new Date().toISOString().slice(0, 10);

// GET /api/reports/roster -> CSV of all this coach's clients with plan status and next due date.
reportsRouter.get(
  "/roster",
  asyncHandler(async (req, res) => {
    const clients = await prisma.client.findMany({
      where: { coachId: coachIdOf(req), joinStatus: "active" }, // Prompt 84
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        name: true,
        goal: true,
        level: true,
        plan: { select: { planName: true, status: true, billingCycle: true, priceAmount: true, nextDueDate: true } },
      },
    });
    const rows = clients.map(({ plan, ...c }) => ({
      ...c,
      planName: plan?.planName,
      planStatus: plan ? plan.status : "No plan",
      billingCycle: plan?.billingCycle,
      priceAmount: plan?.priceAmount,
      nextDueDate: plan?.nextDueDate,
    }));
    sendCsv(res, `roster-${today()}.csv`, toCsv(CSV_COLUMNS.roster, rows));
  }),
);

// GET /api/reports/clients/:clientId/export/:type?from&to -> CSV (progress | measurements | payments | assignments).
reportsRouter.get(
  "/clients/:clientId/export/:type",
  asyncHandler(async (req, res) => {
    const type = req.params.type as ClientExportType;
    if (!CLIENT_EXPORT_TYPES.includes(type)) {
      res.status(400).json({ error: "Please choose progress, measurements, payments or assignments." });
      return;
    }
    const range = rangeOr400(req, res);
    if (!range) return;
    const client = await clientOr404(req, res);
    if (!client) return;
    const scope = { clientId: client.id, coachId: coachIdOf(req) };
    const asc = [{ date: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }];
    const rows =
      type === "progress"
        ? await prisma.progressLog.findMany({ where: { ...scope, ...dateFilter("date", range) }, orderBy: asc })
        : type === "measurements"
          ? await prisma.measurement.findMany({ where: { ...scope, ...dateFilter("date", range) }, orderBy: asc })
          : type === "assignments"
            ? await prisma.assignment.findMany({ where: { ...scope, ...dateFilter("date", range) }, orderBy: asc })
            : await prisma.payment.findMany({
                where: { ...scope, ...dateFilter("paidOn", range) },
                orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
              });
    sendCsv(res, `${slug(client.name)}-${type}.csv`, toCsv(CSV_COLUMNS[type], rows));
  }),
);

const average = (values: (number | null)[]) => {
  const have = values.filter((v): v is number => v !== null);
  return have.length === 0 ? null : Math.round((have.reduce((a, b) => a + b, 0) / have.length) * 10) / 10;
};

// GET /api/reports/clients/:clientId/progress-report?from&to -> the data for the printable progress report.
// Only what a client may see: details, progress numbers, measurements, assignment counts, check-in averages.
reportsRouter.get(
  "/clients/:clientId/progress-report",
  asyncHandler(async (req, res) => {
    const range = rangeOr400(req, res);
    if (!range) return;
    const client = await clientOr404(req, res);
    if (!client) return;
    const scope = { clientId: client.id, coachId: coachIdOf(req) };
    const asc = [{ date: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }];
    const [logs, measurements, assignments, checkIns] = await Promise.all([
      prisma.progressLog.findMany({ where: { ...scope, ...dateFilter("date", range) }, orderBy: asc }),
      prisma.measurement.findMany({ where: { ...scope, ...dateFilter("date", range) }, orderBy: asc }),
      prisma.assignment.findMany({ where: { ...scope, ...dateFilter("date", range) }, select: { type: true, status: true } }),
      prisma.dailyCheckIn.findMany({ where: { ...scope, ...dateFilter("date", range) } }),
    ]);
    res.json({
      client: { name: client.name, goal: client.goal, age: client.age, weightKg: client.weightKg, heightCm: client.heightCm, level: client.level },
      range: { from: range.from ?? null, to: range.to ?? null },
      logs: logs.map((l) => ({ date: l.date, weightKg: l.weightKg, adherence: l.adherence, workoutsDone: l.workoutsDone })),
      measurements: measurements.map((m) => ({
        date: m.date,
        waistCm: m.waistCm,
        chestCm: m.chestCm,
        armCm: m.armCm,
        hipCm: m.hipCm,
        bodyFatPercent: m.bodyFatPercent,
      })),
      assignments: {
        total: assignments.length,
        done: assignments.filter((a) => a.status === "Done").length,
        byType: ASSIGNMENT_TYPES.map((type) => ({ type, count: assignments.filter((a) => a.type === type).length })),
      },
      checkIns: {
        count: checkIns.length,
        energy: average(checkIns.map((c) => c.energy)),
        mood: average(checkIns.map((c) => c.mood)),
        sleepHours: average(checkIns.map((c) => c.sleepHours)),
        recoveryScore: average(checkIns.map((c) => c.recoveryScore)),
        waterLiters: average(checkIns.map((c) => c.waterLiters)),
        steps: average(checkIns.map((c) => c.steps)),
      },
    });
  }),
);
