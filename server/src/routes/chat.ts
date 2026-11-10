// Chat storage - see "API contract" in CLAUDE.md.
// Messages are READ through the API here. They are WRITTEN only by the server itself
// (saveMessage, used by the ask endpoint in Prompt 15) - there is no public endpoint for
// writing chat messages, so fake history can't be created.
import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, findClient } from "./clients.js";

export const CHAT_ROLES = ["coach", "ai"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** Saves one chat message for a client. Server-side only (no public route). */
export async function saveMessage(clientId: string, role: ChatRole, content: string) {
  if (!CHAT_ROLES.includes(role)) throw new Error(`Invalid chat role: ${role}`);
  const text = content.trim();
  if (!text) throw new Error("Chat message content can't be empty");
  return prisma.chatMessage.create({ data: { clientId, role, content: text } });
}

// Mounted at /api/clients/:clientId/chat
export const chatRouter = Router({ mergeParams: true });

// GET /api/clients/:clientId/chat - that client's messages, oldest first.
chatRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { clientId } = req.params as { clientId: string };
    const client = await findClient(clientId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const messages = await prisma.chatMessage.findMany({
      where: { clientId: client.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, clientId: true, role: true, content: true, createdAt: true },
    });
    res.json(messages);
  }),
);
