// New check-ins for the Home tab (Prompt 49) - see "API contract" in CLAUDE.md.
// Read-only summary of the signed-in coach's latest progress logs. Each item carries a `kind`, so the
// daily check-ins of Prompt 53 can be merged into the same list later without changing the UI contract.
import { Router } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler } from "./clients.js";

const WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_ROWS = 8;

export const checkinsRouter = Router();

// GET /api/checkins/recent -> { items: RecentCheckIn[] } (last 48 hours, newest first, max 8).
checkinsRouter.get(
  "/recent",
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - WINDOW_MS);
    const coachId = coachIdOf(req);
    const [logs, daily] = await Promise.all([
      prisma.progressLog.findMany({
        where: { coachId, createdAt: { gte: since } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_ROWS,
        select: {
          id: true,
          clientId: true,
          weightKg: true,
          adherence: true,
          workoutsDone: true,
          note: true,
          createdAt: true,
          client: { select: { name: true } },
        },
      }),
      // Prompt 53: daily check-ins join the same list. `updatedAt` is used, so a check-in edited
      // today counts as today's activity - which is what the coach expects to see.
      prisma.dailyCheckIn.findMany({
        where: { coachId, updatedAt: { gte: since } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: MAX_ROWS,
        select: {
          id: true,
          clientId: true,
          date: true,
          energy: true,
          mood: true,
          sleepHours: true,
          waterLiters: true,
          steps: true,
          foodNote: true,
          updatedAt: true,
          client: { select: { name: true } },
        },
      }),
    ]);

    const items = [
      ...logs.map((log) => ({
        kind: "progress" as const,
        id: log.id,
        clientId: log.clientId,
        clientName: log.client.name,
        createdAt: log.createdAt.toISOString(),
        weightKg: log.weightKg,
        adherence: log.adherence,
        workoutsDone: log.workoutsDone,
        note: log.note,
      })),
      ...daily.map((c) => ({
        kind: "daily" as const,
        id: c.id,
        clientId: c.clientId,
        clientName: c.client.name,
        createdAt: c.updatedAt.toISOString(),
        date: c.date,
        energy: c.energy,
        mood: c.mood,
        sleepHours: c.sleepHours,
        waterLiters: c.waterLiters,
        steps: c.steps,
        foodNote: c.foodNote,
      })),
    ]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, MAX_ROWS);

    res.json({ items });
  }),
);
