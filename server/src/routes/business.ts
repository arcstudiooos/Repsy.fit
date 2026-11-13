// Business tab (Prompt 68): client plans and recorded payments - see "API contract" in CLAUDE.md.
// RECORD-KEEPING ONLY: no payment gateway, no payment links, no automatic charging, no reminders.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { BILLING_CYCLES, PAYMENT_METHODS, PLAN_STATUSES, advanceDueDate, dayOf, type BillingCycle } from "../billing.js";
import { Prisma } from "@prisma/client";
import { loadEngagement, rankEngagement } from "../engagement.js";
import { asyncHandler, findClient } from "./clients.js";
import { isDateString } from "./assignments.js";

export const MAX_AMOUNT = 10_000_000;

/** `what` is the plain word shown to the coach ("price", "amount"). Messages are shown as written. */
const amount = (what: string) => {
  const aWhat = /^[aeiou]/i.test(what) ? `an ${what}` : `a ${what}`;
  return (
  z
    .number({ error: (issue) => (issue.input === undefined ? `Please enter the ${what}.` : `Please enter the ${what} as a number.`) })
    // At least 0.01: a "positive" float like 0.000000005 would otherwise pass and show as 0.00.
    .refine((n) => Math.round(n * 100) >= 1, `Please enter ${aWhat} of at least 0.01.`)
    .refine((n) => n <= MAX_AMOUNT, `Please enter ${aWhat} of ${MAX_AMOUNT.toLocaleString("en")} or less.`)
    // Float-safe "at most 2 decimals" (19.99 * 100 is 1998.9999999999998 in floating point).
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, `Please use at most 2 decimals for the ${what}.`)
  );
};

const date = (what: string) =>
  z.string({ error: `Please choose the ${what}.` }).refine(isDateString, `Please choose a real ${what}.`);

const PlanSchema = z
  .object({
    planName: z.string({ error: "Please name the plan." }).trim().min(1, "Please name the plan.").max(100, "Please use a plan name under 100 characters."),
    priceAmount: amount("price"),
    billingCycle: z.enum(BILLING_CYCLES, { error: "Please choose Monthly, Quarterly, Yearly or One-time." }),
    startDate: date("start date"),
    /** Defaults to startDate for a new plan. Only sent when the coach sets or changes it. */
    nextDueDate: date("next due date").optional(),
    status: z.enum(PLAN_STATUSES, { error: "Please choose Active, Paused or Ended." }).optional(),
  })
  .refine((p) => !p.nextDueDate || p.nextDueDate >= p.startDate, "The next due date can't be before the start date.");

const PaymentSchema = z.object({
  amount: amount("amount"),
  paidOn: date("payment date"),
  method: z.enum(PAYMENT_METHODS, { error: "Please choose Cash, UPI, Card, Bank or Other." }),
  note: z.string().trim().max(500, "Please keep the note under 500 characters.").optional(),
});

/** The first problem, as written for the coach (no field-name prefix). */
const firstMessage = (error: z.ZodError) => error.issues[0]?.message ?? "Please check the form.";
export const PLAN_ENDED = "This plan has ended. Set it back to Active to record a payment.";

async function clientOr404(req: Request, res: Response) {
  const { clientId } = req.params as { clientId: string };
  const client = await findClient(clientId, coachIdOf(req));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return null;
  }
  return client;
}

// ----- /api/business -----
export const businessRouter = Router();

// GET /api/business/plans -> { currency, plans: [{ client: { id, name }, plan, lastPayment }] }
// Every client of this coach that has a plan, with the newest recorded payment (if any).
businessRouter.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const [coach, plans] = await Promise.all([
      prisma.coach.findUnique({ where: { id: coachId }, select: { currency: true } }),
      prisma.clientPlan.findMany({
        where: { coachId },
        orderBy: [{ nextDueDate: "asc" }, { id: "asc" }],
        include: {
          client: { select: { id: true, name: true } },
          payments: { orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], take: 1, select: { amount: true, paidOn: true, method: true } },
        },
      }),
    ]);
    res.json({
      currency: coach?.currency ?? "INR",
      plans: plans.map(({ client, payments, ...plan }) => ({ client, plan, lastPayment: payments[0] ?? null })),
    });
  }),
);

// GET /api/business/engagement?date=YYYY-MM-DD (Prompt 71) -> { date, clients: [{ clientId, clientName, rank,
// checkInStreak, habitPercent, workoutsThisWeek, enoughData }] }. Coach roster, ranked by check-in streak and
// then habit %; `rank` is null ("Not enough data yet") for a client with nothing logged.
businessRouter.get(
  "/engagement",
  asyncHandler(async (req, res) => {
    const raw = req.query.date;
    const date = raw === undefined ? new Date().toISOString().slice(0, 10) : typeof raw === "string" && isDateString(raw) ? raw : null;
    if (!date) {
      res.status(400).json({ error: "date must be a real date in YYYY-MM-DD form." });
      return;
    }
    res.json({ date, clients: rankEngagement(await loadEngagement({ coachId: coachIdOf(req) }, date)) });
  }),
);

// ----- /api/clients/:clientId/plan -----
export const clientPlanRouter = Router({ mergeParams: true });

// GET -> the client's plan or null.
clientPlanRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    res.json(await prisma.clientPlan.findUnique({ where: { clientId: client.id } }));
  }),
);

// PUT { planName, priceAmount, billingCycle, startDate, nextDueDate?, status? } -> create (201) or update (200).
clientPlanRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = PlanSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: firstMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const coachId = coachIdOf(req);
    const { nextDueDate, status, ...fields } = parsed.data;
    // Setting a due date also sets the plan's due day (anchorDay) from it.
    const update = { ...fields, ...(nextDueDate ? { nextDueDate, anchorDay: dayOf(nextDueDate) } : {}), ...(status ? { status } : {}) };
    const existing = await prisma.clientPlan.findUnique({ where: { clientId: client.id } });
    if (existing) {
      // The stored due date must not end up before a newly edited start date.
      if (!nextDueDate && existing.nextDueDate < fields.startDate) {
        res.status(400).json({ error: "The next due date can't be before the start date." });
        return;
      }
      res.json(await prisma.clientPlan.update({ where: { id: existing.id }, data: update }));
      return;
    }
    try {
      const firstDue = nextDueDate ?? fields.startDate;
      const plan = await prisma.clientPlan.create({
        data: { ...fields, coachId, clientId: client.id, nextDueDate: firstDue, anchorDay: dayOf(firstDue), status: status ?? "Active" },
      });
      res.status(201).json(plan);
    } catch (err) {
      // Two "add plan" saves at once: the second finds the plan the first just made, so update it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.json(await prisma.clientPlan.update({ where: { clientId: client.id }, data: update }));
        return;
      }
      throw err;
    }
  }),
);

// GET /payments -> this client's recorded payments, newest first.
clientPlanRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    res.json(
      await prisma.payment.findMany({
        where: { clientId: client.id, coachId: coachIdOf(req) },
        orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
      }),
    );
  }),
);

// POST /payments { amount, paidOn, method, note? } -> 201 { payment, plan }.
// Records the payment and, for an Active plan, moves nextDueDate on by one billing cycle (One-time
// plans do not move; a Paused plan records the payment without moving; an Ended plan is refused).
// One transaction holding a lock on the plan row, so two saves at once advance it twice, not once.
clientPlanRouter.post(
  "/payments",
  asyncHandler(async (req, res) => {
    const parsed = PaymentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: firstMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const coachId = coachIdOf(req);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "client_plans" WHERE "clientId" = ${client.id} FOR UPDATE`;
      const plan = await tx.clientPlan.findUnique({ where: { clientId: client.id } });
      if (!plan || plan.coachId !== coachId) return "no-plan" as const;
      if (plan.status === "Ended") return "ended" as const;
      const payment = await tx.payment.create({
        data: { ...parsed.data, note: parsed.data.note ?? "", coachId, clientId: client.id, clientPlanId: plan.id },
      });
      const next =
        plan.status === "Active"
          ? advanceDueDate(plan.nextDueDate, plan.billingCycle as BillingCycle, plan.anchorDay)
          : plan.nextDueDate;
      const updated = next === plan.nextDueDate ? plan : await tx.clientPlan.update({ where: { id: plan.id }, data: { nextDueDate: next } });
      return { payment, plan: updated };
    });
    if (result === "no-plan") {
      res.status(400).json({ error: "This client has no plan yet. Add a plan first." });
      return;
    }
    if (result === "ended") {
      res.status(400).json({ error: PLAN_ENDED });
      return;
    }
    res.status(201).json(result);
  }),
);
