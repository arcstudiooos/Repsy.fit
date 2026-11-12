// Home alerts about clients (Prompt 84) - see "API contract" in CLAUDE.md. Read-only, computed from real
// rows on each request (no email or push): clients who joined with the code in the last 7 days, plans a
// client finished in the last 24 hours (with their effort and note), unread client messages per client,
// and how many clients are waiting for approval.
import { Router } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler } from "./clients.js";

export const JOINED_WINDOW_DAYS = 7;
export const FINISHED_WINDOW_HOURS = 24;
const DAY = 86_400_000;

export const alertsRouter = Router();

// GET /api/alerts -> { waiting, joined: [{ clientId, name, at }], finished: [{ clientId, clientName,
//   assignmentId, title, type, effort, note, at }], unread: [{ clientId, name, count }] }
alertsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const now = Date.now();
    const [waiting, joined, finished, unread] = await Promise.all([
      prisma.client.count({ where: { coachId, joinStatus: "pending" } }),
      prisma.client.findMany({
        where: { coachId, joinedVia: "code", joinStatus: "active", createdAt: { gte: new Date(now - JOINED_WINDOW_DAYS * DAY) } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.assignment.findMany({
        where: { coachId, status: "Done", completedBy: "client", completedAt: { gte: new Date(now - FINISHED_WINDOW_HOURS * 3_600_000) }, client: { joinStatus: "active" } },
        orderBy: { completedAt: "desc" },
        take: 20,
        select: { id: true, title: true, type: true, clientEffort: true, clientNote: true, completedAt: true, client: { select: { id: true, name: true } } },
      }),
      prisma.threadMessage.groupBy({ by: ["clientId"], where: { coachId, sender: "client", readAt: null }, _count: { _all: true } }),
    ]);
    const names = unread.length
      ? new Map((await prisma.client.findMany({ where: { coachId, joinStatus: "active", id: { in: unread.map((u) => u.clientId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]))
      : new Map<string, string>();
    res.json({
      waiting,
      joined: joined.map((c) => ({ clientId: c.id, name: c.name, at: c.createdAt.toISOString() })),
      finished: finished.map((a) => ({
        clientId: a.client.id,
        clientName: a.client.name,
        assignmentId: a.id,
        title: a.title,
        type: a.type,
        effort: a.clientEffort,
        note: a.clientNote,
        at: a.completedAt!.toISOString(),
      })),
      unread: unread
        .filter((u) => names.has(u.clientId))
        .map((u) => ({ clientId: u.clientId, name: names.get(u.clientId)!, count: u._count._all }))
        .sort((a, b) => b.count - a.count),
    });
  }),
);
