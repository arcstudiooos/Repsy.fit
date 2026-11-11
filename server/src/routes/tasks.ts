// Today's Tasks for the Home tab (Prompt 48) - see "API contract" in CLAUDE.md.
// Every row is computed from the signed-in coach's real clients and assignments; nothing is invented.
import { Router } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler } from "./clients.js";
import { isDateString, today } from "./assignments.js";

/** A client with no assignment dated in the last IDLE_DAYS days (or ahead) needs a new plan. */
const IDLE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00.000Z`).getTime() / DAY_MS);

type DueTask = {
  kind: "due";
  clientId: string;
  clientName: string;
  assignmentId: string;
  assignmentType: string;
  text: string;
};
type IdleTask = { kind: "idle"; clientId: string; clientName: string; daysSince: number | null; text: string };

export const tasksRouter = Router();

// GET /api/tasks/today?date=YYYY-MM-DD (default today UTC; the UI sends its local date).
tasksRouter.get(
  "/today",
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
      select: { id: true, name: true },
    });
    const assignments = await prisma.assignment.findMany({
      where: { coachId },
      select: { id: true, clientId: true, type: true, title: true, status: true, date: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const due: DueTask[] = [];
    const idle: IdleTask[] = [];
    for (const client of clients) {
      const mine = assignments.filter((a) => a.clientId === client.id);
      for (const a of mine) {
        if (a.date === date && a.status === "Active") {
          due.push({
            kind: "due",
            clientId: client.id,
            clientName: client.name,
            assignmentId: a.id,
            assignmentType: a.type,
            text: `${a.type} due today: ${a.title}`,
          });
        }
      }
      // Latest plan date, today or ahead counts as covered.
      const latest = mine.reduce<string | null>((best, a) => (best === null || a.date > best ? a.date : best), null);
      if (latest === null) {
        idle.push({ kind: "idle", clientId: client.id, clientName: client.name, daysSince: null, text: "No assignment yet" });
      } else {
        const daysSince = dayNumber(date) - dayNumber(latest);
        if (daysSince >= IDLE_DAYS) {
          idle.push({
            kind: "idle",
            clientId: client.id,
            clientName: client.name,
            daysSince,
            text: `No assignment in ${daysSince} days`,
          });
        }
      }
    }
    res.json({ date, tasks: [...due, ...idle] });
  }),
);
