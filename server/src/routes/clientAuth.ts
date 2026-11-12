// CLIENT sign-in (Prompt 65) - see "API contract" in CLAUDE.md. Separate from coach auth
// (/api/auth): its own routes, its own cookie and token type (src/auth/clientSession.ts).
// A signed-in client can read exactly one client record - their own - and nothing else.
// Accounts come from a coach's invite (Prompt 65) or from joining with the coach's code (Prompt 77,
// routes/clientJoin.ts). Data routes use requireActiveClient: a pending / declined client gets 403.
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { rateLimit } from "../auth/rateLimit.js";
import { BAD_INVITE, ClientLoginSchema, ClientSetPasswordSchema } from "../auth/schemas.js";
import { hashToken } from "../auth/resetToken.js";
import {
  clearClientSessionCookie,
  clientAccountIdOf,
  requireActiveClient,
  requireClient,
  setClientSessionCookie,
} from "../auth/clientSession.js";
import { BAD_LOGIN, DUMMY_HASH, secretMissing } from "./auth.js";
import { loadEngagement } from "../engagement.js";
import { asyncHandler } from "./clients.js";
import { isDateString } from "./assignments.js";

class InvalidInvite extends Error {}
export const INVITE_EMAIL_TAKEN = "That email is already used for another client sign-in. Please ask your coach for a new invite.";

export const clientAuthRouter = Router();

/** What a signed-in client may see about themselves. Nothing about the coach or other clients. */
type PublicClientAccount = { id: string; name: string; loginEmail: string | null; joinStatus: string };
const publicAccount = (c: PublicClientAccount): PublicClientAccount => ({
  id: c.id,
  name: c.name,
  loginEmail: c.loginEmail,
  joinStatus: c.joinStatus,
});

// POST /api/client-auth/set-password { token, password } -> 204. Spends the single-use invite
// atomically, sets the password, makes the invited address the login email, and ends any older
// client session. It does not sign anyone in: the client logs in with the new password.
clientAuthRouter.post(
  "/set-password",
  rateLimit("client-set-password"),
  asyncHandler(async (req, res) => {
    const parsed = ClientSetPasswordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const tokenHash = hashToken(parsed.data.token);
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      await prisma.$transaction(async (tx) => {
        // One atomic claim: only an unused, unexpired invite matches, and only one caller can win.
        const claimed = await tx.clientInvite.updateMany({
          where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new InvalidInvite();
        const invite = await tx.clientInvite.findUnique({ where: { tokenHash } });
        if (!invite) throw new InvalidInvite();
        // The client must still belong to the coach who invited them.
        const client = await tx.client.findFirst({ where: { id: invite.clientId, coachId: invite.coachId }, select: { id: true } });
        if (!client) throw new InvalidInvite();
        await tx.client.update({
          where: { id: client.id },
          data: { passwordHash, loginEmail: invite.email, clientSessionVersion: { increment: 1 } },
        });
        await tx.clientInvite.deleteMany({ where: { clientId: client.id, usedAt: null } });
      });
    } catch (err) {
      if (err instanceof InvalidInvite) {
        res.status(400).json({ error: BAD_INVITE });
        return;
      }
      // The address was taken by another client's sign-in after this invite was sent. The whole
      // transaction rolled back, so the invite is still unused.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: INVITE_EMAIL_TAKEN });
        return;
      }
      throw err;
    }
    res.status(204).end();
  }),
);

// POST /api/client-auth/login { email, password } -> 200 own account + client cookie; 401 for any mismatch.
clientAuthRouter.post(
  "/login",
  rateLimit("client-login"),
  asyncHandler(async (req, res) => {
    if (secretMissing(res)) return;
    const parsed = ClientLoginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const client = await prisma.client.findUnique({
      where: { loginEmail: parsed.data.email },
      omit: { passwordHash: false },
    });
    // Same cost for an unknown email, an un-invited client and a wrong password.
    const ok = await verifyPassword(parsed.data.password, client?.passwordHash ?? DUMMY_HASH);
    if (!client || !client.passwordHash || !ok) {
      res.status(401).json({ error: BAD_LOGIN });
      return;
    }
    setClientSessionCookie(res, client.id, client.clientSessionVersion);
    res.json(publicAccount(client));
  }),
);

// POST /api/client-auth/logout -> 204, always (clears the client cookie only).
clientAuthRouter.post("/logout", (_req, res) => {
  clearClientSessionCookie(res);
  res.status(204).end();
});

// GET /api/client-auth/my-plan (Prompt 68) -> { plan: { planName, status, nextDueDate } | null, lastPaymentDate }
// Only the signed-in client's OWN plan, and only these fields: no amounts, no payment history beyond
// the date of their own last payment, nothing about any other client.
clientAuthRouter.get(
  "/my-plan",
  requireActiveClient,
  asyncHandler(async (req, res) => {
    const clientId = clientAccountIdOf(req);
    const [plan, last] = await Promise.all([
      prisma.clientPlan.findUnique({ where: { clientId }, select: { planName: true, status: true, nextDueDate: true } }),
      prisma.payment.findFirst({ where: { clientId }, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], select: { paidOn: true } }),
    ]);
    res.json({ plan, lastPaymentDate: last?.paidOn ?? null });
  }),
);

// GET /api/client-auth/my-sessions (Prompt 69) -> { sessions: [{ id, title, type, startsAt, endsAt, location }] }
// The signed-in client's OWN upcoming Booked appointments (not yet ended), soonest first, read-only.
// The coach's private note, status and coach id are never selected; nothing about other clients.
clientAuthRouter.get(
  "/my-sessions",
  requireActiveClient,
  asyncHandler(async (req, res) => {
    const sessions = await prisma.appointment.findMany({
      where: { clientId: clientAccountIdOf(req), status: "Booked", endsAt: { gte: new Date() } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 50,
      select: { id: true, title: true, type: true, startsAt: true, endsAt: true, location: true },
    });
    res.json({ sessions });
  }),
);

// GET /api/client-auth/my-streaks?date=YYYY-MM-DD (Prompt 71) -> { date, checkInStreak, habitPercent, workoutsThisWeek, enoughData }
// The signed-in client's OWN three numbers only: no rank, no roster, nothing about any other client.
clientAuthRouter.get(
  "/my-streaks",
  requireActiveClient,
  asyncHandler(async (req, res) => {
    const raw = req.query.date;
    const date = raw === undefined ? new Date().toISOString().slice(0, 10) : typeof raw === "string" && isDateString(raw) ? raw : null;
    if (!date) {
      res.status(400).json({ error: "date must be a real date in YYYY-MM-DD form." });
      return;
    }
    const [mine] = await loadEngagement({ clientId: clientAccountIdOf(req) }, date);
    if (!mine) {
      // The session is valid but the coach deleted the client record.
      res.status(404).json({ error: "Your account was not found. Please ask your coach." });
      return;
    }
    const { checkInStreak, habitPercent, workoutsThisWeek, enoughData } = mine;
    res.json({ date, checkInStreak, habitPercent, workoutsThisWeek, enoughData });
  }),
);

// GET /api/client-auth/me -> 200 own account, or 401 when no CLIENT session (a coach session does not count).
// Prompt 77: also { joinStatus, coachName, needsWelcome } so a pending client sees the waiting screen and a
// client who joined with the code sees the welcome questions once. coachName is the client's OWN coach.
clientAuthRouter.get(
  "/me",
  requireClient,
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUnique({
      where: { id: clientAccountIdOf(req) },
      select: { id: true, name: true, loginEmail: true, joinStatus: true, joinedVia: true, onboardedAt: true, coach: { select: { name: true } } },
    });
    if (!client) {
      clearClientSessionCookie(res);
      res.status(401).json({ error: "You are not signed in." });
      return;
    }
    res.json({
      ...publicAccount(client),
      coachName: client.coach?.name ?? null,
      needsWelcome: client.joinedVia === "code" && client.onboardedAt === null,
    });
  }),
);
