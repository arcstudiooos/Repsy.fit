// "Continue with Google" routes for coaches - see src/auth/google.ts for the flow and config.
//   GET /api/auth/providers        -> { google: boolean } (the login page shows the button when true)
//   GET /api/auth/google/start     -> 302 to Google (sets the state + PKCE cookie)
//   GET /api/auth/callback/google  -> 302 to /app signed in, or to /login?google=<reason>
//
// Who gets signed in (security review, Nov 2026 - register never proves email ownership, so an
// existing account with this email may have been made by someone else):
//   1. the coach already linked to this Google account (googleSub);
//   2. else, ONLY when Google is authoritative for the address (Gmail, or Workspace hd = domain), the
//      coach with that email, if not linked to another Google account. Linking proves ownership, so
//      the old password is replaced and every older session ends (sessionVersion + 1): a squatter
//      who pre-registered the address loses it. The owner can set a password via "Forgot password".
//   3. else, if a coach with that email exists, refuse (?google=link: log in with the password);
//   4. else a new coach (the first coach ever also claims the demo data, as on register).
import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { claimDemoData } from "../auth/claimDemoData.js";
import { hashPassword } from "../auth/password.js";
import { rateLimit } from "../auth/rateLimit.js";
import { cookieOptions, readCookie, sessionSecret, setSessionCookie } from "../auth/session.js";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_MS,
  GoogleAuthError,
  exchangeCode,
  googleAuthUrl,
  googleConfig,
  googleOrigin,
  attemptFor,
  CLIENT_STATE_PREFIX,
  newAttempt,
  type GoogleIdentity,
} from "../auth/google.js";
import { clientFail, finishClientGoogle } from "./clientGoogle.js";
import { asyncHandler } from "./clients.js";

export const googleAuthRouter = Router();

/** Where a failed coach attempt lands: the login page shows a plain message for each reason. */
const fail = (reason: string) => `/login?google=${reason}`;

/** The URLs carry a one-time code and state: never cache them or leak them in a Referer. */
function noStore(_req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  next();
}

const unguessablePassword = () => hashPassword(crypto.randomBytes(32).toString("base64url"));

googleAuthRouter.get("/providers", (_req, res) => {
  res.json({ google: googleConfig() !== null });
});

googleAuthRouter.get("/google/start", noStore, rateLimit("google-start", { max: 30 }), (req, res) => {
  const cfg = googleConfig();
  if (!cfg || !sessionSecret()) {
    res.redirect(302, fail("off"));
    return;
  }
  // Run the whole flow on the registered origin (e.g. a click on repsy.fit/login moves to app.repsy.fit),
  // so the state cookie, the callback and the session cookie share one host.
  // (Host only: the scheme behind Render's proxy is not part of the decision, so this cannot loop.)
  const origin = googleOrigin(cfg);
  if (process.env.APP_URL && req.get("host") !== new URL(origin).host) {
    res.redirect(302, `${origin}/api/auth/google/start`);
    return;
  }
  const attempt = newAttempt();
  res.cookie(GOOGLE_STATE_COOKIE, attempt.cookie, { ...cookieOptions(), maxAge: GOOGLE_STATE_MS });
  res.redirect(302, googleAuthUrl(cfg, attempt.state, attempt.verifier));
});

/** Applies the sign-in rules above. Returns the coach to sign in, or a failure reason. */
async function coachFor(who: GoogleIdentity): Promise<{ id: string; sessionVersion: number } | string> {
  const linked = await prisma.coach.findUnique({ where: { googleSub: who.sub } });
  if (linked) return linked;
  const byEmail = await prisma.coach.findUnique({ where: { email: who.email } });
  if (byEmail) {
    if (!who.emailAuthoritative || byEmail.googleSub) return "link";
    const passwordHash = await unguessablePassword();
    // Only if still unlinked (a concurrent link loses), and ending the old password and sessions.
    const done = await prisma.coach.updateMany({
      where: { id: byEmail.id, googleSub: null },
      data: { googleSub: who.sub, passwordHash, sessionVersion: { increment: 1 } },
    });
    if (done.count !== 1) return "link";
    return (await prisma.coach.findUnique({ where: { id: byEmail.id } })) ?? "failed";
  }
  const passwordHash = await unguessablePassword();
  return prisma.$transaction(async (tx) => {
    const created = await tx.coach.create({ data: { name: who.name, email: who.email, passwordHash, googleSub: who.sub } });
    await claimDemoData(tx, created.id);
    return created;
  });
}

googleAuthRouter.get(
  "/callback/google",
  noStore,
  rateLimit("google-callback", { max: 30 }),
  asyncHandler(async (req, res) => {
    const cfg = googleConfig();
    const attempt = attemptFor(readCookie(req, GOOGLE_STATE_COOKIE), req.query.state);
    res.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions());
    // Prompt 78: client attempts (sign-in or join) fail back to the client pages, never the coach login.
    // Without a valid cookie, the state's own prefix still says whether this was a client attempt.
    const kind = attempt?.kind ?? (typeof req.query.state === "string" && req.query.state.startsWith(CLIENT_STATE_PREFIX) ? "client" : "coach");
    const joinCode = kind.startsWith("join:") ? kind.slice(5) : null;
    const fail = (reason: string) => (kind === "coach" ? `/login?google=${reason}` : clientFail(reason, joinCode));
    if (!cfg || !sessionSecret()) return res.redirect(302, fail("off"));
    if (typeof req.query.error === "string") return res.redirect(302, fail("cancelled"));
    if (!attempt) return res.redirect(302, fail("expired"));
    const verifier = attempt.verifier;
    const code = req.query.code;
    if (typeof code !== "string" || !code) return res.redirect(302, fail("failed"));

    let who: GoogleIdentity;
    try {
      who = await exchangeCode(cfg, code, verifier);
    } catch (err) {
      if (err instanceof GoogleAuthError) {
        console.error(`Google sign-in failed: ${err.reason}`);
        return res.redirect(302, fail(err.reason === "unverified" ? "unverified" : "failed"));
      }
      throw err;
    }

    if (kind !== "coach") return finishClientGoogle(res, who, kind);

    let result: Awaited<ReturnType<typeof coachFor>>;
    try {
      result = await coachFor(who);
    } catch (err) {
      // Two callbacks at once (double click, two tabs), or a register in between: the unique email /
      // googleSub index refused one write. Whoever won is linked now - try once more.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const again = await prisma.coach.findUnique({ where: { googleSub: who.sub } });
        result = again ?? "failed";
      } else throw err;
    }
    if (typeof result === "string") return res.redirect(302, fail(result));
    setSessionCookie(res, result.id, result.sessionVersion);
    res.redirect(302, "/app");
  }),
);
