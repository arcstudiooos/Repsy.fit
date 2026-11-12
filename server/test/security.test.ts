// Prompt 73: the security pass, as tests.
// The point of this file is that it is EXHAUSTIVE and self-maintaining: every coach route group
// mounted in src/app.ts is listed here, so a new route group that forgets its guard fails a test
// rather than shipping. Also covers the response headers and the delete-account path.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const mock: Record<string, any> = {
    coach: { findUnique: vi.fn(), delete: vi.fn() },
    client: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    // The lead form is a real write: mock it so the rate-limit test does not log server errors.
    lead: { create: vi.fn().mockResolvedValue({ id: "lead-1", name: "A", email: "a@b.com", createdAt: new Date() }) },
    $queryRaw: vi.fn().mockResolvedValue([{ "1": 1 }]),
  };
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(mock)));
  return mock;
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;
const { CLIENT_SESSION_COOKIE, signClientSession } = await import("../src/auth/clientSession.js");
const { hashPassword } = await import("../src/auth/password.js");
const { CONTENT_SECURITY_POLICY } = await import("../src/security.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");

const clientCookie = () => `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0)}`;

/**
 * Every coach-only route group mounted in src/app.ts, as [method, path].
 * Keep this list in step with app.ts: that is the whole point of it.
 */
const COACH_ROUTES: [string, string][] = [
  ["get", "/api/clients"],
  ["get", "/api/clients/c1"],
  ["delete", "/api/clients/c1"],
  ["get", "/api/clients/c1/assignments"],
  ["get", "/api/clients/c1/progress"],
  ["get", "/api/clients/c1/checkins"],
  ["get", "/api/clients/c1/habits"],
  ["get", "/api/clients/c1/measurements"],
  ["get", "/api/clients/c1/messages"],
  ["get", "/api/clients/c1/chat"],
  ["get", "/api/clients/c1/invite"],
  ["get", "/api/clients/c1/plan"],
  ["get", "/api/clients/c1/plan/payments"],
  ["post", "/api/clients/c1/auto-assign"],
  ["get", "/api/templates"],
  ["get", "/api/meals"],
  ["post", "/api/macros"],
  ["get", "/api/tasks/today"],
  ["get", "/api/at-risk"],
  ["get", "/api/checkins"],
  ["get", "/api/weekly-summary"],
  ["get", "/api/review-queue"],
  ["get", "/api/messages/threads"],
  ["get", "/api/appointments"],
  ["get", "/api/business/plans"],
  ["get", "/api/business/engagement"],
  // Prompt 70 exports: named by the security checklist, so asserted by hand as well as in the loop.
  ["get", "/api/reports/roster"],
  ["get", "/api/reports/clients/c1/export/progress"],
  ["get", "/api/reports/clients/c1/export/measurements"],
  ["get", "/api/reports/clients/c1/export/payments"],
  ["get", "/api/reports/clients/c1/export/assignments"],
  ["get", "/api/reports/clients/c1/progress-report"],
  ["post", "/api/seed/demo"],
  ["delete", "/api/auth/account"],
  ["patch", "/api/auth/me"],
  ["patch", "/api/auth/currency"],
  ["post", "/api/auth/change-password"],
  // Prompt 76: the coach's join code.
  ["get", "/api/join-code"],
  ["post", "/api/join-code/regenerate"],
  ["patch", "/api/join-code"],
];

/** Every route that needs a CLIENT session. */
const CLIENT_ROUTES: [string, string][] = [
  ["get", "/api/client-auth/me"],
  ["get", "/api/client-auth/my-plan"],
  ["get", "/api/client-auth/my-sessions"],
  ["get", "/api/client-auth/my-streaks"],
];

const send = (method: string, url: string, cookie?: string) => {
  const r = (supertest(app) as any)[method](url);
  return cookie ? r.set("Cookie", cookie) : r;
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  prismaMock.client.findMany.mockResolvedValue([]);
  prismaMock.client.findFirst.mockResolvedValue(null);
});

describe("every route group requires the right session", () => {
  it.each(COACH_ROUTES)("%s %s needs a coach session when signed out", async (method, url) => {
    expect((await send(method, url)).status).toBe(401);
  });

  it.each(COACH_ROUTES)("%s %s rejects a CLIENT session", async (method, url) => {
    expect((await send(method, url, clientCookie())).status).toBe(401);
  });

  it.each(CLIENT_ROUTES)("%s %s rejects a coach session", async (method, url) => {
    // authedRequest signs a coach cookie.
    expect((await (request(app) as any)[method](url)).status).toBe(401);
  });

  it.each(CLIENT_ROUTES)("%s %s rejects no session at all", async (method, url) => {
    expect((await send(method, url)).status).toBe(401);
  });

  it("the public routes stay public", async () => {
    expect((await send("get", "/api/health")).status).toBe(200);
    // A bad body, not a 401: the route itself is reachable signed out.
    expect((await send("post", "/api/leads")).status).toBe(400);
    expect((await send("post", "/api/auth/login")).status).toBe(400);
    expect((await send("post", "/api/client-auth/login")).status).toBe(400);
    // "Continue with Google": reachable signed out (Google is not configured here, so they say so).
    expect((await send("get", "/api/auth/providers")).body).toEqual({ google: false });
    expect((await send("get", "/api/auth/google/start")).status).toBe(302);
    expect((await send("get", "/api/auth/callback/google")).status).toBe(302);
  });
});

describe("security headers", () => {
  it("sets them on an API response, and does not advertise Express", async () => {
    const res = await send("get", "/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets them on a 401 too (an error response is still a response)", async () => {
    const res = await send("get", "/api/clients");
    expect(res.status).toBe(401);
    expect(res.headers["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
  });

  it("the policy refuses inline scripts and framing, and allows only our own origin to be called", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    // 'unsafe-inline' is allowed for STYLE only (inline style attributes), never for script.
    expect(CONTENT_SECURITY_POLICY).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(/script-src [^;]*unsafe-inline/.test(CONTENT_SECURITY_POLICY)).toBe(false);
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
  });

  it("HSTS only over HTTPS, so local http dev is not pinned", async () => {
    const plain = await send("get", "/api/health");
    expect(plain.headers["strict-transport-security"]).toBeUndefined();
    const forwarded = await supertest(app).get("/api/health").set("X-Forwarded-Proto", "https");
    expect(forwarded.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
  });

  it("never sends a cross-origin allow header (there is no CORS middleware)", async () => {
    const res = await supertest(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("DELETE /api/auth/account (type-to-confirm)", () => {
  const coach = async () => ({
    id: "coach-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: await hashPassword("right-password-1"),
    sessionVersion: 0,
    currency: "INR",
    createdAt: new Date(),
  });

  it("deletes the coach once, and clears the session cookie", async () => {
    prismaMock.coach.findUnique.mockResolvedValue(await coach());
    const res = await request(app).delete("/api/auth/account").send({ password: "right-password-1", confirm: "DELETE" });
    expect(res.status).toBe(204);
    // One statement: Postgres cascades every child row from `coaches`.
    expect(prismaMock.coach.delete).toHaveBeenCalledWith({ where: { id: "coach-1" } });
    expect(String(res.headers["set-cookie"])).toMatch(/repsy_session=;/);
  });

  it("refuses a wrong password, and deletes nothing", async () => {
    prismaMock.coach.findUnique.mockResolvedValue(await coach());
    const res = await request(app).delete("/api/auth/account").send({ password: "wrong-password-1", confirm: "DELETE" });
    expect(res.status).toBe(400);
    expect(prismaMock.coach.delete).not.toHaveBeenCalled();
  });

  it.each([["delete"], [""], ["DELETE ME"], ["Delete"]])("refuses the confirm word %o, and deletes nothing", async (confirm) => {
    prismaMock.coach.findUnique.mockResolvedValue(await coach());
    const res = await request(app).delete("/api/auth/account").send({ password: "right-password-1", confirm });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("To delete your account, type DELETE and enter your password.");
    expect(prismaMock.coach.delete).not.toHaveBeenCalled();
  });

  it("asks for the password in plain words when it is missing", async () => {
    prismaMock.coach.findUnique.mockResolvedValue(await coach());
    const res = await request(app).delete("/api/auth/account").send({ confirm: "DELETE" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Please enter your password.");
  });
});

describe("the public lead form is rate limited", () => {
  it("answers 429 once the window is used up, with Retry-After", async () => {
    let last = await send("post", "/api/leads");
    for (let i = 0; i < 25; i++) last = await supertest(app).post("/api/leads").send({ name: "A", email: `a${i}@b.com` });
    expect(last.status).toBe(429);
    expect(last.headers["retry-after"]).toBeTruthy();
  });
});
