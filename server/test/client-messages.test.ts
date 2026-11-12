// Prompt 82: the client's side of the coach <-> client thread. Prisma mocked.
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
  threadMessage: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const { app } = await import("../src/app.js");
const { CLIENT_SESSION_COOKIE, signClientSession } = await import("../src/auth/clientSession.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");
const { CLIENT_MESSAGES_PER_WINDOW, CLIENT_THREAD_SIZE, NO_COACH, TOO_FAST } = await import("../src/routes/clientMessages.js");
const signedIn = (await import("./helpers/authedRequest.js")).default;

let status = "active";
let coachId: string | null = "coach-1";
const cookie = () => `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0)}`;
const as = (m: "get" | "post", url: string) => (supertest(app) as any)[m](url).set("Cookie", cookie());
const msg = (id: string, sender: "coach" | "client", readAt: Date | null = null) => ({ id, sender, body: `m ${id}`, createdAt: new Date(Date.UTC(2026, 10, 12, 9, Number(id))), readAt });

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  status = "active";
  coachId = "coach-1";
  prismaMock.client.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
    select?.clientSessionVersion ? { clientSessionVersion: 0, passwordHash: "$2b$x", joinStatus: status } : { id: "c1", coachId },
  );
  prismaMock.threadMessage.findMany.mockResolvedValue([]);
  prismaMock.threadMessage.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.threadMessage.count.mockResolvedValue(0);
  prismaMock.threadMessage.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "new", createdAt: new Date(), readAt: null, ...data }));
});

describe("GET /api/client-auth/my-messages", () => {
  it("reads only the client's own thread with their coach: newest 100, returned oldest first", async () => {
    prismaMock.threadMessage.findMany.mockResolvedValue([msg("3", "client"), msg("2", "coach", new Date()), msg("1", "client")]);
    const res = await as("get", "/api/client-auth/my-messages");
    expect(res.status).toBe(200);
    const arg = prismaMock.threadMessage.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ clientId: "c1", coachId: "coach-1" });
    expect(arg.take).toBe(CLIENT_THREAD_SIZE);
    expect(arg.orderBy[0]).toEqual({ createdAt: "desc" });
    expect(res.body.messages.map((m: { id: string }) => m.id)).toEqual(["1", "2", "3"]);
    expect(Object.keys(res.body.messages[0]).sort()).toEqual(["body", "createdAt", "id", "readAt", "sender"]);
  });

  it("marks the coach's unread messages up to the newest shown as read - never the client's own", async () => {
    prismaMock.threadMessage.findMany.mockResolvedValue([msg("4", "coach"), msg("3", "client"), msg("2", "coach"), msg("1", "coach", new Date())]);
    prismaMock.threadMessage.updateMany.mockResolvedValue({ count: 2 });
    const res = await as("get", "/api/client-auth/my-messages");
    const upd = prismaMock.threadMessage.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ clientId: "c1", coachId: "coach-1", sender: "coach", readAt: null, createdAt: { lte: msg("4", "coach").createdAt } });
    const byId = Object.fromEntries(res.body.messages.map((m: { id: string; readAt: string | null }) => [m.id, m.readAt]));
    expect(byId["3"]).toBeNull();
    expect(byId["2"]).not.toBeNull();
    expect(res.body.hasCoach).toBe(true);
  });

  it("with a full page it also clears older unread coach messages beyond the 100 shown", async () => {
    const page = Array.from({ length: CLIENT_THREAD_SIZE }, (_, i) => msg(String(i % 50), "client", new Date()));
    prismaMock.threadMessage.findMany.mockResolvedValue(page);
    await as("get", "/api/client-auth/my-messages");
    expect(prismaMock.threadMessage.updateMany).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when there is nothing unread", async () => {
    prismaMock.threadMessage.findMany.mockResolvedValue([msg("1", "client")]);
    await as("get", "/api/client-auth/my-messages");
    expect(prismaMock.threadMessage.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/client-auth/my-messages/unread", () => {
  it("counts the coach's unread messages in the client's own thread, read-only", async () => {
    prismaMock.threadMessage.count.mockResolvedValue(3);
    expect((await as("get", "/api/client-auth/my-messages/unread")).body).toEqual({ count: 3 });
    expect(prismaMock.threadMessage.count.mock.calls[0][0].where).toEqual({ clientId: "c1", coachId: "coach-1", sender: "coach", readAt: null });
    expect(prismaMock.threadMessage.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/client-auth/my-messages", () => {
  it("saves as the client, into their own thread with their own coach", async () => {
    const res = await as("post", "/api/client-auth/my-messages").send({ body: "  Hi coach  " });
    expect(res.status).toBe(201);
    expect(prismaMock.threadMessage.create.mock.calls[0][0].data).toEqual({ clientId: "c1", coachId: "coach-1", sender: "client", body: "Hi coach" });
  });

  it.each([
    [{ body: "Hi", sender: "coach" }, "Only the message text can be sent."],
    [{ body: "Hi", clientId: "c2" }, "Only the message text can be sent."],
    [{ body: "Hi", coachId: "coach-2" }, "Only the message text can be sent."],
    [{ body: "   " }, "Write a message first."],
    [{}, "Write a message first."],
    [{ body: "x".repeat(2001) }, "Messages can be up to 2000 characters."],
  ])("refuses %j", async (body, error) => {
    const res = await as("post", "/api/client-auth/my-messages").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(prismaMock.threadMessage.create).not.toHaveBeenCalled();
  });

  it("is rate limited per client", async () => {
    for (let i = 0; i < CLIENT_MESSAGES_PER_WINDOW; i++) expect((await as("post", "/api/client-auth/my-messages").send({ body: `m${i}` })).status).toBe(201);
    const res = await as("post", "/api/client-auth/my-messages").send({ body: "one too many" });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: TOO_FAST });
    expect(prismaMock.threadMessage.create).toHaveBeenCalledTimes(CLIENT_MESSAGES_PER_WINDOW);
  });
});

describe("a client with no coach", () => {
  it("sees an empty thread and a zero badge (not an error), and can't send", async () => {
    coachId = null;
    expect((await as("get", "/api/client-auth/my-messages")).body).toEqual({ messages: [], hasCoach: false });
    expect((await as("get", "/api/client-auth/my-messages/unread")).body).toEqual({ count: 0 });
    const res = await as("post", "/api/client-auth/my-messages").send({ body: "hi" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: NO_COACH });
    expect(prismaMock.threadMessage.findMany).not.toHaveBeenCalled();
    expect(prismaMock.threadMessage.create).not.toHaveBeenCalled();
  });
});

describe("who can use it", () => {
  it("a pending client gets 403; signed out or a coach session gets 401", async () => {
    status = "pending";
    expect((await as("get", "/api/client-auth/my-messages")).status).toBe(403);
    expect((await as("get", "/api/client-auth/my-messages/unread")).status).toBe(403);
    expect((await as("post", "/api/client-auth/my-messages").send({ body: "hi" })).status).toBe(403);
    expect((await supertest(app).get("/api/client-auth/my-messages")).status).toBe(401);
    expect((await signedIn(app).post("/api/client-auth/my-messages").send({ body: "hi" })).status).toBe(401);
  });
});
