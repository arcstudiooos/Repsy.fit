// Prompt 24 "Test:" line against a real database: mark a plan Done, pause one, delete one -
// the list reflects each change. Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const createdIds: string[] = [];

describe.skipIf(!process.env.DATABASE_URL)("assignment status and delete (database)", () => {
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("marks one Done, pauses one, deletes one; the list and another client stay correct", async () => {
    const created = await request(app).post("/api/clients").send({ name: "Status Test Client" });
    const other = await request(app).post("/api/clients").send({ name: "Status Other Client" });
    expect(created.status).toBe(201);
    expect(other.status).toBe(201);
    const clientId: string = created.body.id;
    const otherId: string = other.body.id;
    createdIds.push(clientId, otherId);

    const ids: string[] = [];
    for (const title of ["Plan A", "Plan B", "Plan C"]) {
      const res = await request(app)
        .post(`/api/clients/${clientId}/assignments`)
        .send({ type: "Workout", title, details: "Squat 3x10" });
      expect(res.status).toBe(201);
      ids.push(res.body.id);
    }
    const [a, b, c] = ids;

    const done = await request(app).patch(`/api/clients/${clientId}/assignments/${a}`).send({ status: "Done" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ id: a, clientId, status: "Done", title: "Plan A" });

    const paused = await request(app).patch(`/api/clients/${clientId}/assignments/${b}`).send({ status: "Paused" });
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe("Paused");

    const deleted = await request(app).delete(`/api/clients/${clientId}/assignments/${c}`);
    expect(deleted.status).toBe(204);

    const list = await request(app).get(`/api/clients/${clientId}/assignments`);
    expect(list.body.map((x: { id: string; status: string }) => [x.id, x.status])).toEqual([
      [b, "Paused"],
      [a, "Done"],
    ]);

    // Another client's path can't see or change these assignments.
    const wrongPatch = await request(app).patch(`/api/clients/${otherId}/assignments/${a}`).send({ status: "Active" });
    expect(wrongPatch.status).toBe(404);
    expect(wrongPatch.body).toEqual({ error: "Assignment not found" });
    const wrongDelete = await request(app).delete(`/api/clients/${otherId}/assignments/${a}`);
    expect(wrongDelete.status).toBe(404);

    const again = await request(app).delete(`/api/clients/${clientId}/assignments/${c}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: "Assignment not found" });

    const after = await request(app).get(`/api/clients/${clientId}/assignments`);
    expect(after.body).toHaveLength(2);
    expect(after.body.find((x: { id: string }) => x.id === a).status).toBe("Done");
  });
});
