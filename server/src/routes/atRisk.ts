// "Needs attention" card for the Home tab (Prompt 50) - see "API contract" in CLAUDE.md.
// Read-only: loads the signed-in coach's clients and progress logs and hands them to the rules in ../atRisk.ts.
import { Router } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { findAtRiskClients } from "../atRisk.js";
import { SLEEP_WINDOW_DAYS } from "../sleep.js";
import { addDays } from "../habits.js";
import { asyncHandler } from "./clients.js";
import { isDateString, today } from "./assignments.js";

export const atRiskRouter = Router();

// GET /api/at-risk?date=YYYY-MM-DD (default today UTC; the UI sends its local date) -> { date, clients }.
atRiskRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const raw = req.query.date;
    const date = raw === undefined ? today() : typeof raw === "string" && isDateString(raw) ? raw : null;
    if (!date) {
      res.status(400).json({ error: "date must be a real date in YYYY-MM-DD form." });
      return;
    }
    const coachId = coachIdOf(req);
    const clients = await prisma.client.findMany({
      where: { coachId, joinStatus: "active" }, // Prompt 84
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, goal: true, createdAt: true },
    });
    const logs = await prisma.progressLog.findMany({
      where: { coachId },
      select: { clientId: true, date: true, weightKg: true, adherence: true },
    });
    // Only the week the sleep rule can use, so this does not grow with the coach's whole history.
    const sleepFrom = addDays(date, -(SLEEP_WINDOW_DAYS - 1));
    const nights = await prisma.dailyCheckIn.findMany({
      where: { coachId, sleepHours: { not: null }, date: { gte: sleepFrom, lte: date } },
      select: { clientId: true, date: true, sleepHours: true },
    });
    const clientsOut = findAtRiskClients(
      clients.map((client) => ({
        client,
        logs: logs.filter((l) => l.clientId === client.id),
        sleep: nights.filter((n) => n.clientId === client.id),
      })),
      date,
    );
    res.json({ date, clients: clientsOut });
  }),
);
