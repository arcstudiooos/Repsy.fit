// Inbound mail forwarding (owner, Nov 2026).
//
// Resend receives mail for hello@repsy.fit but has no dashboard forwarding setting: the only way to
// get it into a real inbox is to answer the "email.received" webhook yourself. Resend's webhooks
// carry metadata only (no body or attachments), so this asks Resend to forward the stored message,
// and falls back to fetching it and sending a copy if that endpoint is unavailable.
//
// Security: every request is checked against the webhook signing secret (Svix "standard webhooks"
// scheme) using node:crypto - no new dependency - and timestamps older than five minutes are
// refused, so a captured payload cannot be replayed. Nothing about the message body is logged.
import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";

const RESEND_API = "https://api.resend.com";
/** How far a webhook timestamp may be from now (Svix's own tolerance). */
const TOLERANCE_SECONDS = 5 * 60;

type Env = { apiKey: string; secret: string; to: string; from: string };

/** Reads the four settings this needs; returns null when the feature isn't configured. */
export function inboundEnv(env: NodeJS.ProcessEnv = process.env): Env | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const secret = env.RESEND_WEBHOOK_SECRET?.trim();
  const to = env.INBOUND_FORWARD_TO?.trim();
  if (!apiKey || !secret || !to) return null;
  return { apiKey, secret, to, from: env.INBOUND_FORWARD_FROM?.trim() || "Repsy <hello@repsy.fit>" };
}

/**
 * The Svix / standard-webhooks check: HMAC-SHA256 over "<id>.<timestamp>.<raw body>" with the
 * signing secret, compared against every v1 signature in the svix-signature header.
 */
export function verifyWebhook(opts: {
  body: string;
  id?: string;
  timestamp?: string;
  signature?: string;
  secret: string;
  now?: number;
}): boolean {
  const { body, id, timestamp, signature, secret } = opts;
  if (!id || !timestamp || !signature) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - sent) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  // The header is a space-separated list, each entry "v1,<base64>"; any match is enough.
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    let given: Buffer;
    try {
      given = Buffer.from(value, "base64");
    } catch {
      return false;
    }
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

async function resend(env: Env, method: "GET" | "POST", path: string, body?: unknown) {
  const res = await fetch(`${RESEND_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

type ReceivedEmail = {
  from?: string;
  to?: string[];
  subject?: string;
  html?: string | null;
  text?: string | null;
  created_at?: string;
  headers?: Record<string, string>;
};

/** Forwards one received email. Resend's own forward keeps attachments; the copy is the fallback. */
async function forward(env: Env, emailId: string) {
  const direct = await resend(env, "POST", `/emails/receiving/${emailId}/forward`, { to: env.to, from: env.from });
  if (direct.ok) return { how: "forward" as const };

  const got = await resend(env, "GET", `/emails/receiving/${emailId}`);
  if (!got.ok) return { how: "failed" as const, status: got.status };
  const mail = (got.json ?? {}) as ReceivedEmail;
  const sender = mail.headers?.from ?? mail.from ?? "unknown sender";
  const note = `Forwarded by Repsy.\nFrom: ${sender}\nTo: ${(mail.to ?? []).join(", ")}\nReceived: ${mail.created_at ?? ""}\n\n`;
  const sent = await resend(env, "POST", "/emails", {
    from: env.from,
    to: [env.to],
    reply_to: mail.from ? [mail.from] : undefined,
    subject: mail.subject ? `[repsy.fit] ${mail.subject}` : "[repsy.fit] (no subject)",
    text: mail.text ? note + mail.text : undefined,
    html: mail.html ? `<pre style="font:13px/1.5 monospace">${note.replace(/</g, "&lt;")}</pre>${mail.html}` : undefined,
  });
  return sent.ok ? { how: "copy" as const } : { how: "failed" as const, status: sent.status };
}

export const inboundMailRouter = Router();

// POST /api/inbound/resend - Resend's "email.received" webhook. Mounted with a raw body parser in
// app.ts, because the signature covers the exact bytes sent.
inboundMailRouter.post("/resend", async (req: Request, res: Response) => {
  const env = inboundEnv();
  if (!env) {
    res.status(503).json({ error: "Inbound forwarding is not configured." });
    return;
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : "";
  const header = (name: string) => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  if (
    !verifyWebhook({
      body: raw,
      id: header("svix-id"),
      timestamp: header("svix-timestamp"),
      signature: header("svix-signature"),
      secret: env.secret,
    })
  ) {
    res.status(401).json({ error: "Not found" });
    return;
  }

  let event: { type?: string; data?: { email_id?: string; id?: string; from?: string; subject?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: "Request body is not valid JSON." });
    return;
  }
  if (event.type !== "email.received") {
    res.status(200).json({ ignored: event.type ?? null });
    return;
  }
  const emailId = event.data?.email_id ?? event.data?.id;
  if (!emailId) {
    res.status(400).json({ error: "The event has no email id." });
    return;
  }

  const result = await forward(env, emailId);
  if (result.how === "failed") {
    // Subject and sender only: never the body of someone's mail.
    console.error(`inbound forward failed (${result.status}) for ${emailId} from ${event.data?.from ?? "?"}`);
    res.status(502).json({ error: "Could not forward the email." });
    return;
  }
  console.log(`inbound mail forwarded (${result.how}): ${event.data?.subject ?? "(no subject)"}`);
  res.status(200).json({ forwarded: true });
});
