// Sessions (Prompt 44): a signed, stateless token (JWT, HS256) in an httpOnly cookie, 7-day expiry.
// Built on node:crypto so no extra dependency is needed. The secret comes ONLY from the
// SESSION_SECRET env var. In production a missing secret disables sign-in with a logged reason
// (see sessionSecret); outside production a random per-process secret is used, so local dev and
// tests work (sessions then end whenever the server restarts).
import crypto from "node:crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import { isSessionCurrent } from "./sessionCheck.js";

export const SESSION_COOKIE = "repsy_session";
export const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by sessionMiddleware when a valid session cookie is sent; undefined when signed out. */
      coachId?: string;
    }
  }
}

let devSecret: string | undefined;

/** The signing secret, or null when it is missing in production. */
export function sessionSecret(): string | null {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") return null;
  devSecret ??= crypto.randomBytes(32).toString("hex");
  return devSecret;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (data: string, secret: string) => crypto.createHmac("sha256", secret).update(data).digest("base64url");
const HEADER = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));

/**
 * Creates a token for `coachId` that expires 7 days after `now`. `version` is the coach's
 * sessionVersion (Prompt 47): raising it in the database ends every older token. Throws if there is no secret.
 */
export function signSession(coachId: string, now = Date.now(), version = 0): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const payload = b64(JSON.stringify({ sub: coachId, v: version, iat: Math.floor(now / 1000), exp: Math.floor((now + SESSION_MS) / 1000) }));
  return `${HEADER}.${payload}.${sign(`${HEADER}.${payload}`, secret)}`;
}

/** Coach id and session version of a valid, unexpired token; null for anything else. */
export function verifySessionClaims(token: string): { coachId: string; version: number } | null {
  const secret = sessionSecret();
  const parts = token.split(".");
  if (!secret || parts.length !== 3 || parts[0] !== HEADER) return null;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown; v?: unknown };
    if (typeof p.sub !== "string" || typeof p.exp !== "number" || p.exp * 1000 <= Date.now()) return null;
    // Tokens issued before Prompt 47 have no "v": they count as version 0.
    return { coachId: p.sub, version: typeof p.v === "number" ? p.v : 0 };
  } catch {
    return null;
  }
}

/** Returns the coach id for a valid, unexpired token; null for anything else. */
export function verifySession(token: string): { coachId: string } | null {
  const claims = verifySessionClaims(token);
  return claims ? { coachId: claims.coachId } : null;
}

function cookieOptions(): CookieOptions {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
}

export function setSessionCookie(res: Response, coachId: string, version = 0): void {
  res.cookie(SESSION_COOKIE, signSession(coachId, Date.now(), version), { ...cookieOptions(), maxAge: SESSION_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Reads the session cookie and attaches `req.coachId` when it is valid AND still current (the coach
 * has not changed or reset their password since it was issued - Prompt 47). It never blocks a
 * request itself: requireCoach (Prompt 45) answers 401 for the protected routes.
 */
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? verifySessionClaims(token) : null;
    if (session && (await isSessionCurrent(session.coachId, session.version))) req.coachId = session.coachId;
    next();
  } catch (err) {
    next(err);
  }
}
