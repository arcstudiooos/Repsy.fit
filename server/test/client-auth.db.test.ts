// Prompt 65 against a real database (CI only): invite -> set password -> client login -> /me,
// and the walls between coach and client sessions, with real cookies end to end.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";
import { CLIENT_SESSION_COOKIE } from "../src/auth/clientSession.js";
import { hashToken } from "../src/auth/resetToken.js";
import { resetRateLimits } from "../src/auth/rateLimit.js";

const tag = `client-auth-${Date.now()}`;
const PASSWORD = "client password 123";

/** The Cookie header value for the client session from a login response. */
function clientCookieFrom(res: supertest.Response): string {
  const raw = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${CLIENT_SESSION_COOKIE}=`));
  if (!raw) throw new Error("no client cookie");
  return raw.split(";")[0];
}

describe.skipIf(!process.env.DATABASE_URL)("client invite and sign-in (database)", () => {
  const coachIds: string[] = [];
  let coach: ReturnType<typeof asCoach>;
  let otherCoach: ReturnType<typeof asCoach>;
  let clientA = "";
  let clientB = "";
  let cookie = "";
  const emailA = `${tag}-maya@example.com`;

  beforeAll(async () => {
    resetRateLimits();
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { name: `Coach ${n}`, email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    coach = asCoach(app, coachIds[0]);
    otherCoach = asCoach(app, coachIds[1]);
    clientA = (await coach.post("/api/clients").send({ name: "Invite Probe A" })).body.id;
    clientB = (await coach.post("/api/clients").send({ name: "Invite Probe B" })).body.id;
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades clients and invites
    await prisma.$disconnect();
  });

  it("invite -> set password -> login -> /me shows only their own account", async () => {
    const invite = await coach.post(`/api/clients/${clientA}/invite`).send({ email: emailA });
    expect(invite.status).toBe(201);
    // CI has no SMTP, so the coach gets the link to share.
    expect(invite.body).toMatchObject({ sent: false, loginEmail: emailA });
    const token = new URL(invite.body.inviteLink).searchParams.get("token")!;

    // Only the hash is stored.
    const stored = await prisma.clientInvite.findFirst({ where: { clientId: clientA } });
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(stored?.tokenHash).not.toBe(token);

    // Sending the invite does not set the login yet: that happens when the client uses it.
    expect((await coach.get(`/api/clients/${clientA}/invite`)).body).toMatchObject({ status: "invited", loginEmail: null, pendingEmail: emailA });

    const set = await supertest(app).post("/api/client-auth/set-password").send({ token, password: PASSWORD });
    expect(set.status).toBe(204);
    // Single use.
    const again = await supertest(app).post("/api/client-auth/set-password").send({ token, password: PASSWORD });
    expect(again.status).toBe(400);

    const login = await supertest(app).post("/api/client-auth/login").send({ email: emailA, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ id: clientA, name: "Invite Probe A", loginEmail: emailA, joinStatus: "active" });
    cookie = clientCookieFrom(login);

    const me = await supertest(app).get("/api/client-auth/me").set("Cookie", cookie);
    // Prompt 77: plus their join status, their OWN coach's name, and no welcome step (added by the coach).
    expect(me.body).toMatchObject({ id: clientA, name: "Invite Probe A", loginEmail: emailA, joinStatus: "active", needsWelcome: false });
    expect(Object.keys(me.body).sort()).toEqual(["coachName", "id", "joinStatus", "loginEmail", "name", "needsWelcome"]);
    expect((await coach.get(`/api/clients/${clientA}/invite`)).body).toMatchObject({ status: "active", loginEmail: emailA });
  });

  it("the client's session opens no coach data: not their own record, not client B, no /api/auth/me", async () => {
    for (const url of [`/api/clients/${clientA}`, `/api/clients/${clientB}`, "/api/clients", `/api/clients/${clientA}/messages`, "/api/auth/me"]) {
      const res = await supertest(app).get(url).set("Cookie", cookie);
      expect(res.status, url).toBe(401);
    }
  });

  it("a coach session gets 401 on the client routes", async () => {
    expect((await coach.get("/api/client-auth/me")).status).toBe(401);
  });

  it("the password hash never reaches the coach API", async () => {
    const list = await coach.get("/api/clients");
    const one = await coach.get(`/api/clients/${clientA}`);
    expect(JSON.stringify(list.body)).not.toContain("passwordHash");
    expect(JSON.stringify(one.body)).not.toContain("passwordHash");
    expect(one.body.loginEmail).toBe(emailA);
    // It is in the database, just never sent.
    const row = await prisma.client.findUnique({ where: { id: clientA }, select: { passwordHash: true } });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("an expired invite is refused; a newer invite replaces the older one", async () => {
    const first = (await coach.post(`/api/clients/${clientB}/invite`).send({ email: `${tag}-b@example.com` })).body;
    const second = (await coach.post(`/api/clients/${clientB}/invite`).send({ email: `${tag}-b@example.com` })).body;
    const t1 = new URL(first.inviteLink).searchParams.get("token")!;
    const t2 = new URL(second.inviteLink).searchParams.get("token")!;
    expect((await supertest(app).post("/api/client-auth/set-password").send({ token: t1, password: PASSWORD })).status).toBe(400);

    await prisma.clientInvite.updateMany({ where: { tokenHash: hashToken(t2) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await supertest(app).post("/api/client-auth/set-password").send({ token: t2, password: PASSWORD })).status).toBe(400);
  });

  it("another coach cannot see or invite this coach's client; a login email is unique (generic message)", async () => {
    expect((await otherCoach.get(`/api/clients/${clientA}/invite`)).status).toBe(404);
    expect((await otherCoach.post(`/api/clients/${clientA}/invite`).send({ email: "x@example.com" })).status).toBe(404);
    const dup = await coach.post(`/api/clients/${clientB}/invite`).send({ email: emailA });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("That email can't be used for a client sign-in. Please use a different one.");
  });

  it("re-inviting an active client to a new address does not lock them out before they use it", async () => {
    const other = `${tag}-maya-new@example.com`;
    expect((await coach.post(`/api/clients/${clientA}/invite`).send({ email: other })).status).toBe(201);
    // The old email and password still work while the new invite is unused.
    const still = await supertest(app).post("/api/client-auth/login").send({ email: emailA, password: PASSWORD });
    expect(still.status).toBe(200);
    expect((await supertest(app).post("/api/client-auth/login").send({ email: other, password: PASSWORD })).status).toBe(401);
    cookie = clientCookieFrom(still);
  });

  it("two invites sent at the same moment leave exactly one live link", async () => {
    const [a, b] = await Promise.all([
      coach.post(`/api/clients/${clientB}/invite`).send({ email: `${tag}-race1@example.com` }),
      coach.post(`/api/clients/${clientB}/invite`).send({ email: `${tag}-race2@example.com` }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const live = await prisma.clientInvite.count({ where: { clientId: clientB, usedAt: null, expiresAt: { gt: new Date() } } });
    expect(live).toBe(1);
  });

  it("setting the password again (new invite) ends the older client session", async () => {
    const invite = await coach.post(`/api/clients/${clientA}/invite`).send({ email: emailA });
    const token = new URL(invite.body.inviteLink).searchParams.get("token")!;
    expect((await supertest(app).post("/api/client-auth/set-password").send({ token, password: "another password 456" })).status).toBe(204);
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", cookie)).status).toBe(401);
  });
});
