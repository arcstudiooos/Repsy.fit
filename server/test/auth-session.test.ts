// Prompt 44: register / login / logout / me + session cookie + rate limit. Prisma is mocked.
import request from "supertest";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, tx, claimDemoData } = vi.hoisted(() => {
  const tx = { coach: { create: vi.fn() } };
  return {
    tx,
    claimDemoData: vi.fn(),
    prisma: {
      coach: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
});
vi.mock("../src/db.js", () => ({ prisma }));
vi.mock("../src/auth/claimDemoData.js", () => ({ claimDemoData }));

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { resetRateLimits } from "../src/auth/rateLimit.js";
import { SESSION_COOKIE, signSession, verifySession } from "../src/auth/session.js";

const created = new Date("2026-11-11T00:00:00.000Z");
const body = { name: " Ana Coach ", email: " Ana@Example.COM ", password: "0123456789" };
let hash: string;

const cookieOf = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[] | undefined)?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
const pairOf = (c: string) => c.split(";")[0];

beforeEach(async () => {
  vi.clearAllMocks();
  resetRateLimits();
  hash ??= await hashPassword("0123456789");
  tx.coach.create.mockImplementation(async ({ data }: { data: { name: string; email: string; passwordHash: string } }) => ({ id: "coach-1", createdAt: created, ...data }));
  claimDemoData.mockResolvedValue({ claimed: true });
  prisma.coach.findUnique.mockResolvedValue({ id: "coach-1", name: "Ana Coach", email: "ana@example.com", passwordHash: hash, createdAt: created });
});

describe("session token", () => {
  it("round-trips, and rejects tampered or expired tokens", () => {
    const t = signSession("coach-9");
    expect(verifySession(t)).toEqual({ coachId: "coach-9" });
    expect(verifySession(t.slice(0, -2) + "xx")).toBeNull();
    expect(verifySession("garbage")).toBeNull();
    expect(verifySession(signSession("c", Date.now() - 8 * 24 * 3600 * 1000))).toBeNull();
  });
});

describe("POST /api/auth/register", () => {
  it("creates the coach, claims demo data in the same transaction, sets a session cookie, hides passwordHash", async () => {
    const res = await request(app).post("/api/auth/register").send(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "coach-1", name: "Ana Coach", email: "ana@example.com", createdAt: created.toISOString() });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|0123456789|\$2/);
    expect(claimDemoData).toHaveBeenCalledWith(tx, "coach-1");
    const stored = tx.coach.create.mock.calls[0][0].data;
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const cookie = cookieOf(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=604800/i);
    expect(cookie).not.toMatch(/Secure/i); // only in production
  });

  it("409 'That email is already registered' for a known email", async () => {
    tx.coach.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "6" }));
    const res = await request(app).post("/api/auth/register").send(body);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "That email is already registered." });
    expect(cookieOf(res)).toBeUndefined();
  });

  it.each([
    ["short password", { ...body, password: "123456789" }, "Your password needs at least 10 characters."],
    ["bad email", { ...body, email: "nope" }, "Please enter a valid email address."],
    ["no name", { ...body, name: " " }, "Please enter your name."],
  ])("400 for %s, creating nothing", async (_n, b, message) => {
    const res = await request(app).post("/api/auth/register").send(b);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(cookieOf(res)).toBeUndefined();
  });
});

describe("login, me, logout", () => {
  it("login -> me -> logout -> me is 401", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "ANA@example.com", password: "0123456789" });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ id: "coach-1", name: "Ana Coach", email: "ana@example.com", createdAt: created.toISOString() });
    expect(JSON.stringify(login.body)).not.toMatch(/passwordHash/);
    const cookie = pairOf(cookieOf(login)!);

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body).toEqual(login.body);

    const out = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(204);
    const cleared = cookieOf(out)!;
    expect(cleared).toMatch(/^repsy_session=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    // The browser now sends no cookie.
    const after = await request(app).get("/api/auth/me");
    expect(after.status).toBe(401);
    expect(after.body).toEqual({ error: "You are not signed in." });
  });

  it("wrong password: plain error, no session", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "ana@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "That email or password is not right." });
    expect(cookieOf(res)).toBeUndefined();
  });

  it("unknown email gives the same error as a wrong password", async () => {
    prisma.coach.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/auth/login").send({ email: "who@example.com", password: "0123456789" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "That email or password is not right." });
    expect(cookieOf(res)).toBeUndefined();
  });

  it("me is 401 for a missing, tampered or deleted-coach session", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=abc.def.ghi`)).status).toBe(401);
    prisma.coach.findUnique.mockResolvedValue(null);
    expect((await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=${signSession("coach-1")}`)).status).toBe(401);
  });

  it("the 11th rapid login attempt is rate-limited (429) and nothing is checked", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post("/api/auth/login").send({ email: "ana@example.com", password: "wrong-password" });
      expect(r.status).toBe(401);
    }
    prisma.coach.findUnique.mockClear();
    const res = await request(app).post("/api/auth/login").send({ email: "ana@example.com", password: "0123456789" });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many/i);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(cookieOf(res)).toBeUndefined();
    expect(prisma.coach.findUnique).not.toHaveBeenCalled();
  });

  it("register is rate-limited too", async () => {
    for (let i = 0; i < 10; i++) await request(app).post("/api/auth/register").send({ ...body, password: "short" });
    expect((await request(app).post("/api/auth/register").send(body)).status).toBe(429);
  });
});

describe("secret handling", () => {
  it("in production without SESSION_SECRET, auth fails safely with a plain message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = process.env.SESSION_SECRET;
    const env = process.env.NODE_ENV;
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = "production";
    try {
      const res = await request(app).post("/api/auth/login").send({ email: "ana@example.com", password: "0123456789" });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "Sign-in is not available right now. Please try again later." });
      expect(cookieOf(res)).toBeUndefined();
    } finally {
      process.env.SESSION_SECRET = secret;
      process.env.NODE_ENV = env;
    }
  });
});
