// Prompt 54: habit endpoints (mocked database).
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock: Record<string, any> = vi.hoisted(() => {
  const mock: Record<string, any> = {
    client: { findFirst: vi.fn() },
    habit: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    habitLog: { upsert: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  // Adding or restoring a habit runs inside a transaction holding a per-client advisory lock,
  // so the mock hands the same mock back as the transaction client.
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(mock)));
  return mock;
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel" };
const habit = (over: Record<string, unknown> = {}) => ({
  id: "h1",
  coachId: "coach-1",
  clientId: "c1",
  name: "Drink water",
  active: true,
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  logs: [] as { date: string; done: boolean }[],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.habit.findMany.mockResolvedValue([habit()]);
  prismaMock.habit.findFirst.mockResolvedValue(habit());
  prismaMock.habit.count.mockResolvedValue(0);
  prismaMock.habit.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(habit(data)));
  prismaMock.habit.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(habit(data)));
  prismaMock.habitLog.upsert.mockResolvedValue({ habitId: "h1", date: "2026-11-11", done: true });
});

describe("GET /api/clients/:clientId/habits", () => {
  it("returns the 7-day grid with streaks, active habits only", async () => {
    prismaMock.habit.findMany.mockResolvedValue([
      habit({ logs: [{ date: "2026-11-09", done: true }, { date: "2026-11-10", done: true }] }),
    ]);
    const res = await request(app).get("/api/clients/c1/habits?date=2026-11-11");
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(res.body.habits[0]).toMatchObject({
      id: "h1",
      name: "Drink water",
      week: [false, false, false, false, true, true, false],
      currentStreak: 2, // today not logged yet does not break it
      bestStreak: 2,
    });
    expect(prismaMock.habit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", coachId: "coach-1", active: true } }),
    );
  });

  it("rejects a bad date and hides other coaches' clients", async () => {
    expect((await request(app).get("/api/clients/c1/habits?date=nope")).status).toBe(400);
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/clients/other/habits");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect((await supertest(app).get("/api/clients/c1/habits")).status).toBe(401);
  });
});

describe("POST /api/clients/:clientId/habits", () => {
  it("adds a habit (201), trimmed, owned by the signed-in coach", async () => {
    const res = await request(app).post("/api/clients/c1/habits").send({ name: "  Walk 10 min " });
    expect(res.status).toBe(201);
    expect(prismaMock.habit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { clientId: "c1", coachId: "coach-1", name: "Walk 10 min" } }),
    );
  });

  it("allows at most 8 active habits per client", async () => {
    prismaMock.habit.count.mockResolvedValue(8);
    const res = await request(app).post("/api/clients/c1/habits").send({ name: "Ninth" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A client can have up to 8 habits. Archive one to add another.");
    expect(prismaMock.habit.create).not.toHaveBeenCalled();
    expect(prismaMock.habit.count).toHaveBeenCalledWith({ where: { clientId: "c1", coachId: "coach-1", active: true } });
  });

  it("needs a name of 1-60 characters", async () => {
    expect((await request(app).post("/api/clients/c1/habits").send({ name: "   " })).status).toBe(400);
    expect((await request(app).post("/api/clients/c1/habits").send({ name: "x".repeat(61) })).status).toBe(400);
    expect(prismaMock.habit.create).not.toHaveBeenCalled();
  });

  it("never adds to another coach's client", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/clients/other/habits").send({ name: "Walk" });
    expect(res.status).toBe(404);
    expect(prismaMock.habit.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/clients/:clientId/habits/:habitId", () => {
  it("renames", async () => {
    const res = await request(app).patch("/api/clients/c1/habits/h1").send({ name: "Water 2L" });
    expect(res.status).toBe(200);
    expect(prismaMock.habit.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "h1" }, data: { name: "Water 2L" } }));
  });

  it("archives by setting active false - nothing is deleted", async () => {
    const res = await request(app).patch("/api/clients/c1/habits/h1").send({ active: false });
    expect(res.status).toBe(200);
    expect(prismaMock.habit.update).toHaveBeenCalledWith(expect.objectContaining({ data: { active: false } }));
  });

  it("restoring an archived habit still respects the limit of 8", async () => {
    prismaMock.habit.findFirst.mockResolvedValue(habit({ active: false }));
    prismaMock.habit.count.mockResolvedValue(8);
    const res = await request(app).patch("/api/clients/c1/habits/h1").send({ active: true });
    expect(res.status).toBe(400);
    expect(prismaMock.habit.update).not.toHaveBeenCalled();
  });

  it("unknown habit is 'Habit not found'; empty body is 400", async () => {
    prismaMock.habit.findFirst.mockResolvedValue(null);
    const res = await request(app).patch("/api/clients/c1/habits/zzz").send({ name: "x" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Habit not found" });
    prismaMock.habit.findFirst.mockResolvedValue(habit());
    expect((await request(app).patch("/api/clients/c1/habits/h1").send({})).status).toBe(400);
  });
});

describe("PUT /api/clients/:clientId/habits/:habitId/logs/:date", () => {
  it("marks a day done or not done (one row per habit per day)", async () => {
    const res = await request(app).put("/api/clients/c1/habits/h1/logs/2026-11-11").send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ habitId: "h1", date: "2026-11-11", done: true });
    expect(prismaMock.habitLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { habitId_date: { habitId: "h1", date: "2026-11-11" } },
        create: { habitId: "h1", date: "2026-11-11", done: true, enteredBy: "coach" },
        update: { done: true, enteredBy: "coach" },
      }),
    );
  });

  it("rejects a bad date or a non-boolean done, and another client's habit", async () => {
    expect((await request(app).put("/api/clients/c1/habits/h1/logs/11-11").send({ done: true })).status).toBe(400);
    expect((await request(app).put("/api/clients/c1/habits/h1/logs/2026-11-11").send({ done: "yes" })).status).toBe(400);
    prismaMock.habit.findFirst.mockResolvedValue(null);
    const res = await request(app).put("/api/clients/c1/habits/h2/logs/2026-11-11").send({ done: true });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Habit not found" });
    expect(prismaMock.habitLog.upsert).not.toHaveBeenCalled();
  });
});
