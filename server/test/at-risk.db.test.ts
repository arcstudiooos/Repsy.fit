// "Needs attention" card (Prompt 50), against a real database (runs in CI only).
// coachId is a real foreign key (Prompt 43), so the test signs in as a coach row it creates.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `atrisk-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("GET /api/at-risk (database)", () => {
  let coachId = "";
  let api: ReturnType<typeof asCoach>;

  beforeAll(async () => {
    coachId = (await prisma.coach.create({ data: { name: "Test", email: `${tag}@example.com`, passwordHash: "x" } })).id;
    api = asCoach(app, coachId);
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: coachId } }); // cascades to its clients and logs
    await prisma.$disconnect();
  });

  it("lists a client with low adherence and a reason, and not a client on track", async () => {
    const low = await api.post("/api/clients").send({ name: "AtRisk Low" });
    const fine = await api.post("/api/clients").send({ name: "AtRisk Fine" });
    expect(low.status).toBe(201);
    expect(fine.status).toBe(201);
    const date = new Date().toISOString().slice(0, 10);
    expect((await api.post(`/api/clients/${low.body.id}/progress`).send({ date, adherence: 30 })).status).toBe(201);
    expect((await api.post(`/api/clients/${fine.body.id}/progress`).send({ date, adherence: 95 })).status).toBe(201);

    const res = await api.get(`/api/at-risk?date=${date}`);
    expect(res.status).toBe(200);
    const ids = res.body.clients.map((c: { clientId: string }) => c.clientId);
    expect(ids).toContain(low.body.id);
    expect(ids).not.toContain(fine.body.id);
    const row = res.body.clients.find((c: { clientId: string }) => c.clientId === low.body.id);
    expect(row.reasons).toEqual([{ rule: "adherence", text: "Adherence 30% over the last 2 weeks" }]);
  });
});
