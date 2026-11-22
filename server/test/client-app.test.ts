// Prompt 79: the client's own plans (list, one, mark done) and the coach's "completed by", Prisma mocked.
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMock = vi.hoisted(() => {
  const mock: Record<string, any> = {
    client: { findUnique: vi.fn(), findFirst: vi.fn() },
    assignment: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  };
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(mock)));
  return mock;
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const { app } = await import("../src/app.js");
const { CLIENT_SESSION_COOKIE, signClientSession, NOT_APPROVED } = await import("../src/auth/clientSession.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");
const { CLIENT_ASSIGNMENT_SELECT, NOT_FOUND } = await import("../src/routes/clientApp.js");
const signedIn = (await import("./helpers/authedRequest.js")).default;

let status = "active";
const cookie = () => `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0)}`;
const PLAN = { id: "a1", type: "Workout", title: "Legs", details: "1. Back Squat — 4 sets × 6 reps · Rest 120s", reasoning: "Build base", status: "Active", date: "2026-11-12", completedAt: null, completedBy: null, clientEffort: null, clientNote: "" };

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  status = "active";
  prismaMock.client.findUnique.mockImplementation(async () => ({ clientSessionVersion: 0, passwordHash: "$2b$x", joinStatus: status }));
  prismaMock.assignment.findMany.mockResolvedValue([PLAN]);
  prismaMock.assignment.findFirst.mockResolvedValue(PLAN);
  prismaMock.assignment.updateMany.mockResolvedValue({ count: 1 });
});

const get = (url: string) => supertest(app).get(url).set("Cookie", cookie());
const done = (id: string, body: unknown) => supertest(app).post(`/api/client-auth/my-assignments/${id}/done`).set("Cookie", cookie()).send(body as object);

describe("GET /api/client-auth/my-assignments", () => {
  it("returns only this client's Active and Done plans in the window, without coach-only fields", async () => {
    const res = await get("/api/client-auth/my-assignments?from=2026-11-10&to=2026-11-16");
    expect(res.status).toBe(200);
    const args = prismaMock.assignment.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ clientId: "c1", status: { in: ["Active", "Done"] }, date: { gte: "2026-11-10", lte: "2026-11-16" } });
    expect(args.select).toEqual(CLIENT_ASSIGNMENT_SELECT);
    expect(Object.keys(CLIENT_ASSIGNMENT_SELECT)).not.toContain("coachId");
    expect(Object.keys(CLIENT_ASSIGNMENT_SELECT)).not.toContain("source");
  });

  it.each([
    ["?from=2026-11-10", "from and to must be real dates in YYYY-MM-DD form."],
    ["?from=2026-02-30&to=2026-03-01", "from and to must be real dates in YYYY-MM-DD form."],
    ["?from=2026-11-16&to=2026-11-10", "from must not be after to."],
    ["?from=2026-01-01&to=2026-03-04", "Please ask for 62 days or fewer at a time."],
  ])("rejects %s", async (q, error) => {
    const res = await get(`/api/client-auth/my-assignments${q}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it("allows exactly 62 days", async () => {
    expect((await get("/api/client-auth/my-assignments?from=2026-01-01&to=2026-03-03")).status).toBe(200);
  });

  it("a pending client gets 403, no session gets 401, a coach session gets 401", async () => {
    status = "pending";
    const p = await get("/api/client-auth/my-assignments?from=2026-11-10&to=2026-11-16");
    expect(p.status).toBe(403);
    expect(p.body).toEqual({ error: NOT_APPROVED });
    expect((await supertest(app).get("/api/client-auth/my-assignments?from=2026-11-10&to=2026-11-16")).status).toBe(401);
    expect((await signedIn(app).get("/api/client-auth/my-assignments?from=2026-11-10&to=2026-11-16")).status).toBe(401);
  });
});

describe("GET /api/client-auth/my-assignments/:id", () => {
  it("looks only among this client's own non-Paused plans", async () => {
    await get("/api/client-auth/my-assignments/a1");
    expect(prismaMock.assignment.findFirst.mock.calls[0][0].where).toEqual({ id: "a1", clientId: "c1", status: { in: ["Active", "Done"] } });
  });
  it("another client's (or a Paused) plan is a plain 404", async () => {
    prismaMock.assignment.findFirst.mockResolvedValue(null);
    const res = await get("/api/client-auth/my-assignments/someone-elses");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: NOT_FOUND });
  });
});

describe("POST /api/client-auth/my-assignments/:id/done", () => {
  it("marks done with effort and note, as the client, only on their own not-Paused plan", async () => {
    const res = await done("a1", { done: true, effort: 7, note: "  felt strong " });
    expect(res.status).toBe(200);
    const { where, data } = prismaMock.assignment.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "a1", clientId: "c1", status: "Active" });
    expect(data).toMatchObject({ status: "Done", completedBy: "client", clientEffort: 7, clientNote: "felt strong" });
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it("an already-Done plan (e.g. the coach did it) is returned unchanged", async () => {
    prismaMock.assignment.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.assignment.findFirst.mockResolvedValue({ ...PLAN, status: "Done", completedBy: "coach" });
    const res = await done("a1", { done: true, effort: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "Done", completedBy: "coach" });
    expect(prismaMock.assignment.findFirst.mock.calls[0][0].where).toEqual({ id: "a1", clientId: "c1", status: "Done" });
  });

  it("undoing clears the completion, effort, note and per-set log", async () => {
    await done("a1", { done: false });
    expect(prismaMock.assignment.updateMany.mock.calls[0][0].where).toEqual({ id: "a1", clientId: "c1", status: { in: ["Active", "Done"] } });
    expect(prismaMock.assignment.updateMany.mock.calls[0][0].data).toEqual({
      status: "Active", completedAt: null, completedBy: null, clientEffort: null, clientNote: "", clientSetLog: Prisma.DbNull,
    });
  });

  it("another client's or a Paused plan: 404 and nothing else", async () => {
    prismaMock.assignment.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.assignment.findFirst.mockResolvedValue(null);
    const res = await done("not-mine", { done: true });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: NOT_FOUND });
  });

  it.each([
    [{}, "done must be true or false."],
    [{ done: "yes" }, "done must be true or false."],
    [{ done: true, effort: 11 }, "Effort must be a whole number from 1 to 10."],
    [{ done: true, effort: 6.5 }, "Effort must be a whole number from 1 to 10."],
    [{ done: true, note: "x".repeat(501) }, "Please keep the note under 500 characters."],
    [{ done: true, title: "Easy day" }, "Only done, effort, note and setLog can be sent."],
    [{ done: true, status: "Paused" }, "Only done, effort, note and setLog can be sent."],
    [{ done: true, details: "nothing" }, "Only done, effort, note and setLog can be sent."],
  ])("rejects %j (a client can never edit the plan itself)", async (body, error) => {
    const res = await done("a1", body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(prismaMock.assignment.updateMany).not.toHaveBeenCalled();
  });

  // Nov 2026 in-workout logging: the per-set log is stored so the coach sees what was lifted.
  const setLog = {
    exercises: [
      {
        seq: 1,
        name: "Back Squat",
        plannedSets: 2,
        plannedReps: "6",
        plannedWeightKg: 60,
        sets: [
          { done: true, reps: "6", weightKg: 60 },
          { done: true, reps: "5", weightKg: 62.5 },
        ],
      },
    ],
  };

  it("stores the per-set log when the client finishes", async () => {
    const res = await done("a1", { done: true, effort: 8, setLog });
    expect(res.status).toBe(200);
    expect(prismaMock.assignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientSetLog: setLog }) }),
    );
  });

  it("clears the per-set log when the client un-finishes", async () => {
    await done("a1", { done: false });
    const { data } = prismaMock.assignment.updateMany.mock.calls[0][0];
    // Prisma needs DbNull (not null) to write SQL NULL into a nullable Json column.
    expect(data.clientSetLog).not.toBeNull();
    expect(String(data.clientSetLog)).toContain("DbNull");
  });

  it.each([
    [{ done: true, setLog: { exercises: [{ ...setLog.exercises[0], sets: new Array(31).fill({ done: true, reps: "6", weightKg: 60 }) }] } }, "Please log 30 sets or fewer per exercise."],
    [{ done: true, setLog: { exercises: new Array(41).fill(setLog.exercises[0]) } }, "Please log 40 exercises or fewer."],
    [{ done: true, setLog: { exercises: [{ ...setLog.exercises[0], sets: [{ done: true, reps: "6", weightKg: 1001 }] }] } }, "Logged weight must be between 0 and 1000 kg."],
  ])("rejects an oversized or out-of-range log", async (body, error) => {
    const res = await done("a1", body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(prismaMock.assignment.updateMany).not.toHaveBeenCalled();
  });

  it("a pending client cannot mark anything", async () => {
    status = "pending";
    expect((await done("a1", { done: true })).status).toBe(403);
    expect(prismaMock.assignment.updateMany).not.toHaveBeenCalled();
  });
});

describe("the coach's status change records who completed it", () => {
  beforeEach(() => {
    prismaMock.client.findFirst.mockResolvedValue({ id: "c1", coachId: "coach-1" });
    prismaMock.assignment.update.mockImplementation(async ({ data }: { data: object }) => ({ ...PLAN, ...data }));
  });
  it("Done by the coach -> completedBy coach", async () => {
    prismaMock.assignment.findFirst.mockResolvedValue({ ...PLAN, status: "Active" });
    await signedIn(app).patch("/api/clients/c1/assignments/a1").send({ status: "Done" });
    const data = prismaMock.assignment.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "Done", completedBy: "coach" });
    expect(data.completedAt).toBeInstanceOf(Date);
  });
  it("re-marking an already-Done plan keeps the client's completion", async () => {
    prismaMock.assignment.findFirst.mockResolvedValue({ ...PLAN, status: "Done", completedBy: "client" });
    await signedIn(app).patch("/api/clients/c1/assignments/a1").send({ status: "Done" });
    expect(prismaMock.assignment.update.mock.calls[0][0].data).toEqual({ status: "Done" });
  });
  it("Active or Paused clears who / when", async () => {
    prismaMock.assignment.findFirst.mockResolvedValue({ ...PLAN, status: "Done", completedBy: "client" });
    await signedIn(app).patch("/api/clients/c1/assignments/a1").send({ status: "Paused" });
    expect(prismaMock.assignment.update.mock.calls[0][0].data).toEqual({ status: "Paused", completedAt: null, completedBy: null, clientEffort: null, clientNote: "", clientSetLog: Prisma.DbNull });
  });
});
