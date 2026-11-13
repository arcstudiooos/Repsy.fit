// Appointments (Prompt 69): the coach's schedule - see "API contract" in CLAUDE.md.
// Times are UTC instants: the client sends ISO times (a "Z" or an offset; both are converted to UTC)
// and shows them in the viewer's local timezone. No reminders, no video calls, no calendar sync.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, MAX_APPOINTMENT_MS } from "../appointments.js";
import { asyncHandler, findClient } from "./clients.js";

const time = (what: string) =>
  z
    .string({ error: `Please choose the ${what}.` })
    .datetime({ offset: true, message: `Please choose a real ${what}.` })
    .transform((s) => new Date(s));

const AppointmentFields = z.object({
  clientId: z.string({ error: "Please choose a client." }).min(1, "Please choose a client."),
  title: z.string({ error: "Please add a title." }).trim().min(1, "Please add a title.").max(100, "Please use a title under 100 characters."),
  type: z.enum(APPOINTMENT_TYPES, { error: "Please choose Session, Call, Check-in review or Other." }),
  startsAt: time("start time"),
  endsAt: time("end time"),
  location: z.string().trim().max(300, "Please keep the location or link under 300 characters.").optional(),
  status: z.enum(APPOINTMENT_STATUSES, { error: "Please choose Booked, Done, Cancelled or No-show." }).optional(),
  note: z.string().trim().max(1000, "Please keep the note under 1000 characters.").optional(),
});

const END_AFTER_START = "The end time must be after the start time.";
const TOO_LONG = "An appointment can last at most 24 hours.";

/** Start / end together make sense (checked again against the stored value when only one is sent). */
function timesProblem(startsAt: Date, endsAt: Date): string | null {
  if (endsAt.getTime() <= startsAt.getTime()) return END_AFTER_START;
  if (endsAt.getTime() - startsAt.getTime() > MAX_APPOINTMENT_MS) return TOO_LONG;
  return null;
}

const CreateSchema = AppointmentFields.superRefine((a, ctx) => {
  // zod 4 still runs object-level checks when a field failed its own rules, so the values here are
  // not guaranteed to be Dates yet: that field's own error is already on the pile, so skip.
  if (!(a.startsAt instanceof Date) || !(a.endsAt instanceof Date)) return;
  const problem = timesProblem(a.startsAt, a.endsAt);
  if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["endsAt"] });
});
const UpdateSchema = AppointmentFields.partial().refine((a) => Object.keys(a).length > 0, "Nothing to change.");

const RangeSchema = z.object({
  from: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
  to: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
});

const firstMessage = (error: z.ZodError) => error.issues[0]?.message ?? "Please check the form.";

/** The record as the coach sees it: the client's name rides along so the week view needs one call. */
function present<T extends { client?: { name: string } }>(row: T) {
  const { client, ...rest } = row;
  return { ...rest, clientName: client?.name ?? "" };
}

export const appointmentsRouter = Router();

// GET /api/appointments?from=<ISO>&to=<ISO> -> Appointment[] starting in [from, to), oldest first.
appointmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const range = RangeSchema.safeParse(req.query);
    if (!range.success || range.data.to <= range.data.from) {
      res.status(400).json({ error: "from and to must be ISO date-times, with to after from." });
      return;
    }
    const rows = await prisma.appointment.findMany({
      where: { coachId: coachIdOf(req), startsAt: { gte: range.data.from, lt: range.data.to } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      include: { client: { select: { name: true } } },
    });
    res.json(rows.map(present));
  }),
);

// POST -> 201 Appointment. The client must belong to this coach.
appointmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: firstMessage(parsed.error) });
      return;
    }
    const coachId = coachIdOf(req);
    const client = await findClient(parsed.data.clientId, coachId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const created = await prisma.appointment.create({
      data: {
        coachId,
        clientId: client.id,
        title: parsed.data.title,
        type: parsed.data.type,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        location: parsed.data.location ?? "",
        status: parsed.data.status ?? "Booked",
        note: parsed.data.note ?? "",
      },
    });
    res.status(201).json(present({ ...created, client: { name: client.name } }));
  }),
);

// PATCH any of the fields above (at least one) -> Appointment. 404 "Appointment not found" also for another coach's row.
appointmentsRouter.patch(
  "/:appointmentId",
  asyncHandler(async (req, res) => {
    const parsed = UpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: firstMessage(parsed.error) });
      return;
    }
    const coachId = coachIdOf(req);
    const { appointmentId } = req.params;
    const existing = await prisma.appointment.findFirst({ where: { id: appointmentId, coachId } });
    if (!existing) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    const problem = timesProblem(parsed.data.startsAt ?? existing.startsAt, parsed.data.endsAt ?? existing.endsAt);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }
    if (parsed.data.clientId !== undefined && !(await findClient(parsed.data.clientId, coachId))) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data: parsed.data,
      include: { client: { select: { name: true } } },
    });
    res.json(present(updated));
  }),
);

// DELETE -> 204.
appointmentsRouter.delete(
  "/:appointmentId",
  asyncHandler(async (req, res) => {
    const existing = await prisma.appointment.findFirst({ where: { id: req.params.appointmentId, coachId: coachIdOf(req) } });
    if (!existing) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    await prisma.appointment.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
