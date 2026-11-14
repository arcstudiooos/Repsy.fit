// Talking to PayPal (Nov 2026).
//
// Kept deliberately small: an access token, and the three calls the app needs. No SDK - the REST
// API is three endpoints and a dependency here would be a dependency in production for no gain.
//
// Everything that MATTERS is verified here, server-side. The browser tells us a subscription id;
// it could tell us anything, so we ask PayPal what that id actually is before believing it.
import { PLAN_TIERS, type PlanTier } from "./state.js";

const BASE = () => (process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

export const paypalConfigured = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && planIdFor("Solo"));

/** The plan id for a tier, from the environment. Not secret: it appears in the checkout. */
export function planIdFor(tier: PlanTier): string | undefined {
  return process.env[`PAYPAL_PLAN_${tier.toUpperCase()}`];
}

/** The tier a plan id belongs to, or undefined if it is not one of ours. */
export function tierForPlanId(planId: string): PlanTier | undefined {
  return PLAN_TIERS.find((t) => planIdFor(t) === planId);
}

/** Cached because PayPal's token lasts hours and every webhook would otherwise fetch a new one. */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token request failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

export type PaypalSubscription = {
  id: string;
  status: string;
  planId: string;
  /** When the period already paid for runs out. */
  nextBillingAt: Date | null;
  /** The account the subscription was created under, used to spot a mismatched custom_id. */
  customId: string | null;
};

function parse(json: Record<string, unknown>): PaypalSubscription {
  const billing = json.billing_info as { next_billing_time?: string } | undefined;
  return {
    id: String(json.id),
    status: String(json.status),
    planId: String(json.plan_id),
    nextBillingAt: billing?.next_billing_time ? new Date(billing.next_billing_time) : null,
    customId: json.custom_id ? String(json.custom_id) : null,
  };
}

/** What PayPal says about a subscription. The only version of the truth the app trusts. */
export async function getSubscription(id: string): Promise<PaypalSubscription | null> {
  const res = await call("GET", `/v1/billing/subscriptions/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return parse(res.json);
}

/** Ends a subscription at PayPal. The webhook then confirms it; this does not write to the db. */
export async function cancelSubscription(id: string, reason: string): Promise<boolean> {
  const res = await call("POST", `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason });
  return res.ok || res.status === 204;
}

/**
 * Asks PayPal whether a webhook really came from PayPal. Their signature scheme needs a cert
 * download and chain validation to check offline, so this uses their verification endpoint: one
 * extra call per webhook, and no home-made crypto to get subtly wrong.
 */
export async function verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const required = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  if (required.some((h) => !headers[h])) return false;
  const res = await call("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  });
  return res.ok && res.json.verification_status === "SUCCESS";
}
