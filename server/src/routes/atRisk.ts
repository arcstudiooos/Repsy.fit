// "Needs attention" card for the Home tab (Prompt 50) - see "API contract" in CLAUDE.md.
// Read-only: loads the signed-in coach's clients and progress logs and hands them to the rules in ../atRisk.ts.
import { Router } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { findAtRiskClients } from "../atRisk.js";
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
      where: { coachId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, goal: true, createdAt: true },
    });
    const logs = await prisma.progressLog.findMany({
      where: { coachId },
      select: { clientId: true, date: true, weightKg: true, adherence: true },
    });
    const clientsOut = findAtRiskClients(
      clients.map((client) => ({ client, logs: logs.filter((l) => l.clientId === client.id) })),
      date,
    );
    res.json({ date, clients: clientsOut });
  }),
);
