// Prompt 55 against a real database (CI only): sleep hours / recovery save and update, bad values are
// refused, and low sleep becomes an added reason on a client the original at-risk rules picked.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `sleep-${Date.now()}`;
const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!process.env.DATABASE_URL)("sleep & recovery (database)", () => {
  let coachId = "";
  let api: ReturnType<typeof asCoach>;
  let clientId = "";

  beforeAll(async () => {
    coachId = (await prisma.coach.create({ data: { name: "Test", email: `${tag}@example.com`, passwordHash: "x" } })).id;
    api = asCoach(app, coachId);
    clientId = (await api.post("/api/clients").send({ name: "Sleep Probe" })).body.id;
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: coachId } }); // cascades
    await prisma.$disconnect();
  });

  it("saves one-decimal sleep and a recovery score, and refuses bad values", async () => {
    const ok = await api.post(`/api/clients/${clientId}/checkins`).send({ date: dayAgo(0), sleepHours: 5.5, recoveryScore: 2 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ sleepHours: 5.5, recoveryScore: 2 });
    for (const bad of [{ sleepHours: 17 }, { sleepHours: 7.25 }, { recoveryScore: 6 }]) {
      expect((await api.post(`/api/clients/${clientId}/checkins`).send({ date: dayAgo(1), ...bad })).status).toBe(400);
    }
  });

  it("low sleep is an added line on an at-risk client, never a reason by itself", async () => {
    await api.post(`/api/clients/${clientId}/checkins`).send({ date: dayAgo(1), sleepHours: 5 });
    // The client was created just now with no progress logs, so none of the 3 original rules fire yet.
    const before = await api.get(`/api/at-risk?date=${dayAgo(0)}`);
    expect(before.body.clients).toEqual([]);
    // Make the client old enough that "no check-in for 10+ days" fires.
    await prisma.client.update({ where: { id: clientId }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
    const after = await api.get(`/api/at-risk?date=${dayAgo(0)}`);
    const found = after.body.clients.find((c: { clientId: string }) => c.clientId === clientId);
    expect(found.reasons.map((r: { rule: string }) => r.rule)).toEqual(["inactive", "sleep"]);
    expect(found.reasons[1].text).toBe("Sleep under 6h average this week");
  });
});
