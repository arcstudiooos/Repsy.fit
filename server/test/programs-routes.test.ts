// The programs API (Inspo W10, Nov 2026).
//
// The claim that matters: assigning a program MATERIALISES ordinary assignment rows, and from then
// on the template and those rows are independent. Everything else here is scoping.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, derive } = vi.hoisted(() => {
  const tx = { programPhase: { deleteMany: vi.fn() }, program: { update: vi.fn() } };
  return {
    derive: vi.fn(),
    prisma: {
      tx,
      program: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
      assignment: { create: vi.fn() },
      client: { findFirst: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (c: unknown) => Promise<unknown>)(tx) : arg,
      ),
    },
  };
});
vi.mock("../src/db.js", () => ({ prisma }));
vi.mock("../src/workouts/persist.js", () => ({
  deriveStructure: derive,
  allowedExerciseIds: vi.fn(async () => new Set()),
  writeSections: vi.fn(),
}));

const { app } = await import("../src/app.js");

// 2026-11-16 is a Monday.
const MON = "2026-11-16";

const PHASES = [
  {
    id: "ph1",
    order: 0,
    name: "Base",
    weeks: 2,
    items: [
      { id: "i1", week: 1, weekday: 1, type: "Workout", title: "Lower body", details: "1. Back Squat — 4 sets × 6 reps · Rest 120s" },
      { id: "i2", week: 2, weekday: 3, type: "Nutrition", title: "Meals", details: "" },
    ],
  },
];

const program = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  coachId: TEST_COACH_ID,
  name: "8 week strength",
  description: "",
  createdAt: new Date("2026-11-15T00:00:00.000Z"),
  phases: PHASES,
  ...over,
});

const body = { name: "My program", phases: [{ name: "Base", weeks: 2, items: [{ week: 1, weekday: 1, type: "Workout", title: "A" }] }] };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.program.findMany.mockResolvedValue([]);
  prisma.program.findFirst.mockResolvedValue(null);
  prisma.client.findFirst.mockResolvedValue({ id: "cl1", coachId: TEST_COACH_ID, name: "Maya" });
  prisma.program.create.mockResolvedValue(program());
  prisma.tx.program.update.mockResolvedValue(program());
  prisma.assignment.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: `a-${data.date}`, ...data }));
  derive.mockResolvedValue(null);
});

describe("GET /api/programs", () => {
  it("returns the coach's programs with the two numbers that matter", async () => {
    prisma.program.findMany.mockResolvedValue([program()]);
    const res = await request(app).get("/api/programs");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ name: "8 week strength", totalWeeks: 2, totalItems: 2 });
    expect(res.body[0]).not.toHaveProperty("coachId");
  });

  it("never asks for another coach's programs", async () => {
    await request(app).get("/api/programs");
    expect(prisma.program.findMany.mock.calls[0][0].where).toEqual({ coachId: TEST_COACH_ID });
  });
});

describe("writing a program", () => {
  it("creates one owned by the signed-in coach, ignoring a coachId in the body", async () => {
    const res = await request(app).post("/api/programs").send({ ...body, coachId: "someone-else" });
    expect(res.status).toBe(201);
    expect(prisma.program.create.mock.calls[0][0].data.coachId).toBe(TEST_COACH_ID);
  });

  it("numbers the phases by their position, so order is never ambiguous", async () => {
    await request(app)
      .post("/api/programs")
      .send({ name: "P", phases: [{ name: "First", weeks: 1 }, { name: "Second", weeks: 1 }] });
    const phases = prisma.program.create.mock.calls[0][0].data.phases.create;
    expect(phases.map((p: { order: number; name: string }) => [p.order, p.name])).toEqual([
      [0, "First"],
      [1, "Second"],
    ]);
  });

  it("refuses a nameless program and names the offending phase", async () => {
    const noName = await request(app).post("/api/programs").send({ name: " " });
    expect(noName.status).toBe(400);
    expect(noName.body.error).toBe("Give the program a name.");

    const badPhase = await request(app)
      .post("/api/programs")
      .send({ name: "P", phases: [{ name: "Fine", weeks: 1 }, { name: "", weeks: 1 }] });
    expect(badPhase.status).toBe(400);
    expect(badPhase.body.error).toContain("phase 2");
  });

  it("refuses an item type the app does not have", async () => {
    const res = await request(app)
      .post("/api/programs")
      .send({ name: "P", phases: [{ name: "B", weeks: 1, items: [{ week: 1, weekday: 1, type: "Telepathy", title: "x" }] }] });
    expect(res.status).toBe(400);
    expect(prisma.program.create).not.toHaveBeenCalled();
  });

  it("replaces phases wholesale on update, rather than diffing them", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    const res = await request(app).put("/api/programs/p1").send(body);
    expect(res.status).toBe(200);
    expect(prisma.tx.programPhase.deleteMany).toHaveBeenCalledWith({ where: { programId: "p1" } });
  });

  it("404s on another coach's program for every write", async () => {
    prisma.program.findFirst.mockResolvedValue(null);
    expect((await request(app).put("/api/programs/p1").send(body)).status).toBe(404);
    expect((await request(app).delete("/api/programs/p1")).status).toBe(404);
    expect((await request(app).post("/api/programs/p1/copy")).status).toBe(404);
    expect(prisma.program.delete).not.toHaveBeenCalled();
  });

  it("copies a program with its phases and items", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    const res = await request(app).post("/api/programs/p1/copy");
    expect(res.status).toBe(201);
    const data = prisma.program.create.mock.calls[0][0].data;
    expect(data.name).toBe("8 week strength (copy)");
    expect(data.phases.create[0].items.create).toHaveLength(2);
  });
});

describe("preview: see the dates before committing a client's calendar", () => {
  it("returns the dates and saves nothing", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    const res = await request(app).post("/api/programs/p1/preview").send({ clientId: "cl1", startDate: MON });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.items.map((i: { date: string }) => i.date)).toEqual([MON, "2026-11-25"]);
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  it("needs a client and a real start date", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    expect((await request(app).post("/api/programs/p1/preview").send({ startDate: MON })).body.error).toBe(
      "Choose which client this is for.",
    );
    expect((await request(app).post("/api/programs/p1/preview").send({ clientId: "cl1", startDate: "soon" })).body.error).toBe(
      "Choose the date this program starts.",
    );
  });
});

describe("assigning: the template becomes real assignments", () => {
  const assign = () => request(app).post("/api/programs/p1/assign").send({ clientId: "cl1", startDate: MON });

  it("creates one assignment per item, on the laid-out dates", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    const res = await assign();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 2, startDate: MON });
    const dates = prisma.assignment.create.mock.calls.map((c) => c[0].data.date);
    // Week 1 Monday, then week 2 Wednesday.
    expect(dates).toEqual([MON, "2026-11-25"]);
  });

  it("marks where they came from, and gives them the client and coach", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    await assign();
    expect(prisma.assignment.create.mock.calls[0][0].data).toMatchObject({
      clientId: "cl1",
      coachId: TEST_COACH_ID,
      source: "program",
      status: "Active",
      type: "Workout",
      title: "Lower body",
    });
  });

  it("writes them all in ONE transaction, so a half-assigned program cannot exist", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    await assign();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("gives each new workout its structure, as any other saved plan gets", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    await assign();
    expect(derive).toHaveBeenCalledTimes(2);
    expect(derive.mock.calls[0][0]).toMatchObject({ title: "Lower body" });
  });

  it("refuses another coach's client", async () => {
    prisma.program.findFirst.mockResolvedValue(program());
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await assign();
    expect(res.status).toBe(404);
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  it("refuses an empty program rather than silently doing nothing", async () => {
    prisma.program.findFirst.mockResolvedValue(program({ phases: [] }));
    const res = await assign();
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("nothing in it yet");
  });

  it("404s on a program that is not the coach's", async () => {
    prisma.program.findFirst.mockResolvedValue(null);
    expect((await assign()).status).toBe(404);
  });
});
