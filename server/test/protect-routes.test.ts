// Prompt 45: every v1 route needs a signed-in coach and is scoped to that coach. Prisma is mocked.
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    assignment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    chatMessage: { findMany: vi.fn(), create: vi.fn() },
    progressLog: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    lead: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";
import { asCoach } from "./helpers/authedRequest.js";

const PROTECTED: [method: "get" | "post" | "patch" | "delete", path: string][] = [
  ["get", "/api/clients"],
  ["post", "/api/clients"],
  ["get", "/api/clients/c1"],
  ["delete", "/api/clients/c1"],
  ["get", "/api/clients/c1/assignments"],
  ["post", "/api/clients/c1/assignments"],
  ["patch", "/api/clients/c1/assignments/a1"],
  ["delete", "/api/clients/c1/assignments/a1"],
  ["get", "/api/clients/c1/chat"],
  ["post", "/api/clients/c1/chat"],
  ["post", "/api/clients/c1/auto-assign"],
  ["get", "/api/clients/c1/progress"],
  ["post", "/api/clients/c1/progress"],
  ["delete", "/api/clients/c1/progress/p1"],
  ["post", "/api/seed/demo"],
  ["post", "/api/seed/six-month-demo"],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signed-out requests", () => {
  it.each(PROTECTED)("%s %s returns 401 and touches no data", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "You are not signed in." });
    for (const table of [prisma.client, prisma.assignment, prisma.chatMessage, prisma.progressLog]) {
      for (const fn of Object.values(table)) expect(fn).not.toHaveBeenCalled();
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("a tampered session cookie is also 401", async () => {
    const res = await request(app).get("/api/clients").set("Cookie", "repsy_session=abc.def.ghi");
    expect(res.status).toBe(401);
  });

  it("an unknown /api route is still the reserved 404 Not found when signed out", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});

describe("public routes stay public", () => {
  it("GET /api/health needs no sign-in", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("POST /api/leads needs no sign-in", async () => {
    prisma.lead.create.mockResolvedValue({ id: "l1", name: "Ana", email: "ana@example.com", createdAt: new Date() });
    const res = await request(app).post("/api/leads").send({ name: "Ana", email: "ana@example.com" });
    expect(res.status).toBe(201);
  });

  it("GET /api/auth/me answers 401 itself (not blocked by the route guard)", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "You are not signed in." });
  });
});

describe("queries are scoped to the signed-in coach", () => {
  it("lists, reads and deletes only inside coach-A's account", async () => {
    prisma.client.findMany.mockResolvedValue([]);
    prisma.client.findFirst.mockResolvedValue(null);
    prisma.client.deleteMany.mockResolvedValue({ count: 0 });
    const a = asCoach(app, "coach-A");

    await a.get("/api/clients");
    expect(prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { coachId: "coach-A" } }));

    const read = await a.get("/api/clients/b-client");
    expect(read.status).toBe(404);
    expect(read.body).toEqual({ error: "Client not found" });
    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: "b-client", coachId: "coach-A" } });

    const del = await a.delete("/api/clients/b-client");
    expect(del.status).toBe(404);
    expect(del.body).toEqual({ error: "Client not found" });
    expect(prisma.client.deleteMany).toHaveBeenCalledWith({ where: { id: "b-client", coachId: "coach-A" } });
  });

  it("creates a client owned by the signed-in coach", async () => {
    prisma.client.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "n1", ...data }));
    const res = await asCoach(app, "coach-A").post("/api/clients").send({ name: "New", coachId: "coach-B" });
    expect(res.status).toBe(201);
    expect(prisma.client.create.mock.calls[0][0].data).toMatchObject({ name: "New", coachId: "coach-A" });
  });

  it("another coach's client gives 404 on every nested route", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const a = asCoach(app, "coach-A");
    const body = { type: "Workout", title: "t", details: "d", date: "2026-11-10", question: "hi" };
    const calls = [
      a.get("/api/clients/b/assignments"),
      a.post("/api/clients/b/assignments").send(body),
      a.patch("/api/clients/b/assignments/x").send({ status: "Done" }),
      a.delete("/api/clients/b/assignments/x"),
      a.get("/api/clients/b/chat"),
      a.post("/api/clients/b/chat").send(body),
      a.post("/api/clients/b/auto-assign").send({ type: "Workout" }),
      a.get("/api/clients/b/progress"),
      a.post("/api/clients/b/progress").send({ date: "2026-11-10" }),
      a.delete("/api/clients/b/progress/x"),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Client not found" });
    }
    expect(prisma.assignment.create).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(prisma.progressLog.create).not.toHaveBeenCalled();
  });
});
