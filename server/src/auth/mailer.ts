// Reset email delivery (Prompt 47). The ONLY way an email leaves the server is the SMTP provider named
// in env vars (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM - see .env.example).
// Sent with nodemailer (the standard, maintained SMTP library) rather than a hand-written client.
// Without those settings: development logs the link on the server console only; production logs that
// email is not set up (never the link). The link is never returned by any API or shown in the UI.
import nodemailer from "nodemailer";

export type SmtpConfig = { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string };

/** The SMTP settings from env vars, or null when no provider is configured. */
export function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const secure = process.env.SMTP_SECURE === "true";
  const port = Number(process.env.SMTP_PORT) || (secure ? 465 : 587);
  return { host, port, secure, user: process.env.SMTP_USER || undefined, pass: process.env.SMTP_PASS || undefined, from };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

async function smtpSend(cfg: SmtpConfig, to: string, subject: string, text: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    // Never send a password in clear text to a remote server: require STARTTLS unless the
    // connection is already TLS or the server is on this machine (tests).
    requireTLS: !cfg.secure && !LOCAL_HOSTS.has(cfg.host),
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({ from: cfg.from, to, subject, text });
  } finally {
    transport.close();
  }
}

/** Gives up after 20 s so a dead mail server can't hang the request that triggered it. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("SMTP timed out")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Emails the reset link to the account's own address (the only recipient this app ever mails). */
export async function deliverResetEmail(to: string, link: string): Promise<void> {
  const cfg = smtpConfig();
  if (!cfg) {
    if (process.env.NODE_ENV === "production") {
      console.error("Password reset email not sent: no email provider is configured (set SMTP_HOST and SMTP_FROM).");
    } else {
      console.log(`[dev] No email provider configured (SMTP_HOST / SMTP_FROM). Password reset link for ${to}: ${link}`);
    }
    return;
  }
  const text = [
    "Hello,",
    "",
    "Someone asked to reset the password of your Repsy Coach account. Open this link to choose a new one:",
    link,
    "",
    "The link works once and expires in 1 hour. If you did not ask for this, you can ignore this email: your password stays the same.",
  ].join("\n");
  await withTimeout(smtpSend(cfg, to, "Reset your Repsy Coach password", text), 20_000);
}
