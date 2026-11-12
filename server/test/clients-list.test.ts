// GET /api/clients adds each client's last check-in day and recent adherence for the client cards,
// from grouped queries over the whole roster (never one query per client). Prisma mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  dailyCheckIn: { groupBy: vi.fn() },
  progressLog: { groupBy: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const { app } = await import("../src/app.js");
const { ADHERENCE_CARD_DAYS } = await import("../src/routes/clients.js");
const request = (await import("./helpers/authedRequest.js")).default;

const client = (id: string) => ({ id, coachId: "coach-1", name: id, joinStatus: "active", createdAt: new Date("2026-10-01") });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findMany.mockResolvedValue([client("c1"), client("c2"), client("c3")]);
  prismaMock.dailyCheckIn.groupBy.mockResolvedValue([
    { clientId: "c1", _max: { date: "2026-11-10" } },
    { clientId: "c2", _max: { date: "2026-11-01" } },
  ]);
  // Two progressLog.groupBy calls: last log date per client, then average adherence in the window.
  prismaMock.progressLog.groupBy.mockImplementation(async (args: { _max?: unknown; _avg?: unknown }) =>
    args._max
      ? [
          { clientId: "c1", _max: { date: "2026-11-08" } },
          { clientId: "c2", _max: { date: "2026-11-05" } },
        ]
      : [{ clientId: "c1", _avg: { adherence: 81.6 } }],
  );
});

describe("GET /api/clients card fields", () => {
  it("adds lastCheckIn (newest of daily check-in and progress log) and rounded adherence; null when none", async () => {
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string; lastCheckIn: string | null; adherence: number | null }) => [c.id, c.lastCheckIn, c.adherence])).toEqual([
      ["c1", "2026-11-10", 82],
      ["c2", "2026-11-05", null],
      ["c3", null, null],
    ]);
  });

  it("uses three grouped queries scoped to this coach and these clients, whatever the roster size", async () => {
    await request(app).get("/api/clients");
    expect(prismaMock.dailyCheckIn.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.progressLog.groupBy).toHaveBeenCalledTimes(2);
    const daily = prismaMock.dailyCheckIn.groupBy.mock.calls[0][0];
    expect(daily.by).toEqual(["clientId"]);
    expect(daily.where).toEqual({ coachId: "coach-1", clientId: { in: ["c1", "c2", "c3"] } });
    const avg = prismaMock.progressLog.groupBy.mock.calls.map((c) => c[0]).find((a) => a._avg);
    const since = new Date(Date.now() - ADHERENCE_CARD_DAYS * 86_400_000).toISOString().slice(0, 10);
    expect(avg.where).toEqual({ coachId: "coach-1", clientId: { in: ["c1", "c2", "c3"] }, adherence: { not: null }, date: { gte: since } });
  });

  it("an empty roster runs no extra queries", async () => {
    prismaMock.client.findMany.mockResolvedValue([]);
    const res = await request(app).get("/api/clients");
    expect(res.body).toEqual([]);
    expect(prismaMock.dailyCheckIn.groupBy).not.toHaveBeenCalled();
    expect(prismaMock.progressLog.groupBy).not.toHaveBeenCalled();
  });
});
