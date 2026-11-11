// Coach register / login / logout / me (Prompt 44) - see "API contract" in CLAUDE.md.
// Responses carry the public coach only ({ id, name, email, createdAt}); passwordHash never leaves.
import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { claimDemoData } from "../auth/claimDemoData.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { rateLimit } from "../auth/rateLimit.js";
import { ChangePasswordSchema, ForgotSchema, LoginSchema, RegisterSchema, ResetSchema, UpdateNameSchema } from "../auth/schemas.js";
import { clearSessionCookie, sessionSecret, setSessionCookie } from "../auth/session.js";
import { deliverResetEmail } from "../auth/mailer.js";
import { requireCoach, coachIdOf } from "../auth/requireCoach.js";
import { appBaseUrl, hashToken, issueResetToken, resetLink } from "../auth/resetToken.js";
import { asyncHandler } from "./clients.js";

export const FORGOT_REPLY = "If that email exists, a reset link is on its way.";
export const BAD_RESET = "This reset link is not valid any more. Please ask for a new one.";
export const WRONG_CURRENT = "Your current password is not right.";
class InvalidResetToken extends Error {}
export const EMAIL_TAKEN = "That email is already registered.";
export const BAD_LOGIN = "That email or password is not right.";
export const NOT_SIGNED_IN = "You are not signed in.";
const AUTH_DOWN = "Sign-in is not available right now. Please try again later.";

// A real bcrypt hash of a random string, so an unknown email costs the same time as a wrong password.
export const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8.gIEG9mP2LzvQe4gGSx0Q1l5hQ8se";

type PublicCoach = { id: string; name: string; email: string; createdAt: Date };
const publicCoach = (c: PublicCoach): PublicCoach => ({ id: c.id, name: c.name, email: c.email, createdAt: c.createdAt });

/** In production without SESSION_SECRET: log once per request and refuse with a plain message. */
export function secretMissing(res: Response): boolean {
  if (sessionSecret()) return false;
  console.error("Auth disabled: SESSION_SECRET is not set (or shorter than 16 characters).");
  res.status(503).json({ error: AUTH_DOWN });
  return true;
}

export const authRouter = Router();

// POST /api/auth/register { name, email, password } -> 201 coach + session cookie.
// The first coach ever also claims the unclaimed demo data (same transaction).
authRouter.post(
  "/register",
  rateLimit("register"),
  asyncHandler(async (req, res) => {
    if (secretMissing(res)) return;
    const parsed = RegisterSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { name, email, password } = parsed.data;
    const passwordHash = await hashPassword(password);
    try {
      const coach = await prisma.$transaction(async (tx) => {
        const created = await tx.coach.create({ data: { name, email, passwordHash } });
        await claimDemoData(tx, created.id);
        return created;
      });
      setSessionCookie(res, coach.id, coach.sessionVersion);
      res.status(201).json(publicCoach(coach));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: EMAIL_TAKEN });
        return;
      }
      throw err;
    }
  }),
);

// POST /api/auth/login { email, password } -> 200 coach + session cookie; 401 for any mismatch.
authRouter.post(
  "/login",
  rateLimit("login"),
  asyncHandler(async (req, res) => {
    if (secretMissing(res)) return;
    const parsed = LoginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const coach = await prisma.coach.findUnique({ where: { email: parsed.data.email } });
    const ok = await verifyPassword(parsed.data.password, coach?.passwordHash ?? DUMMY_HASH);
    if (!coach || !ok) {
      res.status(401).json({ error: BAD_LOGIN });
      return;
    }
    setSessionCookie(res, coach.id, coach.sessionVersion);
    res.json(publicCoach(coach));
  }),
);

// POST /api/auth/forgot { email } -> always 200 with the same message, whether or not the email has an
// account. The work (and the email) happens after the reply is sent, so timing can't give it away.
authRouter.post(
  "/forgot",
  rateLimit("forgot"),
  asyncHandler(async (req, res) => {
    const parsed = ForgotSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    res.json({ message: FORGOT_REPLY });
    void sendResetLink(parsed.data.email).catch((err) => {
      console.error("Password reset request failed:", err instanceof Error ? err.message : err);
    });
  }),
);

async function sendResetLink(email: string): Promise<void> {
  const coach = await prisma.coach.findUnique({ where: { email } });
  if (!coach) return;
  const base = appBaseUrl();
  if (!base) {
    console.error("Password reset email not sent: APP_URL is not set, so no link can be built.");
    return;
  }
  const token = await issueResetToken(prisma, coach.id);
  await deliverResetEmail(coach.email, resetLink(base, token));
}

// POST /api/auth/reset { token, password } -> 204. Spends the single-use token, sets the new password and
// ends every existing session (nobody is signed in by it: the coach logs in with the new password).
authRouter.post(
  "/reset",
  rateLimit("reset"),
  asyncHandler(async (req, res) => {
    const parsed = ResetSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { token, password } = parsed.data;
    const tokenHash = hashToken(token);
    const passwordHash = await hashPassword(password);
    try {
      await prisma.$transaction(async (tx) => {
        // One atomic claim: only an unused, unexpired token matches, and only one caller can win it.
        const claimed = await tx.passwordResetToken.updateMany({
          where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new InvalidResetToken();
        const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
        if (!row) throw new InvalidResetToken();
        await tx.coach.update({ where: { id: row.coachId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
        await tx.passwordResetToken.deleteMany({ where: { coachId: row.coachId, usedAt: null } });
      });
    } catch (err) {
      if (err instanceof InvalidResetToken) {
        res.status(400).json({ error: BAD_RESET });
        return;
      }
      throw err;
    }
    res.status(204).end();
  }),
);

// PATCH /api/auth/me { name } -> 200 coach (display name only; the email is read-only).
authRouter.patch(
  "/me",
  requireCoach,
  asyncHandler(async (req, res) => {
    const parsed = UpdateNameSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const coach = await prisma.coach.update({ where: { id: coachIdOf(req) }, data: { name: parsed.data.name } });
    res.json(publicCoach(coach));
  }),
);

// POST /api/auth/change-password { currentPassword, newPassword } -> 204. Needs the current password.
// Every other session ends; this one gets a fresh cookie and carries on.
authRouter.post(
  "/change-password",
  requireCoach,
  rateLimit("change-password"),
  asyncHandler(async (req, res) => {
    if (secretMissing(res)) return;
    const parsed = ChangePasswordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const id = coachIdOf(req);
    const coach = await prisma.coach.findUnique({ where: { id } });
    if (!coach || !(await verifyPassword(parsed.data.currentPassword, coach.passwordHash))) {
      res.status(400).json({ error: WRONG_CURRENT });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const updated = await prisma.coach.update({ where: { id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    setSessionCookie(res, updated.id, updated.sessionVersion);
    res.status(204).end();
  }),
);

// POST /api/auth/logout -> 204, session cookie cleared (also fine when already signed out).
authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

// GET /api/auth/me -> 200 coach; 401 when signed out, the session is invalid, or the coach is gone.
authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const coach = req.coachId ? await prisma.coach.findUnique({ where: { id: req.coachId } }) : null;
    if (!coach) {
      if (req.coachId) clearSessionCookie(res);
      res.status(401).json({ error: NOT_SIGNED_IN });
      return;
    }
    res.json(publicCoach(coach));
  }),
);
