// Six-month demo seed (Prompt 30). Prisma is mocked, so these run without a database.
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, tx } = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    client: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  };
  return { tx, prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";
import { SIX_MONTH_ROSTER, sixMonthLogs } from "../src/routes/seed.js";

const NAMES = [
  "Rohan Kapoor",
  "Sarah Mitchell",
  "David Osei",
  "Priya Nair",
  "Tom Becker",
  "Lena Fischer",
  "Miguel Santos",
  "Aisha Khan",
  "Jake Thompson",
  "Emma Wilson",
];

const WEEK_MS = 7 * 86_400_000;
const dayMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

describe("six-month roster", () => {
  it("is the 10 clients from the prompt with their numbers", () => {
    expect(SIX_MONTH_ROSTER.map((c) => c.name)).toEqual(NAMES);
    const sarah = SIX_MONTH_ROSTER.find((c) => c.name === "Sarah Mitchell")!;
    expect(sarah).toMatchObject({ goal: "Fat loss", age: 38, heightCm: 167, level: "Intermediate", startKg: 82, endKg: 74.1 });
    expect(SIX_MONTH_ROSTER.find((c) => c.name === "Aisha Khan")!.notes).toMatch(/knee/i);
    expect(SIX_MONTH_ROSTER.find((c) => c.name === "Aisha Khan")!.notes).toMatch(/jump/i);
    expect(SIX_MONTH_ROSTER.find((c) => c.name === "Jake Thompson")!.notes).toMatch(/shoulder impingement/i);
    expect(SIX_MONTH_ROSTER.find((c) => c.name === "Jake Thompson")!.notes).toMatch(/physio/i);
    for (const c of SIX_MONTH_ROSTER) {
      expect(c.focus.trim()).not.toBe("");
      expect(c.notes.trim()).not.toBe("");
      expect(c.baseAdherence).toBeGreaterThanOrEqual(76);
      expect(c.baseAdherence).toBeLessThanOrEqual(91);
      expect(c.baseWorkouts).toBeGreaterThanOrEqual(3);
      expect(c.baseWorkouts).toBeLessThanOrEqual(5);
    }
  });
});

describe("sixMonthLogs", () => {
  it.each(SIX_MONTH_ROSTER.map((c) => [c.name, c] as const))("%s: 26 weekly logs, in range, trending the right way", (_n, c) => {
    const logs = sixMonthLogs(c);
    expect(logs).toHaveLength(26);
    expect(logs[0].date).toBe("2026-05-11");
    expect(logs[25].date).toBe("2026-11-02");
    for (let i = 1; i < 26; i++) expect(dayMs(logs[i].date) - dayMs(logs[i - 1].date)).toBe(WEEK_MS);

    expect(logs[0].weightKg).toBe(c.startKg);
    expect(logs[25].weightKg).toBe(c.endKg);
    // Smooth: no week jumps by more than 1 kg; every week stays near the straight line.
    for (let i = 1; i < 26; i++) expect(Math.abs(logs[i].weightKg - logs[i - 1].weightKg)).toBeLessThanOrEqual(1);
    // Trend: the average of the last 8 weeks is on the end-weight side of the first 8.
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const first8 = avg(logs.slice(0, 8).map((l) => l.weightKg));
    const last8 = avg(logs.slice(-8).map((l) => l.weightKg));
    expect(Math.sign(last8 - first8)).toBe(Math.sign(c.endKg - c.startKg));

    for (const l of logs) {
      expect(Number.isInteger(l.adherence)).toBe(true);
      expect(l.adherence).toBeGreaterThanOrEqual(55);
      expect(l.adherence).toBeLessThanOrEqual(98);
      expect(Math.abs(l.adherence - c.baseAdherence)).toBeLessThanOrEqual(10);
      expect(Number.isInteger(l.workoutsDone)).toBe(true);
      expect(l.workoutsDone).toBeGreaterThanOrEqual(1);
      expect(l.workoutsDone).toBeLessThanOrEqual(7);
      expect(Math.abs(l.workoutsDone - c.baseWorkouts)).toBeLessThanOrEqual(2);
      expect(Math.round(l.weightKg * 10) / 10).toBe(l.weightKg);
    }
    expect(logs[0].note).toBe("Started program");
    expect(logs[25].note).toBe("6-month review");
  });

  it("is stable: the same client always gets the same history, different clients differ", () => {
    const sarah = SIX_MONTH_ROSTER[1];
    expect(sixMonthLogs(sarah)).toEqual(sixMonthLogs(sarah));
    const a = sixMonthLogs(SIX_MONTH_ROSTER[0]).map((l) => l.adherence);
    const b = sixMonthLogs(SIX_MONTH_ROSTER[3]).map((l) => l.adherence);
    expect(a).not.toEqual(b);
  });

  it("Sarah Mitchell trends down", () => {
    const logs = sixMonthLogs(SIX_MONTH_ROSTER.find((c) => c.name === "Sarah Mitchell")!);
    expect(logs[25].weightKg).toBeLessThan(logs[0].weightKg);
    expect(logs[12].weightKg).toBeLessThan(80);
    expect(logs[12].weightKg).toBeGreaterThan(76);
  });
});

type CreateArg = { data: { name: string; weightKg: number; progressLogs: { create: unknown[] }; [k: string]: unknown } };

describe("POST /api/seed/six-month-demo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.client.findMany.mockResolvedValue([]);
    tx.client.create.mockImplementation(async ({ data }: CreateArg) => ({ id: `id-${data.name}`, ...data }));
  });

  it("creates all 10 (201) with 26 logs each and current weight = end weight", async () => {
    const res = await request(app).post("/api/seed/six-month-demo");
    expect(res.status).toBe(201);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(NAMES);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const data = tx.client.create.mock.calls.map(([a]) => (a as CreateArg).data);
    for (const d of data) {
      expect(d.coachId).toBe("default-coach");
      expect(d.progressLogs.create).toHaveLength(26);
      expect(d.weightKg).toBe(SIX_MONTH_ROSTER.find((c) => c.name === d.name)!.endKg);
      expect(d).not.toHaveProperty("startKg");
      expect(d).not.toHaveProperty("baseAdherence");
    }
  });

  it("skips clients whose name already exists", async () => {
    tx.client.findMany.mockResolvedValue([{ name: "Sarah Mitchell" }, { name: "Jake Thompson" }]);
    const res = await request(app).post("/api/seed/six-month-demo");
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(8);
    expect(res.body.map((c: { name: string }) => c.name)).not.toContain("Sarah Mitchell");
    expect(tx.client.findMany).toHaveBeenCalledWith({
      where: { coachId: "default-coach", name: { in: NAMES } },
      select: { name: true },
    });
  });

  it("returns 200 [] when all 10 already exist", async () => {
    tx.client.findMany.mockResolvedValue(NAMES.map((name) => ({ name })));
    const res = await request(app).post("/api/seed/six-month-demo");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(tx.client.create).not.toHaveBeenCalled();
  });
});
