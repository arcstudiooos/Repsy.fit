// Prompt 51 against a real database (runs in CI only): the summary is saved, survives a reload,
// needs a confirm to be replaced, and belongs to one coach only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `weekly-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("weekly summary (database)", () => {
  const coachIds: string[] = [];
  let api: ReturnType<typeof asCoach>;
  let otherApi: ReturnType<typeof asCoach>;

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    api = asCoach(app, coachIds[0]);
    otherApi = asCoach(app, coachIds[1]);
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades
    await prisma.$disconnect();
  });

  it("saves one summary per week, keeps it on reload, and replaces it only on confirm", async () => {
    const date = "2026-11-11";
    const client = await api.post("/api/clients").send({ name: "Weekly Probe" });
    expect(client.status).toBe(201);
    expect((await api.post(`/api/clients/${client.body.id}/progress`).send({ date: "2026-11-10", adherence: 84 })).status).toBe(201);

    const before = await api.get(`/api/weekly-summary?date=${date}`);
    expect(before.body).toMatchObject({ weekStart: "2026-11-09", summary: null });

    // No AI key in CI, so the saved text is the plain fact list - never an error.
    const made = await api.post("/api/weekly-summary").send({ date });
    expect(made.status).toBe(201);
    expect(made.body.summary.source).toBe("facts");
    expect(made.body.summary.facts).toMatchObject({ weekStart: "2026-11-09", checkIns: 1, avgAdherence: 84 });
    expect(made.body.summary.text).toContain("Check-ins logged: 1");

    const reloaded = await api.get(`/api/weekly-summary?date=${date}`);
    expect(reloaded.body.summary.text).toBe(made.body.summary.text);

    const blocked = await api.post("/api/weekly-summary").send({ date });
    expect(blocked.status).toBe(409);

    const replaced = await api.post("/api/weekly-summary").send({ date, replace: true });
    expect(replaced.status).toBe(201);
    expect(await prisma.weeklySummary.count({ where: { coachId: coachIds[0] } })).toBe(1);

    // Another coach sees nothing of it, and counts only their own (empty) records.
    const other = await otherApi.get(`/api/weekly-summary?date=${date}`);
    expect(other.body.summary).toBeNull();
    const otherMade = await otherApi.post("/api/weekly-summary").send({ date });
    expect(otherMade.body.summary.facts).toMatchObject({ activeClients: 0, checkIns: 0 });
  });
});
