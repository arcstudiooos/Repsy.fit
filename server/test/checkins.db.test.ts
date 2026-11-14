// New check-ins card (Prompt 49), against a real database (runs in CI only).
// coachId is a real foreign key (Prompt 43), so the test signs in as a coach row it creates.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `checkins-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("GET /api/checkins/recent (database)", () => {
  let coachId = "";
  let api: ReturnType<typeof asCoach>;

  beforeAll(async () => {
    coachId = (await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}@example.com`, passwordHash: "x" } })).id;
    api = asCoach(app, coachId);
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: coachId } }); // cascades to its clients and logs
    await prisma.$disconnect();
  });

  it("a progress log added for a client appears with the right client, newest first", async () => {
    const made = await api.post("/api/clients").send({ name: "Checkin Probe" });
    expect(made.status).toBe(201);
    const date = new Date().toISOString().slice(0, 10);
    const first = await api.post(`/api/clients/${made.body.id}/progress`).send({ date, adherence: 80 });
    expect(first.status).toBe(201);
    const second = await api.post(`/api/clients/${made.body.id}/progress`).send({ date, weightKg: 70, note: "Probe" });
    expect(second.status).toBe(201);

    const res = await api.get("/api/checkins/recent");
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids.indexOf(second.body.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(second.body.id)).toBeLessThan(ids.indexOf(first.body.id));
    const item = res.body.items.find((i: { id: string }) => i.id === second.body.id);
    expect(item).toMatchObject({ kind: "progress", clientId: made.body.id, clientName: "Checkin Probe", weightKg: 70, note: "Probe" });
    expect(res.body.items.length).toBeLessThanOrEqual(8);
  });
});
