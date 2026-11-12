// Prompt 83: the client's own account - summary, name/timezone, change password, payments (read-only,
// no amounts), timezone on sessions, and deleting their own account. Prisma mocked.
import supertest from "supertest";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  payment: { findMany: vi.fn() },
  appointment: { findMany: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const { app } = await import("../src/app.js");
const { CLIENT_SESSION_COOKIE, signClientSession, verifyClientSession } = await import("../src/auth/clientSession.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");
const A = await import("../src/routes/clientAccount.js");
const signedIn = (await import("./helpers/authedRequest.js")).default;

const HASH = bcrypt.hashSync("old-password-1", 4);
let row: Record<string, unknown>;
const cookie = () => `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0)}`;
const as = (m: "get" | "post" | "patch" | "delete", url: string) => (supertest(app) as any)[m](url).set("Cookie", cookie());

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  row = { id: "c1", name: "Maya", loginEmail: "maya@example.com", passwordHash: HASH, googleSub: null, lastGoogleAuthAt: null, timezone: null, clientSessionVersion: 0, joinStatus: "active", coachId: "coach-1" };
  prismaMock.client.findUnique.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) => {
    if (!row) return null;
    if (!select) return row;
    return Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));
  });
  prismaMock.client.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const v = data.clientSessionVersion as { increment?: number } | undefined;
    row = { ...row, ...data, clientSessionVersion: v?.increment ? (row.clientSessionVersion as number) + v.increment : row.clientSessionVersion };
    return row;
  });
  prismaMock.client.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.payment.findMany.mockResolvedValue([{ id: "p1", paidOn: "2026-11-01", amount: 4999, method: "UPI", clientPlan: { planName: "Monthly" } }]);
  prismaMock.appointment.findMany.mockResolvedValue([]);
});

describe("account summary and edits", () => {
  it("shows the client's own name, email, Google link and timezone - nothing else", async () => {
    row.googleSub = "g-123";
    row.timezone = "Asia/Kolkata";
    expect((await as("get", "/api/client-auth/me/account")).body).toEqual({ name: "Maya", loginEmail: "maya@example.com", googleConnected: true, timezone: "Asia/Kolkata" });
  });
  it("changes name and timezone; refuses email, coach and a made-up timezone", async () => {
    expect((await as("patch", "/api/client-auth/me/account").send({ name: " Maya P ", timezone: "Europe/London" })).status).toBe(204);
    expect(prismaMock.client.update.mock.calls[0][0]).toEqual({ where: { id: "c1" }, data: { name: "Maya P", timezone: "Europe/London" } });
    // Aliases and odd casing are stored in Intl's canonical form.
    await as("patch", "/api/client-auth/me/account").send({ timezone: "europe/london" });
    expect(prismaMock.client.update.mock.calls[1][0].data.timezone).toBe("Europe/London");
    // A coach may have given a name up to 100 characters; the client can keep it.
    expect((await as("patch", "/api/client-auth/me/account").send({ name: "x".repeat(100) })).status).toBe(204);
    expect((await as("patch", "/api/client-auth/me/account").send({ name: "x".repeat(101) })).status).toBe(400);
    expect((await as("patch", "/api/client-auth/me/account").send({ timezone: null })).status).toBe(204);
    for (const body of [{ loginEmail: "x@y.z" }, { coachId: "coach-2" }]) {
      expect((await as("patch", "/api/client-auth/me/account").send(body)).body).toEqual({ error: "Only your name and timezone can be changed here." });
    }
    for (const tz of ["Mars/Olympus", "../../etc", "x".repeat(70)]) {
      expect((await as("patch", "/api/client-auth/me/account").send({ timezone: tz })).body, tz).toEqual({ error: A.BAD_TIMEZONE });
    }
  });
  it("isTimeZone knows real IANA names", () => {
    expect(A.isTimeZone("Asia/Kolkata")).toBe(true);
    expect(A.isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(A.isTimeZone("UTC")).toBe(true);
    expect(A.isTimeZone("Nowhere/City")).toBe(false);
  });
  it("my-sessions carries the client's timezone override", async () => {
    row.timezone = "Asia/Kolkata";
    expect((await as("get", "/api/client-auth/my-sessions")).body).toEqual({ sessions: [], timezone: "Asia/Kolkata" });
  });
});

describe("change password", () => {
  it("needs the current password; bumps the session version and re-issues this session's cookie", async () => {
    const wrong = await as("post", "/api/client-auth/change-password").send({ currentPassword: "nope", newPassword: "new-password-12" });
    expect(wrong.status).toBe(400);
    const ok = await as("post", "/api/client-auth/change-password").send({ currentPassword: "old-password-1", newPassword: "new-password-12" });
    expect(ok.status).toBe(204);
    expect(prismaMock.client.update.mock.calls[0][0].data.clientSessionVersion).toEqual({ increment: 1 });
    const set = String(ok.headers["set-cookie"]);
    const token = decodeURIComponent(set.split(`${CLIENT_SESSION_COOKIE}=`)[1].split(";")[0]);
    expect(verifyClientSession(token)?.version).toBe(1);
    expect(await bcrypt.compare("new-password-12", row.passwordHash as string)).toBe(true);
    // The old cookie (version 0) no longer works.
    expect((await as("get", "/api/client-auth/me/account")).status).toBe(401);
  });
  it("a Google-only client is told to use Forgot password", async () => {
    row.googleSub = "g-1";
    const res = await as("post", "/api/client-auth/change-password").send({ currentPassword: "x", newPassword: "new-password-12" });
    expect(res.body).toEqual({ error: A.GOOGLE_NO_PASSWORD });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });
});

describe("payments", () => {
  it("only the client's own, newest first, with amounts in the coach's currency - never the coach's note", async () => {
    row.coach = { currency: "USD" };
    const res = await as("get", "/api/client-auth/my-payments");
    expect(res.body).toEqual([{ id: "p1", paidOn: "2026-11-01", amount: 4999, currency: "USD", method: "UPI", planName: "Monthly" }]);
    const arg = prismaMock.payment.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ clientId: "c1" });
    expect(arg.select.note).toBeUndefined();
  });
  it("there is no way to write payments as a client", async () => {
    for (const m of ["post", "patch", "delete"] as const) expect((await as(m, "/api/client-auth/my-payments")).status).toBe(404);
  });
});

describe("delete my account", () => {
  it("needs the typed word and the right password; deletes only this client and clears the cookie", async () => {
    expect((await as("delete", "/api/client-auth/me").send({ password: "old-password-1", confirm: "delete" })).body).toEqual({ error: A.DELETE_WORD_WRONG });
    expect((await as("delete", "/api/client-auth/me").send({ confirm: "DELETE" })).body).toEqual({ error: A.NEED_PASSWORD });
    expect((await as("delete", "/api/client-auth/me").send({ password: "wrong", confirm: "DELETE" })).status).toBe(400);
    expect(prismaMock.client.deleteMany).not.toHaveBeenCalled();
    const ok = await as("delete", "/api/client-auth/me").send({ password: "old-password-1", confirm: "DELETE" });
    expect(ok.status).toBe(204);
    expect(prismaMock.client.deleteMany).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(String(ok.headers["set-cookie"])).toMatch(new RegExp(`${CLIENT_SESSION_COOKIE}=;`));
  });
  it("a Google-only client needs a Google sign-in within the last 5 minutes", async () => {
    row.googleSub = "g-1";
    row.lastGoogleAuthAt = new Date(Date.now() - 6 * 60_000);
    const stale = await as("delete", "/api/client-auth/me").send({ confirm: "DELETE" });
    expect(stale.status).toBe(403);
    expect(stale.body).toEqual({ error: A.GOOGLE_NOT_FRESH });
    row.lastGoogleAuthAt = new Date(Date.now() - 60_000);
    // An older cookie (issued before that Google sign-in, e.g. on another device) can't use it...
    const old = `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0, Date.now() - 10 * 60_000)}`;
    const fromOld = await supertest(app).delete("/api/client-auth/me").set("Cookie", old).send({ confirm: "DELETE" });
    expect(fromOld.status).toBe(403);
    expect(prismaMock.client.deleteMany).not.toHaveBeenCalled();
    // ...the session that sign-in created can.
    const fresh = `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0, Date.now() - 30_000)}`;
    expect((await supertest(app).delete("/api/client-auth/me").set("Cookie", fresh).send({ confirm: "DELETE" })).status).toBe(204);
  });
  it("only password and confirm can be sent (no deleting someone else by id)", async () => {
    expect((await as("delete", "/api/client-auth/me").send({ password: "old-password-1", confirm: "DELETE", clientId: "c2" })).status).toBe(400);
  });
  it("signed out or a coach session gets 401", async () => {
    expect((await supertest(app).delete("/api/client-auth/me").send({ confirm: "DELETE" })).status).toBe(401);
    expect((await signedIn(app).delete("/api/client-auth/me").send({ confirm: "DELETE" })).status).toBe(401);
  });
});
