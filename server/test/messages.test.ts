// Prompt 63: coach <-> client messages (mocked database).
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
  threadMessage: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;
const { DELETE_NOT_YOURS, DELETE_TOO_LATE, MESSAGE_PAGE_SIZE } = await import("../src/routes/messages.js");

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel" };
const message = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  coachId: "coach-1",
  clientId: "c1",
  sender: "coach",
  body: "Hi Maya",
  createdAt: new Date(),
  readAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.threadMessage.findMany.mockResolvedValue([]);
  prismaMock.threadMessage.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.threadMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(message(data)));
  prismaMock.threadMessage.delete.mockResolvedValue(message());
});

describe("GET /api/clients/:clientId/messages", () => {
  it("returns the newest page oldest -> newest, scoped to this client AND coach", async () => {
    prismaMock.threadMessage.findMany.mockResolvedValue([
      message({ id: "m2", sender: "client", body: "Done!", createdAt: new Date("2026-11-11T10:00:00Z") }),
      message({ id: "m1", body: "How was the session?", createdAt: new Date("2026-11-11T09:00:00Z") }),
    ]);
    const res = await request(app).get("/api/clients/c1/messages");
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m2"]);
    expect(res.body.hasMore).toBe(false);
    expect(prismaMock.threadMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "c1", coachId: "coach-1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MESSAGE_PAGE_SIZE + 1,
      }),
    );
  });

  it("pages by 50 and says when there is more", async () => {
    const page = Array.from({ length: MESSAGE_PAGE_SIZE + 1 }, (_, i) => message({ id: `m${i}` }));
    prismaMock.threadMessage.findMany.mockResolvedValue(page);
    const res = await request(app).get("/api/clients/c1/messages");
    expect(res.body.messages).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(res.body.hasMore).toBe(true);

    await request(app).get("/api/clients/c1/messages?before=2026-11-11T09:00:00.000Z");
    expect(prismaMock.threadMessage.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { clientId: "c1", coachId: "coach-1", createdAt: { lt: new Date("2026-11-11T09:00:00.000Z") } } }),
    );
    expect((await request(app).get("/api/clients/c1/messages?before=yesterday")).status).toBe(400);
  });

  it("opening the thread marks the client's unread messages read (coach side only)", async () => {
    prismaMock.threadMessage.findMany.mockResolvedValue([message({ id: "m2", sender: "client", readAt: null })]);
    const res = await request(app).get("/api/clients/c1/messages");
    expect(prismaMock.threadMessage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m2"] }, clientId: "c1", coachId: "coach-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(res.body.messages[0].readAt).not.toBeNull();
  });

  it("marks only what it shows: nothing to mark means no write", async () => {
    prismaMock.threadMessage.findMany.mockResolvedValue([message({ id: "m1", sender: "coach" })]);
    await request(app).get("/api/clients/c1/messages");
    expect(prismaMock.threadMessage.updateMany).not.toHaveBeenCalled();
  });

  it("an older page does not mark anything read", async () => {
    await request(app).get("/api/clients/c1/messages?before=2026-11-11T09:00:00.000Z");
    expect(prismaMock.threadMessage.updateMany).not.toHaveBeenCalled();
  });

  it("another coach's client is 404; signed out is 401", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/clients/c-other/messages");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect(prismaMock.threadMessage.findMany).not.toHaveBeenCalled();
    expect((await supertest(app).get("/api/clients/c1/messages")).status).toBe(401);
    expect((await supertest(app).post("/api/clients/c1/messages").send({ body: "x" })).status).toBe(401);
    expect((await supertest(app).delete("/api/clients/c1/messages/m1")).status).toBe(401);
  });
});

describe("POST /api/clients/:clientId/messages", () => {
  it("saves a coach message (201), trimmed, plain text as written", async () => {
    const res = await request(app).post("/api/clients/c1/messages").send({ body: "  <b>Great work</b> today  " });
    expect(res.status).toBe(201);
    expect(prismaMock.threadMessage.create).toHaveBeenCalledWith({
      data: { clientId: "c1", coachId: "coach-1", sender: "coach", body: "<b>Great work</b> today" },
    });
  });

  it("refuses empty or too-long messages in plain words", async () => {
    expect((await request(app).post("/api/clients/c1/messages").send({ body: "   " })).body).toEqual({ error: "Write a message first." });
    expect((await request(app).post("/api/clients/c1/messages").send({})).body).toEqual({ error: "Write a message first." });
    const long = await request(app).post("/api/clients/c1/messages").send({ body: "x".repeat(2001) });
    expect(long.status).toBe(400);
    expect(long.body).toEqual({ error: "Messages can be up to 2000 characters." });
    expect(prismaMock.threadMessage.create).not.toHaveBeenCalled();
  });

  it("cannot be sent to another coach's client", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    expect((await request(app).post("/api/clients/c-other/messages").send({ body: "hi" })).status).toBe(404);
    expect(prismaMock.threadMessage.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/clients/:clientId/messages/:messageId", () => {
  it("deletes the coach's own message within 15 minutes (204)", async () => {
    prismaMock.threadMessage.findFirst.mockResolvedValue(message({ createdAt: new Date(Date.now() - 14 * 60 * 1000) }));
    const res = await request(app).delete("/api/clients/c1/messages/m1");
    expect(res.status).toBe(204);
    expect(prismaMock.threadMessage.findFirst).toHaveBeenCalledWith({ where: { id: "m1", clientId: "c1", coachId: "coach-1" } });
    expect(prismaMock.threadMessage.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });

  it("after 15 minutes the delete is refused in plain words and nothing is deleted", async () => {
    prismaMock.threadMessage.findFirst.mockResolvedValue(message({ createdAt: new Date(Date.now() - 16 * 60 * 1000) }));
    const res = await request(app).delete("/api/clients/c1/messages/m1");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: DELETE_TOO_LATE });
    expect(DELETE_TOO_LATE).toBe("Messages can only be deleted within 15 minutes of sending.");
    expect(prismaMock.threadMessage.delete).not.toHaveBeenCalled();
  });

  it("a client's message cannot be deleted by the coach", async () => {
    prismaMock.threadMessage.findFirst.mockResolvedValue(message({ sender: "client" }));
    const res = await request(app).delete("/api/clients/c1/messages/m1");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: DELETE_NOT_YOURS });
    expect(prismaMock.threadMessage.delete).not.toHaveBeenCalled();
  });

  it("a message from another thread is 404", async () => {
    prismaMock.threadMessage.findFirst.mockResolvedValue(null);
    const res = await request(app).delete("/api/clients/c1/messages/m-elsewhere");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Message not found" });
  });
});
