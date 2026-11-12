// Prompt 84 against a real database: a pending client is hidden from the coach's list until approved;
// a declined one can't reach their data; only pending can be decided; another coach can't decide.
import supertest from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { CLIENT_SESSION_COOKIE, signClientSession } from "../src/auth/clientSession.js";
import { asCoach } from "./helpers/authedRequest.js";

const stamp = Date.now();
const emails = [`appr84-a-${stamp}@example.com`, `appr84-b-${stamp}@example.com`];

describe.skipIf(!process.env.DATABASE_URL)("approving clients (database)", () => {
  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  it("pending -> approved shows in the list; declined loses data access; rules hold", async () => {
    const [a, b] = await Promise.all(emails.map((email, i) => prisma.coach.create({ data: { email, name: `Coach ${i}`, passwordHash: "x" } })));
    const [pat, dee] = await Promise.all(
      ["pat", "dee"].map((n) => prisma.client.create({ data: { coachId: a.id, name: n, loginEmail: `${n}-84-${stamp}@example.com`, passwordHash: "$2b$12$x", joinStatus: "pending", joinedVia: "code" } })),
    );
    const names = async () => (await asCoach(app, a.id).get("/api/clients")).body.map((c: { name: string }) => c.name);
    expect(await names()).toEqual([]);
    expect((await asCoach(app, a.id).get("/api/clients/waiting")).body.map((c: { name: string }) => c.name)).toEqual(["pat", "dee"]);
    expect((await asCoach(app, a.id).get("/api/alerts")).body.waiting).toBe(2);

    // Another coach can't decide.
    expect((await asCoach(app, b.id).post(`/api/clients/${pat.id}/approve`)).status).toBe(404);

    expect((await asCoach(app, a.id).post(`/api/clients/${pat.id}/approve`)).status).toBe(200);
    expect((await asCoach(app, a.id).post(`/api/clients/${pat.id}/decline`)).status).toBe(409);
    expect(await names()).toEqual(["pat"]);
    expect((await asCoach(app, a.id).get("/api/alerts")).body.joined.map((j: { name: string }) => j.name)).toEqual(["pat"]);

    expect((await asCoach(app, a.id).post(`/api/clients/${dee.id}/decline`)).status).toBe(200);
    const deeCookie = `${CLIENT_SESSION_COOKIE}=${signClientSession(dee.id, 0)}`;
    expect((await supertest(app).get("/api/client-auth/my-assignments").set("Cookie", deeCookie)).status).toBe(403);
    expect((await supertest(app).get("/api/client-auth/me").set("Cookie", deeCookie)).body.joinStatus).toBe("declined");
    const patCookie = `${CLIENT_SESSION_COOKIE}=${signClientSession(pat.id, 0)}`;
    expect((await supertest(app).get("/api/client-auth/my-assignments").set("Cookie", patCookie)).status).toBe(200);
  });
});
