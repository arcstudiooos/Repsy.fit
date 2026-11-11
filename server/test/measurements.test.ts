// Prompt 56: body measurement endpoints (mocked database).
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
  measurement: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel" };
const row = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  coachId: "coach-1",
  clientId: "c1",
  date: "2026-11-11",
  waistCm: null,
  chestCm: null,
  armCm: null,
  hipCm: null,
  bodyFatPercent: null,
  note: "",
  createdAt: new Date("2026-11-11T08:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.measurement.findMany.mockResolvedValue([row()]);
  prismaMock.measurement.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(row(data)));
  prismaMock.measurement.deleteMany.mockResolvedValue({ count: 1 });
});

describe("GET /api/clients/:clientId/measurements", () => {
  it("lists this client's measurements newest first, scoped to the coach", async () => {
    const res = await request(app).get("/api/clients/c1/measurements");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prismaMock.measurement.findMany).toHaveBeenCalledWith({
      where: { clientId: "c1", coachId: "coach-1" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
  });

  it("404 'Client not found' for another coach's client; 401 signed out", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/clients/other/measurements");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect((await supertest(app).get("/api/clients/c1/measurements")).status).toBe(401);
  });
});

describe("POST /api/clients/:clientId/measurements", () => {
  it("saves a measurement (201) with the exact field names, owned by the signed-in coach", async () => {
    const body = { date: "2026-11-11", waistCm: 82.5, chestCm: 100, armCm: 35, hipCm: 98, bodyFatPercent: 18.4, note: "  morning " };
    const res = await request(app).post("/api/clients/c1/measurements").send(body);
    expect(res.status).toBe(201);
    expect(prismaMock.measurement.create).toHaveBeenCalledWith({
      data: { ...body, note: "morning", clientId: "c1", coachId: "coach-1" },
    });
    expect(Object.keys(res.body).sort()).toEqual(
      ["armCm", "bodyFatPercent", "chestCm", "clientId", "coachId", "createdAt", "date", "hipCm", "id", "note", "waistCm"].sort(),
    );
  });

  it("only date is required; the rest default to null / empty note", async () => {
    const res = await request(app).post("/api/clients/c1/measurements").send({ date: "2026-11-11", waistCm: 80 });
    expect(res.status).toBe(201);
    expect(prismaMock.measurement.create).toHaveBeenCalledWith({
      data: { date: "2026-11-11", waistCm: 80, note: "", clientId: "c1", coachId: "coach-1" },
    });
    expect((await request(app).post("/api/clients/c1/measurements").send({ waistCm: 80 })).status).toBe(400);
    expect((await request(app).post("/api/clients/c1/measurements").send({ date: "2026-02-30" })).status).toBe(400);
  });

  it("rejects negative, zero and absurd values, and a 3-digit body-fat", async () => {
    for (const bad of [
      { waistCm: -1 },
      { chestCm: 0 },
      { armCm: 301 },
      { hipCm: "wide" },
      { bodyFatPercent: 100 },
      { bodyFatPercent: 150 },
      { bodyFatPercent: -3 },
      { note: "x".repeat(501) },
    ]) {
      const res = await request(app).post("/api/clients/c1/measurements").send({ date: "2026-11-11", ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(typeof res.body.error).toBe("string");
    }
    expect(prismaMock.measurement.create).not.toHaveBeenCalled();
  });

  it("never saves for another coach's client, and ignores a coachId in the body", async () => {
    await request(app).post("/api/clients/c1/measurements").send({ date: "2026-11-11", waistCm: 80, coachId: "evil" });
    expect(prismaMock.measurement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ coachId: "coach-1" }),
    });
    prismaMock.measurement.create.mockClear();
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/clients/other/measurements").send({ date: "2026-11-11", waistCm: 80 });
    expect(res.status).toBe(404);
    expect(prismaMock.measurement.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/clients/:clientId/measurements/:measurementId", () => {
  it("deletes one (204), scoped to client and coach", async () => {
    const res = await request(app).delete("/api/clients/c1/measurements/m1");
    expect(res.status).toBe(204);
    expect(prismaMock.measurement.deleteMany).toHaveBeenCalledWith({ where: { id: "m1", clientId: "c1", coachId: "coach-1" } });
  });

  it("unknown measurement -> 'Measurement not found'", async () => {
    prismaMock.measurement.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app).delete("/api/clients/c1/measurements/zzz");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Measurement not found" });
  });
});
