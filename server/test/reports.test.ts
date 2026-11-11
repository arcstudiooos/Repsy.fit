// Prompt 70: reports and CSV exports (mocked database).
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findFirst: vi.fn(), findMany: vi.fn() },
  coach: { findUnique: vi.fn() },
  progressLog: { findMany: vi.fn() },
  measurement: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  assignment: { findMany: vi.fn() },
  dailyCheckIn: { findMany: vi.fn() },
  clientPlan: { findMany: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;
const { toCsv, CSV_COLUMNS } = await import("../src/csv.js");

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "SECRET FOCUS", notes: "SECRET COACH NOTE" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  for (const m of [prismaMock.progressLog, prismaMock.measurement, prismaMock.payment, prismaMock.assignment, prismaMock.dailyCheckIn, prismaMock.clientPlan, prismaMock.client]) {
    m.findMany.mockResolvedValue([]);
  }
});

describe("toCsv", () => {
  it("writes a header row, CRLF line ends, a UTF-8 BOM, and quotes commas, quotes and newlines", () => {
    const out = toCsv(["a", "b"], [{ a: 'x, "y"', b: "line1\nline2" }, { a: null, b: 3.5 }]);
    expect(out).toBe('﻿a,b\r\n"x, ""y""","line1\nline2"\r\n,3.5\r\n');
  });

  it("neutralises spreadsheet formulas in text cells (leading = + - @)", () => {
    const out = toCsv(["a"], [{ a: "=HYPERLINK(1)" }, { a: "+1" }, { a: "@x" }, { a: -4 }]);
    expect(out).toContain("\r\n'=HYPERLINK(1)\r\n'+1\r\n'@x\r\n-4\r\n");
  });

  it("lists the export columns", () => {
    expect(CSV_COLUMNS.progress).toEqual(["date", "weightKg", "adherence", "workoutsDone", "note"]);
    expect(CSV_COLUMNS.measurements).toEqual(["date", "waistCm", "chestCm", "armCm", "hipCm", "bodyFatPercent", "note"]);
    expect(CSV_COLUMNS.payments).toEqual(["paidOn", "amount", "method", "note"]);
    expect(CSV_COLUMNS.assignments).toEqual(["date", "type", "title", "details", "reasoning", "source", "status"]);
    expect(CSV_COLUMNS.roster).toEqual(["name", "goal", "level", "planName", "planStatus", "billingCycle", "priceAmount", "nextDueDate"]);
  });
});

describe("GET /api/reports/clients/:clientId/export/:type", () => {
  it("progress: CSV headers, YYYY-MM-DD dates, scoped to client AND coach, range applied", async () => {
    prismaMock.progressLog.findMany.mockResolvedValue([
      { id: "l1", clientId: "c1", date: "2026-10-05", weightKg: 68.2, adherence: 80, workoutsDone: 3, note: "ok", createdAt: new Date("2026-10-05T10:00:00Z") },
    ]);
    const res = await request(app).get("/api/reports/clients/c1/export/progress?from=2026-10-01&to=2026-10-31");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv; charset=utf-8/);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="[^"]*progress[^"]*\.csv"/);
    expect(res.text).toBe("﻿date,weightKg,adherence,workoutsDone,note\r\n2026-10-05,68.2,80,3,ok\r\n");
    expect(prismaMock.progressLog.findMany.mock.calls[0][0].where).toEqual({ clientId: "c1", coachId: "coach-1", date: { gte: "2026-10-01", lte: "2026-10-31" } });
  });

  it.each([
    ["measurements", "measurement"],
    ["payments", "payment"],
    ["assignments", "assignment"],
  ] as const)("%s: header row only when empty, scoped by coach", async (type, model) => {
    const res = await request(app).get(`/api/reports/clients/c1/export/${type}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe(`﻿${CSV_COLUMNS[type].join(",")}\r\n`);
    expect((prismaMock[model] as { findMany: ReturnType<typeof vi.fn> }).findMany.mock.calls[0][0].where).toMatchObject({ clientId: "c1", coachId: "coach-1" });
  });

  it("payments use paidOn for the range", async () => {
    await request(app).get("/api/reports/clients/c1/export/payments?from=2026-01-01");
    expect(prismaMock.payment.findMany.mock.calls[0][0].where).toEqual({ clientId: "c1", coachId: "coach-1", paidOn: { gte: "2026-01-01" } });
  });

  it("another coach's client is 404; unknown type is 400; bad range is 400; signed out is 401", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    expect((await request(app).get("/api/reports/clients/x/export/progress")).status).toBe(404);
    prismaMock.client.findFirst.mockResolvedValue(CLIENT);
    const bad = await request(app).get("/api/reports/clients/c1/export/photos");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBeTruthy();
    const range = await request(app).get("/api/reports/clients/c1/export/progress?from=2026-02-31");
    expect(range.status).toBe(400);
    const backwards = await request(app).get("/api/reports/clients/c1/export/progress?from=2026-03-01&to=2026-02-01");
    expect(backwards.status).toBe(400);
    expect((await supertest(app).get("/api/reports/clients/c1/export/progress")).status).toBe(401);
  });
});

describe("GET /api/reports/roster", () => {
  it("lists every client of this coach with plan status and next due date; No plan when none", async () => {
    prismaMock.client.findMany.mockResolvedValue([
      { name: "Maya Patel", goal: "Fat loss", level: "Intermediate", plan: { planName: "Monthly", status: "Active", billingCycle: "Monthly", priceAmount: 4999, nextDueDate: "2026-12-01" } },
      { name: "Arjun Rao", goal: "Muscle gain", level: "Beginner", plan: null },
    ]);
    const res = await request(app).get("/api/reports/roster");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toBe(
      "﻿name,goal,level,planName,planStatus,billingCycle,priceAmount,nextDueDate\r\n" +
        "Maya Patel,Fat loss,Intermediate,Monthly,Active,Monthly,4999,2026-12-01\r\n" +
        "Arjun Rao,Muscle gain,Beginner,,No plan,,,\r\n",
    );
    expect(prismaMock.client.findMany.mock.calls[0][0].where).toEqual({ coachId: "coach-1" });
  });

  it("signed out is 401", async () => {
    expect((await supertest(app).get("/api/reports/roster")).status).toBe(401);
  });
});

describe("GET /api/reports/clients/:clientId/progress-report", () => {
  it("returns client details, logs, measurements, assignment counts and check-in averages - never notes, focus or chat", async () => {
    prismaMock.progressLog.findMany.mockResolvedValue([
      { id: "l1", clientId: "c1", date: "2026-10-05", weightKg: 70, adherence: 80, workoutsDone: 3, note: "private log note", createdAt: new Date() },
    ]);
    prismaMock.measurement.findMany.mockResolvedValue([
      { id: "m1", clientId: "c1", date: "2026-10-06", waistCm: 80, chestCm: null, armCm: null, hipCm: null, bodyFatPercent: 22, note: "private m note", createdAt: new Date() },
    ]);
    prismaMock.assignment.findMany.mockResolvedValue([
      { type: "Workout", status: "Done" },
      { type: "Workout", status: "Active" },
      { type: "Nutrition", status: "Done" },
    ]);
    prismaMock.dailyCheckIn.findMany.mockResolvedValue([
      { energy: 4, mood: 2, sleepHours: 7, recoveryScore: null, waterLiters: 2, steps: 8000 },
      { energy: 2, mood: 4, sleepHours: null, recoveryScore: 3, waterLiters: null, steps: 4000 },
    ]);
    const res = await request(app).get("/api/reports/clients/c1/progress-report?from=2026-10-01&to=2026-10-31");
    expect(res.status).toBe(200);
    expect(res.body.client).toEqual({ name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate" });
    expect(res.body.range).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(res.body.logs).toEqual([{ date: "2026-10-05", weightKg: 70, adherence: 80, workoutsDone: 3 }]);
    expect(res.body.measurements).toEqual([{ date: "2026-10-06", waistCm: 80, chestCm: null, armCm: null, hipCm: null, bodyFatPercent: 22 }]);
    expect(res.body.assignments).toEqual({ total: 3, done: 2, byType: [{ type: "Workout", count: 2 }, { type: "Nutrition", count: 1 }, { type: "Habit", count: 0 }, { type: "Recovery", count: 0 }] });
    expect(res.body.checkIns).toEqual({ count: 2, energy: 3, mood: 3, sleepHours: 7, recoveryScore: 3, waterLiters: 2, steps: 6000 });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/SECRET|private|reasoning|chat/i);
    for (const m of [prismaMock.progressLog, prismaMock.measurement, prismaMock.assignment, prismaMock.dailyCheckIn]) {
      expect(m.findMany.mock.calls[0][0].where).toMatchObject({ clientId: "c1", coachId: "coach-1" });
    }
  });

  it("no data: counts are zero and averages are null", async () => {
    const res = await request(app).get("/api/reports/clients/c1/progress-report");
    expect(res.status).toBe(200);
    expect(res.body.checkIns).toEqual({ count: 0, energy: null, mood: null, sleepHours: null, recoveryScore: null, waterLiters: null, steps: null });
    expect(res.body.assignments.total).toBe(0);
  });

  it("another coach's client is 404", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    expect((await request(app).get("/api/reports/clients/x/progress-report")).status).toBe(404);
  });
});
