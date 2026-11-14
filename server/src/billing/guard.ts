// The guard that enforces read-only on a lapsed account (Nov 2026).
//
// It sits on WRITE routes only. Reading, exporting and deleting always work: a coach who stops
// paying must still be able to see their data and take it with them, and their clients' app is
// never affected by any of this (see src/billing/state.ts for the rule).
//
// It fails OPEN: if the billing row cannot be read, coaching work continues. A database hiccup
// must never look like an expired plan.
import type { NextFunction, Request, Response } from "express";
import { coachIdOf } from "../auth/requireCoach.js";
import { billingFor } from "./current.js";
import { billingState, BILLING_BLOCKED } from "./state.js";

/**
 * Is the paywall switched on? Off by default: the state, the guard and the UI ship in pieces, and
 * nothing should start refusing a coach's work until the checkout flow exists for them to pay with.
 * Set BILLING_ENFORCED=true in Render when the whole flow is live.
 */
export const billingEnforced = () => process.env.BILLING_ENFORCED === "true";

/** 402 Payment Required when the account may only read; otherwise carries on. */
export async function requirePaidWrite(req: Request, res: Response, next: NextFunction) {
  if (!billingEnforced()) return next();
  // Reads and deletes are always allowed, whatever the billing state.
  if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") return next();
  if (!req.coachId) return next(); // the auth guard answers this one
  let billing;
  try {
    billing = await billingFor(coachIdOf(req));
  } catch (err) {
    console.error("billing lookup failed; allowing the write", err);
    return next();
  }
  if (!billing || billingState(billing).canWrite) return next();
  res.status(402).json({ error: BILLING_BLOCKED });
}
