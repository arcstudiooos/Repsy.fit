// Prompt 71: streaks and leaderboard. Pure rules + mocked-database routes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findMany: vi.fn(), findUnique: vi.fn() },
  dailyCheckIn: { findMany: vi.fn() },
  habit: { findMany: vi.fn() },
  assignment: { findMany: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;
const { CLIENT_SESSION_COOKIE, signClientSession } = await import("../src/auth/clientSession.js");
const { engagementFor, rankEngagement, weekBounds } = await import("../src/engagement.js");

const TODAY = "2026-11-12"; // a Thursday

const base = { clientId: "c1", clientName: "Maya", checkInDates: [] as string[], habits: [] as { doneDates: string[] }[], workoutDates: [] as string[] };

describe("weekBounds (Monday to Sunday)", () => {
  it("Thursday -> that Monday and Sunday; Sunday and Monday stay in their own week", () => {
    expect(weekBounds("2026-11-12")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(weekBounds("2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(weekBounds("2026-11-16")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
  });
});

describe("engagementFor", () => {
  it("check-in streak reuses the habit streak rule: today missing does not break it, a gap does", () => {
    expect(engagementFor({ ...base, checkInDates: ["2026-11-11", "2026-11-10", "2026-11-09"] }, TODAY).checkInStreak).toBe(3);
    expect(engagementFor({ ...base, checkInDates: ["2026-11-12", "2026-11-11", "2026-11-09"] }, TODAY).checkInStreak).toBe(2);
    expect(engagementFor({ ...base, checkInDates: ["2026-11-09"] }, TODAY).checkInStreak).toBe(0);
  });

  it("habit % = done ticks in the last 7 days / (active habits x 7), null with no habits", () => {
    const habits = [
      { doneDates: ["2026-11-12", "2026-11-11", "2026-11-10", "2026-11-06", "2026-11-05"] }, // 4 inside 06..12 (05 is outside)
      { doneDates: ["2026-11-12"] },
    ];
    expect(engagementFor({ ...base, habits }, TODAY).habitPercent).toBe(Math.round((5 / 14) * 100)); // 36
    expect(engagementFor(base, TODAY).habitPercent).toBeNull();
  });

  it("counts workouts done inside this week only", () => {
    const r = engagementFor({ ...base, workoutDates: ["2026-11-08", "2026-11-09", "2026-11-12", "2026-11-15", "2026-11-16"] }, TODAY);
    expect(r.workoutsThisWeek).toBe(3);
  });

  it("a client with no check-ins and no habit ticks has not enough data", () => {
    expect(engagementFor(base, TODAY).enoughData).toBe(false);
    expect(engagementFor({ ...base, habits: [{ doneDates: [] }] }, TODAY).enoughData).toBe(false);
    expect(engagementFor({ ...base, checkInDates: ["2026-10-01"] }, TODAY).enoughData).toBe(true);
    expect(engagementFor({ ...base, habits: [{ doneDates: ["2026-11-10"] }] }, TODAY).enoughData).toBe(true);
  });
});

describe("rankEngagement (check-in streak, then habit %, shown beside the rank)", () => {
  const row = (name: string, checkInStreak: number, habitPercent: number | null, enoughData = true) => ({
    clientId: name,
    clientName: name,
    checkInStreak,
    habitPercent,
    workoutsThisWeek: 0,
    enoughData,
  });

  it("sorts by streak, then habit %, then name; equal numbers share a rank", () => {
    const out = rankEngagement([row("Zed", 3, 50), row("Ann", 5, 10), row("Bo", 3, 80), row("Cy", 3, 50), row("Di", 3, null)]);
    expect(out.map((r) => [r.clientName, r.rank])).toEqual([
      ["Ann", 1],
      ["Bo", 2],
      ["Cy", 3],
      ["Zed", 3],
      ["Di", 5],
    ]);
  });

  it("three clients with the same numbers all share rank 1, and the next one is 4th", () => {
    const out = rankEngagement([row("Cy", 4, 60), row("Ann", 4, 60), row("Dee", 2, 90), row("Bo", 4, 60)]);
    expect(out.map((r) => [r.clientName, r.rank])).toEqual([
      ["Ann", 1],
      ["Bo", 1],
      ["Cy", 1],
      ["Dee", 4],
    ]);
    // Never the forbidden rank 0.
    expect(out.every((r) => r.rank === null || r.rank >= 1)).toBe(true);
  });

  it("clients without enough data come last, with rank null (never rank 0)", () => {
    const out = rankEngagement([row("New", 0, null, false), row("Ann", 0, 0), row("Old", 0, null, false)]);
    expect(out.map((r) => [r.clientName, r.rank])).toEqual([
      ["Ann", 1],
      ["New", null],
      ["Old", null],
    ]);
  });
});

const CLIENTS = [
  { id: "c1", name: "Maya" },
  { id: "c2", name: "Arjun" },
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findMany.mockResolvedValue(CLIENTS);
  prismaMock.dailyCheckIn.findMany.mockResolvedValue([
    { clientId: "c1", date: "2026-11-12" },
    { clientId: "c1", date: "2026-11-11" },
  ]);
  prismaMock.habit.findMany.mockResolvedValue([{ clientId: "c1", logs: [{ date: "2026-11-12" }] }]);
  prismaMock.assignment.findMany.mockResolvedValue([{ clientId: "c1", date: "2026-11-10" }]);
});

describe("GET /api/business/engagement (coach roster)", () => {
  it("needs a signed-in coach", async () => {
    expect((await supertest(app).get("/api/business/engagement")).status).toBe(401);
  });

  it("ranks this coach's clients with the three numbers beside each rank", async () => {
    const res = await request(app).get(`/api/business/engagement?date=${TODAY}`);
    expect(res.status).toBe(200);
    expect(prismaMock.client.findMany.mock.calls[0][0].where).toMatchObject({ coachId: "coach-1" });
    for (const model of [prismaMock.dailyCheckIn, prismaMock.habit, prismaMock.assignment]) {
      expect(model.findMany.mock.calls[0][0].where).toMatchObject({ coachId: "coach-1" });
    }
    expect(res.body.date).toBe(TODAY);
    expect(res.body.clients).toEqual([
      { clientId: "c1", clientName: "Maya", rank: 1, checkInStreak: 2, habitPercent: 14, workoutsThisWeek: 1, enoughData: true },
      { clientId: "c2", clientName: "Arjun", rank: null, checkInStreak: 0, habitPercent: null, workoutsThisWeek: 0, enoughData: false },
    ]);
  });

  it("400 for a bad date", async () => {
    expect((await request(app).get("/api/business/engagement?date=nope")).status).toBe(400);
  });
});

describe("GET /api/client-auth/my-streaks (the client's own numbers only)", () => {
  const cookie = `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0)}`;
  beforeEach(() => {
    prismaMock.client.findUnique.mockResolvedValue({ clientSessionVersion: 0, passwordHash: "$2b$12$x", id: "c1", name: "Maya" });
    prismaMock.client.findMany.mockResolvedValue([{ id: "c1", name: "Maya" }]);
  });

  it("needs a client session (a coach session gets 401)", async () => {
    expect((await supertest(app).get("/api/client-auth/my-streaks")).status).toBe(401);
    expect((await request(app).get("/api/client-auth/my-streaks")).status).toBe(401);
  });

  it("a live session whose client record is gone gets a plain 404, not a false 'not signed in'", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);
    const res = await supertest(app).get(`/api/client-auth/my-streaks?date=${TODAY}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Your account was not found. Please ask your coach.");
  });

  it("returns three numbers for that client only: no rank, no roster, no names", async () => {
    const res = await supertest(app).get(`/api/client-auth/my-streaks?date=${TODAY}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(prismaMock.client.findMany.mock.calls[0][0].where).toMatchObject({ id: "c1" });
    expect(prismaMock.dailyCheckIn.findMany.mock.calls[0][0].where).toMatchObject({ clientId: "c1" });
    expect(res.body).toEqual({ date: TODAY, checkInStreak: 2, habitPercent: 14, workoutsThisWeek: 1, enoughData: true });
  });
});
