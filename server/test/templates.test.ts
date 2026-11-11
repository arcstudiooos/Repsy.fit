// Prompt 58: workout template endpoints (mocked database).
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  workoutTemplate: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;

const EXERCISES = [
  { name: "Back Squat", sets: 4, reps: "6", rest: 120 },
  { name: "Bench Press", sets: 3, reps: "8-10", rest: 90 },
];
const row = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  coachId: "coach-1",
  name: "Leg day",
  focus: "Legs",
  exercises: EXERCISES,
  notes: "",
  createdAt: new Date("2026-11-11T08:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.workoutTemplate.findMany.mockResolvedValue([row()]);
  prismaMock.workoutTemplate.findFirst.mockResolvedValue(row());
  prismaMock.workoutTemplate.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(row(data)));
  prismaMock.workoutTemplate.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.workoutTemplate.deleteMany.mockResolvedValue({ count: 1 });
});

describe("GET /api/templates", () => {
  it("lists only the signed-in coach's templates; 401 signed out", async () => {
    const res = await request(app).get("/api/templates");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prismaMock.workoutTemplate.findMany).toHaveBeenCalledWith({
      where: { coachId: "coach-1" },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    expect((await supertest(app).get("/api/templates")).status).toBe(401);
    // Writing is guarded too, not only reading.
    const anon = supertest(app);
    expect((await anon.post("/api/templates").send({ name: "x", rows: [] })).status).toBe(401);
    expect((await anon.put("/api/templates/t1").send({ name: "x" })).status).toBe(401);
    expect((await anon.delete("/api/templates/t1")).status).toBe(401);
  });
});

describe("POST /api/templates", () => {
  it("saves a template (201) with exercises in order, owned by the signed-in coach", async () => {
    const body = { name: "  Leg day ", focus: "Legs", exercises: EXERCISES, notes: "Warm up first" };
    const res = await request(app).post("/api/templates").send({ ...body, coachId: "evil" });
    expect(res.status).toBe(201);
    expect(prismaMock.workoutTemplate.create).toHaveBeenCalledWith({
      data: { name: "Leg day", focus: "Legs", exercises: EXERCISES, notes: "Warm up first", coachId: "coach-1" },
    });
    expect(Object.keys(res.body).sort()).toEqual(["coachId", "createdAt", "exercises", "focus", "id", "name", "notes"]);
  });

  it("focus and notes default to empty text", async () => {
    await request(app).post("/api/templates").send({ name: "A", exercises: EXERCISES });
    expect(prismaMock.workoutTemplate.create).toHaveBeenCalledWith({
      data: { name: "A", focus: "", exercises: EXERCISES, notes: "", coachId: "coach-1" },
    });
  });

  it("rejects a missing name, no exercises and bad sets / reps / rest", async () => {
    for (const bad of [
      { name: "" },
      { name: "   " },
      { exercises: [] },
      { exercises: [{ name: "", sets: 3, reps: "10", rest: 60 }] },
      { exercises: [{ name: "Squat", sets: 0, reps: "10", rest: 60 }] },
      { exercises: [{ name: "Squat", sets: 3, reps: "  ", rest: 60 }] },
      { exercises: [{ name: "Squat", sets: 3, reps: "10", rest: 1 }] },
      { exercises: [{ name: "Squat", sets: 3, reps: "10" }] },
      { notes: "x".repeat(2001) },
    ]) {
      const res = await request(app).post("/api/templates").send({ name: "Ok", exercises: EXERCISES, ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(typeof res.body.error).toBe("string");
    }
    expect(prismaMock.workoutTemplate.create).not.toHaveBeenCalled();
  });
});

describe("PUT /api/templates/:templateId", () => {
  it("replaces the template, scoped to the coach", async () => {
    const res = await request(app).put("/api/templates/t1").send({ name: "Push", exercises: [EXERCISES[1]] });
    expect(res.status).toBe(200);
    expect(prismaMock.workoutTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", coachId: "coach-1" },
      data: { name: "Push", focus: "", exercises: [EXERCISES[1]], notes: "" },
    });
  });

  it("another coach's / unknown template -> 'Template not found'", async () => {
    prismaMock.workoutTemplate.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).put("/api/templates/other").send({ name: "Push", exercises: EXERCISES });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Template not found" });
  });
});

describe("DELETE /api/templates/:templateId", () => {
  it("deletes one (204), scoped to the coach", async () => {
    const res = await request(app).delete("/api/templates/t1");
    expect(res.status).toBe(204);
    expect(prismaMock.workoutTemplate.deleteMany).toHaveBeenCalledWith({ where: { id: "t1", coachId: "coach-1" } });
  });

  it("unknown template -> 'Template not found'", async () => {
    prismaMock.workoutTemplate.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app).delete("/api/templates/zzz");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Template not found" });
  });
});
