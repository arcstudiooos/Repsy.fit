// Quick demo seed (Prompt 29). Prisma is mocked, so these run without a database.
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, tx } = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    client: { count: vi.fn(), create: vi.fn() },
  };
  return { tx, prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

beforeEach(() => {
  vi.clearAllMocks();
  tx.client.count.mockResolvedValue(0);
  tx.client.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `id-${String(data.name)}`,
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    ...data,
  }));
});

type CreateArg = {
  data: {
    name: string;
    coachId: string;
    progressLogs: { create: Record<string, unknown>[] };
    assignments: { create: Record<string, unknown>[] };
    [key: string]: unknown;
  };
};
const createdData = () => tx.client.create.mock.calls.map(([arg]) => (arg as CreateArg).data);

describe("POST /api/seed/demo", () => {
  it("creates exactly the 3 starter clients, in order, and returns them (201)", async () => {
    const res = await request(app).post("/api/seed/demo");

    expect(res.status).toBe(201);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(["Maya Patel", "Arjun Mehta", "Casey Jordan"]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // advisory lock: two seeds can't interleave
    expect(tx.client.count).toHaveBeenCalledWith({ where: { coachId: "default-coach" } });

    const [maya, arjun, casey] = createdData();
    expect(maya).toMatchObject({
      name: "Maya Patel",
      goal: "Fat loss + strength",
      age: 29,
      weightKg: 68,
      heightCm: 165,
      level: "Intermediate",
      focus: "Lower body strength, protein intake",
      notes: "Vegetarian. Trains 4x/week. Sleep inconsistent on weekdays.",
      coachId: "default-coach",
    });
    expect(arjun).toMatchObject({
      name: "Arjun Mehta",
      goal: "Muscle gain",
      age: 24,
      weightKg: 62,
      heightCm: 178,
      level: "Beginner",
      focus: "Upper body, calorie surplus",
      notes: "Student, budget meals. Prefers morning workouts.",
    });
    expect(casey).toMatchObject({
      name: "Casey Jordan",
      goal: "Marathon prep + conditioning",
      age: 34,
      weightKg: 74,
      heightCm: 172,
      level: "Advanced",
      focus: "Endurance, injury prevention",
      notes: "History of shin splints. Runs 5x/week.",
    });
  });

  it("gives each client 3 weekly logs ending at their current weight and 1 starter plan", async () => {
    await request(app).post("/api/seed/demo");
    for (const data of createdData()) {
      const logs = data.progressLogs.create;
      expect(logs).toHaveLength(3);
      const current = data.weightKg as number;
      expect(logs.map((l) => l.weightKg)).toEqual([
        Math.round((current + 1.2) * 10) / 10,
        Math.round((current + 0.6) * 10) / 10,
        current,
      ]);
      expect(logs.map((l) => l.adherence)).toEqual([72, 81, 86]);
      expect(logs.map((l) => l.workoutsDone)).toEqual([3, 4, 4]);
      expect(logs.map((l) => l.note)).toEqual(["Starting week", "Better consistency", "On track"]);
      // The 3 most recent weeks, one week apart, oldest first.
      const dates = logs.map((l) => new Date(`${String(l.date)}T00:00:00Z`).getTime());
      expect(dates[1] - dates[0]).toBe(7 * 86_400_000);
      expect(dates[2] - dates[1]).toBe(7 * 86_400_000);
      expect(logs.every((l) => l.coachId === "default-coach")).toBe(true);

      expect(data.assignments.create).toEqual([
        expect.objectContaining({
          type: "Workout",
          title: "Demo starter plan",
          details: "Full-body session 3x this week - squat, hinge, push, pull. RPE 7-8.",
          reasoning: "Starter plan to establish baseline.",
          source: "manual",
          status: "Active",
          coachId: "default-coach",
        }),
      ]);
    }
  });

  it("skips the whole seed when any client already exists and returns []", async () => {
    tx.client.count.mockResolvedValue(1);
    const res = await request(app).post("/api/seed/demo");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(tx.client.create).not.toHaveBeenCalled();
  });
});
