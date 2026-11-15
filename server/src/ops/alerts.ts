// Telling the owner when something is wrong (Nov 2026).
//
// Repsy had no alerting at all: a 2am crash reached the owner only via an annoyed coach. This sends
// an email through the SMTP provider the app already uses - no new vendor, no new dependency.
//
// WHAT THIS CANNOT DO: notice that the server is DEAD. Code inside a process cannot email you about
// its own death. That needs something outside the app (an uptime monitor pinging /api/health, and
// the host's own deploy/crash notifications). This covers errors in a server that is still running,
// which is the common case; see "Error alerting" in CLAUDE.md for the rest.
import { deliverOwnerAlert, emailConfigured } from "../auth/mailer.js";

/** Where alerts go. Unset = alerting off, which is the correct default for a fork or a local run. */
const alertEmail = () => process.env.ALERT_EMAIL?.trim() || "";

/**
 * How often the same problem may email, and the daily ceiling across all problems.
 *
 * A crash loop that emails on every request is its own outage - the inbox becomes unreadable
 * exactly when it matters most. One email per signature per hour, 20 a day, is enough to know.
 */
const QUIET_MS = Number(process.env.ALERT_QUIET_MINUTES ?? 60) * 60_000;
const MAX_PER_DAY = Number(process.env.ALERT_MAX_PER_DAY ?? 20);

/** In memory on purpose: a restart SHOULD re-alert, because a restart is itself news. */
const lastSent = new Map<string, number>();
let sentToday = 0;
let todayKey = "";

/** Collapses a message to what makes it the SAME problem: ids, numbers and dates are noise. */
export function signatureOf(text: string): string {
  return (
    text
      .toLowerCase()
      // Dates first: they contain digits that the id rule would otherwise chew through.
      .replace(/\d{4}-\d{2}-\d{2}/g, "<date>")
      // Any long token mixing letters and digits is an id (cuid, uuid, hash). This MUST run before
      // the digit rule: a cuid like "ckl9x8m2a0001" would otherwise become "ckl<n>x<n>m<n>a<n>",
      // which differs per id - and a signature that differs per id defeats the whole throttle,
      // turning a crash loop into thousands of emails. There is a test for exactly this.
      .replace(/\b(?=[a-z0-9_-]{8,}\b)[a-z0-9_-]*\d[a-z0-9_-]*\b/g, "<id>")
      .replace(/\d+/g, "<n>")
      .slice(0, 200)
  );
}

/** Exposed for tests: forget what has been sent. */
export function resetAlerts(): void {
  lastSent.clear();
  sentToday = 0;
  todayKey = "";
}

/** True when this problem may email right now. Updates the counters when it says yes. */
export function mayAlert(signature: string, now: Date = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  if (day !== todayKey) {
    todayKey = day;
    sentToday = 0;
  }
  if (sentToday >= MAX_PER_DAY) return false;
  const previous = lastSent.get(signature);
  if (previous !== undefined && now.getTime() - previous < QUIET_MS) return false;
  lastSent.set(signature, now.getTime());
  sentToday += 1;
  return true;
}

/**
 * Emails the owner about a problem. NEVER throws and never blocks the caller.
 *
 * An alert failing must not turn one bug into two, and a request must not wait on an SMTP round
 * trip - so this is fire and forget, logged either way. The log line is the real audit trail;
 * the email is a nudge to go and read it.
 */
export function alertOwner(subject: string, detail: string): void {
  const to = alertEmail();
  const signature = signatureOf(`${subject} ${detail}`);
  if (!to || !emailConfigured() || !mayAlert(signature)) return;

  const body = [
    detail,
    "",
    `Host: ${process.env.PUBLIC_APP_URL ?? "unknown"}`,
    `Time: ${new Date().toISOString()} (UTC)`,
    "",
    "Repeats of this same problem are held back for an hour so the inbox stays readable.",
  ].join("\n");

  void deliverOwnerAlert(to, `Repsy: ${subject}`, body).catch((err: unknown) => {
    console.error(`Could not send the owner alert "${subject}": ${err instanceof Error ? err.message : String(err)}`);
  });
}
