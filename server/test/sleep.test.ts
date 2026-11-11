// Sleep & recovery (Prompt 55): one-decimal validation, the 7-day average, the added At-Risk reason
// line and the AI context line. Prompt 50's three rules are covered by at-risk.test.ts and stay as they were.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SLEEP_LOW_HOURS, sleepWeek } from "../src/sleep.js";
import { findAtRiskClients } from "../src/atRisk.js";

const prismaMock = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
  dailyCheckIn: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  progressLog: { findMany: vi.fn() },
  assignment: { findMany: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");

const TODAY = "2026-11-11";
const night = (date: string, sleepHours: number | null) => ({ date, sleepHours });

describe("sleepWeek", () => {
  it("averages the nights logged in the 7 days up to today and ignores older or empty ones", () => {
    const week = sleepWeek(
      [night("2026-11-11", 5), night("2026-11-10", 6), night("2026-11-09", null), night("2026-11-05", 7), night("2026-11-04", 12)],
      TODAY,
    );
    expect(week).toEqual({ average: 6, nights: 3 });
  });

  it("is null when nothing was logged this week", () => {
    expect(sleepWeek([night("2026-11-01", 8)], TODAY)).toEqual({ average: null, nights: 0 });
    expect(sleepWeek([], TODAY)).toEqual({ average: null, nights: 0 });
  });

  it("rounds to one decimal", () => {
    expect(sleepWeek([night("2026-11-11", 7), night("2026-11-10", 7), night("2026-11-09", 8)], TODAY).average).toBe(7.3);
  });

  it("the threshold is 6 hours", () => expect(SLEEP_LOW_HOURS).toBe(6));
});

describe("At-Risk sleep reason", () => {
  const client = { id: "c1", name: "Maya", goal: "General fitness", createdAt: new Date("2026-01-01T00:00:00.000Z") };
  const poorSleep = [night("2026-11-11", 5), night("2026-11-10", 5.5), night("2026-11-09", 4)];
  // a stale client: Prompt 50's inactive rule fires (no logs for 10+ days)
  const run = (sleep: ReturnType<typeof night>[]) => findAtRiskClients([{ client, logs: [], sleep }], TODAY);

  it("adds 'Sleep under 6h average this week' to a client the original rules already picked", () => {
    const [found] = run(poorSleep);
    expect(found.reasons.map((r) => r.rule)).toEqual(["inactive", "sleep"]);
    expect(found.reasons[1].text).toBe("Sleep under 6h average this week");
  });

  it("is only an added line: low sleep alone does not put a client on the card", () => {
    const fresh = { ...client, createdAt: new Date("2026-11-10T00:00:00.000Z") };
    expect(findAtRiskClients([{ client: fresh, logs: [], sleep: poorSleep }], TODAY)).toEqual([]);
  });

  it("is not added when the average is 6h or more, or sleep was not passed", () => {
    expect(run([night("2026-11-11", 6), night("2026-11-10", 7)])[0].reasons.map((r) => r.rule)).toEqual(["inactive"]);
    expect(findAtRiskClients([{ client, logs: [] }], TODAY)[0].reasons.map((r) => r.rule)).toEqual(["inactive"]);
  });
});

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel" };
const saved = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  coachId: "coach-1",
  clientId: "c1",
  date: "2026-11-11",
  energy: null,
  mood: null,
  sleepHours: 7.5,
  recoveryScore: 4,
  waterLiters: null,
  steps: null,
  foodNote: "",
  createdAt: new Date("2026-11-11T08:00:00.000Z"),
  updatedAt: new Date("2026-11-11T08:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.dailyCheckIn.findUnique.mockResolvedValue(null);
  prismaMock.dailyCheckIn.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => Promise.resolve(saved(create)));
});

describe("POST /api/clients/:clientId/checkins sleep fields", () => {
  it("saves sleepHours with one decimal and a recoveryScore", async () => {
    const res = await request(app).post("/api/clients/c1/checkins").send({ date: TODAY, sleepHours: 7.5, recoveryScore: 4 });
    expect(res.status).toBe(201);
    expect(prismaMock.dailyCheckIn.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ sleepHours: 7.5, recoveryScore: 4 }) }),
    );
  });

  it("accepts the edges 0 and 16", async () => {
    expect((await request(app).post("/api/clients/c1/checkins").send({ date: TODAY, sleepHours: 0 })).status).toBe(201);
    expect((await request(app).post("/api/clients/c1/checkins").send({ date: TODAY, sleepHours: 16 })).status).toBe(201);
  });

  it.each([
    [{ date: TODAY, sleepHours: 7.25 }, "sleepHours: sleepHours must be a number of hours from 0 to 16, with at most one decimal."],
    [{ date: TODAY, sleepHours: 16.5 }, "sleepHours: sleepHours must be a number of hours from 0 to 16, with at most one decimal."],
    [{ date: TODAY, sleepHours: -1 }, "sleepHours: sleepHours must be a number of hours from 0 to 16, with at most one decimal."],
    [{ date: TODAY, recoveryScore: 0 }, "recoveryScore: recoveryScore must be a whole number from 1 to 5."],
    [{ date: TODAY, recoveryScore: 6 }, "recoveryScore: recoveryScore must be a whole number from 1 to 5."],
    [{ date: TODAY, recoveryScore: 2.5 }, "recoveryScore: recoveryScore must be a whole number from 1 to 5."],
  ])("rejects bad input in plain words: %j", async (body, message) => {
    const res = await request(app).post("/api/clients/c1/checkins").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
    expect(prismaMock.dailyCheckIn.upsert).not.toHaveBeenCalled();
  });
});

describe("AI context", () => {
  it("includes the 7-day sleep average and recovery score", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: "ok", suggestionType: "None", suggestionTitle: null, suggestionDetails: null, suggestionReasoning: null }) } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T12:00:00.000Z"));
    process.env.AI_BASE_URL = "https://ai.example.com/v1";
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "m";
    const { loadClientContext, answerQuestion } = await import("../src/routes/ai.js");
    prismaMock.assignment.findMany.mockResolvedValue([]);
    prismaMock.progressLog.findMany.mockResolvedValue([]);
    prismaMock.dailyCheckIn.findMany.mockResolvedValue([
      saved({ date: "2026-11-11", sleepHours: 5, recoveryScore: 2 }),
      saved({ id: "d2", date: "2026-11-10", sleepHours: 6, recoveryScore: 3 }),
    ]);
    const context = await loadClientContext({ ...CLIENT, goal: "Fat loss", level: "Intermediate", focus: "", notes: "", age: null, weightKg: null, heightCm: null, createdAt: new Date() } as never);
    await answerQuestion(context, "How is she sleeping?");
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { messages: { role: string; content: string }[] };
    const text = sent.messages.find((m) => m.role === "user")!.content;
    expect(text).toContain("7-day sleep average: 5.5 h (2 nights logged)");
    expect(text).toContain("recovery 2/5");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
