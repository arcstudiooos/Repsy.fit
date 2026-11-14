// The structured-workout endpoints (Inspo W3, Nov 2026).
//
// The rules worth protecting here:
//   * a legacy plan still answers with a structure, parsed from `details` on demand;
//   * saving structure REGENERATES `details`, so older readers never see a stale plan;
//   * clearing the structure must not wipe the coach's words;
//   * an exerciseId the coach cannot see is downgraded to a plain name, never saved as a link.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn(), update: vi.fn() },
    workoutSection: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    exercise: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const CLIENT = { id: "cl1", coachId: TEST_COACH_ID, name: "Maya" };
const ASSIGNMENT = {
  id: "a1",
  clientId: "cl1",
  coachId: TEST_COACH_ID,
  type: "Workout",
  title: "Lower body",
  details: "1. Back Squat - 4 sets x 6 reps · 60 kg · Rest 120s",
};
const url = "/api/clients/cl1/assignments/a1/structure";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.client.findFirst.mockResolvedValue(CLIENT);
  prisma.assignment.findFirst.mockResolvedValue(ASSIGNMENT);
  prisma.workoutSection.findMany.mockResolvedValue([]);
  prisma.exercise.findMany.mockResolvedValue([]);
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
});

describe("GET structure", () => {
  it("returns the stored sections when there are some", async () => {
    prisma.workoutSection.findMany.mockResolvedValue([
      {
        order: 0,
        protocol: "Superset",
        sets: 3,
        restSec: 90,
        durationSec: null,
        notes: "",
        exercises: [
          {
            exerciseId: "stk_back_squat",
            name: "Back Squat",
            repsPerSet: [12, 12, 10],
            loadPerSet: [],
            durationSec: null,
            distanceM: null,
            rpe: 8,
            restSec: 60,
            notes: "",
            recordFields: ["reps", "weight"],
          },
        ],
      },
    ]);
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(true);
    expect(res.body.sections[0]).toMatchObject({ protocol: "Superset", sets: 3 });
    expect(res.body.sections[0].exercises[0]).toMatchObject({
      name: "Back Squat",
      repsPerSet: [12, 12, 10],
      recordFields: ["reps", "weight"],
    });
    expect(res.body.estimatedSeconds).toBeGreaterThan(0);
  });

  it("parses `details` on demand for a plan written before structure existed", async () => {
    prisma.workoutSection.findMany.mockResolvedValue([]);
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    // Nothing stored, but the coach still sees a structured workout.
    expect(res.body.stored).toBe(false);
    expect(res.body.sections[0].exercises[0]).toMatchObject({ name: "Back Squat", repsPerSet: [6, 6, 6, 6] });
  });

  it("404s for another coach's assignment", async () => {
    prisma.assignment.findFirst.mockResolvedValue(null);
    expect((await request(app).get(url)).status).toBe(404);
  });

  it("404s when the client is not this coach's", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await request(app).get(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Client not found");
  });
});

describe("PUT structure", () => {
  const body = {
    sections: [
      {
        protocol: "Regular",
        sets: 1,
        exercises: [{ name: "Back Squat", repsPerSet: [12, 12, 10], restSec: 120 }],
      },
    ],
  };

  it("saves the sections and regenerates `details` so older readers stay correct", async () => {
    const res = await request(app).put(url).send(body);
    expect(res.status).toBe(200);
    expect(prisma.workoutSection.deleteMany).toHaveBeenCalledWith({ where: { assignmentId: "a1" } });
    const created = prisma.workoutSection.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ assignmentId: "a1", order: 0, protocol: "Regular" });
    expect(created.exercises.create[0]).toMatchObject({ order: 0, name: "Back Squat", repsPerSet: [12, 12, 10] });
    // `details` is rewritten from the structure, in the format the client app parses.
    expect(prisma.assignment.update.mock.calls[0][0].data.details).toBe("1. Back Squat - 3 sets x 12, 12, 10 reps · Rest 120s");
    expect(res.body.details).toContain("12, 12, 10");
  });

  it("numbers sections and exercises by position, ignoring any order in the body", async () => {
    await request(app)
      .put(url)
      .send({
        sections: [
          { exercises: [{ name: "A" }, { name: "B" }] },
          { exercises: [{ name: "C" }] },
        ],
      });
    const [first, second] = prisma.workoutSection.create.mock.calls.map((c) => c[0].data);
    expect(first.order).toBe(0);
    expect(second.order).toBe(1);
    expect(first.exercises.create.map((e: { order: number }) => e.order)).toEqual([0, 1]);
  });

  it("keeps a link to an exercise the coach can see", async () => {
    prisma.exercise.findMany.mockResolvedValue([{ id: "stk_back_squat" }]);
    await request(app)
      .put(url)
      .send({ sections: [{ exercises: [{ name: "Back Squat", exerciseId: "stk_back_squat" }] }] });
    expect(prisma.workoutSection.create.mock.calls[0][0].data.exercises.create[0].exerciseId).toBe("stk_back_squat");
    // The lookup is always scoped to this coach plus stock.
    expect(prisma.exercise.findMany.mock.calls[0][0].where).toMatchObject({
      OR: [{ coachId: TEST_COACH_ID }, { coachId: null }],
    });
  });

  it("downgrades an exerciseId the coach cannot see to a plain name instead of failing", async () => {
    prisma.exercise.findMany.mockResolvedValue([]); // not visible to this coach
    const res = await request(app)
      .put(url)
      .send({ sections: [{ exercises: [{ name: "Back Squat", exerciseId: "someone-elses-exercise" }] }] });
    expect(res.status).toBe(200);
    const saved = prisma.workoutSection.create.mock.calls[0][0].data.exercises.create[0];
    expect(saved.exerciseId).toBeNull();
    expect(saved.name).toBe("Back Squat");
  });

  it("clearing the structure does NOT wipe the words the coach typed", async () => {
    const res = await request(app).put(url).send({ sections: [] });
    expect(res.status).toBe(200);
    expect(prisma.workoutSection.deleteMany).toHaveBeenCalled();
    expect(prisma.assignment.update).not.toHaveBeenCalled();
    expect(res.body.stored).toBe(false);
    expect(res.body.details).toBe(ASSIGNMENT.details);
  });

  it("rejects a nameless exercise in plain words, and saves nothing", async () => {
    const res = await request(app).put(url).send({ sections: [{ exercises: [{ name: "" }] }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Every exercise needs a name.");
    expect(prisma.workoutSection.deleteMany).not.toHaveBeenCalled();
  });

  it("names the section when there is more than one to look at", async () => {
    const res = await request(app)
      .put(url)
      .send({ sections: [{ exercises: [{ name: "Fine" }] }, { exercises: [{ name: "" }] }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Every exercise needs a name. (section 2)");
  });

  it("does not bother naming the section when there is only one", async () => {
    const res = await request(app).put(url).send({ sections: [{ exercises: [{ name: "" }] }] });
    expect(res.body.error).toBe("Every exercise needs a name.");
  });

  it("rejects a bad protocol and an impossible RPE", async () => {
    expect((await request(app).put(url).send({ sections: [{ protocol: "Vibes", exercises: [] }] })).status).toBe(400);
    expect((await request(app).put(url).send({ sections: [{ exercises: [{ name: "x", rpe: 99 }] }] })).status).toBe(400);
  });

  it("404s for another coach's assignment, before touching anything", async () => {
    prisma.assignment.findFirst.mockResolvedValue(null);
    const res = await request(app).put(url).send(body);
    expect(res.status).toBe(404);
    expect(prisma.workoutSection.deleteMany).not.toHaveBeenCalled();
  });

  it("writes everything in one transaction", async () => {
    await request(app).put(url).send(body);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
