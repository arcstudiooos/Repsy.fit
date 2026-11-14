// Prompt 53 "You test" against a real database (CI only): log today, save again with a change -
// still one row, updated; it shows on Home; and the AI context can read it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `daily-${Date.now()}`;
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!process.env.DATABASE_URL)("daily check-ins (database)", () => {
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
    clientId = (await api.post("/api/clients").send({ name: "Daily Probe" })).body.id;
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades
    await prisma.$disconnect();
  });

  it("saving the same day twice keeps ONE row, updated, and it reaches Home", async () => {
    const first = await api.post(`/api/clients/${clientId}/checkins`).send({ date: today, energy: 4, mood: 3, waterLiters: 2.5, steps: 8000, foodNote: "High protein" });
    expect(first.status).toBe(201);

    const again = await api.post(`/api/clients/${clientId}/checkins`).send({ date: today, energy: 2, mood: 2, foodNote: "Low energy day" });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(again.body).toMatchObject({ energy: 2, mood: 2, foodNote: "Low energy day" });
    // Fields left out are cleared, not kept from the earlier save.
    expect(again.body.steps).toBeNull();

    expect(await prisma.dailyCheckIn.count({ where: { clientId, date: today } })).toBe(1);

    const list = await api.get(`/api/clients/${clientId}/checkins`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ date: today, energy: 2 });

    // Home "New check-ins" merges it (Prompt 49's promise).
    const home = await api.get("/api/checkins/recent");
    const daily = home.body.items.find((i: { kind: string; id: string }) => i.kind === "daily" && i.id === first.body.id);
    expect(daily).toMatchObject({ clientName: "Daily Probe", energy: 2, mood: 2, date: today });
  });

  it("belongs to one coach only", async () => {
    expect((await otherApi.get(`/api/clients/${clientId}/checkins`)).status).toBe(404);
    expect((await otherApi.post(`/api/clients/${clientId}/checkins`).send({ date: today, energy: 5 })).status).toBe(404);
    const otherHome = await otherApi.get("/api/checkins/recent");
    expect(otherHome.body.items.filter((i: { kind: string }) => i.kind === "daily")).toEqual([]);
  });
});
