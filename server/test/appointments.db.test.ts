// Prompt 69 against a real database: coach scoping, UTC storage, the client's own sessions, today's tasks.
// Skipped when DATABASE_URL is not set (runs in CI).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { CLIENT_SESSION_COOKIE, signClientSession } from "../src/auth/clientSession.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `appts-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("appointments (database)", () => {
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

  it("create, week list, status change, delete - and another coach sees and changes nothing", async () => {
    const maya = (await api.post("/api/clients").send({ name: "Maya" })).body.id as string;
    const stranger = (await otherApi.post("/api/clients").send({ name: "Stranger" })).body.id as string;

    // Another coach cannot book for my client.
    const foreign = await otherApi.post("/api/appointments").send({ clientId: maya, title: "x", type: "Call", startsAt: "2026-11-12T04:30:00.000Z", endsAt: "2026-11-12T05:00:00.000Z" });
    expect(foreign.status).toBe(404);

    const created = await api.post("/api/appointments").send({
      clientId: maya, title: "Strength session", type: "Session",
      startsAt: "2026-11-12T10:00:00+05:30", endsAt: "2026-11-12T11:00:00+05:30", location: "Gym 2",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "Booked", startsAt: "2026-11-12T04:30:00.000Z", endsAt: "2026-11-12T05:30:00.000Z", clientName: "Maya" });
    const id = created.body.id as string;
    await otherApi.post("/api/appointments").send({ clientId: stranger, title: "Not yours", type: "Other", startsAt: "2026-11-12T04:30:00.000Z", endsAt: "2026-11-12T05:00:00.000Z" });

    const week = await api.get("/api/appointments?from=2026-11-09T00:00:00.000Z&to=2026-11-16T00:00:00.000Z");
    expect(week.status).toBe(200);
    expect((week.body as { id: string }[]).map((a) => a.id)).toEqual([id]);
    expect(JSON.stringify(week.body)).not.toContain("Not yours");
    const empty = await api.get("/api/appointments?from=2026-11-16T00:00:00.000Z&to=2026-11-23T00:00:00.000Z");
    expect(empty.body).toEqual([]);

    expect((await otherApi.patch(`/api/appointments/${id}`).send({ status: "Done" })).status).toBe(404);
    expect((await otherApi.delete(`/api/appointments/${id}`)).status).toBe(404);

    const done = await api.patch(`/api/appointments/${id}`).send({ status: "No-show" });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("No-show");

    expect((await api.delete(`/api/appointments/${id}`)).status).toBe(204);
    expect((await api.delete(`/api/appointments/${id}`)).status).toBe(404);
  });

  it("deleting a client deletes their appointments", async () => {
    const c = (await api.post("/api/clients").send({ name: "Temp" })).body.id as string;
    await api.post("/api/appointments").send({ clientId: c, title: "t", type: "Call", startsAt: "2026-11-12T04:30:00.000Z", endsAt: "2026-11-12T05:00:00.000Z" });
    expect((await api.delete(`/api/clients/${c}`)).status).toBe(204);
    expect(await prisma.appointment.count({ where: { clientId: c } })).toBe(0);
  });

  it("the client sees only their own upcoming Booked sessions; today's tasks list the coach's appointments first", async () => {
    const now = Date.now();
    const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
    const maya = (await api.post("/api/clients").send({ name: "Maya Mine" })).body.id as string;
    const other = (await api.post("/api/clients").send({ name: "Other Client" })).body.id as string;
    const mk = (clientId: string, title: string, startH: number, status = "Booked") =>
      api.post("/api/appointments").send({ clientId, title, type: "Session", startsAt: at(startH), endsAt: at(startH + 1), status, note: "private note" });
    await mk(maya, "Mine soon", 24);
    await mk(maya, "Mine later", 48);
    await mk(maya, "Mine cancelled", 30, "Cancelled");
    await mk(maya, "Mine past", -48);
    await mk(other, "Not mine", 24);

    await prisma.client.update({ where: { id: maya }, data: { loginEmail: `${tag}@example.com`, passwordHash: "x" } });
    const cookie = `${CLIENT_SESSION_COOKIE}=${signClientSession(maya, 0)}`;
    const res = await supertest(app).get("/api/client-auth/my-sessions").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect((res.body.sessions as { title: string }[]).map((s) => s.title)).toEqual(["Mine soon", "Mine later"]);
    expect(JSON.stringify(res.body)).not.toContain("private note");
    expect(JSON.stringify(res.body)).not.toContain("Not mine");

    // Today's tasks (UTC viewer): an appointment starting today comes before any other row.
    const today = new Date().toISOString().slice(0, 10);
    const soon = await mk(maya, "Right now", 0);
    expect(soon.status).toBe(201);
    const tasks = await api.get(`/api/tasks/today?date=${today}&tz=0`);
    expect(tasks.status).toBe(200);
    const rows = tasks.body.tasks as { kind: string; text: string }[];
    const firstNonAppt = rows.findIndex((t) => t.kind !== "appointment");
    const lastAppt = rows.map((t) => t.kind).lastIndexOf("appointment");
    expect(rows.some((t) => t.kind === "appointment" && t.text.includes("Right now"))).toBe(true);
    if (firstNonAppt !== -1) expect(lastAppt).toBeLessThan(firstNonAppt);
  });
});
