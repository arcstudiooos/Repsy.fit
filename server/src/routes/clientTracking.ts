// The client's own tracking (Prompt 80) - see "API contract" in CLAUDE.md. Mounted at /api/client-auth,
// every route behind requireActiveClient and scoped to the signed-in client's OWN records:
//   habits (tick today / yesterday), the daily check-in (today / yesterday), the weekly check-in
//   (a ProgressLog that goes to the coach's review queue, exactly like a coach-entered one), their
//   targets, and the meals on a Nutrition plan.
// "Today / yesterday" is the CLIENT's local calendar: the app sends its local date in the
// X-Client-Date header, which the server accepts only within UTC today -1 ... +1 (every real timezone).
// Allowed dates are exactly that day and the day before. Without the header, UTC today is used.
// A client never edits or deletes a coach-entered record, and never back-fills further.
// Prompt 81 adds the client's body measurements (any past date; delete only their own).
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { clientAccountIdOf, requireActiveClient } from "../auth/clientSession.js";
import { rateLimit } from "../auth/rateLimit.js";
import { addDays, GRID_DAYS, habitStreaks, lastDays } from "../habits.js";
import { isDateString } from "./assignments.js";
import { asyncHandler, validationMessage } from "./clients.js";
import { NewMeasurementSchema } from "./measurements.js";
import { CheckInSchema } from "./dailyCheckIns.js";
import { checkInSummary, NewProgressLogSchema } from "./progress.js";
import { strictWith } from "../validation.js";

export const TOO_FAR_BACK = "You can only log today or yesterday.";
export const COACH_ENTERED = "Your coach already logged this day, so it can't be changed here.";
export const ALREADY_SENT = "You already sent a check-in today.";
const BAD_DATE = "date must be a real date in YYYY-MM-DD form.";

/** The client's local "today": the X-Client-Date header when it is a real date within a day of UTC today. */
export function clientToday(req: Request, now = new Date()): string {
  const utcToday = now.toISOString().slice(0, 10);
  const h = req.get("x-client-date");
  if (typeof h === "string" && isDateString(h) && h >= addDays(utcToday, -1) && h <= addDays(utcToday, 1)) return h;
  return utcToday;
}

/** True for the client's today or yesterday. */
export function isRecentDay(date: string, today: string): boolean {
  return date === today || date === addDays(today, -1);
}

export const clientTrackingRouter = Router();
clientTrackingRouter.use(
  ["/my-habits", "/my-checkins", "/my-progress", "/my-targets", "/my-measurements"],
  requireActiveClient,
  rateLimit("client-tracking", { keyOf: (req) => `client:${req.clientAccountId}`, max: 300 }),
);

/** The client's coach id (every tracking row stores it). Null when the client has no coach. */
async function coachOf(req: Request, res: Response): Promise<{ id: string; coachId: string } | null> {
  const c = await prisma.client.findUnique({ where: { id: clientAccountIdOf(req) }, select: { id: true, coachId: true } });
  if (!c?.coachId) {
    res.status(404).json({ error: "Your account was not found. Please ask your coach." });
    return null;
  }
  return { id: c.id, coachId: c.coachId };
}

// ---------- habits ----------

// GET /api/client-auth/my-habits?date=YYYY-MM-DD -> { date, days, habits: [{ id, name, week, currentStreak, bestStreak }] }
clientTrackingRouter.get(
  "/my-habits",
  asyncHandler(async (req, res) => {
    const date = req.query.date === undefined ? new Date().toISOString().slice(0, 10) : String(req.query.date);
    if (!isDateString(date)) return void res.status(400).json({ error: BAD_DATE });
    const habits = await prisma.habit.findMany({
      where: { clientId: clientAccountIdOf(req), active: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, logs: { where: { done: true }, select: { date: true } } },
    });
    const days = lastDays(date, GRID_DAYS);
    res.json({
      date,
      days,
      habits: habits.map(({ logs, id, name }) => {
        const done = logs.map((l) => l.date);
        const { current, best } = habitStreaks(done, date);
        return { id, name, week: days.map((d) => done.includes(d)), currentStreak: current, bestStreak: best };
      }),
    });
  }),
);

const TickSchema = strictWith(
z
  .object({ done: z.boolean({ error: "done must be true or false." }) })
, "Only done can be sent.");

// PUT /api/client-auth/my-habits/:habitId/:date { done } -> { habitId, date, done }. Own active habits only.
clientTrackingRouter.put(
  "/my-habits/:habitId/:date",
  asyncHandler(async (req, res) => {
    const { habitId, date } = req.params;
    if (!isDateString(date)) return void res.status(400).json({ error: BAD_DATE });
    if (!isRecentDay(date, clientToday(req))) return void res.status(400).json({ error: TOO_FAR_BACK });
    const parsed = TickSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const habit = await prisma.habit.findFirst({ where: { id: habitId, clientId: clientAccountIdOf(req), active: true }, select: { id: true } });
    if (!habit) return void res.status(404).json({ error: "Habit not found" });
    const existing = await prisma.habitLog.findUnique({ where: { habitId_date: { habitId: habit.id, date } }, select: { enteredBy: true } });
    if (existing?.enteredBy === "coach") return void res.status(409).json({ error: COACH_ENTERED });
    const log = await prisma.habitLog.upsert({
      where: { habitId_date: { habitId: habit.id, date } },
      create: { habitId: habit.id, date, done: parsed.data.done, enteredBy: "client" },
      update: { done: parsed.data.done },
    });
    res.json({ habitId: log.habitId, date: log.date, done: log.done });
  }),
);

// ---------- daily check-in ----------

const CHECKIN_SELECT = { enteredBy: true, date: true, energy: true, mood: true, sleepHours: true, recoveryScore: true, waterLiters: true, steps: true, foodNote: true } as const;

// GET /api/client-auth/my-checkins/:date -> { checkIn: {...} | null }
clientTrackingRouter.get(
  "/my-checkins/:date",
  asyncHandler(async (req, res) => {
    const { date } = req.params;
    if (!isDateString(date)) return void res.status(400).json({ error: BAD_DATE });
    const checkIn = await prisma.dailyCheckIn.findUnique({
      where: { clientId_date: { clientId: clientAccountIdOf(req), date } },
      select: CHECKIN_SELECT,
    });
    res.json({ checkIn });
  }),
);

/** The coach's check-in fields and rules, without `date` (it comes from the path). */
const ClientCheckInSchema = strictWith(CheckInSchema.omit({ date: true }), "Only the check-in fields can be sent.");
const nullish = <T>(v: T | null | undefined) => (v === undefined ? null : v);

// PUT /api/client-auth/my-checkins/:date { energy?, mood?, sleepHours?, recoveryScore?, waterLiters?, steps?, foodNote? }
// -> the saved check-in (201 new / 200 updated). Today or yesterday only. Saving the day again updates it.
clientTrackingRouter.put(
  "/my-checkins/:date",
  asyncHandler(async (req, res) => {
    const { date } = req.params;
    if (!isDateString(date)) return void res.status(400).json({ error: BAD_DATE });
    if (!isRecentDay(date, clientToday(req))) return void res.status(400).json({ error: TOO_FAR_BACK });
    const parsed = ClientCheckInSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const me = await coachOf(req, res);
    if (!me) return;
    const { foodNote, ...rest } = parsed.data;
    const values = {
      energy: nullish(rest.energy),
      mood: nullish(rest.mood),
      sleepHours: nullish(rest.sleepHours),
      recoveryScore: nullish(rest.recoveryScore),
      waterLiters: nullish(rest.waterLiters),
      steps: nullish(rest.steps),
      foodNote: foodNote ?? "",
    };
    const existing = await prisma.dailyCheckIn.findUnique({ where: { clientId_date: { clientId: me.id, date } }, select: { id: true, enteredBy: true } });
    if (existing?.enteredBy === "coach") return void res.status(409).json({ error: COACH_ENTERED });
    const saved = await prisma.dailyCheckIn.upsert({
      where: { clientId_date: { clientId: me.id, date } },
      create: { clientId: me.id, coachId: me.coachId, date, ...values, enteredBy: "client" },
      update: values,
      select: CHECKIN_SELECT,
    });
    res.status(existing ? 200 : 201).json(saved);
  }),
);

// ---------- weekly check-in (progress log) ----------

const LOG_SELECT = { id: true, date: true, weightKg: true, adherence: true, workoutsDone: true, note: true, createdAt: true } as const;

// GET /api/client-auth/my-progress -> the client's own progress logs, oldest first.
clientTrackingRouter.get(
  "/my-progress",
  asyncHandler(async (req, res) => {
    const logs = await prisma.progressLog.findMany({
      where: { clientId: clientAccountIdOf(req) },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: LOG_SELECT,
    });
    res.json(logs);
  }),
);

const ClientProgressSchema = strictWith(
  NewProgressLogSchema.extend({
    note: z.string().trim().max(500, "Please keep the note under 500 characters.").default(""),
  }),
  "Only date, weightKg, adherence, workoutsDone and note can be sent.",
);

// POST /api/client-auth/my-progress { date, weightKg?, adherence?, workoutsDone?, note? } -> 201 the log.
// Same rules as the coach's form; the log goes to the coach's review queue like any other check-in.
clientTrackingRouter.post(
  "/my-progress",
  asyncHandler(async (req, res) => {
    const parsed = ClientProgressSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    if (!isRecentDay(parsed.data.date, clientToday(req))) return void res.status(400).json({ error: TOO_FAR_BACK });
    const me = await coachOf(req, res);
    if (!me) return;
    // One weekly check-in per day from the client (a double tap must not queue two reviews).
    const dup = await prisma.progressLog.findFirst({
      where: { clientId: me.id, date: parsed.data.date, enteredBy: "client" },
      select: { id: true },
    });
    if (dup) return void res.status(409).json({ error: ALREADY_SENT });
    const log = await prisma.progressLog.create({
      data: { enteredBy: "client", ...parsed.data, clientId: me.id, coachId: me.coachId },
      select: LOG_SELECT,
    });
    try {
      await prisma.reviewItem.create({
        data: {
          coachId: me.coachId,
          clientId: me.id,
          kind: "checkin",
          title: `Check-in ${log.date} (from client)`,
          summary: checkInSummary(log),
          sourceId: log.id,
        },
      });
    } catch (err) {
      console.error(`Could not queue client check-in ${log.id} for review: ${(err as Error).message}`);
    }
    res.status(201).json(log);
  }),
);

// ---------- targets ----------

// GET /api/client-auth/my-targets -> { calorieTarget, proteinTargetG, weeklyCheckInDay }
clientTrackingRouter.get(
  "/my-targets",
  asyncHandler(async (req, res) => {
    const c = await prisma.client.findUnique({
      where: { id: clientAccountIdOf(req) },
      select: { calorieTarget: true, proteinTargetG: true, weeklyCheckInDay: true },
    });
    if (!c) return void res.status(404).json({ error: "Your account was not found. Please ask your coach." });
    res.json(c);
  }),
);

// ---------- Prompt 81: body measurements ----------

const MEASUREMENT_SELECT = {
  id: true,
  date: true,
  waistCm: true,
  chestCm: true,
  armCm: true,
  hipCm: true,
  bodyFatPercent: true,
  note: true,
  createdBy: true,
  createdAt: true,
} as const;
const ClientMeasurementSchema = strictWith(NewMeasurementSchema, "Only date, waistCm, chestCm, armCm, hipCm, bodyFatPercent and note can be sent.");
export const MEASUREMENT_NOT_FOUND = "Measurement not found";

// GET /api/client-auth/my-measurements -> the client's own measurements, newest first.
clientTrackingRouter.get(
  "/my-measurements",
  asyncHandler(async (req, res) => {
    const items = await prisma.measurement.findMany({
      where: { clientId: clientAccountIdOf(req) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: MEASUREMENT_SELECT,
    });
    res.json(items);
  }),
);

// POST /api/client-auth/my-measurements -> 201, saved under the client's coach as createdBy "client".
// Same fields and validation as the coach route; any past date is fine (a tape measure log, not a check-in).
clientTrackingRouter.post(
  "/my-measurements",
  asyncHandler(async (req, res) => {
    const parsed = ClientMeasurementSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: validationMessage(parsed.error) });
    if (parsed.data.date > clientToday(req)) return void res.status(400).json({ error: "date can't be in the future." });
    const values = [parsed.data.waistCm, parsed.data.chestCm, parsed.data.armCm, parsed.data.hipCm, parsed.data.bodyFatPercent];
    if (values.every((v) => v == null)) return void res.status(400).json({ error: "Enter at least one measurement." });
    const me = await coachOf(req, res);
    if (!me) return;
    const item = await prisma.measurement.create({
      data: { ...parsed.data, clientId: me.id, coachId: me.coachId, createdBy: "client" },
      select: MEASUREMENT_SELECT,
    });
    res.status(201).json(item);
  }),
);

// DELETE /api/client-auth/my-measurements/:id -> 204; only a measurement this client added (404 otherwise,
// including the coach's own entries - the same answer as an unknown id).
clientTrackingRouter.delete(
  "/my-measurements/:id",
  asyncHandler(async (req, res) => {
    const { count } = await prisma.measurement.deleteMany({
      where: { id: String(req.params.id), clientId: clientAccountIdOf(req), createdBy: "client" },
    });
    if (count === 0) return void res.status(404).json({ error: MEASUREMENT_NOT_FOUND });
    res.status(204).end();
  }),
);
