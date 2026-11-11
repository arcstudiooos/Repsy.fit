// Prompt 52: the review queue. Approve turns a parked suggestion into a real assignment;
// Dismiss keeps the row as history. Nothing is decided automatically and nothing is deleted.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
  reviewItem: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  assignment: { create: vi.fn() },
  progressLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const { cookieFor } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  clientId: "c1",
  kind: "suggestion",
  status: "Pending",
  title: "Lower-body strength day",
  summary: "Adherence is climbing",
  type: "Workout",
  details: "1. Back Squat - 4 sets x 6 reps",
  reasoning: "Adherence is climbing",
  assignmentId: null,
  createdAt: new Date("2026-11-11T09:00:00.000Z"),
  decidedAt: null,
  client: { name: "Maya Patel" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
  prismaMock.client.findFirst.mockResolvedValue({ id: "c1" });
  prismaMock.reviewItem.count.mockResolvedValue(1);
  prismaMock.reviewItem.findMany.mockResolvedValue([row()]);
  prismaMock.reviewItem.findFirst.mockResolvedValue(row());
  prismaMock.reviewItem.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(row(data)));
  prismaMock.reviewItem.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(row(data)));
  prismaMock.assignment.create.mockResolvedValue({ id: "a1", clientId: "c1", type: "Workout", title: "Lower-body strength day", status: "Active" });
});

describe("GET /api/review-queue", () => {
  it("lists this coach's pending items with the client, type, summary and date, plus the badge count", async () => {
    const res = await request(app).get("/api/review-queue");
    expect(res.status).toBe(200);
    expect(res.body.pendingCount).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      id: "r1",
      clientName: "Maya Patel",
      kind: "suggestion",
      type: "Workout",
      title: "Lower-body strength day",
      summary: "Adherence is climbing",
      status: "Pending",
      createdAt: "2026-11-11T09:00:00.000Z",
    });
    expect(prismaMock.reviewItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { coachId: "coach-1", status: "Pending" } }));
    expect(prismaMock.reviewItem.count).toHaveBeenCalledWith({ where: { coachId: "coach-1", status: "Pending" } });
  });

  it("status=decided returns the kept history (approved and dismissed)", async () => {
    await request(app).get("/api/review-queue?status=decided");
    expect(prismaMock.reviewItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { coachId: "coach-1", status: { in: ["Approved", "Dismissed"] } } }),
    );
  });

  it("needs a signed-in coach", async () => {
    expect((await supertest(app).get("/api/review-queue")).status).toBe(401);
  });
});

describe("POST /api/review-queue", () => {
  it("parks an AI suggestion for this coach's client", async () => {
    const res = await request(app)
      .post("/api/review-queue")
      .send({ clientId: "c1", kind: "suggestion", type: "Workout", title: "Lower-body strength day", details: "1. Back Squat", reasoning: "why" });
    expect(res.status).toBe(201);
    expect(prismaMock.reviewItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ coachId: "coach-1", clientId: "c1", kind: "suggestion", type: "Workout", title: "Lower-body strength day" }),
      }),
    );
  });

  it("404s for another coach's client, and never creates anything", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/review-queue").send({ clientId: "other", title: "x", type: "Workout" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prismaMock.reviewItem.create).not.toHaveBeenCalled();
  });

  it("a suggestion needs a type", async () => {
    const res = await request(app).post("/api/review-queue").send({ clientId: "c1", title: "No type" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("type is required for a suggestion.");
  });
});

describe("approve and dismiss", () => {
  it("approving a suggestion creates the real assignment and marks the item Approved", async () => {
    const res = await request(app).post("/api/review-queue/r1/approve").send({ date: "2026-11-11" });
    expect(res.status).toBe(200);
    expect(prismaMock.assignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coachId: "coach-1",
        clientId: "c1",
        type: "Workout",
        title: "Lower-body strength day",
        source: "ai",
        status: "Active",
        date: "2026-11-11",
      }),
    });
    expect(prismaMock.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r1" }, data: expect.objectContaining({ status: "Approved", assignmentId: "a1" }) }),
    );
    expect(res.body.assignment).toMatchObject({ id: "a1" });
  });

  it("approving a flagged check-in marks it read and creates no assignment", async () => {
    prismaMock.reviewItem.findFirst.mockResolvedValue(row({ kind: "checkin", type: null, title: "Check-in 2026-11-10" }));
    const res = await request(app).post("/api/review-queue/r1/approve").send({});
    expect(res.status).toBe(200);
    expect(prismaMock.assignment.create).not.toHaveBeenCalled();
    expect(res.body.assignment).toBeNull();
  });

  it("dismissing keeps the row (history) and creates nothing", async () => {
    const res = await request(app).post("/api/review-queue/r1/dismiss");
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe("Dismissed");
    expect(prismaMock.assignment.create).not.toHaveBeenCalled();
    expect(prismaMock.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "Dismissed" }) }),
    );
  });

  it("another coach's item, or one already decided, is 404 and changes nothing", async () => {
    prismaMock.reviewItem.findFirst.mockResolvedValue(null);
    for (const path of ["/api/review-queue/r1/approve", "/api/review-queue/r1/dismiss"]) {
      const res = await request(app).post(path).send({});
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Review item not found" });
    }
    expect(prismaMock.reviewItem.update).not.toHaveBeenCalled();
    expect(prismaMock.assignment.create).not.toHaveBeenCalled();
  });

  it("only looks for items that belong to the signed-in coach", async () => {
    await supertest(app).post("/api/review-queue/r1/approve").set("Cookie", cookieFor("coach-2")).send({});
    expect(prismaMock.reviewItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r1", coachId: "coach-2", status: "Pending" } }),
    );
  });
});

describe("new progress logs are flagged for review", () => {
  it("adding a check-in creates one Pending review item for that client", async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: "c1", coachId: "coach-1", name: "Maya Patel" });
    prismaMock.progressLog.create.mockResolvedValue({ id: "p1", clientId: "c1", date: "2026-11-10", weightKg: 70, adherence: 84, workoutsDone: 3, note: "" });
    const res = await request(app).post("/api/clients/c1/progress").send({ date: "2026-11-10", weightKg: 70, adherence: 84, workoutsDone: 3 });
    expect(res.status).toBe(201);
    expect(prismaMock.reviewItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coachId: "coach-1",
        clientId: "c1",
        kind: "checkin",
        title: "Check-in 2026-11-10",
        summary: "70 kg · 84% adherence · 3 workouts",
        sourceId: "p1",
      }),
    });
  });
});
