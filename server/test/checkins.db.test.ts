// New check-ins card (Prompt 49), against a real database (runs in CI only).
import request from "./helpers/authedRequest.js";
import { afterAll, describe, expect, it } from "vitest";

describe.skipIf(!process.env.DATABASE_URL)("GET /api/checkins/recent (database)", () => {
  const createdClientIds: string[] = [];
  afterAll(async () => {
    for (const id of createdClientIds) await request((await import("../src/app.js")).app).delete(`/api/clients/${id}`);
  });

  it("a progress log added for a client appears with the right client, newest first", async () => {
    const { app } = await import("../src/app.js");
    const made = await request(app).post("/api/clients").send({ name: "Checkin Probe" });
    expect(made.status).toBe(201);
    createdClientIds.push(made.body.id);
    const date = new Date().toISOString().slice(0, 10);
    const first = await request(app).post(`/api/clients/${made.body.id}/progress`).send({ date, adherence: 80 });
    const second = await request(app).post(`/api/clients/${made.body.id}/progress`).send({ date, weightKg: 70, note: "Probe" });
    expect(second.status).toBe(201);

    const res = await request(app).get("/api/checkins/recent");
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids.indexOf(second.body.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(second.body.id)).toBeLessThan(ids.indexOf(first.body.id));
    const item = res.body.items.find((i: { id: string }) => i.id === second.body.id);
    expect(item).toMatchObject({ kind: "progress", clientId: made.body.id, clientName: "Checkin Probe", weightKg: 70, note: "Probe" });
    expect(res.body.items.length).toBeLessThanOrEqual(8);
  });
});
