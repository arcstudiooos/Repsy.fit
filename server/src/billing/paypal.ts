// Talking to PayPal (Nov 2026).
//
// Kept deliberately small: an access token, and the three calls the app needs. No SDK - the REST
// API is three endpoints and a dependency here would be a dependency in production for no gain.
//
// Everything that MATTERS is verified here, server-side. The browser tells us a subscription id;
// it could tell us anything, so we ask PayPal what that id actually is before believing it.
import { PLANS, type PlanDef } from "./plans.js";

const BASE = () => (process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

/** The plans a coach can actually buy: everything except the free one. */
export const paidPlans = (): PlanDef[] => PLANS.filter((p) => p.price > 0);

export const paypalConfigured = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && paidPlans().every((p) => planIdFor(p.key)));

/** The plan id for a tier, from the environment. Not secret: it appears in the checkout. */
export function planIdFor(tier: string): string | undefined {
  return process.env[`PAYPAL_PLAN_${tier.toUpperCase()}`];
}

/** The tier a plan id belongs to, or undefined if it is not one of ours. */
export function tierForPlanId(planId: string): string | undefined {
  return paidPlans().find((p) => planIdFor(p.key) === planId)?.key;
}

/** Cached because PayPal's token lasts hours and every webhook would otherwise fetch a new one. */
let cached: { token: string; expiresAt: number } | null = null;

/** Thrown only inside this module; every exported function turns it into a quiet failure. */
class PaypalUnavailable extends Error {}

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PaypalUnavailable(`PayPal token request failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/**
 * Never throws. A wrong key, an expired secret, PayPal being down or the network failing all come
 * back as ok:false, because the alternative - an error escaping an async route - takes the whole
 * server down and stops coaches doing work that has nothing to do with billing. That happened once,
 * with live credentials pointed at the sandbox endpoint.
 */
async function call(method: string, path: string, body?: unknown) {
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  } catch (err) {
    console.error(`PayPal call failed: ${method} ${path}`, err instanceof Error ? err.message : err);
    return { ok: false, status: 0, json: {} as Record<string, unknown> };
  }
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

export type PaypalTransaction = {
  id: string;
  time: string;
  amount: string;
  currency: string;
  status: string;
};

/**
 * The payments PayPal has actually taken for a subscription. PayPal is the payer of record - we
 * never invent a number here, we report what it says. Defaults to the last two years, which is
 * PayPal's own limit for this endpoint.
 */
export async function listTransactions(subscriptionId: string): Promise<PaypalTransaction[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 730 * 86_400_000);
  const query = `start_time=${start.toISOString()}&end_time=${end.toISOString()}`;
  const res = await call("GET", `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/transactions?${query}`);
  if (!res.ok) return [];
  const rows = (res.json.transactions ?? []) as Record<string, unknown>[];
  return rows.map((t) => {
    const gross = (t.amount_with_breakdown as { gross_amount?: { value?: string; currency_code?: string } })?.gross_amount;
    return {
      id: String(t.id),
      time: String(t.time),
      amount: String(gross?.value ?? ""),
      currency: String(gross?.currency_code ?? ""),
      status: String(t.status),
    };
  });
}

/**
 * Ends a subscription at PayPal. The webhook then confirms it; this does not write to the db.
 *
 * Idempotent on purpose. A cancel can succeed at PayPal and still look like a failure here - a
 * timeout, a dropped connection, a retry on an already-cancelled subscription. Reporting "could not
 * cancel" for a subscription that IS cancelled is the worst answer we can give: the coach clicks
 * again, or believes they are still being charged. So on any failure we ask PayPal what the state
 * actually is, and treat an already-ended subscription as success.
 */
export async function cancelSubscription(id: string, reason: string): Promise<boolean> {
  const res = await call("POST", `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason });
  if (res.ok || res.status === 204) return true;
  const now = await getSubscription(id);
  return now !== null && (now.status === "CANCELLED" || now.status === "EXPIRED");
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
