// Chat storage - see "API contract" in CLAUDE.md.
// Messages are READ through the API here. They are WRITTEN only by the server itself
// (saveMessage, used by the ask endpoint in Prompt 15) - there is no public endpoint for
// writing chat messages, so fake history can't be created.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { answerQuestion, loadClientContext } from "./ai.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient, validationMessage } from "./clients.js";

export const CHAT_ROLES = ["coach", "ai"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** Saves one chat message for a client. Server-side only (no public route). */
export async function saveMessage(clientId: string, role: ChatRole, content: string, coachId: string) {
  if (!CHAT_ROLES.includes(role)) throw new Error(`Invalid chat role: ${role}`);
  const text = content.trim();
  if (!text) throw new Error("Chat message content can't be empty");
  return prisma.chatMessage.create({ data: { clientId, role, content: text, coachId } });
}

// Mounted at /api/clients/:clientId/chat
export const chatRouter = Router({ mergeParams: true });

// GET /api/clients/:clientId/chat - that client's messages, oldest first.
chatRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { clientId } = req.params as { clientId: string };
    const coachId = coachIdOf(req);
    const client = await findClient(clientId, coachId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const messages = await prisma.chatMessage.findMany({
      where: { clientId: client.id, coachId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, clientId: true, role: true, content: true, createdAt: true },
    });
    res.json(messages);
  }),
);

const AskSchema = z.object({
  question: z
    .string({ required_error: "question is required." })
    .trim()
    .min(1, "question can't be empty."),
});

// POST /api/clients/:clientId/chat - saves the coach's question, asks the AI about this
// client and saves its reply. Returns both messages plus an optional plan suggestion.
chatRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = AskSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { clientId } = req.params as { clientId: string };
    const coachId = coachIdOf(req);
    const client = await findClient(clientId, coachId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const context = await loadClientContext(client);
    const question = await saveMessage(client.id, "coach", parsed.data.question, coachId);
    const { answer, suggestion } = await answerQuestion(context, parsed.data.question);
    const reply = await saveMessage(client.id, "ai", answer, coachId);
    res.status(201).json({ question, reply, suggestion });
  }),
);
