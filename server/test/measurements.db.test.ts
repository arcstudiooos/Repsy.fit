// Prompt 56 against a real database (CI only): add, list newest first, delete, scoping, cascade.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `meas-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("body measurements (database)", () => {
  const coachIds: string[] = [];
  let api: ReturnType<typeof asCoach>;
  let otherApi: ReturnType<typeof asCoach>;
  let clientId = "";

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    api = asCoach(app, coachIds[0]);
    otherApi = asCoach(app, coachIds[1]);
    clientId = (await api.post("/api/clients").send({ name: "Measure Probe" })).body.id;
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades
    await prisma.$disconnect();
  });

  it("adds measurements and lists them newest first", async () => {
    const a = await api.post(`/api/clients/${clientId}/measurements`).send({ date: "2026-10-01", waistCm: 84, bodyFatPercent: 20 });
    const b = await api.post(`/api/clients/${clientId}/measurements`).send({ date: "2026-11-01", waistCm: 82, armCm: 34, note: "ok" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({ clientId, date: "2026-11-01", waistCm: 82, armCm: 34, chestCm: null, hipCm: null, bodyFatPercent: null, note: "ok" });
    const list = await api.get(`/api/clients/${clientId}/measurements`);
    expect(list.status).toBe(200);
    expect(list.body.map((m: { date: string }) => m.date)).toEqual(["2026-11-01", "2026-10-01"]);
  });

  it("rejects bad values with a plain-words error", async () => {
    const res = await api.post(`/api/clients/${clientId}/measurements`).send({ date: "2026-11-02", bodyFatPercent: 120 });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });

  it("another coach cannot read, add or delete", async () => {
    const mine = (await api.get(`/api/clients/${clientId}/measurements`)).body[0].id;
    expect((await otherApi.get(`/api/clients/${clientId}/measurements`)).status).toBe(404);
    expect((await otherApi.post(`/api/clients/${clientId}/measurements`).send({ date: "2026-11-03", waistCm: 80 })).status).toBe(404);
    const del = await otherApi.delete(`/api/clients/${clientId}/measurements/${mine}`);
    expect(del.status).toBe(404);
  });

  it("deletes one (204), then 'Measurement not found'", async () => {
    const list = (await api.get(`/api/clients/${clientId}/measurements`)).body;
    const del = await api.delete(`/api/clients/${clientId}/measurements/${list[0].id}`);
    expect(del.status).toBe(204);
    const again = await api.delete(`/api/clients/${clientId}/measurements/${list[0].id}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: "Measurement not found" });
  });

  it("deleting the client deletes its measurements", async () => {
    await api.delete(`/api/clients/${clientId}`);
    expect(await prisma.measurement.count({ where: { clientId } })).toBe(0);
  });
});
