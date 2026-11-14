// Deriving structure from a plan's own words (Inspo A1/A2, Nov 2026).
//
// The AI writes a workout as numbered lines, and so do most coaches. That text is what the client
// app renders and what the exports use - but it is a blob. Parsing it on save means an AI draft
// lands as REAL structure, with no prompt change and no second model call.
//
// The two rules that matter most are both about not making things worse:
//   * `details` is NEVER rewritten - a human's words must not change under them;
//   * a failure NEVER fails the save - structure is a bonus, not a precondition.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => {
  const tx = {
    workoutSection: { deleteMany: vi.fn(), create: vi.fn() },
    assignment: { update: vi.fn() },
  };
  return {
    prisma: {
      tx,
      exercise: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx)),
    },
  };
});
vi.mock("../src/db.js", () => ({ prisma }));

const { allowedExerciseIds, deriveStructure } = await import("../src/workouts/persist.js");

// How the AI actually writes a plan, and how parsePlanLines has always read it.
const AI_TEXT = [
  "1. Back Squat — 4 sets × 6 reps · 80 kg · Rest 120s",
  "2. Romanian Deadlift — 3 sets × 10 reps · 60 kg · Rest 90s",
  "3. Walking Lunge — 3 sets × 12 reps · Rest 60s",
].join("\n");

const assignment = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  coachId: "coach-1",
  type: "Workout",
  details: AI_TEXT,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.exercise.findMany.mockResolvedValue([]);
  prisma.tx.workoutSection.create.mockResolvedValue({ id: "s1" });
});

describe("deriveStructure", () => {
  it("turns an AI-written plan into real structure", async () => {
    const result = await deriveStructure(assignment());
    expect(result).toEqual({ sections: 1 });
    expect(prisma.tx.workoutSection.create).toHaveBeenCalledTimes(1);
    const data = prisma.tx.workoutSection.create.mock.calls[0][0].data;
    const exercises = data.exercises.create as { name: string; repsPerSet: number[] }[];
    expect(exercises.map((e) => e.name)).toEqual(["Back Squat", "Romanian Deadlift", "Walking Lunge"]);
    // "4 sets x 6 reps" becomes the per-set array the builder edits as "6, 6, 6, 6".
    expect(exercises[0].repsPerSet).toEqual([6, 6, 6, 6]);
    expect(exercises[1].repsPerSet).toEqual([10, 10, 10]);
  });

  it("NEVER rewrites the words the coach or the AI wrote", async () => {
    await deriveStructure(assignment());
    // The whole point: text in, structure alongside. Nothing a human reads changes.
    expect(prisma.tx.assignment.update).not.toHaveBeenCalled();
  });

  it("replaces any structure already there, so a re-save cannot double up", async () => {
    await deriveStructure(assignment());
    expect(prisma.tx.workoutSection.deleteMany).toHaveBeenCalledWith({ where: { assignmentId: "a1" } });
  });

  it("leaves a plan that is only prose alone", async () => {
    for (const details of [
      "Go for a 30 minute walk and stretch afterwards.",
      "",
      "   ",
      "Rest day. Do nothing at all.",
    ]) {
      expect(await deriveStructure(assignment({ details }))).toBeNull();
    }
    expect(prisma.tx.workoutSection.create).not.toHaveBeenCalled();
  });

  it("only touches a Workout", async () => {
    for (const type of ["Nutrition", "Habit", "Note", "Check-in"]) {
      expect(await deriveStructure(assignment({ type }))).toBeNull();
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not fail the save when the database refuses the structure", async () => {
    // A plan the coach just wrote must not be lost because a bonus feature broke.
    prisma.$transaction.mockRejectedValueOnce(new Error("deadlock detected"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deriveStructure(assignment())).resolves.toBeNull();
    expect(spy.mock.calls[0][0]).toContain("The plan is saved");
    spy.mockRestore();
  });

  it("does not fail the save when the text parses to nothing usable", async () => {
    // Looks numbered, holds no exercise.
    const result = await deriveStructure(assignment({ details: "1. \n2. " }));
    expect(result).toBeNull();
  });
});

describe("allowedExerciseIds", () => {
  const sections = [
    {
      protocol: "Regular" as const,
      sets: 3,
      restSec: 60,
      durationSec: null,
      notes: "",
      exercises: [
        { exerciseId: "stk_back_squat", name: "Back Squat", repsPerSet: [6], loadPerSet: [], durationSec: null, distanceM: null, rpe: null, restSec: 0, notes: "", recordFields: [] },
        { exerciseId: "someone-elses", name: "Mystery", repsPerSet: [6], loadPerSet: [], durationSec: null, distanceM: null, rpe: null, restSec: 0, notes: "", recordFields: [] },
      ],
    },
  ];

  it("asks only for this coach's own exercises and Repsy stock", async () => {
    prisma.exercise.findMany.mockResolvedValue([{ id: "stk_back_squat" }]);
    const allowed = await allowedExerciseIds("coach-1", sections);
    expect(prisma.exercise.findMany.mock.calls[0][0].where).toMatchObject({
      OR: [{ coachId: "coach-1" }, { coachId: null }],
    });
    // The id that is not theirs is simply absent, so the caller keeps it as a plain name.
    expect([...allowed]).toEqual(["stk_back_squat"]);
  });

  it("asks nothing when no exercise is linked", async () => {
    const plain = [{ ...sections[0], exercises: sections[0].exercises.map((e) => ({ ...e, exerciseId: null })) }];
    expect([...(await allowedExerciseIds("coach-1", plain))]).toEqual([]);
    expect(prisma.exercise.findMany).not.toHaveBeenCalled();
  });

  it("leaves demo data (no coach) with stock exercises only", async () => {
    prisma.exercise.findMany.mockResolvedValue([{ id: "stk_back_squat" }]);
    await allowedExerciseIds(null, sections);
    expect(prisma.exercise.findMany.mock.calls[0][0].where).toMatchObject({ OR: [{ coachId: null }, { coachId: null }] });
  });
});
