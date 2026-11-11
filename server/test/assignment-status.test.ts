// Assignment status change + delete (Prompt 24). Prisma is mocked, so these run without a database.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

const client = { id: "client-1", coachId: TEST_COACH_ID, name: "Maya Patel" };
const stored = {
  id: "assignment-1",
  clientId: client.id,
  coachId: TEST_COACH_ID,
  type: "Workout",
  title: "Squat day",
  details: "Back squat 4x6",
  reasoning: "",
  source: "manual",
  status: "Active",
  date: "2026-11-10",
  createdAt: new Date("2026-11-10T00:00:00.000Z"),
};
const path = `/api/clients/${client.id}/assignments/${stored.id}`;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.client.findFirst.mockResolvedValue(client);
  prisma.assignment.findFirst.mockResolvedValue(stored);
  prisma.assignment.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...stored, ...data }));
  prisma.assignment.delete.mockResolvedValue(stored);
});

describe("PATCH /api/clients/:clientId/assignments/:assignmentId", () => {
  it.each(["Done", "Paused", "Active"])("sets status %s and returns the full assignment", async (status) => {
    const res = await request(app).patch(path).send({ status });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: stored.id, clientId: client.id, status });
    expect(prisma.assignment.findFirst).toHaveBeenCalledWith({
      where: { id: stored.id, clientId: client.id, coachId: TEST_COACH_ID },
    });
    expect(prisma.assignment.update).toHaveBeenCalledWith({ where: { id: stored.id }, data: { status } });
  });

  it("changes only the status, even when other fields are sent", async () => {
    await request(app).patch(path).send({ status: "Done", title: "Hacked", clientId: "other", coachId: "other" });
    expect(prisma.assignment.update.mock.calls[0][0].data).toEqual({ status: "Done" });
  });

  it.each([
    ["missing status", {}],
    ["unknown status", { status: "Finished" }],
    ["lower-case status", { status: "done" }],
  ])("rejects %s with 400 and changes nothing", async (_label, body) => {
    const res = await request(app).patch(path).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
    expect(prisma.assignment.update).not.toHaveBeenCalled();
  });

  it("returns 404 Client not found for an unknown client", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await request(app).patch(`/api/clients/missing/assignments/${stored.id}`).send({ status: "Done" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prisma.assignment.update).not.toHaveBeenCalled();
  });

  it("returns 404 Assignment not found for an unknown id or another client's assignment", async () => {
    prisma.assignment.findFirst.mockResolvedValue(null);
    const res = await request(app).patch(`/api/clients/${client.id}/assignments/missing`).send({ status: "Done" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Assignment not found" });
    expect(prisma.assignment.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/clients/:clientId/assignments/:assignmentId", () => {
  it("deletes this client's assignment and replies 204 with no body", async () => {
    const res = await request(app).delete(path);

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(prisma.assignment.findFirst).toHaveBeenCalledWith({
      where: { id: stored.id, clientId: client.id, coachId: TEST_COACH_ID },
    });
    expect(prisma.assignment.delete).toHaveBeenCalledWith({ where: { id: stored.id } });
  });

  it("returns 404 Client not found for an unknown client", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const res = await request(app).delete(`/api/clients/missing/assignments/${stored.id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prisma.assignment.delete).not.toHaveBeenCalled();
  });

  it("returns 404 Assignment not found for an unknown id or another client's assignment", async () => {
    prisma.assignment.findFirst.mockResolvedValue(null);
    const res = await request(app).delete(`/api/clients/${client.id}/assignments/missing`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Assignment not found" });
    expect(prisma.assignment.delete).not.toHaveBeenCalled();
  });
});
