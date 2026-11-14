// Prompt 48 "Test:" line against a real database: tasks match the records, and only this coach's.
// Skipped when DATABASE_URL is not set (runs in CI).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `tasks-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("today's tasks (database)", () => {
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
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } });
    await prisma.$disconnect();
  });

  it("returns due and idle tasks for this coach only", async () => {
    const mk = async (who: typeof api, name: string) => (await who.post("/api/clients").send({ name })).body.id as string;
    const busy = await mk(api, "Busy Client");
    const idle = await mk(api, "Idle Client");
    const empty = await mk(api, "Empty Client");
    const stranger = await mk(otherApi, "Stranger");

    const add = (who: typeof api, id: string, date: string, title: string) =>
      who.post(`/api/clients/${id}/assignments`).send({ type: "Habit", title, details: "d", date });
    await add(api, busy, "2026-11-11", "Walk 8k steps");
    await add(api, idle, "2026-10-01", "Old plan");
    await add(otherApi, stranger, "2026-11-11", "Not yours");

    const res = await api.get("/api/tasks/today?date=2026-11-11");
    expect(res.status).toBe(200);
    const tasks = res.body.tasks as { kind: string; clientId: string }[];
    expect(tasks.find((t) => t.kind === "due" && t.clientId === busy)).toBeTruthy();
    expect(tasks.find((t) => t.kind === "idle" && t.clientId === idle)).toBeTruthy();
    expect(tasks.find((t) => t.kind === "idle" && t.clientId === empty)).toBeTruthy();
    expect(tasks.find((t) => t.clientId === busy && t.kind === "idle")).toBeUndefined();
    expect(tasks.find((t) => t.clientId === stranger)).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("Not yours");
  });
});
