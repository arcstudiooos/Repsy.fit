// Prompt 84: the coach's waiting list, approve / decline (only pending, only own clients) and Home alerts
// computed from real windows. Prisma mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  assignment: { findMany: vi.fn() },
  threadMessage: { groupBy: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const { app } = await import("../src/app.js");
const { ONLY_PENDING } = await import("../src/routes/clients.js");
const { JOINED_WINDOW_DAYS, FINISHED_WINDOW_HOURS } = await import("../src/routes/alerts.js");
const request = (await import("./helpers/authedRequest.js")).default;
import supertest from "supertest";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findMany.mockResolvedValue([]);
  prismaMock.client.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.client.findFirst.mockResolvedValue({ id: "c1" });
  prismaMock.client.findUnique.mockResolvedValue({ id: "c1", name: "Maya", loginEmail: "m@x.io", joinStatus: "active", joinedVia: "code", createdAt: new Date() });
  prismaMock.client.count.mockResolvedValue(0);
  prismaMock.assignment.findMany.mockResolvedValue([]);
  prismaMock.threadMessage.groupBy.mockResolvedValue([]);
});

describe("client lists", () => {
  it("GET /api/clients lists only active clients", async () => {
    await request(app).get("/api/clients");
    expect(prismaMock.client.findMany.mock.calls[0][0].where).toEqual({ coachId: "coach-1", joinStatus: "active" });
  });
  it("GET /api/clients/waiting lists this coach's pending first, then declined, without private fields", async () => {
    prismaMock.client.findMany.mockResolvedValue([
      { id: "d1", name: "Dee", joinStatus: "declined" },
      { id: "p1", name: "Pat", joinStatus: "pending" },
    ]);
    const res = await request(app).get("/api/clients/waiting");
    const arg = prismaMock.client.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ coachId: "coach-1", joinStatus: { in: ["pending", "declined"] } });
    expect(Object.keys(arg.select).sort()).toEqual(["createdAt", "id", "joinStatus", "joinedVia", "loginEmail", "name"]);
    expect(res.body.map((c: { id: string }) => c.id)).toEqual(["p1", "d1"]);
  });
});

describe("approve / decline", () => {
  it.each([
    ["approve", "active"],
    ["decline", "declined"],
  ])("%s moves only a pending client of this coach to %s", async (action, to) => {
    const res = await request(app).post(`/api/clients/c1/${action}`);
    expect(res.status).toBe(200);
    expect(prismaMock.client.updateMany).toHaveBeenCalledWith({ where: { id: "c1", coachId: "coach-1", joinStatus: "pending" }, data: { joinStatus: to } });
  });
  it("a client who isn't pending (already approved / declined) gets 409; another coach's client 404", async () => {
    prismaMock.client.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post("/api/clients/c1/approve");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: ONLY_PENDING });
    prismaMock.client.findFirst.mockResolvedValue(null);
    const other = await request(app).post("/api/clients/theirs/decline");
    expect(other.status).toBe(404);
    expect(prismaMock.client.findFirst).toHaveBeenLastCalledWith({ where: { id: "theirs", coachId: "coach-1" }, select: { id: true } });
  });
  it("signed out gets 401", async () => {
    expect((await supertest(app).post("/api/clients/c1/approve")).status).toBe(401);
    expect((await supertest(app).get("/api/alerts")).status).toBe(401);
  });
});

describe("GET /api/alerts", () => {
  it("uses real windows: joined with the code in 7 days, finished by the client in 24 h, unread client messages", async () => {
    const before = Date.now();
    prismaMock.client.count.mockResolvedValue(2);
    prismaMock.client.findMany
      .mockResolvedValueOnce([{ id: "c1", name: "Maya", createdAt: new Date("2026-11-11T10:00:00Z") }])
      .mockResolvedValueOnce([{ id: "c2", name: "Sam" }]);
    prismaMock.assignment.findMany.mockResolvedValue([
      { id: "a1", title: "Leg day", type: "Workout", clientEffort: 8, clientNote: "tough", completedAt: new Date("2026-11-12T08:00:00Z"), client: { id: "c1", name: "Maya" } },
    ]);
    prismaMock.threadMessage.groupBy.mockResolvedValue([{ clientId: "c2", _count: { _all: 3 } }, { clientId: "gone", _count: { _all: 1 } }]);
    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      waiting: 2,
      joined: [{ clientId: "c1", name: "Maya", at: "2026-11-11T10:00:00.000Z" }],
      finished: [{ clientId: "c1", clientName: "Maya", assignmentId: "a1", title: "Leg day", type: "Workout", effort: 8, note: "tough", at: "2026-11-12T08:00:00.000Z" }],
      unread: [{ clientId: "c2", name: "Sam", count: 3 }],
    });
    const joinedWhere = prismaMock.client.findMany.mock.calls[0][0].where;
    expect(joinedWhere).toMatchObject({ coachId: "coach-1", joinedVia: "code", joinStatus: "active" });
    expect(before - joinedWhere.createdAt.gte.getTime()).toBeGreaterThanOrEqual(JOINED_WINDOW_DAYS * 86_400_000 - 1000);
    expect(before - joinedWhere.createdAt.gte.getTime()).toBeLessThan(JOINED_WINDOW_DAYS * 86_400_000 + 1000);
    const finWhere = prismaMock.assignment.findMany.mock.calls[0][0].where;
    expect(finWhere).toMatchObject({ coachId: "coach-1", status: "Done", completedBy: "client" });
    expect(Math.abs(before - finWhere.completedAt.gte.getTime() - FINISHED_WINDOW_HOURS * 3_600_000)).toBeLessThan(1000);
    expect(prismaMock.threadMessage.groupBy.mock.calls[0][0].where).toEqual({ coachId: "coach-1", sender: "client", readAt: null });
  });
});
