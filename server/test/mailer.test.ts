// Prompt 47: the reset email goes out only through SMTP env settings; without them it is logged
// (development only) or reported (production) - never shown anywhere else.
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverResetEmail, smtpConfig } from "../src/auth/mailer.js";

const KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "NODE_ENV"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

/** A throwaway plain-text SMTP server that records the conversation. */
function fakeSmtp(): Promise<{ port: number; lines: string[]; close: () => void }> {
  const lines: string[] = [];
  const server = net.createServer((socket) => {
    let inData = false;
    let buf = "";
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        lines.push(line);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 queued\r\n");
          }
        } else if (/^EHLO/i.test(line)) socket.write("250-fake\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH PLAIN/i.test(line)) socket.write("235 ok\r\n");
        else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write("354 go\r\n");
        } else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ port: (server.address() as AddressInfo).port, lines, close: () => server.close() }),
    ),
  );
}

describe("deliverResetEmail", () => {
  it("sends through the configured SMTP server, to the account's own address only", async () => {
    const smtp = await fakeSmtp();
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(smtp.port);
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret-pass";
    process.env.SMTP_FROM = "Repsy <no-reply@example.com>";
    await deliverResetEmail("ana@example.com", "https://app.example.com/reset-password?token=abc123");
    smtp.close();
    const text = smtp.lines.join("\n");
    expect(text).toContain("MAIL FROM:<no-reply@example.com>");
    expect(smtp.lines.filter((l) => l.startsWith("RCPT TO:"))).toEqual(["RCPT TO:<ana@example.com>"]);
    expect(text).toContain("To: ana@example.com");
    // The body is quoted-printable (soft line breaks "=", "=" written as "=3D"): decode before checking.
    const body = text.replace(/=\n/g, "").replace(/=3D/g, "=");
    expect(body).toContain("https://app.example.com/reset-password?token=abc123");
    expect(text).toContain("AUTH PLAIN");
  });

  it("without SMTP settings in development: logs the link server-side and says so", async () => {
    for (const k of KEYS) delete process.env[k];
    process.env.NODE_ENV = "development";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await deliverResetEmail("ana@example.com", "http://localhost:5173/reset-password?token=abc123");
    const out = log.mock.calls.flat().join(" ");
    expect(out).toContain("http://localhost:5173/reset-password?token=abc123");
    expect(out).toMatch(/no email provider/i);
  });

  it("without SMTP settings in production: never logs the link, reports the missing setup", async () => {
    for (const k of KEYS) delete process.env[k];
    process.env.NODE_ENV = "production";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await deliverResetEmail("ana@example.com", "https://app.example.com/reset-password?token=abc123");
    expect(JSON.stringify([log.mock.calls, err.mock.calls])).not.toContain("abc123");
    expect(err).toHaveBeenCalled();
    expect(smtpConfig()).toBeNull();
  });
});
