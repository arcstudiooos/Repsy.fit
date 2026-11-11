// Prompt 47 against a real database: request a reset, use the link, log in with the new password;
// expired and reused tokens fail; a password change ends the other sessions. Skipped without DATABASE_URL.
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("../src/auth/sessionCheck.js");
const { deliverResetEmail } = vi.hoisted(() => ({ deliverResetEmail: vi.fn() }));
vi.mock("../src/auth/mailer.js", () => ({ deliverResetEmail }));

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { resetRateLimits } from "../src/auth/rateLimit.js";
import { issueResetToken, RESET_TOKEN_TTL_MS } from "../src/auth/resetToken.js";
import { prisma } from "../src/db.js";

const tag = `reset47-${Date.now()}`;
const url = process.env.DATABASE_URL ?? "";
const isRenderDb = /render\.com|dpg-/.test(url);
const cookieOf = (res: request.Response) => ((res.headers["set-cookie"] as unknown as string[]) ?? [])[0]?.split(";")[0];
const OLD = "old-password-123";
const NEW = "new-password-456";
const INVALID = { error: "This reset link is not valid any more. Please ask for a new one." };

async function newCoach(label: string) {
  const email = `${tag}-${label}@example.com`;
  const res = await request(app).post("/api/auth/register").send({ name: `${label} Coach`, email, password: OLD });
  expect(res.status).toBe(201);
  return { id: res.body.id as string, email, cookie: cookieOf(res) };
}

describe.skipIf(!url || isRenderDb)("password reset and account (database)", () => {
  beforeEach(() => {
    resetRateLimits();
    deliverResetEmail.mockReset();
    deliverResetEmail.mockResolvedValue(undefined);
  });
  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  it("request a reset, use the link, log in with the new password; the same link fails; the old password is dead everywhere", async () => {
    const coach = await newCoach("flow");
    const otherSession = cookieOf(await request(app).post("/api/auth/login").send({ email: coach.email, password: OLD }));
    expect((await request(app).get("/api/auth/me").set("Cookie", otherSession)).status).toBe(200);

    const forgot = await request(app).post("/api/auth/forgot").send({ email: coach.email });
    expect(forgot.status).toBe(200);
    await vi.waitFor(() => expect(deliverResetEmail).toHaveBeenCalled());
    const [to, link] = deliverResetEmail.mock.calls[0] as [string, string];
    expect(to).toBe(coach.email);
    const token = new URL(link).searchParams.get("token")!;

    const stored = await prisma.passwordResetToken.findMany({ where: { coachId: coach.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);

    const reset = await request(app).post("/api/auth/reset").send({ token, password: NEW });
    expect(reset.status).toBe(204);

    expect((await request(app).post("/api/auth/login").send({ email: coach.email, password: NEW })).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ email: coach.email, password: OLD })).status).toBe(401);
    // Every session that existed before the reset is signed out.
    expect((await request(app).get("/api/auth/me").set("Cookie", otherSession)).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Cookie", coach.cookie)).status).toBe(401);

    const again = await request(app).post("/api/auth/reset").send({ token, password: "yet-another-password" });
    expect(again.status).toBe(400);
    expect(again.body).toEqual(INVALID);
    expect((await request(app).post("/api/auth/login").send({ email: coach.email, password: "yet-another-password" })).status).toBe(401);
  });

  it("a known and an unknown email get the identical reply", async () => {
    const coach = await newCoach("same");
    const a = await request(app).post("/api/auth/forgot").send({ email: coach.email });
    const b = await request(app).post("/api/auth/forgot").send({ email: `${tag}-nobody@example.com` });
    expect([a.status, a.body]).toEqual([b.status, b.body]);
  });

  it("an expired token fails and changes nothing", async () => {
    const coach = await newCoach("expired");
    const token = await issueResetToken(prisma, coach.id, Date.now() - RESET_TOKEN_TTL_MS - 1000);
    const res = await request(app).post("/api/auth/reset").send({ token, password: NEW });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(INVALID);
    expect((await request(app).post("/api/auth/login").send({ email: coach.email, password: OLD })).status).toBe(200);
  });

  it("a token works once even when two requests race", async () => {
    const coach = await newCoach("race");
    const token = await issueResetToken(prisma, coach.id);
    const [a, b] = await Promise.all([
      request(app).post("/api/auth/reset").send({ token, password: NEW }),
      request(app).post("/api/auth/reset").send({ token, password: "second-password-789" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 400]);
  });

  it("a newer reset request cancels the older link", async () => {
    const coach = await newCoach("newer");
    await request(app).post("/api/auth/forgot").send({ email: coach.email });
    await vi.waitFor(() => expect(deliverResetEmail).toHaveBeenCalledTimes(1));
    const first = new URL((deliverResetEmail.mock.calls[0] as [string, string])[1]).searchParams.get("token")!;
    await request(app).post("/api/auth/forgot").send({ email: coach.email });
    await vi.waitFor(() => expect(deliverResetEmail).toHaveBeenCalledTimes(2));
    expect((await request(app).post("/api/auth/reset").send({ token: first, password: NEW })).status).toBe(400);
  });

  it("changing the password needs the current one and signs out other sessions only", async () => {
    const coach = await newCoach("change");
    const other = cookieOf(await request(app).post("/api/auth/login").send({ email: coach.email, password: OLD }));

    const wrong = await request(app).post("/api/auth/change-password").set("Cookie", coach.cookie).send({ currentPassword: "wrong-password-1", newPassword: NEW });
    expect(wrong.status).toBe(400);
    expect((await request(app).get("/api/auth/me").set("Cookie", other)).status).toBe(200);

    const ok = await request(app).post("/api/auth/change-password").set("Cookie", coach.cookie).send({ currentPassword: OLD, newPassword: NEW });
    expect(ok.status).toBe(204);
    const kept = cookieOf(ok);
    expect((await request(app).get("/api/auth/me").set("Cookie", kept)).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", other)).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Cookie", coach.cookie)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: coach.email, password: OLD })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: coach.email, password: NEW })).status).toBe(200);
  });

  it("the display name can be changed; the email is shown but not editable", async () => {
    const coach = await newCoach("name");
    const res = await request(app).patch("/api/auth/me").set("Cookie", coach.cookie).send({ name: "Renamed", email: "hacker@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
    expect(res.body.email).toBe(coach.email);
    expect(res.body.passwordHash).toBeUndefined();
  });
});
