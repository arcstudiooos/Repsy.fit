// "Continue with Google" for coaches: the OAuth 2.0 / OpenID Connect authorization-code flow,
// built on fetch and node:crypto (no new dependency).
//
// Flow: GET /api/auth/google/start sets a short-lived random `state` cookie and redirects to Google.
// Google sends the coach back to GET /api/auth/callback/google?code&state (the redirect URI
// registered in Google Cloud). The server checks `state`, swaps `code` for tokens at Google's token
// endpoint (server to server, over TLS, authenticated with the client secret) and reads the ID
// token's claims. Per OpenID Connect Core 3.1.3.7, an ID token received directly from the token
// endpoint over TLS may be trusted without checking its signature; the issuer, audience, expiry
// and verified-email claims are still checked here.
//
// Config (Render dashboard only, never in code): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// The redirect URI is APP_URL (or Render's own URL) + /api/auth/callback/google, and must match
// one of the "Authorized redirect URIs" in Google Cloud exactly.
import crypto from "node:crypto";
import { appBaseUrl } from "./resetToken.js";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";
/** __Host- when deployed (Secure, Path=/, no Domain), so a sibling subdomain cannot plant it. */
export const GOOGLE_STATE_COOKIE = process.env.NODE_ENV === "production" || process.env.RENDER ? "__Host-repsy_google_state" : "repsy_google_state";
export const GOOGLE_STATE_MS = 10 * 60 * 1000;

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/**
 * The Google config, or null when Google sign-in is not set up (the button is then hidden).
 * Needs APP_URL explicitly (no fallback to the onrender.com host): the state cookie, the callback
 * and the session cookie must all be on the one origin registered with Google.
 */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const base = process.env.APP_URL?.trim().replace(/\/+$/, "") || (process.env.NODE_ENV === "production" || process.env.RENDER ? null : appBaseUrl());
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: `${base}${GOOGLE_CALLBACK_PATH}` };
}

/** The origin of the registered redirect URI (where the whole flow must run). */
export function googleOrigin(cfg: GoogleConfig): string {
  return new URL(cfg.redirectUri).origin;
}

/** A fresh attempt: `state` (login-CSRF) and a PKCE `verifier` (RFC 7636), kept together in the cookie. */
export function newAttempt(): { state: string; verifier: string; cookie: string } {
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  return { state, verifier, cookie: `${state}.${verifier}` };
}

/** The PKCE verifier from the cookie when the state Google echoed back matches it (constant time); else null. */
export function verifierFor(cookie: string | undefined, fromQuery: unknown): string | null {
  if (!cookie || typeof fromQuery !== "string" || !fromQuery) return null;
  const [state, verifier] = cookie.split(".");
  if (!state || !verifier) return null;
  const a = Buffer.from(state);
  const b = Buffer.from(fromQuery);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? verifier : null;
}

export function googleAuthUrl(cfg: GoogleConfig, state: string, verifier: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}

/**
 * `emailAuthoritative`: Google owns this address for good (a Gmail address, or a Workspace account
 * whose `hd` is the email's own domain). Only then may the email alone link Google to an existing
 * Repsy account - another provider's verified address can change hands later.
 */
export type GoogleIdentity = { sub: string; email: string; name: string; emailAuthoritative: boolean };

export class GoogleAuthError extends Error {
  constructor(public readonly reason: "exchange" | "token" | "unverified") {
    super(reason);
  }
}

/** Checks the ID token's claims and returns who signed in. Throws GoogleAuthError for anything off. */
export function identityFromIdToken(idToken: string, clientId: string, nowSec = Math.floor(Date.now() / 1000)): GoogleIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleAuthError("token");
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new GoogleAuthError("token");
  }
  const issOk = c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com";
  const audOk = c.aud === clientId || (Array.isArray(c.aud) && c.aud.includes(clientId));
  const expOk = typeof c.exp === "number" && c.exp > nowSec - 60;
  if (!issOk || !audOk || !expOk || typeof c.sub !== "string" || !c.sub) throw new GoogleAuthError("token");
  if (typeof c.email !== "string" || !c.email || c.email_verified !== true) throw new GoogleAuthError("unverified");
  const email = c.email.trim().toLowerCase();
  const name = (typeof c.name === "string" && c.name.trim()) || email.split("@")[0];
  const domain = email.split("@")[1] ?? "";
  const emailAuthoritative = domain === "gmail.com" || domain === "googlemail.com" || (typeof c.hd === "string" && c.hd.toLowerCase() === domain);
  return { sub: c.sub, email, name: name.slice(0, 100), emailAuthoritative };
}

/** Swaps the authorization code for tokens at Google and returns the verified identity. */
export async function exchangeCode(cfg: GoogleConfig, code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<GoogleIdentity> {
  let res: Response;
  try {
    res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GoogleAuthError("exchange");
  }
  if (!res.ok) {
    // Google's error codes never contain secrets; they say what is misconfigured (redirect_uri_mismatch, invalid_client).
    const e = (await res.json().catch(() => ({}))) as { error?: unknown; error_description?: unknown };
    console.error(`Google token exchange refused: ${String(e.error ?? res.status)} ${String(e.error_description ?? "")}`.trim());
    throw new GoogleAuthError("exchange");
  }
  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown };
  if (typeof body.id_token !== "string") throw new GoogleAuthError("token");
  return identityFromIdToken(body.id_token, cfg.clientId);
}
