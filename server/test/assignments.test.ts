// Assignments create + list (Prompt 17). Prisma is mocked, so these run without a database.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findFirst: vi.fn() },
    assignment: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

const client = { id: "client-1", coachId: TEST_COACH_ID, name: "Maya Patel" };

const aiBody = {
  type: "Workout",
  title: "Lower-body strength session",
  details: "Back squat 4x6",
  reasoning: "Builds the lower-body strength Maya is focusing on.",
  source: "ai",
  date: "2026-11-10",
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.client.findFirst.mockResolvedValue(client);
  prisma.assignment.findMany.mockResolvedValue([]);
  prisma.assignment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "assignment-1",
    reasoning: "",
    source: "manual",
    status: "Active",
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    ...data,
  }));
});

describe("POST /api/clients/:clientId/assignments", () => {
  it("saves an AI suggestion for this client and coach, status Active, and returns the full record", async () => {
    const res = await request(app).post(`/api/clients/${client.id}/assignments`).send(aiBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "assignment-1", ...aiBody, clientId: client.id, coachId: TEST_COACH_ID, status: "Active" });
    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: client.id, coachId: TEST_COACH_ID } });
    expect(prisma.assignment.create).toHaveBeenCalledOnce();
    expect(prisma.assignment.create.mock.calls[0][0].data).toEqual({
      ...aiBody,
      status: "Active",
      clientId: client.id,
      coachId: TEST_COACH_ID,
    });
  });

  it("defaults reasoning to empty, source to manual and date to today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .post(`/api/clients/${client.id}/assignments`)
      .send({ type: "Habit", title: "Walk daily", details: "10k steps" });

    expect(res.status).toBe(201);
    expect(prisma.assignment.create.mock.calls[0][0].data).toMatchObject({
      reasoning: "",
      source: "manual",
      status: "Active",
      date: today,
    });
  });

  it.each([
    ["missing type", { ...aiBody, type: undefined }],
    ["unknown type", { ...aiBody, type: "Cardio" }],
    ["empty title", { ...aiBody, title: "  " }],
    ["empty details", { ...aiBody, details: "" }],
    ["unknown source", { ...aiBody, source: "robot" }],
    ["bad date", { ...aiBody, date: "10/11/2026" }],
    ["impossible date", { ...aiBody, date: "2026-02-30" }],
  ])("rejects %s with 400 and saves nothing", async (_label, body) => {
    const res = await request(app).post(`/api/clients/${client.id}/assignments`).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  it("ignores a coachId or clientId sent in the body", async () => {
    await request(app)
      .post(`/api/clients/${client.id}/assignments`)
      .send({ ...aiBody, coachId: "other-coach", clientId: "other-client" });
    expect(prisma.assignment.create.mock.calls[0][0].data).toMatchObject({
      clientId: client.id,
      coachId: TEST_COACH_ID,
    });
  });

  it("returns 404 Client not found for an unknown client and saves nothing", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/clients/missing/assignments").send(aiBody);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/clients/:clientId/assignments", () => {
  it("lists only this client's assignments, newest first", async () => {
    const rows = [{ id: "a2" }, { id: "a1" }];
    prisma.assignment.findMany.mockResolvedValue(rows);

    const res = await request(app).get(`/api/clients/${client.id}/assignments`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(prisma.assignment.findMany).toHaveBeenCalledWith({
      where: { clientId: client.id, coachId: TEST_COACH_ID },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });

  it("returns 404 Client not found for an unknown client", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/clients/missing/assignments");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prisma.assignment.findMany).not.toHaveBeenCalled();
  });
});
