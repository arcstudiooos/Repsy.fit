// Prompt 65: client invite and client sign-in (mocked database).
// The heart of it: coach and client sessions never cross over, in either direction.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const mock: Record<string, any> = {
    client: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    clientInvite: { deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    coach: { findUnique: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(mock)));
  return mock;
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
const mailer = vi.hoisted(() => ({ configured: false, deliverInviteEmail: vi.fn() }));
vi.mock("../src/auth/mailer.js", () => ({
  emailConfigured: () => mailer.configured,
  deliverInviteEmail: mailer.deliverInviteEmail,
  deliverResetEmail: vi.fn(),
}));

const { app } = await import("../src/app.js");
const { default: request, cookieFor } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;
const { CLIENT_SESSION_COOKIE, signClientSession, verifyClientSession } = await import("../src/auth/clientSession.js");
const { SESSION_COOKIE, signSession, verifySessionClaims } = await import("../src/auth/session.js");
const { hashToken } = await import("../src/auth/resetToken.js");
const { hashPassword } = await import("../src/auth/password.js");
const { INVITE_TTL_MS } = await import("../src/auth/clientInvite.js");
const { EMAIL_NOT_CONFIGURED_NOTE, LOGIN_EMAIL_TAKEN } = await import("../src/routes/clientInvite.js");
const { BAD_INVITE } = await import("../src/auth/schemas.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");
const { Prisma } = await import("@prisma/client");

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel", loginEmail: null as string | null };
/** A Cookie header for a signed-in CLIENT (version 0). */
const clientCookie = (clientId = "c1", version = 0) => `${CLIENT_SESSION_COOKIE}=${signClientSession(clientId, version)}`;
let passwordHash = "";

beforeEach(async () => {
  vi.clearAllMocks();
  resetRateLimits();
  mailer.configured = false;
  passwordHash ||= await hashPassword("correct horse battery");
  // findClient (this coach's client) -> CLIENT; the "is this email someone's login?" check -> nobody.
  prismaMock.client.findFirst.mockImplementation(({ where }: { where: { loginEmail?: string } }) =>
    Promise.resolve(where.loginEmail ? null : CLIENT),
  );
  // The client-session check (is this client token still current?).
  prismaMock.client.findUnique.mockImplementation(({ where, select }: { where: { id?: string; loginEmail?: string }; select?: Record<string, boolean> }) => {
    if (where.id === "c1" && select?.clientSessionVersion) return Promise.resolve({ clientSessionVersion: 0, passwordHash });
    if (where.id === "c1") return Promise.resolve({ id: "c1", name: "Maya Patel", loginEmail: "maya@example.com", passwordHash });
    return Promise.resolve(null);
  });
  prismaMock.client.update.mockResolvedValue(CLIENT);
  prismaMock.clientInvite.create.mockResolvedValue({});
  prismaMock.clientInvite.findFirst.mockResolvedValue(null);
  prismaMock.coach.findUnique.mockResolvedValue({ name: "Ana" });
});

describe("coach and client sessions never cross over", () => {
  it("token level: a client token is not a coach token, and a coach token is not a client token", () => {
    const clientToken = signClientSession("c1", 0);
    const coachToken = signSession("coach-1");
    expect(verifyClientSession(clientToken)).toEqual({ clientId: "c1", version: 0 });
    expect(verifySessionClaims(clientToken)).toBeNull();
    expect(verifySessionClaims(coachToken)).not.toBeNull();
    expect(verifyClientSession(coachToken)).toBeNull();
  });

  it("a signed-in CLIENT gets 401 on every coach route", async () => {
    for (const url of ["/api/clients", "/api/clients/c1", "/api/clients/c1/messages", "/api/auth/me", "/api/review-queue", "/api/templates", "/api/messages/threads"]) {
      const res = await supertest(app).get(url).set("Cookie", clientCookie());
      expect(res.status, url).toBe(401);
    }
    const write = await supertest(app).post("/api/clients/c1/messages").set("Cookie", clientCookie()).send({ body: "hi" });
    expect(write.status).toBe(401);
  });

  it("a signed-in COACH gets 401 on the client routes", async () => {
    const res = await request(app).get("/api/client-auth/me");
    expect(res.status).toBe(401);
  });

  it("swapping cookie values does not work either way", async () => {
    // A client token placed in the COACH cookie name.
    const asCoachCookie = await supertest(app).get("/api/clients").set("Cookie", `${SESSION_COOKIE}=${signClientSession("c1", 0)}`);
    expect(asCoachCookie.status).toBe(401);
    // A coach token placed in the CLIENT cookie name.
    const asClientCookie = await supertest(app).get("/api/client-auth/me").set("Cookie", `${CLIENT_SESSION_COOKIE}=${signSession("coach-1")}`);
    expect(asClientCookie.status).toBe(401);
  });

  it("GET /me shows only the client's own account (no coach data, no hash)", async () => {
    const res = await supertest(app).get("/api/client-auth/me").set("Cookie", clientCookie());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "c1", name: "Maya Patel", loginEmail: "maya@example.com" });
  });

  it("an old client token stops working once the password is set again (version raised)", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ clientSessionVersion: 1, passwordHash });
    const res = await supertest(app).get("/api/client-auth/me").set("Cookie", clientCookie("c1", 0));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/clients/:clientId/invite (coach)", () => {
  it("stores only a hash, valid 48 hours; without email the coach gets a copyable link and a clear note", async () => {
    const before = Date.now();
    const res = await request(app).post("/api/clients/c1/invite").send({ email: "Maya@Example.com" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sent: false, loginEmail: "maya@example.com", note: EMAIL_NOT_CONFIGURED_NOTE });
    expect(EMAIL_NOT_CONFIGURED_NOTE).toBe("Email is not configured - share this link with your client.");
    const link = new URL(res.body.inviteLink as string);
    expect(link.pathname).toBe("/client/set-password");
    const token = link.searchParams.get("token")!;

    const created = prismaMock.clientInvite.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ coachId: "coach-1", clientId: "c1", email: "maya@example.com", tokenHash: hashToken(token) });
    expect(created.tokenHash).not.toBe(token);
    expect(JSON.stringify(created)).not.toContain(token);
    const ttl = created.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(INVITE_TTL_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(INVITE_TTL_MS + 1000);
    expect(prismaMock.clientInvite.deleteMany).toHaveBeenCalledWith({ where: { clientId: "c1", usedAt: null } });
    // The client row is locked first, so two invites at once cannot both survive.
    const [lockSql, lockId] = prismaMock.$executeRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(lockSql.join("?")).toMatch(/FROM "clients" WHERE "id" = \? FOR UPDATE/);
    expect(lockId).toBe("c1");
    // Sending an invite never changes how the client signs in - only using it does.
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("with email configured it emails the link and never returns it", async () => {
    mailer.configured = true;
    const res = await request(app).post("/api/clients/c1/invite").send({ email: "maya@example.com" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sent: true, loginEmail: "maya@example.com" });
    expect(res.body.inviteLink).toBeUndefined();
    expect(mailer.deliverInviteEmail).toHaveBeenCalledWith("maya@example.com", "Ana", expect.stringContaining("/client/set-password?token="));
  });

  it("an email another client signs in with is refused, without saying whose it is", async () => {
    prismaMock.client.findFirst
      .mockResolvedValueOnce(CLIENT) // findClient (this coach's client)
      .mockResolvedValueOnce({ id: "someone-else" }); // the email-in-use check
    const res = await request(app).post("/api/clients/c1/invite").send({ email: "taken@example.com" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: LOGIN_EMAIL_TAKEN });
    expect(LOGIN_EMAIL_TAKEN).not.toMatch(/another coach|already (registered|used by)/i);
    expect(prismaMock.clientInvite.create).not.toHaveBeenCalled();
  });

  it("invites are limited per coach (30 per 15 minutes), not per shared IP", async () => {
    for (let i = 0; i < 30; i++) expect((await request(app).post("/api/clients/c1/invite").send({ email: `m${i}@example.com` })).status).toBe(201);
    expect((await request(app).post("/api/clients/c1/invite").send({ email: "one-more@example.com" })).status).toBe(429);
  });

  it("another coach's client is 404; a bad email is 400; signed out is 401", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    expect((await request(app).post("/api/clients/other/invite").send({ email: "a@b.co" })).status).toBe(404);
    prismaMock.client.findFirst.mockResolvedValue(CLIENT);
    expect((await request(app).post("/api/clients/c1/invite").send({ email: "nope" })).status).toBe(400);
    expect((await supertest(app).post("/api/clients/c1/invite").send({ email: "a@b.co" })).status).toBe(401);
    expect(prismaMock.clientInvite.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/client-auth/set-password", () => {
  it("spends a valid invite once and stores a bcrypt hash", async () => {
    prismaMock.clientInvite.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.clientInvite.findUnique.mockResolvedValue({ clientId: "c1", coachId: "coach-1", email: "maya@example.com" });
    prismaMock.client.findFirst.mockResolvedValue({ id: "c1" });
    const res = await supertest(app).post("/api/client-auth/set-password").send({ token: "raw-token", password: "a long new password" });
    expect(res.status).toBe(204);
    // Using the invite is what makes the invited address the login email.
    expect(prismaMock.client.update.mock.calls[0][0].data.loginEmail).toBe("maya@example.com");
    expect(prismaMock.clientInvite.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("raw-token"), usedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { usedAt: expect.any(Date) },
    });
    const data = prismaMock.client.update.mock.calls[0][0].data;
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(data.clientSessionVersion).toEqual({ increment: 1 });
  });

  it("a used, expired or unknown invite is refused in plain words", async () => {
    prismaMock.clientInvite.updateMany.mockResolvedValue({ count: 0 });
    const res = await supertest(app).post("/api/client-auth/set-password").send({ token: "spent", password: "a long new password" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: BAD_INVITE });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("an invite for a client who has moved to another coach is refused", async () => {
    prismaMock.clientInvite.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.clientInvite.findUnique.mockResolvedValue({ clientId: "c1", coachId: "coach-old" });
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await supertest(app).post("/api/client-auth/set-password").send({ token: "t", password: "a long new password" });
    expect(res.status).toBe(400);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("if the invited email was taken meanwhile, it is refused in plain words and nothing changes", async () => {
    prismaMock.clientInvite.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.clientInvite.findUnique.mockResolvedValue({ clientId: "c1", coachId: "coach-1", email: "taken@example.com" });
    prismaMock.client.findFirst.mockResolvedValue({ id: "c1" });
    prismaMock.client.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
    const res = await supertest(app).post("/api/client-auth/set-password").send({ token: "t", password: "a long new password" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already used for another client sign-in/);
  });

  it("uses the coach password rules", async () => {
    const res = await supertest(app).post("/api/client-auth/set-password").send({ token: "t", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Your password needs at least 10 characters.");
  });
});

describe("POST /api/client-auth/login and /logout", () => {
  it("signs in with the CLIENT cookie only - never the coach cookie", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ id: "c1", name: "Maya Patel", loginEmail: "maya@example.com", passwordHash, clientSessionVersion: 0 });
    const res = await supertest(app).post("/api/client-auth/login").send({ email: "maya@example.com", password: "correct horse battery" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "c1", name: "Maya Patel", loginEmail: "maya@example.com" });
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(cookies.some((c) => c.startsWith(`${CLIENT_SESSION_COOKIE}=`) && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
    expect(prismaMock.client.findUnique).toHaveBeenCalledWith({ where: { loginEmail: "maya@example.com" }, omit: { passwordHash: false } });
  });

  it("wrong password, unknown email, or a client who never set a password: the same 401", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ id: "c1", name: "Maya", loginEmail: "maya@example.com", passwordHash, clientSessionVersion: 0 });
    const wrong = await supertest(app).post("/api/client-auth/login").send({ email: "maya@example.com", password: "wrong password!!" });
    prismaMock.client.findUnique.mockResolvedValue(null);
    const unknown = await supertest(app).post("/api/client-auth/login").send({ email: "who@example.com", password: "whatever12345" });
    prismaMock.client.findUnique.mockResolvedValue({ id: "c1", name: "Maya", loginEmail: "maya@example.com", passwordHash: null, clientSessionVersion: 0 });
    const notSet = await supertest(app).post("/api/client-auth/login").send({ email: "maya@example.com", password: "whatever12345" });
    for (const r of [wrong, unknown, notSet]) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: "That email or password is not right." });
    }
  });

  it("logout clears the client cookie and leaves the coach cookie alone", async () => {
    const res = await supertest(app).post("/api/client-auth/logout").set("Cookie", `${clientCookie()}; ${cookieFor("coach-1")}`);
    expect(res.status).toBe(204);
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(cookies.some((c) => c.startsWith(`${CLIENT_SESSION_COOKIE}=;`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it("there is no client registration endpoint", async () => {
    const res = await supertest(app).post("/api/client-auth/register").send({ email: "a@b.co", password: "a long password" });
    expect(res.status).toBe(404);
  });
});
