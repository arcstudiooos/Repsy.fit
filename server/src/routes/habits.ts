// Habit tracker (Prompt 54) - see "API contract" in CLAUDE.md.
// The coach adds up to 8 active habits per client, ticks days off, and archives habits that are
// no longer used (archive = `active: false`, so the history is kept). Coach-side in v2.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient, validationMessage } from "./clients.js";
import { isDateString } from "./assignments.js";
import { GRID_DAYS, MAX_ACTIVE_HABITS, habitStreaks, lastDays } from "../habits.js";

// Mounted at /api/clients/:clientId/habits
export const habitsRouter = Router({ mergeParams: true });

const LIMIT_MESSAGE = `A client can have up to ${MAX_ACTIVE_HABITS} habits. Archive one to add another.`;

const NameSchema = z
  .string({ required_error: "name is required." })
  .trim()
  .min(1, "name is required.")
  .max(60, "name must be 60 characters or fewer.");

const NewHabitSchema = z.object({ name: NameSchema });
const UpdateHabitSchema = z
  .object({ name: NameSchema.optional(), active: z.boolean({ invalid_type_error: "active must be true or false." }).optional() })
  .refine((v) => v.name !== undefined || v.active !== undefined, "Nothing to change: send a name or active.");
const LogSchema = z.object({ done: z.boolean({ required_error: "done is required.", invalid_type_error: "done must be true or false." }) });

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

/** The habit when it is this client's and this coach's; otherwise replies 404 and returns null. */
async function habitOr404(req: Request, res: Response, clientId: string) {
  const { habitId } = req.params as { habitId: string };
  const habit = await prisma.habit.findFirst({ where: { id: habitId, clientId, coachId: coachIdOf(req) } });
  if (!habit) {
    res.status(404).json({ error: "Habit not found" });
    return null;
  }
  return habit;
}

/**
 * Counting the active habits and then writing must not be two separate steps, or two adds at the
 * same moment could both pass the check and leave 9 active habits. Both happen inside one
 * transaction holding a per-client advisory lock, so the second add waits and then sees the first.
 */
async function withHabitLimit<T>(
  clientId: string,
  coachId: string,
  write: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>,
): Promise<T | "limit"> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`repsy:habits:${clientId}`}))`;
    const count = await tx.habit.count({ where: { clientId, coachId, active: true } });
    if (count >= MAX_ACTIVE_HABITS) return "limit";
    return write(tx);
  });
}

// GET /api/clients/:clientId/habits?date=YYYY-MM-DD - the this-week grid: the last 7 days ending
// `date` (default today UTC; the UI sends its local date), one row per ACTIVE habit with its
// ticks and its current / best streak.
habitsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const date = req.query.date === undefined ? new Date().toISOString().slice(0, 10) : String(req.query.date);
    if (!isDateString(date)) {
      res.status(400).json({ error: "date must be a real date in YYYY-MM-DD form." });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const coachId = coachIdOf(req);
    const habits = await prisma.habit.findMany({
      where: { clientId: client.id, coachId, active: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { logs: { where: { done: true }, select: { date: true, done: true } } },
    });
    const days = lastDays(date, GRID_DAYS);
    res.json({
      date,
      days,
      habits: habits.map(({ logs, ...habit }) => {
        const doneDates = logs.filter((l) => l.done).map((l) => l.date);
        const { current, best } = habitStreaks(doneDates, date);
        return { ...habit, week: days.map((d) => doneDates.includes(d)), currentStreak: current, bestStreak: best };
      }),
    });
  }),
);

// POST /api/clients/:clientId/habits - add a habit (201). At most 8 active per client.
habitsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = NewHabitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const coachId = coachIdOf(req);
    const habit = await withHabitLimit(client.id, coachId, (tx) =>
      tx.habit.create({ data: { clientId: client.id, coachId, name: parsed.data.name } }),
    );
    if (habit === "limit") {
      res.status(400).json({ error: LIMIT_MESSAGE });
      return;
    }
    res.status(201).json(habit);
  }),
);

// PATCH /api/clients/:clientId/habits/:habitId - rename and / or archive (active false) or restore.
habitsRouter.patch(
  "/:habitId",
  asyncHandler(async (req, res) => {
    const parsed = UpdateHabitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const habit = await habitOr404(req, res, client.id);
    if (!habit) return;
    const data: { name?: string; active?: boolean } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.active !== undefined) data.active = parsed.data.active;

    // Restoring an archived habit is also an add, so it goes through the same limit + lock.
    if (parsed.data.active === true && !habit.active) {
      const restored = await withHabitLimit(client.id, coachIdOf(req), (tx) =>
        tx.habit.update({ where: { id: habit.id }, data }),
      );
      if (restored === "limit") {
        res.status(400).json({ error: LIMIT_MESSAGE });
        return;
      }
      res.json(restored);
      return;
    }
    res.json(await prisma.habit.update({ where: { id: habit.id }, data }));
  }),
);

// PUT /api/clients/:clientId/habits/:habitId/logs/:date - tick a day done / not done (one row per day).
habitsRouter.put(
  "/:habitId/logs/:date",
  asyncHandler(async (req, res) => {
    const { date } = req.params as { date: string };
    if (!isDateString(date)) {
      res.status(400).json({ error: "date must be a real date in YYYY-MM-DD form." });
      return;
    }
    const parsed = LogSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const habit = await habitOr404(req, res, client.id);
    if (!habit) return;
    const { done } = parsed.data;
    const log = await prisma.habitLog.upsert({
      where: { habitId_date: { habitId: habit.id, date } },
      create: { habitId: habit.id, date, done, enteredBy: "coach" },
      update: { done, enteredBy: "coach" },
    });
    res.json({ habitId: log.habitId, date: log.date, done: log.done });
  }),
);
