// The client's side of the coach <-> client thread (Prompt 82) - see "API contract" in CLAUDE.md.
// Same table as the coach side (thread_messages). The sender is always set here, from the session:
// a client can only ever post as "client", and only into their own thread with their own coach.
// Opening the thread marks the COACH's messages up to the newest shown as read (readAt = when the other side read it).
// No real-time: the app re-fetches on open and every 20 seconds, like the coach's Messages tab.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { clientAccountIdOf, requireActiveClient } from "../auth/clientSession.js";
import { rateLimit } from "../auth/rateLimit.js";
import { asyncHandler } from "./clients.js";
import { MESSAGE_MAX_CHARS } from "./messages.js";

/** How many of the newest messages the client app shows. */
export const CLIENT_THREAD_SIZE = 100;
/** Messages a client may send per 15-minute window (a typing person never gets near it). */
export const CLIENT_MESSAGES_PER_WINDOW = 60;
export const NO_COACH = "You don't have a coach to message right now.";
export const TOO_FAST = "You're sending messages too fast. Please wait a few minutes and try again.";

const MESSAGE_SELECT = { id: true, sender: true, body: true, createdAt: true, readAt: true } as const;
const ClientMessageSchema = z
  .object({
    body: z
      .string({ required_error: "Write a message first.", invalid_type_error: "Write a message first." })
      .trim()
      .min(1, "Write a message first.")
      .max(MESSAGE_MAX_CHARS, `Messages can be up to ${MESSAGE_MAX_CHARS} characters.`),
  })
  .strict("Only the message text can be sent.");

export const clientMessagesRouter = Router();
clientMessagesRouter.use(["/my-messages"], requireActiveClient);

/** The client's coach id, or null when the client currently has no coach. */
async function myCoachId(req: Request): Promise<string | null> {
  const c = await prisma.client.findUnique({ where: { id: clientAccountIdOf(req) }, select: { coachId: true } });
  return c?.coachId ?? null;
}

// GET /api/client-auth/my-messages -> { messages, hasCoach } the newest 100 of the client's own thread with
// their coach, oldest first. Marks the coach's messages up to the newest shown as read (never the client's own).
clientMessagesRouter.get(
  "/my-messages",
  asyncHandler(async (req, res) => {
    const clientId = clientAccountIdOf(req);
    const coachId = await myCoachId(req);
    // No coach: nothing to show (the app hides the composer), not an error to retry.
    if (!coachId) return void res.json({ messages: [], hasCoach: false });
    const page = await prisma.threadMessage.findMany({
      where: { clientId, coachId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CLIENT_THREAD_SIZE,
      select: MESSAGE_SELECT,
    });
    const messages = page.reverse();
    const newest = messages[messages.length - 1];
    // Everything the coach sent up to the newest message shown counts as read - including older ones
    // beyond the 100 shown, so the badge can't come back for messages the client scrolled past. A coach
    // message that arrives while this runs is newer, so it stays unread.
    const unreadShown = messages.some((m) => m.sender === "coach" && m.readAt === null);
    const mayHaveOlder = page.length === CLIENT_THREAD_SIZE;
    if (newest && (unreadShown || mayHaveOlder)) {
      const now = new Date();
      const { count } = await prisma.threadMessage.updateMany({
        where: { clientId, coachId, sender: "coach", readAt: null, createdAt: { lte: newest.createdAt } },
        data: { readAt: now },
      });
      if (count > 0) for (const m of messages) if (m.sender === "coach" && m.readAt === null) m.readAt = now;
    }
    res.json({ messages, hasCoach: true });
  }),
);

// GET /api/client-auth/my-messages/unread -> { count } coach messages the client hasn't opened yet (the
// tab badge). Read-only.
clientMessagesRouter.get(
  "/my-messages/unread",
  asyncHandler(async (req, res) => {
    const coachId = await myCoachId(req);
    if (!coachId) return void res.json({ count: 0 });
    const count = await prisma.threadMessage.count({ where: { clientId: clientAccountIdOf(req), coachId, sender: "coach", readAt: null } });
    res.json({ count });
  }),
);

// POST /api/client-auth/my-messages { body } -> 201, sender "client". Plain text, 1-2000 characters.
clientMessagesRouter.post(
  "/my-messages",
  rateLimit("client-messages", { keyOf: (req) => `client:${clientAccountIdOf(req)}`, max: CLIENT_MESSAGES_PER_WINDOW, message: TOO_FAST }),
  asyncHandler(async (req, res) => {
    const parsed = ClientMessageSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Write a message first." });
    const coachId = await myCoachId(req);
    if (!coachId) return void res.status(409).json({ error: NO_COACH });
    const message = await prisma.threadMessage.create({
      data: { clientId: clientAccountIdOf(req), coachId, sender: "client", body: parsed.data.body },
      select: MESSAGE_SELECT,
    });
    res.status(201).json(message);
  }),
);
