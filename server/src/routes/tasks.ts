// Today's Tasks for the Home tab (Prompt 48) - see "API contract" in CLAUDE.md.
// Every row is computed from the signed-in coach's real clients and assignments; nothing is invented.
import { Router } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler } from "./clients.js";
import { isDateString, today } from "./assignments.js";
import { localDayRange } from "../appointments.js";

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
type AppointmentTask = {
  kind: "appointment";
  clientId: string;
  clientName: string;
  appointmentId: string;
  appointmentType: string;
  /** UTC instants (ISO); the UI shows them in the viewer's local time. */
  startsAt: string;
  endsAt: string;
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
    // `tz` = the viewer's Date.getTimezoneOffset() (minutes, UTC minus local), so "today" means the
    // coach's local day. Default 0 (UTC), like `date`.
    // `tzEnd` = the offset at the next local midnight (differs from `tz` only on a daylight-saving
    // change day, which is 23 or 25 hours long). Defaults to `tz`.
    const offset = (raw: unknown, fallback: number) =>
      raw === undefined ? fallback : typeof raw === "string" && /^-?\d{1,4}$/.test(raw) ? Number(raw) : NaN;
    const tz = offset(req.query.tz, 0);
    const tzEnd = offset(req.query.tzEnd, tz);
    if (![tz, tzEnd].every((m) => Number.isInteger(m) && Math.abs(m) <= 14 * 60)) {
      res.status(400).json({ error: "tz must be a whole number of minutes (the browser's timezone offset)." });
      return;
    }
    const coachId = coachIdOf(req);
    // Prompt 69: today's Booked appointments come first, soonest first.
    const [dayStart, dayEnd] = localDayRange(date, tz, tzEnd);
    const todays = await prisma.appointment.findMany({
      where: { coachId, status: "Booked", startsAt: { gte: dayStart, lt: dayEnd } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      include: { client: { select: { name: true } } },
    });
    const appointments: AppointmentTask[] = todays.map((a) => ({
      kind: "appointment",
      clientId: a.clientId,
      clientName: a.client.name,
      appointmentId: a.id,
      appointmentType: a.type,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      text: `${a.type}: ${a.title}`,
    }));
    const clients = await prisma.client.findMany({
      where: { coachId, joinStatus: "active" }, // Prompt 84: not people still waiting for approval
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
    res.json({ date, tasks: [...appointments, ...due, ...idle] });
  }),
);
