// Prompt 77: joining with a coach's code, the welcome questions, pending clients, and client password
// reset - with Prisma and the mailer mocked.
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, mailer } = vi.hoisted(() => {
  const mock: Record<string, any> = {
    coach: { findUnique: vi.fn() },
    client: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    clientInvite: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    clientPasswordResetToken: { deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    clientPlan: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  mock.$transaction = vi.fn((arg: unknown) =>
    typeof arg === "function" ? Promise.resolve((arg as (tx: unknown) => unknown)(mock)) : Promise.all(arg as unknown[]),
  );
  const mailer = { configured: false, welcome: vi.fn(), invite: vi.fn(), reset: vi.fn() };
  return { prismaMock: mock, mailer };
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
vi.mock("../src/auth/mailer.js", () => ({
  emailConfigured: () => mailer.configured,
  deliverWelcomeEmail: (...a: unknown[]) => mailer.welcome(...a),
  deliverInviteEmail: (...a: unknown[]) => mailer.invite(...a),
  deliverClientResetEmail: (...a: unknown[]) => mailer.reset(...a),
  deliverResetEmail: vi.fn(),
}));

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.APP_URL = "https://app.repsy.fit";

const { app } = await import("../src/app.js");
const { CLIENT_SESSION_COOKIE, signClientSession, NOT_APPROVED, DECLINED } = await import("../src/auth/clientSession.js");
const { SESSION_COOKIE } = await import("../src/auth/session.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");
const { hashToken } = await import("../src/auth/resetToken.js");
const { verifyPassword } = await import("../src/auth/password.js");
const { BAD_JOIN_CODE } = await import("../src/routes/joinCode.js");
const { EMAIL_HAS_ACCOUNT, CHECK_YOUR_EMAIL, CHECK_YOUR_EMAIL_NO_MAIL, HEALTH_CONSENT_NEEDED } = await import("../src/routes/clientJoin.js");
const { FORGOT_REPLY, BAD_RESET } = await import("../src/routes/auth.js");
const { Prisma } = await import("@prisma/client");

const COACH = { id: "coach-1", name: "Anna Rivers", joinCode: "ANNA-7K2Q8M", joinCodeActive: true, approveNewClients: false };
const JOIN = { code: "anna-7k2q8m", name: "Maya Patel", email: "Maya@Example.com", password: "correct horse battery" };
const cookie = (status = "active", id = "c1", version = 0) => {
  session = { id, status };
  return `${CLIENT_SESSION_COOKIE}=${signClientSession(id, version)}`;
};
let session: { id: string; status: string } = { id: "c1", status: "active" };
let stored: Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  mailer.configured = false;
  mailer.welcome.mockResolvedValue(undefined);
  mailer.invite.mockResolvedValue(undefined);
  mailer.reset.mockResolvedValue(undefined);
  COACH.joinCodeActive = true;
  COACH.approveNewClients = false;
  stored = { id: "c1", coachId: "coach-1", name: "Maya Patel", notes: "", onboardedAt: null, healthConsentAt: null, joinedVia: "code", joinStatus: "active", loginEmail: "maya@example.com" };
  prismaMock.coach.findUnique.mockImplementation(async ({ where }: { where: { joinCode?: string } }) =>
    where.joinCode === COACH.joinCode ? COACH : null,
  );
  prismaMock.client.findUnique.mockImplementation(async ({ where, select }: { where: { id?: string; loginEmail?: string }; select?: Record<string, unknown> }) => {
    if (select?.clientSessionVersion && where.id === session.id) return { clientSessionVersion: 0, passwordHash: "$2b$x", joinStatus: session.status };
    if (where.loginEmail) return null;
    if (where.id === "c1") return { ...stored, coach: { name: COACH.name } };
    return null;
  });
  prismaMock.client.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "c-new", name: data.name, loginEmail: data.loginEmail, joinStatus: data.joinStatus, clientSessionVersion: 0,
  }));
  prismaMock.client.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => Object.assign(stored, data));
  prismaMock.clientInvite.findMany.mockResolvedValue([]);
  prismaMock.clientInvite.findFirst.mockResolvedValue(null);
  prismaMock.clientPlan.findUnique.mockResolvedValue(null);
  prismaMock.payment.findFirst.mockResolvedValue(null);
});

const setCookies = (res: supertest.Response) => ([] as string[]).concat(res.headers["set-cookie"] ?? []);

describe("POST /api/client-auth/join", () => {
  it("creates the client under the code's coach and signs in with the CLIENT cookie only", async () => {
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "c-new", name: "Maya Patel", loginEmail: "maya@example.com", joinStatus: "active" });
    const data = prismaMock.client.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ coachId: "coach-1", name: "Maya Patel", loginEmail: "maya@example.com", joinedVia: "code", joinStatus: "active" });
    expect(await verifyPassword(JOIN.password, data.passwordHash)).toBe(true);
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith(`${CLIENT_SESSION_COOKIE}=`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|coachId/);
  });

  it("puts the client in 'pending' when the coach approves new clients first", async () => {
    COACH.approveNewClients = true;
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(201);
    expect(res.body.joinStatus).toBe("pending");
  });

  it("sends a welcome email when email is set up; a failed send never blocks the join", async () => {
    mailer.configured = true;
    mailer.welcome.mockRejectedValue(new Error("smtp down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 10));
    expect(mailer.welcome).toHaveBeenCalledWith("maya@example.com", "Anna Rivers", "https://app.repsy.fit/client/login");
    err.mockRestore();
  });

  it("answers an unknown, malformed or turned-off code with the same 404", async () => {
    for (const code of ["NOPE-222222", "x", "ANNA-7K2Q8M"]) {
      if (code === "ANNA-7K2Q8M") COACH.joinCodeActive = false;
      const res = await supertest(app).post("/api/client-auth/join").send({ ...JOIN, code });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: BAD_JOIN_CODE });
    }
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it("refuses an email that already signs in, without saying whose client it is", async () => {
    prismaMock.client.findUnique.mockImplementation(async ({ where }: { where: { loginEmail?: string } }) =>
      where.loginEmail === "maya@example.com" ? { id: "other-coachs-client" } : null,
    );
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: EMAIL_HAS_ACCOUNT });
    expect(JSON.stringify(res.body)).not.toMatch(/coach|other/i);
  });

  it("a race on the unique email is the same 409", async () => {
    prismaMock.client.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "t" }));
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: EMAIL_HAS_ACCOUNT });
  });

  it("an email the coach already invited is NOT attached on the spot: a fresh invite goes to that inbox", async () => {
    mailer.configured = true;
    prismaMock.clientInvite.findMany.mockResolvedValue([{ clientId: "c-existing" }]);
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "check-email", message: CHECK_YOUR_EMAIL });
    // Only this coach's invites to this email, for a client with no sign-in yet.
    expect(prismaMock.clientInvite.findMany.mock.calls[0][0].where).toEqual({
      coachId: "coach-1",
      email: "maya@example.com",
      client: { passwordHash: null, loginEmail: null },
    });
    expect(prismaMock.client.create).not.toHaveBeenCalled();
    expect(prismaMock.client.update).not.toHaveBeenCalled();
    expect(setCookies(res)).toEqual([]); // nobody is signed in
    expect(prismaMock.clientInvite.create.mock.calls[0][0].data).toMatchObject({ coachId: "coach-1", clientId: "c-existing", email: "maya@example.com" });
    await new Promise((r) => setTimeout(r, 10));
    expect(mailer.invite.mock.calls[0][0]).toBe("maya@example.com");
    expect(mailer.invite.mock.calls[0][2]).toMatch(/^https:\/\/app\.repsy\.fit\/client\/set-password\?token=/);
  });

  it("does not re-send while a recent invite is still live (no spam, the coach's link keeps working)", async () => {
    mailer.configured = true;
    prismaMock.clientInvite.findMany.mockResolvedValue([{ clientId: "c-existing" }]);
    prismaMock.clientInvite.findFirst.mockResolvedValue({ id: "inv-1" });
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(202);
    expect(res.body.message).toBe(CHECK_YOUR_EMAIL);
    expect(prismaMock.clientInvite.create).not.toHaveBeenCalled();
    expect(prismaMock.clientInvite.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.clientInvite.findFirst.mock.calls[0][0].where).toMatchObject({ clientId: "c-existing", usedAt: null });
  });

  it("is also limited per email address, across IPs", async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await supertest(app).post("/api/client-auth/join").set("X-Forwarded-For", `10.0.0.${i}`).send({ ...JOIN, code: "NOPE-222222" })).status;
    }
    expect(last).toBe(429);
  });

  it("without email set up, an invited address is told to ask the coach (still no attach)", async () => {
    prismaMock.clientInvite.findMany.mockResolvedValue([{ clientId: "c-existing" }]);
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(202);
    expect(res.body.message).toBe(CHECK_YOUR_EMAIL_NO_MAIL);
    expect(prismaMock.clientInvite.create).not.toHaveBeenCalled();
  });

  it("two of the coach's clients invited at one address: a new client is created (no guessing)", async () => {
    prismaMock.clientInvite.findMany.mockResolvedValue([{ clientId: "a" }, { clientId: "b" }]);
    const res = await supertest(app).post("/api/client-auth/join").send(JOIN);
    expect(res.status).toBe(201);
  });

  it.each([
    [{ ...JOIN, name: "" }, "Please enter your name."],
    [{ ...JOIN, email: "nope" }, "Please enter a valid email address."],
    [{ ...JOIN, password: "short" }, "Your password needs at least 10 characters."],
  ])("validates %#", async (body, error) => {
    const res = await supertest(app).post("/api/client-auth/join").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it("is rate limited", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await supertest(app).post("/api/client-auth/join").send({ ...JOIN, code: "NOPE-222222" })).status;
    expect(last).toBe(429);
  });
});

describe("pending and declined clients", () => {
  it("can read /me (with the coach's name, for the waiting screen) but get 403 on data routes", async () => {
    stored.joinStatus = "pending";
    const me = await supertest(app).get("/api/client-auth/me").set("Cookie", cookie("pending"));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ joinStatus: "pending", coachName: "Anna Rivers", needsWelcome: true });
    for (const url of ["/api/client-auth/my-plan", "/api/client-auth/my-sessions", "/api/client-auth/my-streaks"]) {
      const res = await supertest(app).get(url).set("Cookie", cookie("pending"));
      expect(res.status, url).toBe(403);
      expect(res.body).toEqual({ error: NOT_APPROVED });
    }
    const declined = await supertest(app).get("/api/client-auth/my-plan").set("Cookie", cookie("declined"));
    expect(declined.body).toEqual({ error: DECLINED });
  });

  it("an active client reaches the data routes", async () => {
    const res = await supertest(app).get("/api/client-auth/my-plan").set("Cookie", cookie("active"));
    expect(res.status).toBe(200);
  });
});

describe("the welcome questions: GET/PATCH /api/client-auth/me/profile", () => {
  it("needsWelcome only for a code-joined client who has not answered", async () => {
    stored.joinedVia = "coach";
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", cookie())).body.needsWelcome).toBe(false);
    stored.joinedVia = "code";
    stored.onboardedAt = new Date();
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", cookie())).body.needsWelcome).toBe(false);
  });

  it("saves only the allowed fields and marks the welcome done", async () => {
    const res = await supertest(app)
      .patch("/api/client-auth/me/profile")
      .set("Cookie", cookie())
      .send({ goal: "Fat loss", age: 29, heightCm: 165, weightKg: 68, level: "Intermediate", units: "lb", injuries: "Left knee\n  hurts on squats", healthConsent: true });
    expect(res.status).toBe(204);
    const data = prismaMock.client.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ goal: "Fat loss", age: 29, heightCm: 165, weightKg: 68, level: "Intermediate", units: "lb" });
    expect(data.notes).toBe("From client: Left knee hurts on squats");
    expect(data.onboardedAt).toBeInstanceOf(Date);
    expect(data.healthConsentAt).toBeInstanceOf(Date);
    expect(prismaMock.client.update.mock.calls[0][0].where).toEqual({ id: "c1" });
  });

  it("health details need the client's separate, explicit consent", async () => {
    for (const body of [{ weightKg: 70 }, { heightCm: 170 }, { injuries: "Bad back" }]) {
      const res = await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(HEALTH_CONSENT_NEEDED);
    }
    expect(prismaMock.client.update).not.toHaveBeenCalled();
    // Non-health answers and Skip don't need it; consent can't be sent as false.
    expect((await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ goal: "Fat loss", age: 30 })).status).toBe(204);
    expect((await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ skip: true })).status).toBe(204);
    expect((await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ healthConsent: false })).status).toBe(400);
  });

  it("re-sending a value already on the record (e.g. the coach's) or clearing it needs no consent", async () => {
    stored.weightKg = 70;
    stored.heightCm = 170;
    stored.notes = "From client: Bad back";
    const res = await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ weightKg: 70, heightCm: null, injuries: "Bad back" });
    expect(res.status).toBe(204);
    expect((await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ weightKg: 71 })).status).toBe(400);
  });

  it("consent given once covers later edits, and the profile reports it", async () => {
    stored.healthConsentAt = new Date("2026-11-01T00:00:00Z");
    const res = await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ weightKg: 71 });
    expect(res.status).toBe(204);
    expect(prismaMock.client.update.mock.calls[0][0].data.healthConsentAt).toBeUndefined();
    const got = await supertest(app).get("/api/client-auth/me/profile").set("Cookie", cookie());
    expect(got.body.healthConsent).toBe(true);
  });

  it("keeps the coach's own notes and replaces only the client's line", async () => {
    stored.notes = "Coach: watch form\nFrom client: old text";
    await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ injuries: "new text", healthConsent: true });
    expect(stored.notes).toBe("Coach: watch form\nFrom client: new text");
    // GET shows the client ONLY their own line, never the coach's notes.
    const got = await supertest(app).get("/api/client-auth/me/profile").set("Cookie", cookie());
    expect(got.body.injuries).toBe("new text");
    expect(JSON.stringify(got.body)).not.toContain("watch form");
  });

  it("turns every kind of line break into a space, so the client's text stays one line", async () => {
    stored.notes = "Coach: private";
    await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ injuries: "a\rb\u2028c\u2029d\r\ne", healthConsent: true });
    expect(stored.notes).toBe("Coach: private\nFrom client: a b c d e");
  });

  it("a declined client cannot write to their record", async () => {
    const res = await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie("declined")).send({ goal: "x" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: DECLINED });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("skip marks the welcome done and saves nothing else", async () => {
    await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send({ skip: true, goal: "ignored" });
    const data = prismaMock.client.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(["onboardedAt"]);
  });

  it.each([
    [{ age: 9 }, "You need to be 18 or over to use Repsy."],
    [{ age: 17 }, "You need to be 18 or over to use Repsy."],
    [{ heightCm: 400 }, "Height looks too big."],
    [{ weightKg: "a lot" }, "Weight must be a number."],
    [{ level: "Pro" }, "Please pick Beginner, Intermediate or Advanced."],
    [{ units: "stone" }, "Please pick kg or lb."],
    [{ name: "New name" }, "Only the welcome questions can be changed here."],
    [{ coachId: "coach-2" }, "Only the welcome questions can be changed here."],
    [{ notes: "overwrite coach notes" }, "Only the welcome questions can be changed here."],
  ])("rejects %j", async (body, error) => {
    const res = await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie()).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("needs a client session (a coach session does not count)", async () => {
    expect((await supertest(app).patch("/api/client-auth/me/profile").send({ goal: "x" })).status).toBe(401);
    expect((await supertest(app).get("/api/client-auth/me/profile")).status).toBe(401);
  });
});

describe("client password reset", () => {
  it("forgot replies the same for any email and emails a single-use link to a real client", async () => {
    prismaMock.client.findUnique.mockImplementation(async ({ where }: { where: { loginEmail?: string } }) =>
      where.loginEmail === "maya@example.com" ? { id: "c1", loginEmail: "maya@example.com" } : null,
    );
    const known = await supertest(app).post("/api/client-auth/forgot").send({ email: "MAYA@example.com" });
    const unknown = await supertest(app).post("/api/client-auth/forgot").send({ email: "nobody@example.com" });
    expect(known.body).toEqual({ message: FORGOT_REPLY });
    expect(unknown.body).toEqual(known.body);
    await new Promise((r) => setTimeout(r, 20));
    expect(mailer.reset).toHaveBeenCalledTimes(1);
    const link = new URL(mailer.reset.mock.calls[0][1] as string);
    expect(link.origin + link.pathname).toBe("https://app.repsy.fit/client/reset-password");
    const token = link.searchParams.get("token")!;
    const created = prismaMock.clientPasswordResetToken.create.mock.calls[0][0].data;
    expect(created.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(created)).not.toContain(token);
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("reset spends the token once, sets the password and ends old client sessions", async () => {
    prismaMock.clientPasswordResetToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prismaMock.clientPasswordResetToken.findUnique.mockResolvedValue({ clientId: "c1" });
    const ok = await supertest(app).post("/api/client-auth/reset").send({ token: "tok", password: "new password 123" });
    expect(ok.status).toBe(204);
    expect(prismaMock.clientPasswordResetToken.updateMany.mock.calls[0][0].where).toMatchObject({ tokenHash: hashToken("tok"), usedAt: null });
    const upd = prismaMock.client.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "c1" });
    expect(upd.data.clientSessionVersion).toEqual({ increment: 1 });
    // Prompt 78: proving the inbox removes any linked Google sign-in.
    expect(upd.data.googleSub).toBeNull();
    expect(await verifyPassword("new password 123", upd.data.passwordHash)).toBe(true);
    const again = await supertest(app).post("/api/client-auth/reset").send({ token: "tok", password: "new password 123" });
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ error: BAD_RESET });
  });

  it("an expired token is refused: the claim only matches tokens that have not expired", async () => {
    prismaMock.clientPasswordResetToken.updateMany.mockResolvedValue({ count: 0 });
    const before = Date.now();
    const res = await supertest(app).post("/api/client-auth/reset").send({ token: "old", password: "new password 123" });
    expect(res.status).toBe(400);
    const where = prismaMock.clientPasswordResetToken.updateMany.mock.calls[0][0].where;
    expect(where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before - 5);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });
});
