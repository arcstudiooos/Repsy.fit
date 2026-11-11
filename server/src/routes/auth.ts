// Coach register / login / logout / me (Prompt 44) - see "API contract" in CLAUDE.md.
// Responses carry the public coach only ({ id, name, email, createdAt}); passwordHash never leaves.
import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { claimDemoData } from "../auth/claimDemoData.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { rateLimit } from "../auth/rateLimit.js";
import { LoginSchema, RegisterSchema } from "../auth/schemas.js";
import { clearSessionCookie, sessionSecret, setSessionCookie } from "../auth/session.js";
import { asyncHandler } from "./clients.js";

export const EMAIL_TAKEN = "That email is already registered.";
export const BAD_LOGIN = "That email or password is not right.";
export const NOT_SIGNED_IN = "You are not signed in.";
const AUTH_DOWN = "Sign-in is not available right now. Please try again later.";

// A real bcrypt hash of a random string, so an unknown email costs the same time as a wrong password.
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8.gIEG9mP2LzvQe4gGSx0Q1l5hQ8se";

type PublicCoach = { id: string; name: string; email: string; createdAt: Date };
const publicCoach = (c: PublicCoach): PublicCoach => ({ id: c.id, name: c.name, email: c.email, createdAt: c.createdAt });

/** In production without SESSION_SECRET: log once per request and refuse with a plain message. */
function secretMissing(res: Response): boolean {
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
      setSessionCookie(res, coach.id);
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
    setSessionCookie(res, coach.id);
    res.json(publicCoach(coach));
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
