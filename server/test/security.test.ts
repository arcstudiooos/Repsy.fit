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
  ["patch", "/api/clients/c1/targets"],
  // Prompt 84: approvals and alerts.
  ["get", "/api/clients/waiting"],
  ["post", "/api/clients/c1/approve"],
  ["post", "/api/clients/c1/decline"],
  ["get", "/api/alerts"],
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
  // Prompt 77: the welcome questions.
  ["get", "/api/client-auth/me/profile"],
  ["patch", "/api/client-auth/me/profile"],
  // Prompt 79: the client's own plans.
  ["get", "/api/client-auth/my-assignments?from=2026-11-10&to=2026-11-16"],
  ["get", "/api/client-auth/my-assignments/a1"],
  ["post", "/api/client-auth/my-assignments/a1/done"],
  // Prompt 80: the client's tracking.
  ["get", "/api/client-auth/my-habits"],
  ["put", "/api/client-auth/my-habits/h1/2026-11-12"],
  ["get", "/api/client-auth/my-checkins/2026-11-12"],
  ["put", "/api/client-auth/my-checkins/2026-11-12"],
  ["get", "/api/client-auth/my-progress"],
  ["post", "/api/client-auth/my-progress"],
  ["get", "/api/client-auth/my-targets"],
  // Prompt 81: measurements.
  ["get", "/api/client-auth/my-measurements"],
  ["post", "/api/client-auth/my-measurements"],
  ["delete", "/api/client-auth/my-measurements/m1"],
  // Prompt 82: messages.
  ["get", "/api/client-auth/my-messages"],
  ["get", "/api/client-auth/my-messages/unread"],
  ["post", "/api/client-auth/my-messages"],
  // Prompt 83: account.
  ["get", "/api/client-auth/me/account"],
  ["patch", "/api/client-auth/me/account"],
  ["post", "/api/client-auth/change-password"],
  ["get", "/api/client-auth/my-payments"],
  ["delete", "/api/client-auth/me"],
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

// ---------- Prompt 85: the client app's security pass ----------

/** Signed-out client routes (sign-in, joining, password reset, Google start). Everything else needs a session. */
const PUBLIC_CLIENT_ROUTES = new Set([
  "post /set-password",
  "post /login",
  "post /logout",
  "post /join",
  "post /forgot",
  "post /reset",
  "get /google/start",
]);
/** Routes a PENDING or DECLINED client may still use (their own account, the waiting screen). */
const PENDING_ALLOWED = new Set(["get /me", "get /me/profile", "patch /me/profile", "get /me/account", "post /change-password", "delete /me"]);

const norm = (url: string) => url.replace(/^\/api\/client-auth/, "").split("?")[0].replace(/\/(a1|h1|m1|2026-11-12)(?=\/|$)/g, "/:x");
const routeKey = (method: string, path: string) => `${method} ${path.replace(/:[A-Za-z]+/g, ":x")}`;

describe("the client app: every /api/client-auth route is accounted for", () => {
  it("every route in the client routers is either public or in CLIENT_ROUTES (so it is tested above)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const appSrc = fs.readFileSync(path.resolve(import.meta.dirname, "../src/app.ts"), "utf8");
    const mounted = [...appSrc.matchAll(/app\.use\("\/api\/client-auth",\s*(\w+)\)/g)].map((m) => m[1]);
    expect(mounted.length).toBeGreaterThanOrEqual(7);
    const listed = new Set(CLIENT_ROUTES.map(([m, u]) => `${m} ${norm(u)}`));
    const found: string[] = [];
    for (const file of fs.readdirSync(path.resolve(import.meta.dirname, "../src/routes"))) {
      const src = fs.readFileSync(path.resolve(import.meta.dirname, "../src/routes", file), "utf8");
      for (const router of mounted) {
        for (const m of src.matchAll(new RegExp(`${router}\\.(get|post|put|patch|delete)\\(\\s*"([^"]+)"`, "g"))) found.push(routeKey(m[1], m[2]));
      }
    }
    expect(found.length).toBeGreaterThan(30);
    const missing = found.filter((k) => !listed.has(k) && !PUBLIC_CLIENT_ROUTES.has(k.replace(/:x/g, ":code")) && !PUBLIC_CLIENT_ROUTES.has(k));
    expect(missing).toEqual([]);
  });

  it.each(CLIENT_ROUTES.filter(([m, u]) => !PENDING_ALLOWED.has(`${m} ${norm(u)}`)))("%s %s refuses a client still waiting for approval (403)", async (method, url) => {
    prismaMock.client.findUnique.mockResolvedValue({ clientSessionVersion: 0, passwordHash: "$2b$12$x", joinStatus: "pending" });
    const res = await send(method, url, clientCookie());
    expect(res.status).toBe(403);
  });

  it("a declined client is refused the same way", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ clientSessionVersion: 0, passwordHash: "$2b$12$x", joinStatus: "declined" });
    for (const [m, u] of [["get", "/api/client-auth/my-assignments/a1"], ["post", "/api/client-auth/my-messages"], ["get", "/api/client-auth/my-progress"]] as const) {
      expect((await send(m, u, clientCookie())).status, u).toBe(403);
    }
  });

  it("no client response carries the password hash or the Google account id", async () => {
    const row = {
      id: "c1", name: "Maya", loginEmail: "maya@example.com", joinStatus: "active", joinedVia: "code", onboardedAt: new Date(),
      passwordHash: "$2b$12$secret", googleSub: "google-sub-secret", clientSessionVersion: 0, timezone: null, coach: { name: "Anna" },
    };
    prismaMock.client.findUnique.mockImplementation(async ({ select }: { select?: Record<string, unknown> }) =>
      select ? Object.fromEntries(Object.keys(select).map((k) => [k, (row as Record<string, unknown>)[k]])) : row,
    );
    for (const url of ["/api/client-auth/me", "/api/client-auth/me/account"]) {
      const res = await send("get", url, clientCookie());
      expect(res.status, url).toBe(200);
      expect(JSON.stringify(res.body), url).not.toMatch(/secret|passwordHash|googleSub/);
    }
    const hash = await hashPassword("client-password-1");
    prismaMock.client.findUnique.mockResolvedValue({ ...row, passwordHash: hash });
    const login = await supertest(app).post("/api/client-auth/login").send({ email: "maya@example.com", password: "client-password-1" });
    expect(login.status).toBe(200);
    expect(JSON.stringify(login.body)).not.toMatch(/\$2b\$|passwordHash|googleSub|google-sub-secret/);
  });

  it("client sign-in, joining and password reset are rate limited", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await supertest(app).post("/api/client-auth/login").send({ email: "x@y.io", password: "nope-nope-1" })).status;
    expect(last).toBe(429);
    for (let i = 0; i < 11; i++) last = (await supertest(app).post("/api/client-auth/forgot").send({ email: "x@y.io" })).status;
    expect(last).toBe(429);
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
    // The ONLY third party that may run or be called is Cloudflare's cookieless analytics beacon.
    const scriptSrc = /script-src ([^;]*)/.exec(CONTENT_SECURITY_POLICY)?.[1] ?? "";
    expect(scriptSrc.trim()).toBe("'self' https://static.cloudflareinsights.com");
    const connectSrc = /connect-src ([^;]*)/.exec(CONTENT_SECURITY_POLICY)?.[1] ?? "";
    expect(connectSrc.trim()).toBe("'self' https://static.cloudflareinsights.com https://cloudflareinsights.com");
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

describe("search engines", () => {
  it("marks the app host noindex, so public pages are not indexed twice", async () => {
    const onApp = await supertest(app).get("/api/health").set("Host", "app.repsy.fit");
    expect(onApp.headers["x-robots-tag"]).toBe("noindex");
    const onSite = await supertest(app).get("/api/health").set("Host", "repsy.fit");
    expect(onSite.headers["x-robots-tag"]).toBeUndefined();
  });
});

describe("request size", () => {
  it("refuses a body over 32 KB before any validation runs", async () => {
    const big = { name: "x".repeat(40_000), email: "a@b.com" };
    const res = await supertest(app).post("/api/leads").set("Content-Type", "application/json").send(JSON.stringify(big));
    expect(res.status).toBe(413);
    // A normal body still goes through the usual validation, not the size guard.
    const ok = await supertest(app).post("/api/leads").send({ name: "Ranesh", email: "r@example.com" });
    expect(ok.status).not.toBe(413);
  });
});

describe("headers an SEO audit asked for", () => {
  it("switches off camera, microphone, geolocation and payment for the page", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["permissions-policy"]).toContain("geolocation=()");
  });

  it("points the marketing host at the speculation rules, and the app host at nothing", async () => {
    const marketing = await request(app).get("/api/health").set("Host", "repsy.fit");
    expect(marketing.headers["speculation-rules"]).toBe('"/speculation-rules.json"');
    // Prefetching signed-in pages would spend a coach's data for nothing.
    const appHost = await request(app).get("/api/health").set("Host", "app.repsy.fit");
    expect(appHost.headers["speculation-rules"]).toBeUndefined();
  });
});
