-- Prompt 84: indexes for the Home alerts.
CREATE INDEX "thread_messages_coachId_sender_readAt_idx" ON "thread_messages"("coachId", "sender", "readAt");
CREATE INDEX "assignments_coachId_completedAt_idx" ON "assignments"("coachId", "completedAt");
