// "Continue with Google" for CLIENTS (Prompt 78). Starts here; finishes in the shared callback
// (routes/googleAuth.ts -> finishClientGoogle), because Google allows only the one registered redirect URI.
//   GET /api/client-auth/google/start             -> sign in to an existing client account
//   GET /api/client-auth/google/start?code=<CODE> -> join the coach whose join code this is
//
// Which client gets signed in (same reasoning as the coach rules in googleAuth.ts):
//   1. the client already linked to this Google account (Client.googleSub);
//   2. else, ONLY when Google is authoritative for the address (Gmail, or Workspace hd = domain):
//      a. the client whose login email this is, if not linked to another Google account. Linking proves
//         ownership: the old password is replaced and older sessions end (clientSessionVersion + 1);
//      b. joining: the ONE client of this coach invited at this address with no sign-in yet (the coach
//         added them) - Google has proved the inbox, so the record becomes theirs. No duplicate.
//   3. else, an address that already signs in -> refuse (?google=link: use email and password);
//   4. else, joining: a new client under the code's coach (joinedVia "code", pending if the coach approves);
//   5. else (signing in, no account) -> ?google=noaccount.
// On a join link, an account found in 1 or 2a that belongs to ANOTHER coach is not signed in silently:
// ?google=othercoach (sign in from /client/login instead).
// Coach and client Google accounts are separate columns and cookies: nothing here reads Coach.googleSub.
import crypto from "node:crypto";
import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { rateLimit } from "../auth/rateLimit.js";
import { cookieOptions, sessionSecret } from "../auth/session.js";
import { setClientSessionCookie } from "../auth/clientSession.js";
import { normalizeJoinCode } from "../auth/joinCode.js";
import { GOOGLE_STATE_COOKIE, GOOGLE_STATE_MS, googleAuthUrl, googleConfig, googleOrigin, newAttempt, type GoogleIdentity } from "../auth/google.js";
import { coachForCode } from "./joinCode.js";

export const clientGoogleRouter = Router();

/** Where a failed client attempt lands. A join goes back to its join page; a sign-in to /client/login. */
export function clientFail(reason: string, rawCode: string | null): string {
  const code = rawCode === null ? null : normalizeJoinCode(rawCode);
  const r = encodeURIComponent(reason);
  return code ? `/join/${encodeURIComponent(code)}?google=${r}` : `/client/login?google=${r}`;
}

clientGoogleRouter.get("/google/start", rateLimit("client-google-start", { max: 30 }), (req, res) => {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  const rawCode = req.query.code;
  const code = rawCode === undefined ? null : normalizeJoinCode(rawCode);
  if (rawCode !== undefined && !code) return res.redirect(302, "/client/login?google=badcode");
  const cfg = googleConfig();
  if (!cfg || !sessionSecret()) return res.redirect(302, clientFail("off", code));
  const origin = googleOrigin(cfg);
  if (process.env.APP_URL && req.get("host") !== new URL(origin).host) {
    return res.redirect(302, `${origin}/api/client-auth/google/start${code ? `?code=${code}` : ""}`);
  }
  const attempt = newAttempt(code ? `join:${code}` : "client");
  res.cookie(GOOGLE_STATE_COOKIE, attempt.cookie, { ...cookieOptions(), maxAge: GOOGLE_STATE_MS });
  res.redirect(302, googleAuthUrl(cfg, attempt.state, attempt.verifier));
});

const unguessablePassword = () => hashPassword(crypto.randomBytes(32).toString("base64url"));

type Signed = { id: string; clientSessionVersion: number; isNew: boolean };
/** The account found belongs to a different coach than the join link's: say so, don't silently sign in. */
const otherCoach = async (coachIdOfClient: string | null, code: string | null) => {
  if (!code) return false;
  const coach = await coachForCode(code);
  return !!coach && coach.id !== coachIdOfClient;
};

/** Applies the client rules above. Returns the client to sign in, or a failure reason. */
export async function clientFor(who: GoogleIdentity, code: string | null): Promise<Signed | string> {
  const now = new Date();
  const linked = await prisma.client.findUnique({ where: { googleSub: who.sub }, select: { id: true, coachId: true } });
  if (linked) {
    if (await otherCoach(linked.coachId, code)) return "othercoach";
    const row = await prisma.client.update({ where: { id: linked.id }, data: { lastGoogleAuthAt: now }, select: { id: true, clientSessionVersion: true } });
    return { ...row, isNew: false };
  }
  const byEmail = await prisma.client.findUnique({ where: { loginEmail: who.email }, select: { id: true, googleSub: true, coachId: true } });
  if (byEmail) {
    if (!who.emailAuthoritative || byEmail.googleSub) return "link";
    if (await otherCoach(byEmail.coachId, code)) return "othercoach";
    const passwordHash = await unguessablePassword();
    const done = await prisma.client.updateMany({
      where: { id: byEmail.id, googleSub: null },
      data: { googleSub: who.sub, passwordHash, clientSessionVersion: { increment: 1 }, lastGoogleAuthAt: now },
    });
    if (done.count !== 1) return "link";
    const row = await prisma.client.findUnique({ where: { id: byEmail.id }, select: { id: true, clientSessionVersion: true } });
    return row ? { ...row, isNew: false } : "failed";
  }
  if (!code) return "noaccount";
  const coach = await coachForCode(code);
  if (!coach) return "badcode";
  const passwordHash = await unguessablePassword();

  if (who.emailAuthoritative) {
    const invited = await prisma.clientInvite.findMany({
      where: { coachId: coach.id, email: who.email, client: { passwordHash: null, loginEmail: null, googleSub: null } },
      select: { clientId: true },
      distinct: ["clientId"],
    });
    if (invited.length === 1) {
      const clientId = invited[0].clientId;
      // One transaction: the attach, dropping the old invite links and the read-back can't interleave
      // with an invite being used at the same moment.
      const row = await prisma.$transaction(async (tx) => {
        const done = await tx.client.updateMany({
          where: { id: clientId, coachId: coach.id, passwordHash: null, loginEmail: null, googleSub: null },
          data: { loginEmail: who.email, googleSub: who.sub, passwordHash, clientSessionVersion: { increment: 1 }, lastGoogleAuthAt: now },
        });
        if (done.count !== 1) return null;
        await tx.clientInvite.deleteMany({ where: { clientId, usedAt: null } });
        return tx.client.findUnique({ where: { id: clientId }, select: { id: true, clientSessionVersion: true } });
      });
      if (row) return { ...row, isNew: false };
    }
  }

  const created = await prisma.client.create({
    data: {
      coachId: coach.id,
      name: who.name,
      loginEmail: who.email,
      googleSub: who.sub,
      passwordHash,
      lastGoogleAuthAt: now,
      joinedVia: "code",
      joinStatus: coach.approveNewClients ? "pending" : "active",
    },
    select: { id: true, clientSessionVersion: true },
  });
  return { ...created, isNew: true };
}

/** The callback's client branch: signs the client in (CLIENT cookie only) and picks where to land. */
export async function finishClientGoogle(res: Response, who: GoogleIdentity, kind: "client" | `join:${string}`): Promise<void> {
  const code = kind.startsWith("join:") ? normalizeJoinCode(kind.slice(5)) : null;
  let result: Signed | string;
  try {
    result = await clientFor(who, code);
  } catch (err) {
    // Two callbacks at once: the unique googleSub / loginEmail index refused one write. Whoever won is linked.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.client.findUnique({ where: { googleSub: who.sub }, select: { id: true } });
      result = again
        ? { ...(await prisma.client.update({ where: { id: again.id }, data: { lastGoogleAuthAt: new Date() }, select: { id: true, clientSessionVersion: true } })), isNew: false }
        : "link";
    } else throw err;
  }
  if (typeof result === "string") return void res.redirect(302, clientFail(result, code));
  setClientSessionCookie(res, result.id, result.clientSessionVersion);
  // /client sends a client who has not answered the welcome questions on to /client/welcome.
  res.redirect(302, "/client");
}

/** Clears the state cookie with the same options it was set with. */
export function clearState(res: Response): void {
  res.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions());
}
