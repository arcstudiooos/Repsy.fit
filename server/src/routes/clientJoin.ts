// Joining a coach with their code, the welcome questions, and client password reset (Prompt 77).
// Mounted at /api/client-auth next to clientAuth.ts - see "API contract" in CLAUDE.md.
//
// Who can take over an existing client record: ONLY someone who proves they own its email. A sign-up
// with an address the coach already sent an invite to does NOT attach on the spot (anyone who knows
// the code and a client's email could otherwise take that client's history); instead a fresh invite
// goes to that inbox, and using it attaches the record (the Prompt 65 set-password flow). No duplicate.
import crypto from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { rateLimit } from "../auth/rateLimit.js";
import { ClientForgotSchema, ClientJoinSchema, ClientProfileSchema, ClientResetSchema } from "../auth/schemas.js";
import { appBaseUrl, hashToken, RESET_TOKEN_TTL_MS } from "../auth/resetToken.js";
import { clientAccountIdOf, DECLINED, requireClient, setClientSessionCookie } from "../auth/clientSession.js";
import { issueClientInvite, inviteLink } from "../auth/clientInvite.js";
import { deliverClientResetEmail, deliverInviteEmail, deliverWelcomeEmail, emailConfigured } from "../auth/mailer.js";
import { BAD_JOIN_CODE, coachForCode } from "./joinCode.js";
import { BAD_RESET, FORGOT_REPLY, secretMissing } from "./auth.js";
import { asyncHandler } from "./clients.js";

export const EMAIL_HAS_ACCOUNT = "That email already has a client account. Please sign in.";
export const CHECK_YOUR_EMAIL =
  "Your coach has already added you. We've emailed you a link to finish joining - open it to set your password.";
export const CHECK_YOUR_EMAIL_NO_MAIL =
  "Your coach has already added you with this email. Ask them to send you an invite link to finish joining.";
const FROM_CLIENT = "From client: ";

export const clientJoinRouter = Router();

// POST /api/client-auth/join { code, name, email, password }
//   201 { id, name, loginEmail, joinStatus } + the CLIENT cookie (never the coach cookie): a new client
//       under the code's coach. joinStatus "pending" when that coach approves new clients first.
//   202 { status: "check-email", message }: the coach already invited this email - see the note above.
//   404 BAD_JOIN_CODE (unknown / off code), 409 EMAIL_HAS_ACCOUNT, 400 validation.
/** Per address too, so one email cannot be hammered from many IPs (or used to spam its owner). */
const JOINS_PER_EMAIL = 5;
/** A live invite younger than this is not replaced: no re-sending, and the coach's link keeps working. */
export const REINVITE_AFTER_MS = 15 * 60 * 1000;

clientJoinRouter.post(
  "/join",
  rateLimit("client-join"),
  rateLimit("client-join-email", {
    keyOf: (req) => `email:${String((req.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase()}`,
    max: JOINS_PER_EMAIL,
  }),
  asyncHandler(async (req, res) => {
    if (secretMissing(res)) return;
    const parsed = ClientJoinSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const { code, name, email, password } = parsed.data;
    const coach = await coachForCode(code);
    if (!coach) return void res.status(404).json({ error: BAD_JOIN_CODE });

    // An address that already signs in (with any coach) is refused, without saying whose client it is.
    const existing = await prisma.client.findUnique({ where: { loginEmail: email }, select: { id: true } });
    if (existing) return void res.status(409).json({ error: EMAIL_HAS_ACCOUNT });

    // The coach already added this person and invited this address: prove the inbox first. Any invite
    // counts, even an expired one: the coach meant this address for this client.
    const invited = await prisma.clientInvite.findMany({
      where: { coachId: coach.id, email, client: { passwordHash: null, loginEmail: null } },
      select: { clientId: true },
      distinct: ["clientId"],
    });
    if (invited.length === 1) {
      const base = appBaseUrl();
      const clientId = invited[0].clientId;
      const recent = await prisma.clientInvite.findFirst({
        where: { clientId, usedAt: null, expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - REINVITE_AFTER_MS) } },
        select: { id: true },
      });
      if (recent) return void res.status(202).json({ status: "check-email", message: CHECK_YOUR_EMAIL });
      if (base && emailConfigured()) {
        const invite = await prisma.$transaction((tx) => issueClientInvite(tx, coach.id, clientId, email));
        void deliverInviteEmail(email, coach.name, inviteLink(base, invite.token)).catch((err) =>
          console.error("Join invite email failed:", err instanceof Error ? err.message : err),
        );
        return void res.status(202).json({ status: "check-email", message: CHECK_YOUR_EMAIL });
      }
      return void res.status(202).json({ status: "check-email", message: CHECK_YOUR_EMAIL_NO_MAIL });
    }

    const passwordHash = await hashPassword(password);
    let client: { id: string; name: string; loginEmail: string | null; joinStatus: string; clientSessionVersion: number };
    try {
      client = await prisma.client.create({
        data: {
          coachId: coach.id,
          name,
          loginEmail: email,
          passwordHash,
          joinedVia: "code",
          joinStatus: coach.approveNewClients ? "pending" : "active",
        },
        select: { id: true, name: true, loginEmail: true, joinStatus: true, clientSessionVersion: true },
      });
    } catch (err) {
      // Two sign-ups with one address at the same moment: the unique loginEmail lets only one win.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return void res.status(409).json({ error: EMAIL_HAS_ACCOUNT });
      }
      throw err;
    }
    setClientSessionCookie(res, client.id, client.clientSessionVersion);
    res.status(201).json({ id: client.id, name: client.name, loginEmail: client.loginEmail, joinStatus: client.joinStatus });

    const base = appBaseUrl();
    if (base) {
      void deliverWelcomeEmail(email, coach.name, `${base}/client/login`).catch((err) =>
        console.error("Welcome email failed:", err instanceof Error ? err.message : err),
      );
    }
  }),
);

export const HEALTH_CONSENT_NEEDED = "Please tick the box to let your coach store your health details, or leave weight, height and injuries empty.";

// GET /api/client-auth/me/profile -> the client's own welcome-question answers (for the form).
clientJoinRouter.get(
  "/me/profile",
  requireClient,
  asyncHandler(async (req, res) => {
    const c = await prisma.client.findUnique({
      where: { id: clientAccountIdOf(req) },
      select: { goal: true, age: true, heightCm: true, weightKg: true, level: true, units: true, notes: true, weeklyCheckInDay: true, healthConsentAt: true },
    });
    if (!c) return void res.status(404).json({ error: "Your account was not found. Please ask your coach." });
    const line = c.notes.split("\n").find((l) => l.startsWith(FROM_CLIENT));
    // Only the client's OWN line from notes - never the coach's private notes.
    res.json({ goal: c.goal, age: c.age, heightCm: c.heightCm, weightKg: c.weightKg, level: c.level, units: c.units, weeklyCheckInDay: c.weeklyCheckInDay, healthConsent: c.healthConsentAt !== null, injuries: line ? line.slice(FROM_CLIENT.length) : "" });
  }),
);

// PATCH /api/client-auth/me/profile { goal?, age?, heightCm?, weightKg?, level?, injuries?, units?, skip? } -> 204
// Only these fields. Injuries / notes go into Client.notes as ONE line starting "From client: ", which
// replaces the client's previous line and never touches the coach's own notes. Marks the welcome done.
// Pending clients may answer too (it helps the coach decide whether to approve), so this sits behind
// requireClient; declined clients get 403.
clientJoinRouter.patch(
  "/me/profile",
  requireClient,
  asyncHandler(async (req, res) => {
    if (req.clientJoinStatus === "declined") return void res.status(403).json({ error: DECLINED });
    const parsed = ClientProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const { skip, injuries, healthConsent, ...fields } = parsed.data;
    const id = clientAccountIdOf(req);
    // Health details (weight, height, injuries) need the client's explicit consent, asked separately from
    // sign-up and recorded once with its time. Only a CHANGE needs it: re-sending a value already on the
    // record (for example one the coach entered) or clearing one does not.
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.client.findUnique({
        where: { id },
        select: { notes: true, onboardedAt: true, healthConsentAt: true, weightKg: true, heightCm: true },
      });
      if (!current) return "ok";
      const oldLine = current.notes.split("\n").find((l) => l.startsWith(FROM_CLIENT))?.slice(FROM_CLIENT.length) ?? "";
      const newLine = (injuries ?? "").replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ").trim();
      const changes = (v: number | null | undefined, was: number | null) => v != null && v !== was;
      const healthGiven =
        !skip && (changes(fields.weightKg, current.weightKg) || changes(fields.heightCm, current.heightCm) || (newLine !== "" && newLine !== oldLine));
      if (healthGiven && !current.healthConsentAt && !healthConsent) return "consent";
      const data: Prisma.ClientUpdateInput = { onboardedAt: current.onboardedAt ?? new Date() };
      if (healthConsent && !current.healthConsentAt) data.healthConsentAt = new Date();
      if (!skip) {
        Object.assign(data, fields);
        if (injuries !== undefined) {
          const coachLines = current.notes.split("\n").filter((l) => !l.startsWith(FROM_CLIENT));
          const kept = coachLines.join("\n").trimEnd();
          // One line only: every kind of line break (\r, \n, U+2028/2029) becomes a space.
          const mine = injuries.replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ").trim();
          data.notes = mine ? (kept ? `${kept}\n${FROM_CLIENT}${mine}` : `${FROM_CLIENT}${mine}`) : kept;
        }
      }
      await tx.client.update({ where: { id }, data });
      return "ok";
    });
    if (result === "consent") return void res.status(400).json({ error: HEALTH_CONSENT_NEEDED });
    res.status(204).end();
  }),
);

// POST /api/client-auth/forgot { email } -> always 200 { message } (same reply for any email).
clientJoinRouter.post(
  "/forgot",
  rateLimit("client-forgot"),
  asyncHandler(async (req, res) => {
    const parsed = ClientForgotSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    res.json({ message: FORGOT_REPLY });
    void sendClientResetLink(parsed.data.email).catch((err) =>
      console.error("Client password reset failed:", err instanceof Error ? err.message : err),
    );
  }),
);

export async function issueClientResetToken(clientId: string, now = Date.now()): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.clientPasswordResetToken.deleteMany({ where: { clientId, usedAt: null } }),
    prisma.clientPasswordResetToken.create({
      data: { clientId, tokenHash: hashToken(token), expiresAt: new Date(now + RESET_TOKEN_TTL_MS) },
    }),
  ]);
  return token;
}

async function sendClientResetLink(email: string): Promise<void> {
  const client = await prisma.client.findUnique({ where: { loginEmail: email }, select: { id: true, loginEmail: true } });
  if (!client?.loginEmail) return;
  const base = appBaseUrl();
  if (!base) {
    console.error("Client password reset email not sent: APP_URL is not set, so no link can be built.");
    return;
  }
  const token = await issueClientResetToken(client.id);
  await deliverClientResetEmail(client.loginEmail, `${base}/client/reset-password?token=${encodeURIComponent(token)}`);
}

class InvalidResetToken extends Error {}

// POST /api/client-auth/reset { token, password } -> 204. Single use, 1 hour; ends every client session.
clientJoinRouter.post(
  "/reset",
  rateLimit("client-reset"),
  asyncHandler(async (req, res) => {
    const parsed = ClientResetSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const tokenHash = hashToken(parsed.data.token);
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.clientPasswordResetToken.updateMany({
          where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new InvalidResetToken();
        const row = await tx.clientPasswordResetToken.findUnique({ where: { tokenHash } });
        if (!row) throw new InvalidResetToken();
        // Prompt 78: proving the inbox also removes any Google sign-in linked to the account, so whoever
        // linked it (possibly not the inbox owner, for an address Google does not own) is locked out.
        await tx.client.update({ where: { id: row.clientId }, data: { passwordHash, googleSub: null, clientSessionVersion: { increment: 1 } } });
        await tx.clientPasswordResetToken.deleteMany({ where: { clientId: row.clientId, usedAt: null } });
      });
    } catch (err) {
      if (err instanceof InvalidResetToken) return void res.status(400).json({ error: BAD_RESET });
      throw err;
    }
    res.status(204).end();
  }),
);
