// Prompt 45 against a real database, with two coach accounts: coach A can't list, read, change or
// delete coach B's data, signed-out requests get 401, and demo seeds land in the caller's account.
// Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `p45-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("route protection by coach (database)", () => {
  let aId = "";
  let bId = "";
  let bClientId = "";
  let bAssignmentId = "";
  let bLogId = "";

  beforeAll(async () => {
    aId = (await prisma.coach.create({ data: { planTier: "Pro100", name: "A", email: `${tag}-a@example.com`, passwordHash: "x" } })).id;
    bId = (await prisma.coach.create({ data: { planTier: "Pro100", name: "B", email: `${tag}-b@example.com`, passwordHash: "x" } })).id;
    const b = asCoach(app, bId);
    bClientId = (await b.post("/api/clients").send({ name: `${tag} B client` })).body.id;
    bAssignmentId = (
      await b.post(`/api/clients/${bClientId}/assignments`).send({ type: "Habit", title: "Walk", details: "10k steps" })
    ).body.id;
    bLogId = (await b.post(`/api/clients/${bClientId}/progress`).send({ date: "2026-11-09", weightKg: 70 })).body.id;
  });

  afterAll(async () => {
    // Deleting the coaches cascades to their clients and everything under them.
    await prisma.coach.deleteMany({ where: { id: { in: [aId, bId] } } });
    await prisma.$disconnect();
  });

  it("coach A cannot list coach B's client", async () => {
    const list = await asCoach(app, aId).get("/api/clients");
    expect(list.status).toBe(200);
    expect(list.body.map((c: { id: string }) => c.id)).not.toContain(bClientId);
    const own = await asCoach(app, bId).get("/api/clients");
    expect(own.body.map((c: { id: string }) => c.id)).toContain(bClientId);
  });

  it("coach A cannot read, change or delete coach B's data by id (404 Client not found)", async () => {
    const a = asCoach(app, aId);
    const notFound = { error: "Client not found" };
    const base = `/api/clients/${bClientId}`;

    for (const res of [
      await a.get(base),
      await a.get(`${base}/assignments`),
      await a.post(`${base}/assignments`).send({ type: "Habit", title: "x", details: "y" }),
      await a.patch(`${base}/assignments/${bAssignmentId}`).send({ status: "Done" }),
      await a.delete(`${base}/assignments/${bAssignmentId}`),
      await a.get(`${base}/chat`),
      await a.post(`${base}/chat`).send({ question: "hi" }),
      await a.post(`${base}/auto-assign`).send({ type: "Workout" }),
      await a.get(`${base}/progress`),
      await a.post(`${base}/progress`).send({ date: "2026-11-10" }),
      await a.delete(`${base}/progress/${bLogId}`),
      await a.delete(base),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(notFound);
    }

    // Nothing of B's changed.
    const b = asCoach(app, bId);
    expect((await b.get(base)).status).toBe(200);
    const assignments = await b.get(`${base}/assignments`);
    expect(assignments.body).toHaveLength(1);
    expect(assignments.body[0]).toMatchObject({ id: bAssignmentId, status: "Active", coachId: bId });
    expect((await b.get(`${base}/progress`)).body).toHaveLength(1);
    expect((await b.get(`${base}/chat`)).body).toEqual([]);
  });

  it("signed-out requests get 401 { error }", async () => {
    const base = `/api/clients/${bClientId}`;
    for (const res of [
      await request(app).get("/api/clients"),
      await request(app).post("/api/clients").send({ name: "x" }),
      await request(app).get(base),
      await request(app).delete(base),
      await request(app).get(`${base}/assignments`),
      await request(app).patch(`${base}/assignments/${bAssignmentId}`).send({ status: "Done" }),
      await request(app).get(`${base}/chat`),
      await request(app).get(`${base}/progress`),
      await request(app).delete(`${base}/progress/${bLogId}`),
      await request(app).post("/api/seed/demo"),
      await request(app).post("/api/seed/six-month-demo"),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "You are not signed in." });
    }
    expect(await prisma.client.count({ where: { id: bClientId } })).toBe(1);
  });

  it("demo seeds load only into the signed-in coach's own account", async () => {
    const demoBefore = await prisma.client.count({ where: { coachId: null } });
    const a = asCoach(app, aId);

    const quick = await a.post("/api/seed/demo");
    expect(quick.status).toBe(201);
    expect(quick.body).toHaveLength(3);
    for (const c of quick.body) expect(c.coachId).toBe(aId);

    // B already has a client, so the quick seed does nothing for B; A's second tap does nothing too.
    expect((await asCoach(app, bId).post("/api/seed/demo")).body).toEqual([]);
    expect((await a.post("/api/seed/demo")).body).toEqual([]);

    const six = await a.post("/api/seed/six-month-demo");
    expect(six.status).toBe(201);
    expect(six.body).toHaveLength(10);
    for (const c of six.body) expect(c.coachId).toBe(aId);

    // None of it landed in B's account or in the unclaimed demo rows.
    const bNames = (await asCoach(app, bId).get("/api/clients")).body.map((c: { name: string }) => c.name);
    expect(bNames).toEqual([`${tag} B client`]);
    expect(await prisma.client.count({ where: { coachId: null } })).toBe(demoBefore);
    expect(await prisma.assignment.count({ where: { clientId: { in: quick.body.map((c: { id: string }) => c.id) }, coachId: aId } })).toBe(3);
  });

  it("the landing-page lead route stays public", async () => {
    const email = `${tag}-lead@example.com`;
    try {
      const res = await request(app).post("/api/leads").send({ name: "Lead", email });
      expect(res.status).toBe(201);
    } finally {
      await prisma.lead.deleteMany({ where: { email } });
    }
  });
});
