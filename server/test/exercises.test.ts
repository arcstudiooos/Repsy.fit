// The exercise library (Inspo W1, Nov 2026).
//
// What these tests are really protecting: the stock catalogue is shared, so "read-only to coaches"
// and "never leaks between coaches" are the two rules that matter. The rest is ordinary CRUD.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    exercise: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const row = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  coachId: TEST_COACH_ID,
  name: "Back Squat",
  equipment: "Barbell",
  muscleGroup: "Legs",
  mediaUrl: "",
  instructions: "Sit between the knees.",
  createdAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.exercise.findMany.mockResolvedValue([]);
  prisma.exercise.findFirst.mockResolvedValue(null);
});

describe("GET /api/exercises", () => {
  it("returns stock and own exercises, and flags which is which", async () => {
    prisma.exercise.findMany.mockResolvedValue([row({ id: "s1", coachId: null, name: "Push-Up" }), row()]);
    const res = await request(app).get("/api/exercises");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ name: "Push-Up", stock: true }),
      expect.objectContaining({ name: "Back Squat", stock: false }),
    ]);
    // coachId itself is never exposed.
    expect(res.body[0]).not.toHaveProperty("coachId");
  });

  it("by default asks only for this coach's rows plus the shared catalogue", async () => {
    await request(app).get("/api/exercises");
    expect(prisma.exercise.findMany.mock.calls[0][0].where).toMatchObject({
      OR: [{ coachId: TEST_COACH_ID }, { coachId: null }],
    });
  });

  it("scope=mine excludes stock, scope=stock excludes the coach's own", async () => {
    await request(app).get("/api/exercises?scope=mine");
    expect(prisma.exercise.findMany.mock.calls[0][0].where).toMatchObject({ coachId: TEST_COACH_ID });
    vi.clearAllMocks();
    prisma.exercise.findMany.mockResolvedValue([]);
    await request(app).get("/api/exercises?scope=stock");
    expect(prisma.exercise.findMany.mock.calls[0][0].where).toMatchObject({ coachId: null });
  });

  it("searches by name and filters by equipment and muscle group", async () => {
    await request(app).get("/api/exercises?q=squat&equipment=Barbell&muscleGroup=Legs");
    expect(prisma.exercise.findMany.mock.calls[0][0].where).toMatchObject({
      name: { contains: "squat", mode: "insensitive" },
      equipment: "Barbell",
      muscleGroup: "Legs",
    });
  });
});

describe("POST /api/exercises", () => {
  it("creates one owned by the signed-in coach, never by a coachId in the body", async () => {
    prisma.exercise.create.mockResolvedValue(row({ name: "Sled Push", coachId: TEST_COACH_ID }));
    const res = await request(app)
      .post("/api/exercises")
      .send({ name: "Sled Push", equipment: "Other", muscleGroup: "Legs", coachId: "someone-else" });
    expect(res.status).toBe(201);
    expect(prisma.exercise.create.mock.calls[0][0].data.coachId).toBe(TEST_COACH_ID);
  });

  it("applies sensible defaults", async () => {
    prisma.exercise.create.mockResolvedValue(row());
    await request(app).post("/api/exercises").send({ name: "Sled Push" });
    expect(prisma.exercise.create.mock.calls[0][0].data).toMatchObject({
      equipment: "Bodyweight",
      muscleGroup: "Full body",
      mediaUrl: "",
    });
  });

  it("refuses a duplicate name with 409", async () => {
    prisma.exercise.findFirst.mockResolvedValue(row());
    const res = await request(app).post("/api/exercises").send({ name: "Back Squat" });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already have an exercise");
    expect(prisma.exercise.create).not.toHaveBeenCalled();
  });

  it("rejects a bad equipment tag, a missing name and a non-https media link", async () => {
    expect((await request(app).post("/api/exercises").send({ name: "x", equipment: "Jetpack" })).status).toBe(400);
    expect((await request(app).post("/api/exercises").send({ name: "  " })).status).toBe(400);
    const bad = await request(app).post("/api/exercises").send({ name: "x", mediaUrl: "javascript:alert(1)" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain("https://");
    expect(prisma.exercise.create).not.toHaveBeenCalled();
  });
});

describe("the stock catalogue is read-only", () => {
  it("PUT on a stock exercise is 404, not an edit", async () => {
    // The route looks it up scoped by coachId, so a stock row is simply not found.
    prisma.exercise.findFirst.mockResolvedValue(null);
    const res = await request(app).put("/api/exercises/stock-1").send({ name: "Hacked" });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not one of yours");
    expect(prisma.exercise.update).not.toHaveBeenCalled();
  });

  it("DELETE on a stock exercise is 404, and deletes nothing", async () => {
    prisma.exercise.findFirst.mockResolvedValue(null);
    const res = await request(app).delete("/api/exercises/stock-1");
    expect(res.status).toBe(404);
    expect(prisma.exercise.delete).not.toHaveBeenCalled();
  });

  it("the lookup for a write is always scoped to the signed-in coach", async () => {
    await request(app).delete("/api/exercises/e1");
    expect(prisma.exercise.findFirst.mock.calls[0][0].where).toMatchObject({ id: "e1", coachId: TEST_COACH_ID });
  });
});

describe("PUT and DELETE on own exercises", () => {
  it("updates one the coach owns", async () => {
    prisma.exercise.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    prisma.exercise.update.mockResolvedValue(row({ name: "Back Squat (paused)" }));
    const res = await request(app).put("/api/exercises/e1").send({ name: "Back Squat (paused)", equipment: "Barbell" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Back Squat (paused)");
  });

  it("refuses a rename onto another of the coach's exercises", async () => {
    prisma.exercise.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ id: "e2" }));
    const res = await request(app).put("/api/exercises/e1").send({ name: "Deadlift" });
    expect(res.status).toBe(409);
    expect(prisma.exercise.update).not.toHaveBeenCalled();
  });

  it("deletes one the coach owns and returns 204", async () => {
    prisma.exercise.findFirst.mockResolvedValue(row());
    const res = await request(app).delete("/api/exercises/e1");
    expect(res.status).toBe(204);
    expect(prisma.exercise.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
  });
});

describe("POST /api/exercises/:id/copy", () => {
  it("copies a stock exercise into the coach's own library", async () => {
    prisma.exercise.findFirst
      .mockResolvedValueOnce(row({ id: "s1", coachId: null, name: "Push-Up" })) // the source
      .mockResolvedValueOnce(null); // no name clash
    prisma.exercise.create.mockResolvedValue(row({ name: "Push-Up (copy)" }));
    const res = await request(app).post("/api/exercises/s1/copy");
    expect(res.status).toBe(201);
    const data = prisma.exercise.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ coachId: TEST_COACH_ID, name: "Push-Up (copy)", instructions: "Sit between the knees." });
  });

  it("copying twice numbers the second copy instead of failing", async () => {
    prisma.exercise.findFirst
      .mockResolvedValueOnce(row({ id: "s1", coachId: null, name: "Push-Up" })) // source
      .mockResolvedValueOnce(row({ name: "Push-Up (copy)" })) // "(copy)" is taken
      .mockResolvedValueOnce(null); // "(copy 2)" is free
    prisma.exercise.create.mockResolvedValue(row({ name: "Push-Up (copy 2)" }));
    await request(app).post("/api/exercises/s1/copy");
    expect(prisma.exercise.create.mock.calls[0][0].data.name).toBe("Push-Up (copy 2)");
  });

  it("cannot copy an exercise that belongs to another coach", async () => {
    prisma.exercise.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/exercises/other-coach-ex/copy");
    expect(res.status).toBe(404);
    expect(prisma.exercise.create).not.toHaveBeenCalled();
  });
});
