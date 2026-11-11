// Coach <-> client messages (Prompt 63) - see "API contract" in CLAUDE.md.
// This is the CLIENT chat. It is a different conversation from the AI Coach chat
// (/api/clients/:clientId/chat, table chat_messages) and shares no code or table with it.
// No real-time in v2: the Messages tab re-fetches on open and every 20 seconds.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient, validationMessage } from "./clients.js";

export const MESSAGE_PAGE_SIZE = 50;
export const DELETE_WINDOW_MINUTES = 15;
export const MESSAGE_MAX_CHARS = 2000;
export const SENDERS = ["coach", "client"] as const;
export const DELETE_TOO_LATE = `Messages can only be deleted within ${DELETE_WINDOW_MINUTES} minutes of sending.`;
export const DELETE_NOT_YOURS = "You can only delete messages you sent.";

// Mounted at /api/clients/:clientId/messages
export const messagesRouter = Router({ mergeParams: true });

const NewMessageSchema = z.object({
  body: z
    .string({ required_error: "Write a message first.", invalid_type_error: "Write a message first." })
    .trim()
    .min(1, "Write a message first.")
    .max(MESSAGE_MAX_CHARS, `Messages can be up to ${MESSAGE_MAX_CHARS} characters.`),
});

async function clientOr404(req: Request, res: Response) {
  const { clientId } = req.params as { clientId: string };
  const client = await findClient(clientId, coachIdOf(req));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return null;
  }
  return client;
}

// GET /api/clients/:clientId/messages?before=<ISO time>
// The newest page of 50 (or the 50 before `before`), returned oldest -> newest for reading top to
// bottom, plus `hasMore`. Opening the thread marks the client's unread messages as read by the coach.
messagesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    let before: Date | undefined;
    if (req.query.before !== undefined) {
      before = new Date(String(req.query.before));
      if (Number.isNaN(before.getTime())) {
        res.status(400).json({ error: "before must be a date and time." });
        return;
      }
    }
    const coachId = coachIdOf(req);

    const page = await prisma.threadMessage.findMany({
      where: { clientId: client.id, coachId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MESSAGE_PAGE_SIZE + 1,
    });
    const hasMore = page.length > MESSAGE_PAGE_SIZE;
    const messages = page.slice(0, MESSAGE_PAGE_SIZE).reverse();

    // Coach-side read: only on the newest page, and only the messages this response shows - so a
    // client message that arrives while the request runs stays unread until the coach sees it.
    const shownUnread = messages.filter((m) => m.sender === "client" && m.readAt === null);
    if (!before && shownUnread.length > 0) {
      const now = new Date();
      await prisma.threadMessage.updateMany({
        where: { id: { in: shownUnread.map((m) => m.id) }, clientId: client.id, coachId, readAt: null },
        data: { readAt: now },
      });
      for (const m of shownUnread) m.readAt = now;
    }
    res.json({ messages, hasMore });
  }),
);

// POST /api/clients/:clientId/messages { body } -> 201, sent by the coach. Plain text only.
messagesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = NewMessageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? validationMessage(parsed.error) });
      return;
    }
    const client = await clientOr404(req, res);
    if (!client) return;
    const message = await prisma.threadMessage.create({
      data: { clientId: client.id, coachId: coachIdOf(req), sender: "coach", body: parsed.data.body },
    });
    res.status(201).json(message);
  }),
);

// DELETE /api/clients/:clientId/messages/:messageId -> 204. Only the coach's own message, and only
// within 15 minutes of sending; otherwise 403 with a plain sentence.
messagesRouter.delete(
  "/:messageId",
  asyncHandler(async (req, res) => {
    const client = await clientOr404(req, res);
    if (!client) return;
    const { messageId } = req.params as { messageId: string };
    const message = await prisma.threadMessage.findFirst({
      where: { id: messageId, clientId: client.id, coachId: coachIdOf(req) },
    });
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    if (message.sender !== "coach") {
      res.status(403).json({ error: DELETE_NOT_YOURS });
      return;
    }
    if (Date.now() - message.createdAt.getTime() > DELETE_WINDOW_MINUTES * 60 * 1000) {
      res.status(403).json({ error: DELETE_TOO_LATE });
      return;
    }
    await prisma.threadMessage.delete({ where: { id: message.id } });
    res.status(204).end();
  }),
);

// GET /api/messages/threads (Prompt 64) -> { threads: [{ clientId, lastMessage, unreadCount }] }
// One row per client of the signed-in coach, for the Messages conversation list: the latest
// message (or null) and how many client messages the coach has not opened yet. Read-only: it
// never marks anything read - only opening a thread does that.
export const threadsRouter = Router();
/** The list only shows a one-line preview; the full text is in the thread. */
export const PREVIEW_MAX_CHARS = 200;

threadsRouter.get(
  "/threads",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const [clients, latest, unread] = await Promise.all([
      prisma.client.findMany({ where: { coachId }, select: { id: true } }),
      // One row per client, picked by Postgres (DISTINCT ON), with only the start of the body:
      // this runs on every 20-second poll, so it must not load whole conversations.
      // `::int` matters: Prisma binds JS numbers as bigint, and Postgres has only left(text, int).
      prisma.$queryRaw<{ clientId: string; sender: string; body: string; createdAt: Date }[]>`
        SELECT DISTINCT ON ("clientId") "clientId", "sender", LEFT("body", ${PREVIEW_MAX_CHARS}::int) AS "body", "createdAt"
        FROM "thread_messages"
        WHERE "coachId" = ${coachId}
        ORDER BY "clientId", "createdAt" DESC, "id" DESC`,
      prisma.threadMessage.groupBy({
        by: ["clientId"],
        where: { coachId, sender: "client", readAt: null },
        _count: { _all: true },
      }),
    ]);
    const latestBy = new Map(latest.map((m) => [m.clientId, m]));
    const unreadBy = new Map(unread.map((u) => [u.clientId, u._count._all]));
    res.json({
      threads: clients.map((c) => {
        const last = latestBy.get(c.id);
        return {
          clientId: c.id,
          lastMessage: last ? { sender: last.sender, body: last.body, createdAt: last.createdAt.toISOString() } : null,
          unreadCount: unreadBy.get(c.id) ?? 0,
        };
      }),
    });
  }),
);
