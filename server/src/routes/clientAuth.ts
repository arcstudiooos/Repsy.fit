// CLIENT sign-in (Prompt 65) - see "API contract" in CLAUDE.md. Separate from coach auth
// (/api/auth): its own routes, its own cookie and token type (src/auth/clientSession.ts).
// A signed-in client can read exactly one client record - their own - and nothing else.
// There is no client registration: an account exists only after the coach invites the client.
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
  requireClient,
  setClientSessionCookie,
} from "../auth/clientSession.js";
import { BAD_LOGIN, DUMMY_HASH, secretMissing } from "./auth.js";
import { asyncHandler } from "./clients.js";

class InvalidInvite extends Error {}
export const INVITE_EMAIL_TAKEN = "That email is already used for another client sign-in. Please ask your coach for a new invite.";

export const clientAuthRouter = Router();

/** What a signed-in client may see about themselves. Nothing about the coach or other clients. */
type PublicClientAccount = { id: string; name: string; loginEmail: string | null };
const publicAccount = (c: PublicClientAccount): PublicClientAccount => ({ id: c.id, name: c.name, loginEmail: c.loginEmail });

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
  requireClient,
  asyncHandler(async (req, res) => {
    const clientId = clientAccountIdOf(req);
    const [plan, last] = await Promise.all([
      prisma.clientPlan.findUnique({ where: { clientId }, select: { planName: true, status: true, nextDueDate: true } }),
      prisma.payment.findFirst({ where: { clientId }, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], select: { paidOn: true } }),
    ]);
    res.json({ plan, lastPaymentDate: last?.paidOn ?? null });
  }),
);

// GET /api/client-auth/me -> 200 own account, or 401 when no CLIENT session (a coach session does not count).
clientAuthRouter.get(
  "/me",
  requireClient,
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUnique({
      where: { id: clientAccountIdOf(req) },
      select: { id: true, name: true, loginEmail: true },
    });
    if (!client) {
      clearClientSessionCookie(res);
      res.status(401).json({ error: "You are not signed in." });
      return;
    }
    res.json(publicAccount(client));
  }),
);
