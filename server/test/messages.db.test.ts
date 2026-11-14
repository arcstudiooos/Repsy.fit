// Prompt 63 "You test" against a real database (CI only): another coach gets 404 on the thread,
// and client A's thread never returns client B's messages.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `messages-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("coach <-> client messages (database)", () => {
  const coachIds: string[] = [];
  let api: ReturnType<typeof asCoach>;
  let otherApi: ReturnType<typeof asCoach>;
  let clientA = "";
  let clientB = "";

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { planTier: "Pro100", name: "Test", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    api = asCoach(app, coachIds[0]);
    otherApi = asCoach(app, coachIds[1]);
    clientA = (await api.post("/api/clients").send({ name: "Thread A" })).body.id;
    clientB = (await api.post("/api/clients").send({ name: "Thread B" })).body.id;
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades
    await prisma.$disconnect();
  });

  it("client A's thread never returns client B's messages", async () => {
    expect((await api.post(`/api/clients/${clientA}/messages`).send({ body: "For A" })).status).toBe(201);
    expect((await api.post(`/api/clients/${clientB}/messages`).send({ body: "For B" })).status).toBe(201);
    // A message from client B (the client app arrives later; written directly for the test).
    await prisma.threadMessage.create({ data: { coachId: coachIds[0], clientId: clientB, sender: "client", body: "From B" } });

    const a = await api.get(`/api/clients/${clientA}/messages`);
    expect(a.body.messages.map((m: { body: string }) => m.body)).toEqual(["For A"]);
    const b = await api.get(`/api/clients/${clientB}/messages`);
    expect(b.body.messages.map((m: { body: string }) => m.body)).toEqual(["For B", "From B"]);
  });

  it("opening the thread marks the client's messages read", async () => {
    const unread = await prisma.threadMessage.create({ data: { coachId: coachIds[0], clientId: clientB, sender: "client", body: "Unread" } });
    expect(unread.readAt).toBeNull();
    const res = await api.get(`/api/clients/${clientB}/messages`);
    expect(res.body.messages.find((m: { id: string }) => m.id === unread.id).readAt).not.toBeNull();
    expect((await prisma.threadMessage.findUnique({ where: { id: unread.id } }))?.readAt).not.toBeNull();
  });

  it("the coach cannot delete a client's message", async () => {
    const fromClient = await prisma.threadMessage.create({ data: { coachId: coachIds[0], clientId: clientA, sender: "client", body: "Mine" } });
    const res = await api.delete(`/api/clients/${clientA}/messages/${fromClient.id}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You can only delete messages you sent." });
    expect(await prisma.threadMessage.count({ where: { id: fromClient.id } })).toBe(1);
  });

  it("another coach gets 404 on the thread and cannot post or delete", async () => {
    const res = await otherApi.get(`/api/clients/${clientA}/messages`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect((await otherApi.post(`/api/clients/${clientA}/messages`).send({ body: "hi" })).status).toBe(404);
    const mine = (await api.get(`/api/clients/${clientA}/messages`)).body.messages.find((m: { sender: string }) => m.sender === "coach");
    expect((await otherApi.delete(`/api/clients/${clientA}/messages/${mine.id}`)).status).toBe(404);
  });

  it("deletes own message within 15 minutes; an older one is refused", async () => {
    const fresh = (await api.post(`/api/clients/${clientA}/messages`).send({ body: "Typo" })).body;
    expect((await api.delete(`/api/clients/${clientA}/messages/${fresh.id}`)).status).toBe(204);

    const old = await prisma.threadMessage.create({
      data: { coachId: coachIds[0], clientId: clientA, sender: "coach", body: "Old", createdAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    const refused = await api.delete(`/api/clients/${clientA}/messages/${old.id}`);
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ error: "Messages can only be deleted within 15 minutes of sending." });
    expect(await prisma.threadMessage.count({ where: { id: old.id } })).toBe(1);
  });

  it("the conversation list shows the latest message and unread count, per coach", async () => {
    await prisma.threadMessage.create({ data: { coachId: coachIds[0], clientId: clientA, sender: "client", body: "New from A" } });
    const list = await api.get("/api/messages/threads");
    expect(list.status).toBe(200);
    const a = list.body.threads.find((t: { clientId: string }) => t.clientId === clientA);
    expect(a.lastMessage.body).toBe("New from A");
    expect(a.unreadCount).toBeGreaterThanOrEqual(1);
    // Listing does not mark it read; opening the thread does.
    expect((await api.get("/api/messages/threads")).body.threads.find((t: { clientId: string }) => t.clientId === clientA).unreadCount).toBe(a.unreadCount);
    await api.get(`/api/clients/${clientA}/messages`);
    expect((await api.get("/api/messages/threads")).body.threads.find((t: { clientId: string }) => t.clientId === clientA).unreadCount).toBe(0);
    // A long message is cut to a short preview in the list; the thread keeps the full text.
    const long = "x".repeat(500);
    await api.post(`/api/clients/${clientA}/messages`).send({ body: long });
    const preview = (await api.get("/api/messages/threads")).body.threads.find((t: { clientId: string }) => t.clientId === clientA);
    expect(preview.lastMessage).toMatchObject({ sender: "coach", body: "x".repeat(200) });
    const full = (await api.get(`/api/clients/${clientA}/messages`)).body.messages.at(-1);
    expect(full.body).toBe(long);
    // Another coach sees none of these clients.
    expect((await otherApi.get("/api/messages/threads")).body.threads).toEqual([]);
  });

  it("is a separate store from the AI Coach chat", async () => {
    const ai = await api.get(`/api/clients/${clientA}/chat`);
    expect(ai.status).toBe(200);
    expect(JSON.stringify(ai.body)).not.toContain("For A");
  });
});
