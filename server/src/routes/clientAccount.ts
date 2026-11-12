// The client's own account (Prompt 83) - see "API contract" in CLAUDE.md. Mounted at /api/client-auth.
// Account summary, change password, own payment history (read-only: date, amount in the coach's currency,
// method, plan - never the coach's private payment note), timezone, and deleting their own account. A client can never
// change their coach or their sign-in email here.
// Google sign-in and a password are mutually exclusive for clients: linking Google replaces the password
// with an unguessable one, and setting a password (invite / reset) removes the Google link. So a client
// with googleSub set has no usable password ("Google-only").
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { clearClientSessionCookie, clientAccountIdOf, requireActiveClient, requireClient, setClientSessionCookie } from "../auth/clientSession.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { rateLimit } from "../auth/rateLimit.js";
import { ChangePasswordSchema } from "../auth/schemas.js";
import { secretMissing, WRONG_CURRENT } from "./auth.js";
import { asyncHandler } from "./clients.js";

export const GOOGLE_NO_PASSWORD = "You sign in with Google, so there's no password to change. Use Forgot password to set one.";
export const DELETE_WORD = "DELETE";
export const DELETE_WORD_WRONG = `To delete your account, type ${DELETE_WORD}.`;
export const NEED_PASSWORD = "Please enter your password.";
/** A Google-only client deletes within this long of signing in with Google (proves it's really them). */
export const GOOGLE_FRESH_MS = 5 * 60 * 1000;
export const GOOGLE_NOT_FRESH = "For your safety, sign in with Google again, then delete your account within 5 minutes.";
export const BAD_TIMEZONE = "Please pick a timezone from the list.";

/** The canonical IANA name for a timezone, or null when it isn't one. Aliases and odd casing
 * ("asia/calcutta") come back in Intl's canonical form; where Intl.supportedValuesOf exists the result
 * must be in that list (so it always matches an option in the app's picker). */
export function canonicalTimeZone(name: string): string | null {
  if (name.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(name)) return null;
  let canon: string;
  try {
    canon = new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const list = typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : null;
  if (list && !list.includes(canon) && canon !== "UTC") return null;
  return canon;
}
export const isTimeZone = (name: string) => canonicalTimeZone(name) !== null;

export const clientAccountRouter = Router();

// GET /api/client-auth/me/account -> { name, loginEmail, googleConnected, timezone }
clientAccountRouter.get(
  "/me/account",
  requireClient,
  asyncHandler(async (req, res) => {
    const c = await prisma.client.findUnique({
      where: { id: clientAccountIdOf(req) },
      select: { name: true, loginEmail: true, googleSub: true, timezone: true },
    });
    if (!c) return void res.status(404).json({ error: "Your account was not found. Please ask your coach." });
    res.json({ name: c.name, loginEmail: c.loginEmail, googleConnected: c.googleSub !== null, timezone: c.timezone });
  }),
);

const AccountPatchSchema = z
  .object({
    name: z.string({ invalid_type_error: "Please enter your name." }).trim().min(1, "Please enter your name.").max(100, "Please keep your name under 100 characters.").optional(),
    timezone: z
      .string()
      .refine(isTimeZone, BAD_TIMEZONE)
      .transform((s) => canonicalTimeZone(s) as string)
      .nullable()
      .optional(),
  })
  .strict("Only your name and timezone can be changed here.");

// PATCH /api/client-auth/me/account { name?, timezone? (IANA name or null = use the device's) } -> 204
clientAccountRouter.patch(
  "/me/account",
  requireActiveClient,
  asyncHandler(async (req, res) => {
    const parsed = AccountPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    await prisma.client.update({ where: { id: clientAccountIdOf(req) }, data: parsed.data });
    res.status(204).end();
  }),
);

// POST /api/client-auth/change-password { currentPassword, newPassword } -> 204. Every other session ends
// (the session version goes up); this one gets a fresh cookie and carries on.
clientAccountRouter.post(
  "/change-password",
  requireClient,
  rateLimit("client-change-password", { keyOf: (req) => `client:${clientAccountIdOf(req)}` }),
  asyncHandler(async (req, res) => {
    if (secretMissing(res)) return;
    const parsed = ChangePasswordSchema.strict().safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const id = clientAccountIdOf(req);
    const c = await prisma.client.findUnique({ where: { id }, select: { passwordHash: true, googleSub: true } });
    if (!c) return void res.status(404).json({ error: "Your account was not found. Please ask your coach." });
    if (c.googleSub) return void res.status(400).json({ error: GOOGLE_NO_PASSWORD });
    if (!c.passwordHash || !(await verifyPassword(parsed.data.currentPassword, c.passwordHash))) {
      return void res.status(400).json({ error: WRONG_CURRENT });
    }
    const updated = await prisma.client.update({
      where: { id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword), clientSessionVersion: { increment: 1 } },
      select: { id: true, clientSessionVersion: true },
    });
    setClientSessionCookie(res, updated.id, updated.clientSessionVersion);
    res.status(204).end();
  }),
);

// GET /api/client-auth/my-payments -> [{ id, paidOn, amount, currency, method, planName }] the client's OWN
// payments, newest first. Read-only. The coach's note on a payment stays private.
clientAccountRouter.get(
  "/my-payments",
  requireActiveClient,
  asyncHandler(async (req, res) => {
    const clientId = clientAccountIdOf(req);
    const [rows, me] = await Promise.all([
      prisma.payment.findMany({
        where: { clientId },
        orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: { id: true, paidOn: true, amount: true, method: true, clientPlan: { select: { planName: true } } },
      }),
      prisma.client.findUnique({ where: { id: clientId }, select: { coach: { select: { currency: true } } } }),
    ]);
    const currency = me?.coach?.currency ?? "INR";
    res.json(rows.map((p) => ({ id: p.id, paidOn: p.paidOn, amount: p.amount, currency, method: p.method, planName: p.clientPlan.planName })));
  }),
);

const DeleteSchema = z
  .object({
    password: z.string().optional(),
    confirm: z.string({ required_error: DELETE_WORD_WRONG }),
  })
  .strict("Only password and confirm can be sent.");

// DELETE /api/client-auth/me { password?, confirm: "DELETE" } -> 204, cookie cleared. Deletes the Client
// row; Postgres cascades every record that belongs to it (plans, check-ins, habits, measurements, messages,
// payments, appointments, invites, review items, reset tokens...). The coach simply no longer sees them.
// Password clients confirm with their password; Google-only clients with a Google sign-in in the last
// 5 minutes. Pending and declined clients may delete too.
clientAccountRouter.delete(
  "/me",
  requireClient,
  rateLimit("client-delete-account", { keyOf: (req) => `client:${clientAccountIdOf(req)}`, max: 5 }),
  asyncHandler(async (req, res) => {
    const parsed = DeleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    if (parsed.data.confirm !== DELETE_WORD) return void res.status(400).json({ error: DELETE_WORD_WRONG });
    const id = clientAccountIdOf(req);
    const c = await prisma.client.findUnique({ where: { id }, select: { passwordHash: true, googleSub: true, lastGoogleAuthAt: true } });
    if (!c) {
      clearClientSessionCookie(res);
      return void res.status(204).end();
    }
    if (c.googleSub) {
      // Fresh, AND this very session came from that sign-in (an older cookie on another device can't use it).
      const at = c.lastGoogleAuthAt?.getTime() ?? 0;
      const issued = req.clientSessionIssuedAt ?? 0;
      if (!at || Date.now() - at > GOOGLE_FRESH_MS || issued < at - 1000) {
        return void res.status(403).json({ error: GOOGLE_NOT_FRESH });
      }
    } else {
      if (!parsed.data.password) return void res.status(400).json({ error: NEED_PASSWORD });
      if (!c.passwordHash || !(await verifyPassword(parsed.data.password, c.passwordHash))) {
        return void res.status(400).json({ error: WRONG_CURRENT });
      }
    }
    await prisma.client.deleteMany({ where: { id } });
    clearClientSessionCookie(res);
    res.status(204).end();
  }),
);
