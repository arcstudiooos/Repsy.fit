// Coach side of client access (Prompt 65): see the client's sign-in status and invite them.
// Mounted at /api/clients/:clientId/invite, behind requireCoach like every other client route.
import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { InviteSchema } from "../auth/schemas.js";
import { issueClientInvite, inviteLink } from "../auth/clientInvite.js";
import { deliverInviteEmail, emailConfigured } from "../auth/mailer.js";
import { appBaseUrl } from "../auth/resetToken.js";
import { rateLimit } from "../auth/rateLimit.js";
import { asyncHandler, findClient } from "./clients.js";

/** Deliberately generic: it must not tell a coach whether some other coach's client uses this email. */
export const LOGIN_EMAIL_TAKEN = "That email can't be used for a client sign-in. Please use a different one.";
/** Per signed-in coach, so a coach onboarding a whole roster is not blocked by an IP shared with others. */
export const INVITES_PER_15_MIN = 30;
export const EMAIL_NOT_CONFIGURED_NOTE = "Email is not configured - share this link with your client.";
export const EMAIL_FAILED_NOTE = "We couldn't send the invite email - share this link with your client instead.";
export const NO_APP_URL = "Invites can't be created yet: the app's public address (APP_URL) is not set.";

export const clientInviteRouter = Router({ mergeParams: true });

export type AccessStatus = "none" | "invited" | "active";

async function clientOr404(req: Request, res: Response) {
  const { clientId } = req.params as { clientId: string };
  const client = await findClient(clientId, coachIdOf(req));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return null;
  }
  return client;
}

/**
 * "active" once a password is set; "invited" with a live invite; otherwise "none".
 * `pendingEmail` is where the live invite went (it becomes the login email once used).
 */
async function accessOf(clientId: string): Promise<{ status: AccessStatus; inviteExpiresAt: Date | null; pendingEmail: string | null }> {
  const [row, invite] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { passwordHash: true } }),
    prisma.clientInvite.findFirst({
      where: { clientId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { expiresAt: true, email: true },
    }),
  ]);
  const pending = { inviteExpiresAt: invite?.expiresAt ?? null, pendingEmail: invite?.email ?? null };
  if (row?.passwordHash) return { status: "active", ...pending };
  return { status: invite ? "invited" : "none", ...pending };
}

// GET /api/clients/:clientId/invite -> { loginEmail, pendingEmail, status, inviteExpiresAt, emailConfigured }
clientInviteRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    const access = await accessOf(client.id);
    res.json({ loginEmail: client.loginEmail, ...access, emailConfigured: emailConfigured() });
  }),
);

// POST /api/clients/:clientId/invite { email } -> 201
//   email configured: { sent: true, loginEmail, inviteExpiresAt } (the link is never returned)
//   not configured or sending failed: { sent: false, loginEmail, inviteExpiresAt, inviteLink, note }
// `loginEmail` in the reply is the address invited. Nothing about how the client signs in changes
// until they USE the link: the email becomes their login (and the password is set) only then. So an
// unused, mistyped or expired invite never locks an active client out. A new invite replaces the
// client's older unused one. Inviting an active client again lets them choose a new password.
clientInviteRouter.post(
  "/",
  rateLimit("client-invite", { keyOf: (req) => `coach:${req.coachId ?? req.ip}`, max: INVITES_PER_15_MIN }),
  asyncHandler(async (req, res) => {
    const parsed = InviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const base = appBaseUrl();
    if (!base) {
      res.status(503).json({ error: NO_APP_URL });
      return;
    }
    const coachId = coachIdOf(req);
    const email = parsed.data.email;
    // Another client already signs in with this address: refuse up front (set-password would too),
    // with a message that does not say whose client it is.
    const taken = await prisma.client.findFirst({ where: { loginEmail: email, NOT: { id: client.id } }, select: { id: true } });
    if (taken) {
      res.status(409).json({ error: LOGIN_EMAIL_TAKEN });
      return;
    }
    const invite = await prisma.$transaction((tx) => issueClientInvite(tx, coachId, client.id, email));
    const link = inviteLink(base, invite.token);
    const common = { loginEmail: email, inviteExpiresAt: invite.expiresAt };
    if (!emailConfigured()) {
      res.status(201).json({ ...common, sent: false, inviteLink: link, note: EMAIL_NOT_CONFIGURED_NOTE });
      return;
    }
    try {
      const coach = await prisma.coach.findUnique({ where: { id: coachId }, select: { name: true } });
      await deliverInviteEmail(email, coach?.name ?? "Your coach", link);
      res.status(201).json({ ...common, sent: true });
    } catch (err) {
      console.error("Client invite email failed:", err instanceof Error ? err.message : err);
      res.status(201).json({ ...common, sent: false, inviteLink: link, note: EMAIL_FAILED_NOTE });
    }
  }),
);
