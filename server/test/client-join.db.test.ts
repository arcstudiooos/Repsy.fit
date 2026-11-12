// Prompt 77 against a real database: joining with a code puts the client under THAT coach (and no
// other coach can see them), pending clients are kept from data, and the welcome answers save.
// Skipped when DATABASE_URL is not set (runs in CI).
import supertest from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { CLIENT_SESSION_COOKIE } from "../src/auth/clientSession.js";
import { asCoach } from "./helpers/authedRequest.js";

const stamp = Date.now();
const coachEmails = [`join77-a-${stamp}@example.com`, `join77-b-${stamp}@example.com`];
const clientEmail = `join77-client-${stamp}@example.com`;
const pendingEmail = `join77-pending-${stamp}@example.com`;
const clientCookieOf = (res: supertest.Response) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${CLIENT_SESSION_COOKIE}=`))!.split(";")[0];

describe.skipIf(!process.env.DATABASE_URL)("joining with a code (database)", () => {
  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { email: { in: coachEmails } } }); // cascades to the clients
    await prisma.$disconnect();
  });

  it("creates the client under the code's coach only; pending clients wait; the profile saves", async () => {
    const [a, b] = await Promise.all(coachEmails.map((email, i) => prisma.coach.create({ data: { email, name: i ? "Bea" : "Anna", passwordHash: "x" } })));
    const code = (await asCoach(app, a.id).get("/api/join-code")).body.code as string;

    const joined = await supertest(app).post("/api/client-auth/join").send({ code, name: "Maya", email: clientEmail, password: "correct horse battery" });
    expect(joined.status).toBe(201);
    const row = await prisma.client.findUnique({ where: { loginEmail: clientEmail } });
    expect(row).toMatchObject({ coachId: a.id, joinedVia: "code", joinStatus: "active" });

    // Coach A sees the new client; coach B does not, and cannot open it.
    expect(((await asCoach(app, a.id).get("/api/clients")).body as { id: string }[]).map((c) => c.id)).toContain(row!.id);
    expect(((await asCoach(app, b.id).get("/api/clients")).body as { id: string }[]).map((c) => c.id)).not.toContain(row!.id);
    expect((await asCoach(app, b.id).get(`/api/clients/${row!.id}`)).status).toBe(404);

    // Signed in by the join: welcome questions, then data routes work.
    const cookie = clientCookieOf(joined);
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", cookie)).body).toMatchObject({ needsWelcome: true, coachName: "Anna" });
    const saved = await supertest(app).patch("/api/client-auth/me/profile").set("Cookie", cookie).send({ goal: "Muscle gain", age: 31, units: "lb", injuries: "Bad wrist" });
    expect(saved.status).toBe(204);
    const after = await prisma.client.findUnique({ where: { id: row!.id } });
    expect(after).toMatchObject({ goal: "Muscle gain", age: 31, units: "lb", notes: "From client: Bad wrist" });
    expect(after!.onboardedAt).not.toBeNull();
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", cookie)).body.needsWelcome).toBe(false);
    expect((await supertest(app).get("/api/client-auth/my-plan").set("Cookie", cookie)).status).toBe(200);

    // The same email again is refused.
    const again = await supertest(app).post("/api/client-auth/join").send({ code, name: "Maya", email: clientEmail, password: "correct horse battery" });
    expect(again.status).toBe(409);

    // With approval on, the next joiner is pending: /me works, data routes are 403.
    await asCoach(app, a.id).patch("/api/join-code").send({ approveNewClients: true });
    const pending = await supertest(app).post("/api/client-auth/join").send({ code, name: "Pat", email: pendingEmail, password: "correct horse battery" });
    expect(pending.body.joinStatus).toBe("pending");
    const pc = clientCookieOf(pending);
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", pc)).status).toBe(200);
    expect((await supertest(app).get("/api/client-auth/my-plan").set("Cookie", pc)).status).toBe(403);

    // A reset token past its hour is refused by the real database query.
    const { issueClientResetToken } = await import("../src/routes/clientJoin.js");
    const token = await issueClientResetToken(row!.id, Date.now() - 2 * 60 * 60 * 1000);
    const expired = await supertest(app).post("/api/client-auth/reset").send({ token, password: "another password 1" });
    expect(expired.status).toBe(400);
    const fresh = await issueClientResetToken(row!.id);
    expect((await supertest(app).post("/api/client-auth/reset").send({ token: fresh, password: "another password 1" })).status).toBe(204);
    // The reset ended the old session.
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", cookie)).status).toBe(401);
  });
});
