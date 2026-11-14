// Prompt 52 "You test" against a real database (CI only): a pending item is approved into a real
// assignment, another is dismissed and stays as history, and the badge count matches the list.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `review-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("review queue (database)", () => {
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
    const client = await api.post("/api/clients").send({ name: "Review Probe" });
    clientId = client.body.id;
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades
    await prisma.$disconnect();
  });

  it("approve makes a real assignment; dismiss keeps history; the count matches the list", async () => {
    const parked = await api.post("/api/review-queue").send({
      clientId,
      kind: "suggestion",
      type: "Workout",
      title: "Lower-body strength day",
      details: "1. Back Squat - 4 sets x 6 reps · Rest 120s",
      reasoning: "Adherence is climbing",
    });
    expect(parked.status).toBe(201);

    // Adding a check-in flags it for review too.
    expect((await api.post(`/api/clients/${clientId}/progress`).send({ date: "2026-11-10", adherence: 84 })).status).toBe(201);

    const queue = await api.get("/api/review-queue");
    expect(queue.body.pendingCount).toBe(queue.body.items.length);
    expect(queue.body.pendingCount).toBe(2);

    const approved = await api.post(`/api/review-queue/${parked.body.id}/approve`).send({ date: "2026-11-11" });
    expect(approved.status).toBe(200);
    expect(approved.body.assignment).toMatchObject({ clientId, type: "Workout", title: "Lower-body strength day", source: "ai", status: "Active" });
    const assignments = await api.get(`/api/clients/${clientId}/assignments`);
    expect(assignments.body.map((a: { id: string }) => a.id)).toContain(approved.body.assignment.id);

    const checkInItem = (await api.get("/api/review-queue")).body.items[0];
    const dismissed = await api.post(`/api/review-queue/${checkInItem.id}/dismiss`);
    expect(dismissed.status).toBe(200);

    const after = await api.get("/api/review-queue");
    expect(after.body.pendingCount).toBe(0);
    expect(after.body.items).toEqual([]);

    // Nothing was deleted: both decisions are kept, and the progress log is untouched.
    const history = await api.get("/api/review-queue?status=decided");
    expect(history.body.items.map((i: { id: string; status: string }) => `${i.id}:${i.status}`).sort()).toEqual(
      [`${parked.body.id}:Approved`, `${checkInItem.id}:Dismissed`].sort(),
    );
    expect((await api.get(`/api/clients/${clientId}/progress`)).body).toHaveLength(1);

    // Another coach sees none of it and cannot decide it.
    expect((await otherApi.get("/api/review-queue")).body).toMatchObject({ pendingCount: 0, items: [] });
    expect((await otherApi.post(`/api/review-queue/${parked.body.id}/dismiss`)).status).toBe(404);
  });
});
