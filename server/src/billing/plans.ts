// What the plans ARE (owner, Nov 2026). One list, used by the server, the billing screen, the
// landing page and the script that creates the PayPal plans - so a price can never disagree with
// itself across the app.
//
// The model: everyone is free forever with 2 clients. Paying raises the client limit and nothing
// else: every feature is in every plan. Nobody is ever locked out of their own data, so there is no
// trial to expire and no read-only state - a coach who stops paying simply stops ADDING clients
// beyond the free two, and keeps everything they have.

export const FREE_TIER = "Free" as const;

export type PlanDef = {
  /** Stored in coaches.planTier and used as the PAYPAL_PLAN_<KEY> env suffix. */
  key: string;
  /** How many clients this allows. */
  clients: number;
  /** US dollars per month. 0 for the free tier. */
  price: number;
};

export const PLANS: PlanDef[] = [
  { key: FREE_TIER, clients: 2, price: 0 },
  { key: "Pro5", clients: 5, price: 17 },
  { key: "Pro10", clients: 10, price: 25 },
  { key: "Pro20", clients: 20, price: 45 },
  { key: "Pro50", clients: 50, price: 90 },
  { key: "Pro100", clients: 100, price: 150 },
];

/** Above this, coaches talk to us rather than buy a plan. */
export const ENTERPRISE_FROM = 100;

export const planFor = (key: string): PlanDef => PLANS.find((p) => p.key === key) ?? PLANS[0];
/** How many clients a coach on this plan may have. Unknown or missing plans get the free limit. */
export const clientLimitFor = (key: string): number => planFor(key).clients;
export const isPaidPlan = (key: string): boolean => planFor(key).price > 0;
/** "5 clients" / "2 clients" - the label used wherever a plan is named. */
export const planLabel = (key: string): string => {
  const p = planFor(key);
  return `${p.clients} ${p.clients === 1 ? "client" : "clients"}`;
};
