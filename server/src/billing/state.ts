// What a coach's subscription means TODAY (Nov 2026). One place decides it, so every route and
// every screen agrees.
//
// The owner's rule: a billing problem must never cost a coach access to live client data, and must
// never touch their clients. So a lapsed account goes READ-ONLY - everything is still visible and
// exportable, nothing new can be created - and the clients' own app keeps working regardless.
//
// Nothing here talks to PayPal: it reads the stored state (set by the webhook) plus the clock.

/** The three tiers, in the order they are shown. */
export const PLAN_TIERS = ["Solo", "Pro", "Studio"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];
export const isPlanTier = (v: unknown): v is PlanTier => PLAN_TIERS.includes(v as PlanTier);

/** The stored columns this needs. Kept narrow so tests can build one by hand. */
export type BillingFields = {
  planTier: string;
  billingStatus: string;
  trialEndsAt: Date | null;
  periodEndsAt: Date | null;
  pastDueSince: Date | null;
  paypalSubscriptionId: string | null;
};

/** Days a failed payment keeps full access before the account goes read-only. */
export const GRACE_DAYS = 7;
/** Length of the free trial a new account gets. */
export const TRIAL_DAYS = 7;

export type BillingState = {
  /** What the coach is told. */
  status: "trialing" | "active" | "past_due" | "read_only";
  tier: string;
  /** False once a lapsed account may only read: creating and assigning stop here. */
  canWrite: boolean;
  /** Days left in the trial or grace period; null when neither applies. */
  daysLeft: number | null;
  /** True while they have never subscribed (so the UI can ask them to). */
  needsSubscription: boolean;
  /** Plain words for the banner, or null when nothing needs saying. */
  message: string | null;
  /** The date the plan next renews (or ends, once cancelled), ISO. Null when neither applies. */
  renewsOn: string | null;
};

const DAY_MS = 86_400_000;
/** Whole days that have passed. Rounds DOWN: five minutes ago is zero days ago, not one. */
const daysSince = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS);
/** Whole days remaining, rounded UP: any part of a day left still counts as a day. */
const daysUntil = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

export function billingState(coach: BillingFields, now: Date = new Date()): BillingState {
  const tier = coach.planTier;
  const subscribed = coach.paypalSubscriptionId !== null;

  // Paid up: the period they bought has not ended yet (a cancellation still runs to the end).
  const paidThrough = coach.periodEndsAt !== null && coach.periodEndsAt > now;
  if (coach.billingStatus === "active" && paidThrough) {
    return {
      status: "active",
      tier,
      canWrite: true,
      daysLeft: null,
      needsSubscription: false,
      message: null,
      renewsOn: (coach.periodEndsAt as Date).toISOString(),
    };
  }

  // A cancelled subscription keeps working until the paid period runs out.
  if (coach.billingStatus === "cancelled" && paidThrough) {
    const left = daysUntil(now, coach.periodEndsAt as Date);
    return {
      status: "active",
      tier,
      canWrite: true,
      daysLeft: left,
      needsSubscription: true,
      message: `Your plan is cancelled and ends in ${left} ${left === 1 ? "day" : "days"}. You keep everything until then.`,
      renewsOn: (coach.periodEndsAt as Date).toISOString(),
    };
  }

  // A failed payment: full access for the grace period, then read-only.
  if (coach.billingStatus === "past_due" && coach.pastDueSince) {
    const left = GRACE_DAYS - daysSince(coach.pastDueSince, now);
    if (left > 0) {
      return {
        status: "past_due",
        tier,
        canWrite: true,
        daysLeft: left,
        needsSubscription: false,
        // The card already says the payment failed; repeating it here printed the sentence twice.
        message: `Please update it within ${left} ${left === 1 ? "day" : "days"} to keep adding plans.`,
        renewsOn: null,
      };
    }
    return {
      status: "read_only",
      tier,
      canWrite: false,
      daysLeft: 0,
      needsSubscription: false,
      message: "Your last payment did not go through, so new plans are paused. Everything you already have stays here, and your clients are unaffected.",
      renewsOn: null,
    };
  }

  // The free trial.
  if (coach.billingStatus === "trialing" && coach.trialEndsAt && coach.trialEndsAt > now) {
    const left = daysUntil(now, coach.trialEndsAt);
    return {
      status: "trialing",
      tier,
      canWrite: true,
      daysLeft: left,
      needsSubscription: true,
      message: `${left} ${left === 1 ? "day" : "days"} left of your free trial.`,
      renewsOn: coach.trialEndsAt.toISOString(),
    };
  }

  // Trial over, or a subscription that ended: read-only until they pay.
  return {
    status: "read_only",
    tier,
    canWrite: false,
    daysLeft: 0,
    needsSubscription: !subscribed || !paidThrough,
    message: subscribed
      ? "Your plan has ended, so new plans are paused. Everything you already have stays here, and your clients are unaffected."
      : "Your free trial has ended, so new plans are paused. Everything you already have stays here, and your clients are unaffected.",
    renewsOn: null,
  };
}

/** The 402 body every write route sends when the account may only read. */
export const BILLING_BLOCKED = "Your plan has ended. You can still see and export everything; choose a plan to add new ones.";

/** The trial a brand-new account gets, counted from now. */
export const trialEnd = (from: Date = new Date()) => new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
