// Prompt 79 against a real database: a client sees and completes only their own plans; Paused plans
// are invisible; the coach sees "completed by client" with the effort and note.
// Skipped when DATABASE_URL is not set (runs in CI).
import supertest from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { CLIENT_SESSION_COOKIE, signClientSession } from "../src/auth/clientSession.js";
import { asCoach } from "./helpers/authedRequest.js";

const stamp = Date.now();
const coachEmail = `app79-${stamp}@example.com`;

describe.skipIf(!process.env.DATABASE_URL)("client app plans (database)", () => {
  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { email: coachEmail } });
    await prisma.$disconnect();
  });

  it("scopes to the client's own Active / Done plans and records the client's completion", async () => {
    const coach = await prisma.coach.create({ data: { planTier: "Pro100", email: coachEmail, name: "Coach 79", passwordHash: "x" } });
    const [maya, sam] = await Promise.all(
      ["maya", "sam"].map((n) =>
        prisma.client.create({ data: { coachId: coach.id, name: n, loginEmail: `${n}-${stamp}@example.com`, passwordHash: "$2b$12$x" } }),
      ),
    );
    const mk = (clientId: string, title: string, status = "Active") =>
      prisma.assignment.create({ data: { coachId: coach.id, clientId, type: "Workout", title, details: "x", status, date: "2026-11-12" } });
    const [mine, paused, theirs] = await Promise.all([mk(maya.id, "Mine"), mk(maya.id, "Paused one", "Paused"), mk(sam.id, "Sam's")]);
    const cookie = `${CLIENT_SESSION_COOKIE}=${signClientSession(maya.id, 0)}`;

    const list = await supertest(app).get("/api/client-auth/my-assignments?from=2026-11-10&to=2026-11-16").set("Cookie", cookie);
    expect((list.body as { title: string }[]).map((a) => a.title)).toEqual(["Mine"]);
    expect((await supertest(app).get(`/api/client-auth/my-assignments/${paused.id}`).set("Cookie", cookie)).status).toBe(404);
    expect((await supertest(app).post(`/api/client-auth/my-assignments/${theirs.id}/done`).set("Cookie", cookie).send({ done: true })).status).toBe(404);
    expect((await supertest(app).post(`/api/client-auth/my-assignments/${paused.id}/done`).set("Cookie", cookie).send({ done: true })).status).toBe(404);

    const ok = await supertest(app).post(`/api/client-auth/my-assignments/${mine.id}/done`).set("Cookie", cookie).send({ done: true, effort: 8, note: "Tough" });
    expect(ok.body).toMatchObject({ status: "Done", completedBy: "client", clientEffort: 8, clientNote: "Tough" });

    // The coach's list shows it was the client, with effort and note.
    const coachList = await asCoach(app, coach.id).get(`/api/clients/${maya.id}/assignments`);
    expect((coachList.body as { id: string }[]).find((a) => a.id === mine.id)).toMatchObject({ completedBy: "client", clientEffort: 8, clientNote: "Tough" });
    // Sam's plan is untouched.
    expect((await prisma.assignment.findUnique({ where: { id: theirs.id } }))?.status).toBe("Active");
  });
});
