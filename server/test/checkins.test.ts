// New check-ins card (Prompt 49). Prisma is mocked, so these run without a database.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import plainRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    progressLog: { findMany: vi.fn() },
  },
}));

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

const log = (id: string, clientName: string, createdAt: Date, extra: Record<string, unknown> = {}) => ({
  id,
  clientId: `c-${clientName.toLowerCase()}`,
  client: { name: clientName },
  date: createdAt.toISOString().slice(0, 10),
  weightKg: null,
  adherence: null,
  workoutsDone: null,
  note: "",
  createdAt,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.progressLog.findMany.mockResolvedValue([]);
});

describe("GET /api/checkins/recent", () => {
  it("needs a signed-in coach", async () => {
    const res = await plainRequest(app).get("/api/checkins/recent");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "You are not signed in." });
  });

  it("reads only this coach's logs from the last 48 hours, newest first, max 8", async () => {
    const before = Date.now();
    await request(app).get("/api/checkins/recent");
    const args = prisma.progressLog.findMany.mock.calls[0][0];
    expect(args.where.coachId).toBe(TEST_COACH_ID);
    const since: Date = args.where.createdAt.gte;
    expect(Math.abs(before - since.getTime() - 48 * 3600 * 1000)).toBeLessThan(5000);
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.take).toBe(8);
  });

  it("returns one item per log with the client name and what was logged", async () => {
    const t = new Date(Date.now() - 3600 * 1000);
    prisma.progressLog.findMany.mockResolvedValue([
      log("p1", "Maya", t, { weightKg: 67.5, adherence: 90, workoutsDone: 3, note: "Felt strong" }),
    ]);
    const res = await request(app).get("/api/checkins/recent");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          kind: "progress",
          id: "p1",
          clientId: "c-maya",
          clientName: "Maya",
          createdAt: t.toISOString(),
          weightKg: 67.5,
          adherence: 90,
          workoutsDone: 3,
          note: "Felt strong",
        },
      ],
    });
  });

  it("returns an empty list when nothing is new", async () => {
    const res = await request(app).get("/api/checkins/recent");
    expect(res.body).toEqual({ items: [] });
  });
});
