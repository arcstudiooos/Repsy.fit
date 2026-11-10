// Progress logs API (Prompt 25). Prisma is mocked, so these run without a database.
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findFirst: vi.fn() },
    progressLog: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

const client = { id: "client-1", coachId: "default-coach", name: "Maya Patel" };
const base = `/api/clients/${client.id}/progress`;
const stored = {
  id: "log-1",
  coachId: "default-coach",
  clientId: client.id,
  date: "2026-11-02",
  weightKg: 68,
  adherence: 80,
  workoutsDone: 4,
  note: "",
  createdAt: new Date("2026-11-02T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.client.findFirst.mockResolvedValue(client);
  prisma.progressLog.findMany.mockResolvedValue([stored]);
  prisma.progressLog.findFirst.mockResolvedValue(stored);
  prisma.progressLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "log-new",
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    ...data,
  }));
  prisma.progressLog.delete.mockResolvedValue(stored);
});

describe("GET /api/clients/:clientId/progress", () => {
  it("lists only this client's logs, oldest date first", async () => {
    const res = await request(app).get(base);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: client.id, coachId: "default-coach" } });
    expect(prisma.progressLog.findMany).toHaveBeenCalledWith({
      where: { clientId: client.id, coachId: "default-coach" },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  });

  it("returns 404 Client not found for an unknown client", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/clients/nobody/progress");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prisma.progressLog.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/clients/:clientId/progress", () => {
  it("creates a log for this client (201, full record) with note defaulting to empty", async () => {
    const res = await request(app).post(base).send({ date: "2026-11-09", weightKg: 67.4, adherence: 85, workoutsDone: 4 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "log-new", clientId: client.id, date: "2026-11-09", weightKg: 67.4, note: "" });
    expect(prisma.progressLog.create).toHaveBeenCalledWith({
      data: {
        date: "2026-11-09",
        weightKg: 67.4,
        adherence: 85,
        workoutsDone: 4,
        note: "",
        clientId: client.id,
        coachId: "default-coach",
      },
    });
  });

  it("accepts only a date (the other fields are optional)", async () => {
    const res = await request(app).post(base).send({ date: "2026-11-09" });
    expect(res.status).toBe(201);
    expect(prisma.progressLog.create.mock.calls[0][0].data).toEqual({
      date: "2026-11-09",
      note: "",
      clientId: client.id,
      coachId: "default-coach",
    });
  });

  it("ignores clientId and coachId sent in the body", async () => {
    await request(app).post(base).send({ date: "2026-11-09", clientId: "other", coachId: "other" });
    expect(prisma.progressLog.create.mock.calls[0][0].data).toMatchObject({ clientId: client.id, coachId: "default-coach" });
  });

  it.each([
    ["missing date", {}],
    ["badly formed date", { date: "09/11/2026" }],
    ["impossible date", { date: "2026-02-30" }],
    ["adherence above 100", { date: "2026-11-09", adherence: 120 }],
    ["negative adherence", { date: "2026-11-09", adherence: -1 }],
    ["fractional adherence", { date: "2026-11-09", adherence: 80.5 }],
    ["workouts above 14", { date: "2026-11-09", workoutsDone: 15 }],
    ["negative workouts", { date: "2026-11-09", workoutsDone: -1 }],
    ["fractional workouts", { date: "2026-11-09", workoutsDone: 2.5 }],
    ["zero weight", { date: "2026-11-09", weightKg: 0 }],
    ["text weight", { date: "2026-11-09", weightKg: "heavy" }],
  ])("rejects %s with 400 and saves nothing", async (_name, body) => {
    const res = await request(app).post(base).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(prisma.progressLog.create).not.toHaveBeenCalled();
  });

  it("returns 404 Client not found for an unknown client and saves nothing", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/clients/nobody/progress").send({ date: "2026-11-09" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prisma.progressLog.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/clients/:clientId/progress/:logId", () => {
  it("deletes this client's log and replies 204", async () => {
    const res = await request(app).delete(`${base}/${stored.id}`);
    expect(res.status).toBe(204);
    expect(prisma.progressLog.findFirst).toHaveBeenCalledWith({
      where: { id: stored.id, clientId: client.id, coachId: "default-coach" },
    });
    expect(prisma.progressLog.delete).toHaveBeenCalledWith({ where: { id: stored.id } });
  });

  it("returns 404 Progress log not found when the log is not this client's", async () => {
    prisma.progressLog.findFirst.mockResolvedValue(null);
    const res = await request(app).delete(`${base}/someone-elses-log`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Progress log not found" });
    expect(prisma.progressLog.delete).not.toHaveBeenCalled();
  });

  it("returns 404 Client not found for an unknown client", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await request(app).delete(`/api/clients/nobody/progress/${stored.id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prisma.progressLog.delete).not.toHaveBeenCalled();
  });
});
