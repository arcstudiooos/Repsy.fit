// Billing routes (Nov 2026): what the coach's own subscription screen talks to.
//
// The shape of the trust here matters. The browser can claim anything, so:
//   - /api/billing/me reads the database, never the browser.
//   - /api/billing/confirm takes a subscription id from the browser and ASKS PAYPAL what it is
//     before writing a single field. An invented id gets a 400.
//   - the webhook is the long-term source of truth: renewals, failures and cancellations all
//     arrive there, and it is verified with PayPal before it is believed.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler } from "./clients.js";
import { billingState, isPlanTier, PLAN_TIERS, type PlanTier } from "../billing/state.js";
import { cancelSubscription, getSubscription, listTransactions, paypalConfigured, planIdFor, tierForPlanId } from "../billing/paypal.js";

export const billingRouter = Router();

const BILLING_SELECT = {
  planTier: true,
  billingStatus: true,
  trialEndsAt: true,
  periodEndsAt: true,
  pastDueSince: true,
  paypalSubscriptionId: true,
} as const;

/** What the billing screen shows: the state, and the plan ids the checkout button needs. */
billingRouter.get("/me", asyncHandler(async (req: Request, res: Response) => {
  const coach = await prisma.coach.findUnique({ where: { id: coachIdOf(req) }, select: BILLING_SELECT });
  if (!coach) return res.status(404).json({ error: "We could not find your account." });
  const state = billingState(coach);
  res.json({
    ...state,
    // Plan ids are public (they appear in the PayPal checkout), the client id is too.
    paypal: paypalConfigured()
      ? {
          clientId: process.env.PAYPAL_CLIENT_ID,
          environment: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
          plans: Object.fromEntries(PLAN_TIERS.map((t: PlanTier) => [t, planIdFor(t)])),
          // Stamped onto the subscription at checkout so PayPal itself records who it belongs to.
          // /confirm then refuses any subscription whose custom_id is a different coach. Without
          // it, ownership rests only on "has someone else claimed this id already".
          customId: coachIdOf(req),
        }
      : null,
  });
}));

const ConfirmSchema = z.object({
  subscriptionId: z
    .string({ error: "We did not get a subscription from PayPal. Please try again." })
    .trim()
    .min(3)
    .max(64),
});

/**
 * Called by the browser right after PayPal approves. It is a HINT, not an instruction: the
 * subscription is fetched from PayPal and only its real plan and status are stored.
 */
billingRouter.post("/confirm", asyncHandler(async (req: Request, res: Response) => {
  const parsed = ConfirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please try again." });
  if (!paypalConfigured()) return res.status(503).json({ error: "Payments are not set up yet." });

  const coachId = coachIdOf(req);
  const sub = await getSubscription(parsed.data.subscriptionId);
  if (!sub) return res.status(400).json({ error: "PayPal does not recognise that subscription." });

  const tier = tierForPlanId(sub.planId);
  if (!tier) return res.status(400).json({ error: "That subscription is not for one of our plans." });

  // A subscription belongs to the coach whose id was attached when it was created. Without this
  // check, one coach could paste another's subscription id and ride on their payment.
  if (sub.customId && sub.customId !== coachId) {
    return res.status(409).json({ error: "That subscription belongs to another account." });
  }
  const taken = await prisma.coach.findFirst({
    where: { paypalSubscriptionId: sub.id, NOT: { id: coachId } },
    select: { id: true },
  });
  if (taken) return res.status(409).json({ error: "That subscription belongs to another account." });

  await prisma.coach.update({
    where: { id: coachId },
    data: {
      planTier: tier,
      billingStatus: sub.status === "ACTIVE" ? "active" : sub.status === "APPROVAL_PENDING" ? "trialing" : "past_due",
      periodEndsAt: sub.nextBillingAt,
      pastDueSince: null,
      paypalSubscriptionId: sub.id,
      paypalPlanId: sub.planId,
    },
  });
  const fresh = await prisma.coach.findUnique({ where: { id: coachId }, select: BILLING_SELECT });
  res.json(billingState(fresh!));
}));

/** Ends the plan at PayPal. Access continues to the end of the period already paid for. */
billingRouter.post("/cancel", asyncHandler(async (req: Request, res: Response) => {
  const coach = await prisma.coach.findUnique({ where: { id: coachIdOf(req) }, select: BILLING_SELECT });
  if (!coach?.paypalSubscriptionId) return res.status(400).json({ error: "There is no plan to cancel." });
  const done = await cancelSubscription(coach.paypalSubscriptionId, "Cancelled by the coach in Repsy.");
  if (!done) return res.status(502).json({ error: "PayPal could not cancel the plan. Please try again shortly." });
  // The webhook confirms this too; writing it now means the screen is honest immediately.
  await prisma.coach.update({ where: { id: coachIdOf(req) }, data: { billingStatus: "cancelled" } });
  const fresh = await prisma.coach.findUnique({ where: { id: coachIdOf(req) }, select: BILLING_SELECT });
  res.json(billingState(fresh!));
}));

/**
 * What PayPal has actually charged. Proof a coach can keep: PayPal is the payer of record, so every
 * figure here comes from PayPal and none of it is calculated by us.
 */
billingRouter.get("/payments", asyncHandler(async (req: Request, res: Response) => {
  const coach = await prisma.coach.findUnique({ where: { id: coachIdOf(req) }, select: { paypalSubscriptionId: true, planTier: true } });
  if (!coach?.paypalSubscriptionId) return res.json({ reference: null, payments: [] });
  res.json({
    reference: coach.paypalSubscriptionId,
    tier: coach.planTier,
    payments: await listTransactions(coach.paypalSubscriptionId),
  });
}));

/** The same payments as a file, for an accountant or an expense claim. */
billingRouter.get("/payments.csv", asyncHandler(async (req: Request, res: Response) => {
  const coach = await prisma.coach.findUnique({
    where: { id: coachIdOf(req) },
    select: { paypalSubscriptionId: true, planTier: true, name: true, email: true },
  });
  if (!coach?.paypalSubscriptionId) return res.status(400).json({ error: "There are no payments yet." });
  const rows = await listTransactions(coach.paypalSubscriptionId);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [
    ["Date", "Amount", "Currency", "Status", "PayPal transaction", "Plan", "Subscription", "Billed to"]
      .map(esc)
      .join(","),
    ...rows.map((r) =>
      [r.time.slice(0, 10), r.amount, r.currency, r.status, r.id, coach.planTier, coach.paypalSubscriptionId ?? "", coach.email]
        .map((v) => esc(String(v)))
        .join(","),
    ),
  ].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="repsy-payments.csv"');
  res.send(csv);
}));

/** The tier a coach is choosing, used only to hand the right plan id to the PayPal button. */
billingRouter.get("/plan/:tier", (req: Request, res: Response) => {
  const tier = req.params.tier;
  if (!isPlanTier(tier)) return res.status(404).json({ error: "No such plan." });
  const planId = planIdFor(tier as PlanTier);
  if (!planId) return res.status(503).json({ error: "Payments are not set up yet." });
  res.json({ tier, planId });
});
