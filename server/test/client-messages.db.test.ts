// Prompt 82 against a real database: a client's message reaches their coach's thread as "client" and
// shows as unread for the coach; the coach's reply shows as unread for the client until they open the
// thread; nobody else's thread is ever read or marked. Skipped without DATABASE_URL (runs in CI).
import supertest from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { CLIENT_SESSION_COOKIE, signClientSession } from "../src/auth/clientSession.js";
import { asCoach } from "./helpers/authedRequest.js";

const stamp = Date.now();
const coachEmail = `msg82-${stamp}@example.com`;

describe.skipIf(!process.env.DATABASE_URL)("client messages (database)", () => {
  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { email: coachEmail } });
    await prisma.$disconnect();
  });

  it("unread counts work both ways and stay inside the client's own thread", async () => {
    const coach = await prisma.coach.create({ data: { planTier: "Pro100", email: coachEmail, name: "Coach 82", passwordHash: "x" } });
    const [maya, sam] = await Promise.all(
      ["maya", "sam"].map((n) => prisma.client.create({ data: { coachId: coach.id, name: n, loginEmail: `${n}-82-${stamp}@example.com`, passwordHash: "$2b$12$x" } })),
    );
    const as = (id: string) => `${CLIENT_SESSION_COOKIE}=${signClientSession(id, 0)}`;
    const c = supertest(app);
    await prisma.threadMessage.create({ data: { coachId: coach.id, clientId: sam.id, sender: "coach", body: "for sam only" } });

    // Client -> coach.
    const sent = await c.post("/api/client-auth/my-messages").set("Cookie", as(maya.id)).send({ body: "Hi coach", sender: undefined });
    expect(sent.status).toBe(201);
    expect(sent.body.sender).toBe("client");
    const threads = await asCoach(app, coach.id).get("/api/messages/threads");
    expect(threads.body.threads.find((t: { clientId: string }) => t.clientId === maya.id).unreadCount).toBe(1);
    await asCoach(app, coach.id).get(`/api/clients/${maya.id}/messages`);
    const after = await asCoach(app, coach.id).get("/api/messages/threads");
    expect(after.body.threads.find((t: { clientId: string }) => t.clientId === maya.id).unreadCount).toBe(0);

    // Coach -> client.
    await asCoach(app, coach.id).post(`/api/clients/${maya.id}/messages`).send({ body: "Hi Maya" });
    expect((await c.get("/api/client-auth/my-messages/unread").set("Cookie", as(maya.id))).body).toEqual({ count: 1 });
    const thread = await c.get("/api/client-auth/my-messages").set("Cookie", as(maya.id));
    expect(thread.body.messages.map((m: { body: string }) => m.body)).toEqual(["Hi coach", "Hi Maya"]);
    expect((await c.get("/api/client-auth/my-messages/unread").set("Cookie", as(maya.id))).body).toEqual({ count: 0 });
    // The client opening their thread never marks their own message (the coach's read state stays as is),
    // and Sam's thread is untouched.
    expect((await prisma.threadMessage.findFirst({ where: { clientId: sam.id } }))?.readAt).toBeNull();
    expect((await c.get("/api/client-auth/my-messages/unread").set("Cookie", as(sam.id))).body).toEqual({ count: 1 });
  });
});
