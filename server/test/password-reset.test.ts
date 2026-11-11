// Prompt 47: forgot / reset / account endpoints with Prisma and the mailer mocked.
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("../src/auth/sessionCheck.js");

const { prisma, deliverResetEmail } = vi.hoisted(() => {
  const prisma = {
    coach: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (t: typeof prisma) => unknown) => cb(prisma));
  return { prisma, deliverResetEmail: vi.fn() };
});
vi.mock("../src/db.js", () => ({ prisma }));
vi.mock("../src/auth/mailer.js", () => ({ deliverResetEmail }));

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { resetRateLimits } from "../src/auth/rateLimit.js";
import { hashToken, RESET_TOKEN_TTL_MS } from "../src/auth/resetToken.js";
import { SESSION_COOKIE, signSession } from "../src/auth/session.js";

const created = new Date("2026-11-11T00:00:00.000Z");
const SAME = { message: "If that email exists, a reset link is on its way." };
const INVALID = { error: "This reset link is not valid any more. Please ask for a new one." };
let hash: string;
let coach: { id: string; name: string; email: string; passwordHash: string; sessionVersion: number; createdAt: Date };

const cookieOf = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[] | undefined)?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
const sessionCookie = (version: number) => `${SESSION_COOKIE}=${signSession("coach-1", Date.now(), version)}`;

beforeEach(async () => {
  vi.clearAllMocks();
  resetRateLimits();
  hash ??= await hashPassword("0123456789");
  coach = { id: "coach-1", name: "Ana Coach", email: "ana@example.com", passwordHash: hash, sessionVersion: 0, createdAt: created };
  prisma.$transaction.mockImplementation(async (cb: (t: typeof prisma) => unknown) => cb(prisma));
  prisma.coach.findUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
    where.id === coach.id || where.email === coach.email ? coach : null,
  );
  prisma.coach.update.mockImplementation(async ({ data }: { data: { name?: string; passwordHash?: string; sessionVersion?: { increment: number } } }) => {
    coach = {
      ...coach,
      ...(data.name ? { name: data.name } : {}),
      ...(data.passwordHash ? { passwordHash: data.passwordHash } : {}),
      sessionVersion: coach.sessionVersion + (data.sessionVersion?.increment ?? 0),
    };
    return coach;
  });
  prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.passwordResetToken.create.mockResolvedValue({});
  deliverResetEmail.mockResolvedValue(undefined);
});

describe("POST /api/auth/forgot", () => {
  it("replies the same for a known and an unknown email", async () => {
    const known = await request(app).post("/api/auth/forgot").send({ email: "Ana@Example.com" });
    const unknown = await request(app).post("/api/auth/forgot").send({ email: "nobody@example.com" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(SAME);
    expect(unknown.body).toEqual(SAME);
  });

  it("stores only a hash of the token, expiring in 1 hour, and emails the raw token to the account's own address", async () => {
    await request(app).post("/api/auth/forgot").send({ email: "ana@example.com" });
    await vi.waitFor(() => expect(deliverResetEmail).toHaveBeenCalledTimes(1));
    const [to, link] = deliverResetEmail.mock.calls[0] as [string, string];
    expect(to).toBe("ana@example.com");
    const token = new URL(link).searchParams.get("token")!;
    expect(new URL(link).pathname).toBe("/reset-password");
    expect(token.length).toBeGreaterThanOrEqual(32);
    const data = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashToken(token));
    expect(data.tokenHash).not.toBe(token);
    expect(JSON.stringify(prisma.passwordResetToken.create.mock.calls)).not.toContain(token);
    expect(data.coachId).toBe("coach-1");
    const ms = data.expiresAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(RESET_TOKEN_TTL_MS - 5_000);
    expect(ms).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS);
  });

  it("sends nothing for an unknown email", async () => {
    await request(app).post("/api/auth/forgot").send({ email: "nobody@example.com" });
    await new Promise((r) => setTimeout(r, 50));
    expect(deliverResetEmail).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("a failing email provider still gives the same reply", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    deliverResetEmail.mockRejectedValue(new Error("smtp down"));
    const res = await request(app).post("/api/auth/forgot").send({ email: "ana@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(SAME);
  });

  it("400 for a malformed email, and it is rate-limited", async () => {
    expect((await request(app).post("/api/auth/forgot").send({ email: "nope" })).status).toBe(400);
    for (let i = 0; i < 9; i++) await request(app).post("/api/auth/forgot").send({ email: "nobody@example.com" });
    expect((await request(app).post("/api/auth/forgot").send({ email: "nobody@example.com" })).status).toBe(429);
  });
});

describe("POST /api/auth/reset", () => {
  const goodToken = "good-token-good-token-good-token-1234";
  const claimable = () => prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

  beforeEach(() => {
    prisma.passwordResetToken.findUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashToken(goodToken) ? { coachId: "coach-1" } : null,
    );
  });

  it("sets the new password, ends every session, returns 204 and signs nobody in", async () => {
    claimable();
    const res = await request(app).post("/api/auth/reset").send({ token: goodToken, password: "a-brand-new-password" });
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toBeUndefined();
    const claim = prisma.passwordResetToken.updateMany.mock.calls[0][0];
    expect(claim.where.tokenHash).toBe(hashToken(goodToken));
    expect(claim.where.usedAt).toBeNull();
    expect(claim.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(claim.data.usedAt).toBeInstanceOf(Date);
    expect(coach.sessionVersion).toBe(1);
    expect(await verifyPassword("a-brand-new-password", coach.passwordHash)).toBe(true);
    expect(await verifyPassword("0123456789", coach.passwordHash)).toBe(false);
  });

  it("an expired, used or unknown token fails with the same plain message and changes nothing", async () => {
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 }); // expired or already used
    const expiredOrUsed = await request(app).post("/api/auth/reset").send({ token: goodToken, password: "a-brand-new-password" });
    expect(expiredOrUsed.status).toBe(400);
    expect(expiredOrUsed.body).toEqual(INVALID);
    const unknown = await request(app).post("/api/auth/reset").send({ token: "x".repeat(40), password: "a-brand-new-password" });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual(INVALID);
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });

  it("applies the password rules before touching the token", async () => {
    const res = await request(app).post("/api/auth/reset").send({ token: goodToken, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Your password needs at least 10 characters." });
    expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
  });
});

describe("account: name and password", () => {
  it("PATCH /api/auth/me changes the display name and needs a session", async () => {
    expect((await request(app).patch("/api/auth/me").send({ name: "New" })).status).toBe(401);
    const res = await request(app).patch("/api/auth/me").set("Cookie", sessionCookie(0)).send({ name: "  Ana B  " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "coach-1", name: "Ana B", email: "ana@example.com", createdAt: created.toISOString() });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|sessionVersion/);
    const empty = await request(app).patch("/api/auth/me").set("Cookie", sessionCookie(0)).send({ name: " " });
    expect(empty.status).toBe(400);
    expect(empty.body).toEqual({ error: "Please enter your name." });
  });

  it("change-password needs the current password; the wrong one changes nothing", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", sessionCookie(0))
      .send({ currentPassword: "not-my-password", newPassword: "a-brand-new-password" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Your current password is not right." });
    expect(prisma.coach.update).not.toHaveBeenCalled();
  });

  it("change-password: new password works, this session carries on, other sessions end", async () => {
    const mine = sessionCookie(0);
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", mine)
      .send({ currentPassword: "0123456789", newPassword: "a-brand-new-password" });
    expect(res.status).toBe(204);
    expect(await verifyPassword("a-brand-new-password", coach.passwordHash)).toBe(true);
    const fresh = cookieOf(res)!.split(";")[0];
    expect(fresh).not.toBe(mine);
    expect((await request(app).get("/api/auth/me").set("Cookie", fresh)).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", mine)).status).toBe(401); // the other session
    expect((await request(app).get("/api/clients").set("Cookie", mine)).status).toBe(401);
  });

  it("change-password rejects a weak new password and a signed-out caller", async () => {
    const weak = await request(app).post("/api/auth/change-password").set("Cookie", sessionCookie(0)).send({ currentPassword: "0123456789", newPassword: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body).toEqual({ error: "Your password needs at least 10 characters." });
    expect((await request(app).post("/api/auth/change-password").send({ currentPassword: "0123456789", newPassword: "a-brand-new-password" })).status).toBe(401);
  });
});
