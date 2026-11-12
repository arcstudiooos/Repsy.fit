// Today's Tasks (Prompt 48). Prisma is mocked, so these run without a database.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import plainRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findMany: vi.fn() },
    assignment: { findMany: vi.fn() },
    // Prompt 69: today's appointments are the first rows.
    appointment: { findMany: vi.fn() },
  },
}));

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

const maya = { id: "c-maya", name: "Maya Patel" };
const leo = { id: "c-leo", name: "Leo Brooks" };
const sam = { id: "c-sam", name: "Sam Ortiz" };

const row = (clientId: string, date: string, extra: Record<string, unknown> = {}) => ({
  id: `a-${clientId}-${date}`,
  clientId,
  type: "Workout",
  title: "Squat day",
  status: "Active",
  date,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.client.findMany.mockResolvedValue([maya, leo, sam]);
  prisma.assignment.findMany.mockResolvedValue([]);
  prisma.appointment.findMany.mockResolvedValue([]);
});

describe("GET /api/tasks/today", () => {
  it("needs a signed-in coach", async () => {
    const res = await plainRequest(app).get("/api/tasks/today");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "You are not signed in." });
  });

  it("scopes every query to the signed-in coach", async () => {
    await request(app).get("/api/tasks/today?date=2026-11-11");
    expect(prisma.client.findMany.mock.calls[0][0].where).toEqual({ coachId: TEST_COACH_ID, joinStatus: "active" });
    expect(prisma.assignment.findMany.mock.calls[0][0].where).toMatchObject({ coachId: TEST_COACH_ID });
  });

  it("lists active assignments dated today as 'due' tasks and clients idle 7+ days as 'idle' tasks", async () => {
    prisma.assignment.findMany.mockResolvedValue([
      row("c-maya", "2026-11-11", { title: "Squat day" }),
      row("c-leo", "2026-11-04"), // exactly 7 days ago -> Leo is idle
      row("c-leo", "2026-10-20"),
      row("c-sam", "2026-11-08"), // 3 days ago -> not idle
    ]);
    const res = await request(app).get("/api/tasks/today?date=2026-11-11");

    expect(res.status).toBe(200);
    expect(res.body.date).toBe("2026-11-11");
    expect(res.body.tasks).toEqual([
      expect.objectContaining({ kind: "due", clientId: "c-maya", clientName: "Maya Patel", assignmentId: "a-c-maya-2026-11-11", assignmentType: "Workout" }),
      expect.objectContaining({ kind: "idle", clientId: "c-leo", clientName: "Leo Brooks", daysSince: 7 }),
    ]);
    expect(res.body.tasks[0].text).toContain("Squat day");
    expect(res.body.tasks[1].text).toContain("7 days");
  });

  it("flags a client with no assignment at all, and never one with a plan scheduled ahead", async () => {
    prisma.assignment.findMany.mockResolvedValue([row("c-leo", "2026-11-20"), row("c-sam", "2026-11-10")]);
    const res = await request(app).get("/api/tasks/today?date=2026-11-11");
    expect(res.body.tasks).toEqual([
      expect.objectContaining({ kind: "idle", clientId: "c-maya", daysSince: null }),
    ]);
    expect(res.body.tasks[0].text).toContain("No assignment yet");
  });

  it("does not list Done or Paused assignments as due", async () => {
    prisma.assignment.findMany.mockResolvedValue([
      row("c-maya", "2026-11-11", { status: "Done" }),
      row("c-leo", "2026-11-11", { status: "Paused" }),
      row("c-sam", "2026-11-11"),
    ]);
    const res = await request(app).get("/api/tasks/today?date=2026-11-11");
    const due = res.body.tasks.filter((t: { kind: string }) => t.kind === "due");
    expect(due.map((t: { clientId: string }) => t.clientId)).toEqual(["c-sam"]);
  });

  it("returns an empty list when nothing is due", async () => {
    prisma.assignment.findMany.mockResolvedValue([row("c-maya", "2026-11-10"), row("c-leo", "2026-11-09"), row("c-sam", "2026-11-08")]);
    const res = await request(app).get("/api/tasks/today?date=2026-11-11");
    expect(res.body).toEqual({ date: "2026-11-11", tasks: [] });
  });

  it("defaults the date to today (UTC) and rejects a bad date", async () => {
    const ok = await request(app).get("/api/tasks/today");
    expect(ok.status).toBe(200);
    expect(ok.body.date).toBe(new Date().toISOString().slice(0, 10));
    const bad = await request(app).get("/api/tasks/today?date=2026-02-30");
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: expect.any(String) });
  });
});
