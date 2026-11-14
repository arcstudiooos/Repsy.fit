// The client limit, and what a coach is told when they reach it (owner, Nov 2026).
//
// This REPLACES the old trial-and-read-only paywall. The rules, in order of importance:
//
//   1. Nobody is ever locked out of their own data. Reading, editing, exporting and deleting always
//      work, on every plan, forever.
//   2. A client already on the roster is never cut off, whatever happens to the coach's plan. A
//      coach who downgrades below their client count keeps every client and simply cannot add more.
//   3. Only ADDING a client past the limit is refused, and it says exactly what to do about it.
//   4. Demo clients do not count. They are sample data for trying the app, and blocking the demo to
//      protect a quota would be a strange way to welcome someone.
import { prisma } from "../db.js";
import { clientLimitFor, planFor } from "./plans.js";

export type LimitCheck =
  | { allowed: true }
  | { allowed: false; limit: number; used: number; message: string };

/**
 * Real clients on the roster. Demo data does not count, and neither does someone who has asked to
 * join but has not been accepted yet: a request costs the coach nothing until they say yes, and
 * turning a client away at the front door because their coach is one over a limit would be a poor
 * way to treat a person who was invited.
 */
export function countClients(coachId: string): Promise<number> {
  return prisma.client.count({ where: { coachId, isDemo: false, joinStatus: "active" } });
}

/**
 * May this coach add one more client? Fails OPEN: if the count cannot be read we allow it, because
 * a database hiccup must never look like a full roster.
 */
export async function canAddClient(coachId: string): Promise<LimitCheck> {
  let coach, used;
  try {
    coach = await prisma.coach.findUnique({ where: { id: coachId }, select: { planTier: true } });
    used = await countClients(coachId);
  } catch (err) {
    console.error("client limit check failed; allowing the client", err);
    return { allowed: true };
  }
  if (!coach) return { allowed: true };

  const limit = clientLimitFor(coach.planTier);
  if (used < limit) return { allowed: true };

  const plan = planFor(coach.planTier);
  const message =
    plan.price === 0
      ? `Your free plan covers ${limit} clients. Choose a plan in Account settings to add more - everything you already have stays exactly as it is.`
      : `Your plan covers ${limit} clients. Move up a plan in Account settings to add more - everything you already have stays exactly as it is.`;
  return { allowed: false, limit, used, message };
}

/** 402 Payment Required with that message, or false when there is room. */
export async function refuseIfFull(coachId: string, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const check = await canAddClient(coachId);
  if (check.allowed) return false;
  res.status(402).json({ error: check.message, limit: check.limit, used: check.used });
  return true;
}
