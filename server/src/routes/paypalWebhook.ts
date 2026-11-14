// The PayPal webhook (Nov 2026): the long-term source of truth for every subscription.
//
// A coach's browser is only involved once, at checkout. Everything after that - the monthly
// renewal, a card that fails, a cancellation made inside PayPal rather than in Repsy - arrives
// here, or the app's idea of who has paid slowly drifts away from reality.
//
// Verified with PayPal before anything is believed (see verifyWebhook). Unverified events are
// answered 401 and nothing is written. Bodies are never logged: they carry payer details.
import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { getSubscription, tierForPlanId, verifyWebhook } from "../billing/paypal.js";

export const paypalWebhookRouter = Router();

type Event = { event_type?: string; resource?: { id?: string; status?: string; plan_id?: string } };

paypalWebhookRouter.post("/", async (req: Request, res: Response) => {
  if (!process.env.PAYPAL_WEBHOOK_ID) return res.status(503).json({ error: "Webhook not configured." });

  // express.raw gives a Buffer: the signature is over the exact bytes PayPal sent.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!raw) return res.status(400).json({ error: "Empty body." });

  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  if (!(await verifyWebhook(headers, raw))) return res.status(401).json({ error: "Signature did not verify." });

  let event: Event;
  try {
    event = JSON.parse(raw) as Event;
  } catch {
    return res.status(400).json({ error: "Body was not JSON." });
  }

  const type = event.event_type ?? "";
  const subscriptionId = event.resource?.id;
  // Payment events carry the sale, not the subscription, so there is nothing to match on.
  if (!subscriptionId || !type.startsWith("BILLING.SUBSCRIPTION.")) return res.status(204).end();

  const coach = await prisma.coach.findUnique({ where: { paypalSubscriptionId: subscriptionId }, select: { id: true } });
  // An event for a subscription we have never seen (another environment, or a stale test) is not an
  // error: acknowledge it, or PayPal retries it for days.
  if (!coach) return res.status(204).end();

  // Ask PayPal for the current state rather than trusting the event body, which may be out of order.
  const sub = await getSubscription(subscriptionId);
  if (!sub) return res.status(204).end();

  const now = new Date();
  const data: Record<string, unknown> = { periodEndsAt: sub.nextBillingAt };
  const tier = tierForPlanId(sub.planId);
  if (tier) data.planTier = tier;

  switch (sub.status) {
    case "ACTIVE":
      // A recovered payment clears the grace period as well as the status.
      data.billingStatus = "active";
      data.pastDueSince = null;
      break;
    case "SUSPENDED":
      data.billingStatus = "past_due";
      // Keep the first failure date: the 7-day grace runs from then, not from each retry.
      if (type.endsWith("SUSPENDED") || type.endsWith("PAYMENT.FAILED")) data.pastDueSince = undefined;
      break;
    case "CANCELLED":
      data.billingStatus = "cancelled";
      break;
    case "EXPIRED":
      data.billingStatus = "expired";
      break;
    default:
      return res.status(204).end();
  }

  if (sub.status === "SUSPENDED") {
    const current = await prisma.coach.findUnique({ where: { id: coach.id }, select: { pastDueSince: true } });
    if (!current?.pastDueSince) data.pastDueSince = now;
    else delete data.pastDueSince;
  }

  await prisma.coach.update({ where: { id: coach.id }, data });
  // No body, nothing logged beyond the type: PayPal only needs the 204.
  console.log(`PayPal webhook handled: ${type} -> ${sub.status}`);
  res.status(204).end();
});
