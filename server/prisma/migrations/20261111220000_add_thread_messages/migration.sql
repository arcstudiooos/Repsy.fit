-- Prompt 63: coach <-> client chat messages (separate from the AI Coach chat_messages table).
CREATE TABLE "thread_messages" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "thread_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "thread_messages_clientId_createdAt_idx" ON "thread_messages"("clientId", "createdAt");
CREATE INDEX "thread_messages_coachId_idx" ON "thread_messages"("coachId");

ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
