// Prompt 24 "Test:" line against a real database: mark a plan Done, pause one, delete one -
// the list reflects each change. Skipped when DATABASE_URL is not set (runs in CI).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `assignment-status-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("assignment status and delete (database)", () => {
  let coachId = "";
  let api: ReturnType<typeof asCoach>;

  beforeAll(async () => {
    coachId = (await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}@example.com`, passwordHash: "x" } })).id;
    api = asCoach(app, coachId);
  });

  afterAll(async () => {
    // Deleting the coach cascades to its clients and everything under them.
    await prisma.coach.deleteMany({ where: { id: coachId } });
    await prisma.$disconnect();
  });

  it("marks one Done, pauses one, deletes one; the list and another client stay correct", async () => {
    const created = await api.post("/api/clients").send({ name: "Status Test Client" });
    const other = await api.post("/api/clients").send({ name: "Status Other Client" });
    expect(created.status).toBe(201);
    expect(other.status).toBe(201);
    const clientId: string = created.body.id;
    const otherId: string = other.body.id;

    const ids: string[] = [];
    for (const title of ["Plan A", "Plan B", "Plan C"]) {
      const res = await api
        .post(`/api/clients/${clientId}/assignments`)
        .send({ type: "Workout", title, details: "Squat 3x10" });
      expect(res.status).toBe(201);
      ids.push(res.body.id);
    }
    const [a, b, c] = ids;

    const done = await api.patch(`/api/clients/${clientId}/assignments/${a}`).send({ status: "Done" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ id: a, clientId, status: "Done", title: "Plan A" });

    const paused = await api.patch(`/api/clients/${clientId}/assignments/${b}`).send({ status: "Paused" });
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe("Paused");

    const deleted = await api.delete(`/api/clients/${clientId}/assignments/${c}`);
    expect(deleted.status).toBe(204);

    const list = await api.get(`/api/clients/${clientId}/assignments`);
    expect(list.body.map((x: { id: string; status: string }) => [x.id, x.status])).toEqual([
      [b, "Paused"],
      [a, "Done"],
    ]);

    // Another client's path can't see or change these assignments.
    const wrongPatch = await api.patch(`/api/clients/${otherId}/assignments/${a}`).send({ status: "Active" });
    expect(wrongPatch.status).toBe(404);
    expect(wrongPatch.body).toEqual({ error: "Assignment not found" });
    const wrongDelete = await api.delete(`/api/clients/${otherId}/assignments/${a}`);
    expect(wrongDelete.status).toBe(404);

    const again = await api.delete(`/api/clients/${clientId}/assignments/${c}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: "Assignment not found" });

    const after = await api.get(`/api/clients/${clientId}/assignments`);
    expect(after.body).toHaveLength(2);
    expect(after.body.find((x: { id: string }) => x.id === a).status).toBe("Done");
  });
});
