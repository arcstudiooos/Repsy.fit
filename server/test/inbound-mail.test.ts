// Inbound mail forwarding (owner, Nov 2026): Resend has no dashboard forwarding, so the server
// answers the email.received webhook. These tests cover the signature check (including replays),
// the Resend calls, and the fallback when Resend's forward endpoint is not available.
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ $queryRaw: vi.fn().mockResolvedValue([{ "1": 1 }]) }) as Record<string, any>);
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const SECRET = `whsec_${Buffer.from("a-test-signing-secret-32-bytes!!").toString("base64")}`;
process.env.RESEND_API_KEY = "re_test_key";
process.env.RESEND_WEBHOOK_SECRET = SECRET;
process.env.INBOUND_FORWARD_TO = "ranesh@example.com";
process.env.INBOUND_FORWARD_FROM = "Repsy <hello@repsy.fit>";

const { app } = await import("../src/app.js");
const supertest = (await import("supertest")).default;
const { verifyWebhook } = await import("../src/routes/inboundMail.js");

const EVENT = {
  type: "email.received",
  created_at: "2026-11-13T10:00:00.000Z",
  data: { email_id: "37e4414c-5e25-4dbc-a071-43552a4bd53b", from: "someone@example.com", subject: "Question about my plan" },
};

function sign(body: string, opts: { id?: string; timestamp?: number } = {}) {
  const id = opts.id ?? "msg_test1";
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${sig}` };
}

const post = (event: unknown, headers?: Record<string, string>) => {
  const body = JSON.stringify(event);
  return supertest(app)
    .post("/api/inbound/resend")
    .set("Content-Type", "application/json")
    .set(headers ?? sign(body))
    .send(body);
};

describe("inbound mail webhook", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const okJson = (json: unknown = { id: "fwd-1" }) =>
    Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(json)) } as Response);
  const failJson = (status: number) =>
    Promise.resolve({ ok: false, status, text: () => Promise.resolve(JSON.stringify({ message: "nope" })) } as Response);

  it("forwards a received email through Resend", async () => {
    fetchMock.mockReturnValueOnce(okJson());
    const res = await post(EVENT);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ forwarded: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.resend.com/emails/receiving/${EVENT.data.email_id}/forward`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body)).toEqual({ to: "ranesh@example.com", from: "Repsy <hello@repsy.fit>" });
  });

  it("falls back to fetching the email and sending a copy", async () => {
    fetchMock
      .mockReturnValueOnce(failJson(404))
      .mockReturnValueOnce(
        okJson({
          from: "someone@example.com",
          to: ["hello@repsy.fit"],
          subject: "Question about my plan",
          text: "Can I change my plan?",
          created_at: "2026-11-13T09:59:00.000Z",
          headers: { from: "Someone <someone@example.com>" },
        }),
      )
      .mockReturnValueOnce(okJson());
    const res = await post(EVENT);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sent = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.resend.com/emails");
    expect(sent.to).toEqual(["ranesh@example.com"]);
    expect(sent.reply_to).toEqual(["someone@example.com"]);
    expect(sent.subject).toBe("[repsy.fit] Question about my plan");
    expect(sent.text).toContain("Can I change my plan?");
    expect(sent.text).toContain("Someone <someone@example.com>");
  });

  it("502s when Resend cannot forward or send", async () => {
    fetchMock.mockReturnValue(failJson(500));
    const res = await post(EVENT);
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Could not forward the email." });
  });

  it("refuses an unsigned, wrongly signed or replayed request", async () => {
    const body = JSON.stringify(EVENT);
    expect((await post(EVENT, {})).status).toBe(401);
    expect((await post(EVENT, { ...sign(body), "svix-signature": "v1,AAAA" })).status).toBe(401);
    // Six minutes old: outside the tolerance, so a captured payload cannot be replayed.
    const old = sign(body, { timestamp: Math.floor(Date.now() / 1000) - 6 * 60 });
    expect((await post(EVENT, old)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores other event types without calling Resend", async () => {
    const res = await post({ type: "email.delivered", data: { email_id: "x" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ignored: "email.delivered" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifyWebhook needs all three headers and the right secret", () => {
    const body = '{"a":1}';
    const h = sign(body);
    expect(verifyWebhook({ body, id: h["svix-id"], timestamp: h["svix-timestamp"], signature: h["svix-signature"], secret: SECRET })).toBe(true);
    expect(verifyWebhook({ body, id: h["svix-id"], timestamp: h["svix-timestamp"], signature: h["svix-signature"], secret: "whsec_b3RoZXI=" })).toBe(false);
    expect(verifyWebhook({ body, timestamp: h["svix-timestamp"], signature: h["svix-signature"], secret: SECRET })).toBe(false);
    expect(verifyWebhook({ body: '{"a":2}', id: h["svix-id"], timestamp: h["svix-timestamp"], signature: h["svix-signature"], secret: SECRET })).toBe(false);
  });
});
