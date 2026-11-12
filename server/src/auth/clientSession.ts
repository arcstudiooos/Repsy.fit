// Client sessions (Prompt 65): the CLIENT sign-in, kept apart from the coach session in three ways.
//   1. Its own cookie name (repsy_client_session), never the coach's repsy_session.
//   2. Its own signing key: HMAC(SESSION_SECRET, "repsy:client-session:v1"), so a client token
//      never verifies as a coach token (and a coach token never verifies here), even if someone
//      copies one cookie's value into the other.
//   3. An audience claim `aud: "client"` that this module requires and the coach module refuses.
// The client middleware only ever sets req.clientAccountId; requireCoach looks only at req.coachId,
// so a client session gets 401 on every coach route, and requireClient gives coaches 401 here.
import crypto from "node:crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { sessionSecret } from "./session.js";

export const CLIENT_SESSION_COOKIE = "repsy_client_session";
export const CLIENT_SESSION_DAYS = 7;
const CLIENT_SESSION_MS = CLIENT_SESSION_DAYS * 24 * 60 * 60 * 1000;
const AUDIENCE = "client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The signed-in CLIENT's own client id (client sessions only). Never set by a coach session. */
      clientAccountId?: string;
      /** Prompt 77: the signed-in client's joinStatus ("active" | "pending" | "declined"). */
      clientJoinStatus?: string;
    }
  }
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const HEADER = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));

/** The client-session key: derived from SESSION_SECRET, never equal to it. Null when there is no secret. */
function clientKey(): Buffer | null {
  const secret = sessionSecret();
  return secret ? crypto.createHmac("sha256", secret).update("repsy:client-session:v1").digest() : null;
}

const sign = (data: string, key: Buffer) => crypto.createHmac("sha256", key).update(data).digest("base64url");

export function signClientSession(clientId: string, version: number, now = Date.now()): string {
  const key = clientKey();
  if (!key) throw new Error("SESSION_SECRET is not set");
  const payload = b64(
    JSON.stringify({ sub: clientId, aud: AUDIENCE, v: version, iat: Math.floor(now / 1000), exp: Math.floor((now + CLIENT_SESSION_MS) / 1000) }),
  );
  return `${HEADER}.${payload}.${sign(`${HEADER}.${payload}`, key)}`;
}

/** Client id + version of a valid, unexpired CLIENT token; null for anything else (coach tokens included). */
export function verifyClientSession(token: string): { clientId: string; version: number } | null {
  const key = clientKey();
  const parts = token.split(".");
  if (!key || parts.length !== 3 || parts[0] !== HEADER) return null;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, key));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { sub?: unknown; aud?: unknown; exp?: unknown; v?: unknown };
    if (p.aud !== AUDIENCE || typeof p.sub !== "string" || typeof p.v !== "number") return null;
    if (typeof p.exp !== "number" || p.exp * 1000 <= Date.now()) return null;
    return { clientId: p.sub, version: p.v };
  } catch {
    return null;
  }
}

function cookieOptions(): CookieOptions {
  // Secure whenever this is a real deployment: Render does not set NODE_ENV, so RENDER counts too.
  const deployed = process.env.NODE_ENV === "production" || !!process.env.RENDER;
  return { httpOnly: true, secure: deployed, sameSite: "lax", path: "/" };
}

export function setClientSessionCookie(res: Response, clientId: string, version: number): void {
  res.cookie(CLIENT_SESSION_COOKIE, signClientSession(clientId, version), { ...cookieOptions(), maxAge: CLIENT_SESSION_MS });
}

export function clearClientSessionCookie(res: Response): void {
  res.clearCookie(CLIENT_SESSION_COOKIE, cookieOptions());
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

/** A client token is current while the client still exists, still has a password, and its version
 *  matches. Returns the client's joinStatus when current, else null. */
async function currentClientStatus(clientId: string, version: number): Promise<{ joinStatus: string } | null> {
  const row = await prisma.client.findUnique({
    where: { id: clientId },
    select: { clientSessionVersion: true, passwordHash: true, joinStatus: true },
  });
  return row && row.passwordHash !== null && row.clientSessionVersion === version ? { joinStatus: row.joinStatus } : null;
}

/** Reads ONLY the client cookie and sets ONLY req.clientAccountId. Never blocks by itself. */
export async function clientSessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(req, CLIENT_SESSION_COOKIE);
    const session = token ? verifyClientSession(token) : null;
    const status = session ? await currentClientStatus(session.clientId, session.version) : null;
    if (session && status) {
      req.clientAccountId = session.clientId;
      req.clientJoinStatus = status.joinStatus;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Guard for client routes: 401 unless a client session is present. A coach session does not count. */
export function requireClient(req: Request, res: Response, next: NextFunction): void {
  if (!req.clientAccountId) {
    res.status(401).json({ error: "You are not signed in." });
    return;
  }
  next();
}

export const NOT_APPROVED = "Your coach has not approved your account yet.";
export const DECLINED = "Your coach declined your request to join.";

/**
 * Prompt 77: guard for every client DATA route. 401 without a client session (as requireClient);
 * 403 while the coach has not approved the client (or declined them). /me stays reachable so the
 * waiting screen can show.
 */
export function requireActiveClient(req: Request, res: Response, next: NextFunction): void {
  if (!req.clientAccountId) {
    res.status(401).json({ error: "You are not signed in." });
    return;
  }
  if (req.clientJoinStatus !== "active") {
    res.status(403).json({ error: req.clientJoinStatus === "declined" ? DECLINED : NOT_APPROVED });
    return;
  }
  next();
}

/** The signed-in client's own id. Only call from routes behind requireClient. */
export function clientAccountIdOf(req: Request): string {
  if (!req.clientAccountId) throw new Error("clientAccountIdOf called on a route without requireClient");
  return req.clientAccountId;
}
