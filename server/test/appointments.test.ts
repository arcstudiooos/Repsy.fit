// Prompt 69: appointments (schedule), the client's "My sessions" and today's appointments. Mocked database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  assignment: { findMany: vi.fn() },
  appointment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;
const { CLIENT_SESSION_COOKIE, signClientSession } = await import("../src/auth/clientSession.js");
const { localDayRange } = await import("../src/appointments.js");

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel" };
const appt = (over: Record<string, unknown> = {}) => ({
  id: "ap1",
  coachId: "coach-1",
  clientId: "c1",
  title: "Strength session",
  type: "Session",
  startsAt: new Date("2026-11-12T04:30:00.000Z"),
  endsAt: new Date("2026-11-12T05:30:00.000Z"),
  location: "",
  status: "Booked",
  note: "",
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  client: { name: "Maya Patel" },
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({
  clientId: "c1",
  title: "Strength session",
  type: "Session",
  startsAt: "2026-11-12T04:30:00.000Z",
  endsAt: "2026-11-12T05:30:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.client.findMany.mockResolvedValue([CLIENT]);
  prismaMock.assignment.findMany.mockResolvedValue([]);
  prismaMock.appointment.findMany.mockResolvedValue([]);
  prismaMock.appointment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => appt(data));
});

describe("localDayRange (the viewer's local day as UTC instants)", () => {
  it("UTC viewer: midnight to midnight UTC", () => {
    const [from, to] = localDayRange("2026-11-12", 0);
    expect(from.toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });
  it("India (UTC+5:30, getTimezoneOffset -330): local Nov 12 starts at 18:30 UTC on Nov 11", () => {
    const [from, to] = localDayRange("2026-11-12", -330);
    expect(from.toISOString()).toBe("2026-11-11T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-11-12T18:30:00.000Z");
  });
  it("US Pacific (UTC-8, offset 480)", () => {
    expect(localDayRange("2026-11-12", 480)[0].toISOString()).toBe("2026-11-12T08:00:00.000Z");
  });
});

describe("/api/appointments (coach)", () => {
  it("needs a signed-in coach", async () => {
    const res = await supertest(app).get("/api/appointments?from=2026-11-09T00:00:00.000Z&to=2026-11-16T00:00:00.000Z");
    expect(res.status).toBe(401);
  });

  it("GET lists the week for this coach only, as UTC instants with the client's name", async () => {
    prismaMock.appointment.findMany.mockResolvedValue([appt()]);
    const res = await request(app).get("/api/appointments?from=2026-11-09T00:00:00.000Z&to=2026-11-16T00:00:00.000Z");
    expect(res.status).toBe(200);
    const where = prismaMock.appointment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ coachId: "coach-1" });
    expect(where.startsAt.gte).toEqual(new Date("2026-11-09T00:00:00.000Z"));
    expect(where.startsAt.lt).toEqual(new Date("2026-11-16T00:00:00.000Z"));
    expect(res.body).toEqual([
      expect.objectContaining({ id: "ap1", clientName: "Maya Patel", startsAt: "2026-11-12T04:30:00.000Z", endsAt: "2026-11-12T05:30:00.000Z" }),
    ]);
  });

  it("GET rejects a missing or bad range", async () => {
    expect((await request(app).get("/api/appointments")).status).toBe(400);
    expect((await request(app).get("/api/appointments?from=nope&to=2026-11-16T00:00:00.000Z")).status).toBe(400);
  });

  it("POST creates an appointment (201) for the coach's own client, stored in UTC", async () => {
    const res = await request(app).post("/api/appointments").send(body({ location: "https://meet.example/abc", note: "Bring bands" }));
    expect(res.status).toBe(201);
    expect(prismaMock.client.findFirst.mock.calls[0][0].where).toMatchObject({ id: "c1", coachId: "coach-1" });
    const data = prismaMock.appointment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ coachId: "coach-1", clientId: "c1", type: "Session", status: "Booked", location: "https://meet.example/abc", note: "Bring bands" });
    expect(data.startsAt).toEqual(new Date("2026-11-12T04:30:00.000Z"));
    expect(res.body.startsAt).toBe("2026-11-12T04:30:00.000Z");
  });

  it("POST converts an offset time to UTC", async () => {
    await request(app).post("/api/appointments").send(body({ startsAt: "2026-11-12T10:00:00+05:30", endsAt: "2026-11-12T11:00:00+05:30" }));
    expect(prismaMock.appointment.create.mock.calls[0][0].data.startsAt).toEqual(new Date("2026-11-12T04:30:00.000Z"));
  });

  it("POST 404 'Client not found' for another coach's client", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/appointments").send(body());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it.each([
    ["no title", { title: "  " }],
    ["a type outside the four", { type: "Party" }],
    ["a status outside the four", { status: "Maybe" }],
    ["an end before the start", { endsAt: "2026-11-12T04:00:00.000Z" }],
    ["an end equal to the start", { endsAt: "2026-11-12T04:30:00.000Z" }],
    ["a time that is not a date", { startsAt: "tomorrow" }],
    ["a note over 1000 characters", { note: "x".repeat(1001) }],
    ["a location over 300 characters", { location: "x".repeat(301) }],
  ])("POST 400 for %s", async (_name, over) => {
    const res = await request(app).post("/api/appointments").send(body(over));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("PATCH changes the status (and only this coach's row can be found)", async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(appt());
    prismaMock.appointment.update.mockResolvedValue(appt({ status: "Done" }));
    const res = await request(app).patch("/api/appointments/ap1").send({ status: "Done" });
    expect(res.status).toBe(200);
    expect(prismaMock.appointment.findFirst.mock.calls[0][0].where).toMatchObject({ id: "ap1", coachId: "coach-1" });
    expect(prismaMock.appointment.update.mock.calls[0][0].data).toEqual({ status: "Done" });
    expect(res.body.status).toBe("Done");
  });

  it("PATCH checks the new end against the stored start", async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(appt());
    const res = await request(app).patch("/api/appointments/ap1").send({ endsAt: "2026-11-12T04:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(prismaMock.appointment.update).not.toHaveBeenCalled();
  });

  it("PATCH to another client re-checks that client belongs to the coach", async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(appt());
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).patch("/api/appointments/ap1").send({ clientId: "someone-else" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
  });

  it("PATCH / DELETE answer 404 'Appointment not found' for an unknown or foreign row", async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(null);
    const patch = await request(app).patch("/api/appointments/nope").send({ status: "Done" });
    expect(patch.status).toBe(404);
    expect(patch.body).toEqual({ error: "Appointment not found" });
    const del = await request(app).delete("/api/appointments/nope");
    expect(del.status).toBe(404);
    expect(del.body).toEqual({ error: "Appointment not found" });
  });

  it("DELETE removes the row (204)", async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(appt());
    prismaMock.appointment.delete.mockResolvedValue(appt());
    const res = await request(app).delete("/api/appointments/ap1");
    expect(res.status).toBe(204);
    expect(prismaMock.appointment.delete).toHaveBeenCalledWith({ where: { id: "ap1" } });
  });
});

describe("GET /api/client-auth/my-sessions (the client's own upcoming sessions)", () => {
  const clientCookie = `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0)}`;
  beforeEach(() => {
    prismaMock.client.findUnique.mockResolvedValue({ clientSessionVersion: 0, passwordHash: "$2b$12$x", joinStatus: "active" });
  });

  it("needs a client session (a coach session gets 401)", async () => {
    expect((await supertest(app).get("/api/client-auth/my-sessions")).status).toBe(401);
    expect((await request(app).get("/api/client-auth/my-sessions")).status).toBe(401);
  });

  it("returns only this client's upcoming Booked sessions, without the coach's private note", async () => {
    prismaMock.appointment.findMany.mockResolvedValue([
      { id: "ap1", title: "Strength session", type: "Session", startsAt: new Date("2026-11-12T04:30:00.000Z"), endsAt: new Date("2026-11-12T05:30:00.000Z"), location: "Gym 2" },
    ]);
    const res = await supertest(app).get("/api/client-auth/my-sessions").set("Cookie", clientCookie);
    expect(res.status).toBe(200);
    const q = prismaMock.appointment.findMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ clientId: "c1", status: "Booked" });
    expect(q.where.endsAt.gte).toBeInstanceOf(Date);
    expect(q.select).toBeDefined();
    expect(q.select.note).toBeUndefined();
    expect(res.body).toEqual({
      sessions: [{ id: "ap1", title: "Strength session", type: "Session", startsAt: "2026-11-12T04:30:00.000Z", endsAt: "2026-11-12T05:30:00.000Z", location: "Gym 2" }],
      timezone: null, // Prompt 83: no override set
    });
  });
});

describe("GET /api/tasks/today with appointments", () => {
  it("puts today's Booked appointments first, as kind 'appointment' rows, scoped to the coach", async () => {
    prismaMock.assignment.findMany.mockResolvedValue([
      { id: "a1", clientId: "c1", type: "Workout", title: "Squat day", status: "Active", date: "2026-11-12" },
    ]);
    prismaMock.appointment.findMany.mockResolvedValue([appt()]);
    const res = await request(app).get("/api/tasks/today?date=2026-11-12&tz=-330");
    expect(res.status).toBe(200);
    const q = prismaMock.appointment.findMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ coachId: "coach-1", status: "Booked" });
    expect(q.where.startsAt.gte).toEqual(new Date("2026-11-11T18:30:00.000Z"));
    expect(q.where.startsAt.lt).toEqual(new Date("2026-11-12T18:30:00.000Z"));
    expect(res.body.tasks[0]).toMatchObject({
      kind: "appointment",
      clientId: "c1",
      clientName: "Maya Patel",
      appointmentId: "ap1",
      startsAt: "2026-11-12T04:30:00.000Z",
      endsAt: "2026-11-12T05:30:00.000Z",
    });
    expect(res.body.tasks[0].text).toContain("Strength session");
    expect(res.body.tasks[1].kind).toBe("due");
  });

  it("a daylight-saving change day is 23 or 25 hours (tz and tzEnd differ)", async () => {
    const { localDayRange } = await import("../src/appointments.js");
    // US Pacific, 2026-03-08: clocks go forward, offset 480 at the start and 420 at the next midnight.
    const [from, to] = localDayRange("2026-03-08", 480, 420);
    expect(from.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(23);
    // Same offsets at both ends: 24 hours (India).
    const [a, b] = localDayRange("2026-11-12", -330);
    expect(a.toISOString()).toBe("2026-11-11T18:30:00.000Z");
    expect(b.toISOString()).toBe("2026-11-12T18:30:00.000Z");
    expect((await request(app).get("/api/tasks/today?date=2026-11-12&tz=-330&tzEnd=abc")).status).toBe(400);
  });

  it("rejects a bad tz", async () => {
    expect((await request(app).get("/api/tasks/today?date=2026-11-12&tz=abc")).status).toBe(400);
  });
});
