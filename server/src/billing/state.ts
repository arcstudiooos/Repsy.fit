// What a coach's plan means TODAY (owner, Nov 2026).
//
// The pricing is by client count: free forever with 2 clients, and paying raises the limit. That
// makes this far simpler than the trial-and-lockout model it replaced:
//
//   - There is no trial to expire and no read-only state. Every feature works on every plan.
//   - A coach who stops paying drops back to the free limit. They keep every client they have
//     (see billing/limit.ts) and simply cannot add more until they pay again.
//   - So a billing problem can never cost a coach their data, and can never reach their clients.
//
// Nothing here talks to PayPal: it reads the stored state plus the clock.
import { clientLimitFor, FREE_TIER, planFor } from "./plans.js";

/** The stored columns this needs. Kept narrow so tests can build one by hand. */
export type BillingFields = {
  planTier: string;
  billingStatus: string;
  periodEndsAt: Date | null;
  pastDueSince: Date | null;
  paypalSubscriptionId: string | null;
};

/** Days a failed payment keeps the paid client limit before dropping to the free one. */
export const GRACE_DAYS = 7;

export type BillingState = {
  /** free = on the free plan; active = paying; past_due = payment failed, still on the paid limit. */
  status: "free" | "active" | "past_due";
  /** The plan key (billing/plans.ts), e.g. "Free" or "Pro20". */
  tier: string;
  /** How many clients this plan allows right now. */
  clientLimit: number;
  /** Dollars per month, 0 on the free plan. */
  price: number;
  /** Days left of the grace period after a failed payment, else null. */
  daysLeft: number | null;
  /** True when they are on the free plan (so the UI can offer the paid ones). */
  isFree: boolean;
  /** Plain words, or null when nothing needs saying. */
  message: string | null;
  /** When the plan next renews (or ends, once cancelled), ISO. Null on the free plan. */
  renewsOn: string | null;
};

const DAY_MS = 86_400_000;
const daysSince = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS);
const daysUntil = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

const free = (over: Partial<BillingState> = {}): BillingState => ({
  status: "free",
  tier: FREE_TIER,
  clientLimit: clientLimitFor(FREE_TIER),
  price: 0,
  daysLeft: null,
  isFree: true,
  message: null,
  renewsOn: null,
  ...over,
});

export function billingState(coach: BillingFields, now: Date = new Date()): BillingState {
  const plan = planFor(coach.planTier);
  const paidThrough = coach.periodEndsAt !== null && coach.periodEndsAt > now;
  if (plan.price === 0) return free();

  const onPaidPlan = (over: Partial<BillingState>): BillingState => ({
    status: "active",
    tier: plan.key,
    clientLimit: plan.clients,
    price: plan.price,
    daysLeft: null,
    isFree: false,
    message: null,
    renewsOn: coach.periodEndsAt ? coach.periodEndsAt.toISOString() : null,
    ...over,
  });

  if (coach.billingStatus === "active" && paidThrough) return onPaidPlan({});

  // Cancelled: the plan runs to the end of the period already paid for, then the free limit returns.
  if (coach.billingStatus === "cancelled" && paidThrough) {
    const left = daysUntil(now, coach.periodEndsAt as Date);
    return onPaidPlan({
      message: `Your plan is cancelled and ends in ${left} ${left === 1 ? "day" : "days"}. You keep every client you have after that - the free plan just covers ${clientLimitFor(FREE_TIER)} new ones.`,
    });
  }

  // A failed payment keeps the paid limit for the grace period.
  if (coach.billingStatus === "past_due" && coach.pastDueSince) {
    const left = GRACE_DAYS - daysSince(coach.pastDueSince, now);
    if (left > 0) {
      return onPaidPlan({
        status: "past_due",
        daysLeft: left,
        message: `Your last payment did not go through. Please update it within ${left} ${left === 1 ? "day" : "days"} to stay on ${plan.clients} clients.`,
      });
    }
  }

  // The paid plan has lapsed: back to the free limit, keeping every client they already have.
  return free({
    message: `Your plan has ended, so you are back on the free plan. You keep every client you have - the free plan just covers ${clientLimitFor(FREE_TIER)} new ones.`,
  });
}
