-- Prompt 52: the review queue. One row per thing waiting for the coach's decision.
-- Decided rows are kept (history); nothing is ever deleted by approve or dismiss.
CREATE TABLE "review_items" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "type" TEXT,
    "details" TEXT NOT NULL DEFAULT '',
    "reasoning" TEXT NOT NULL DEFAULT '',
    "sourceId" TEXT,
    "assignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "review_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "review_items_coachId_status_idx" ON "review_items"("coachId", "status");
CREATE INDEX "review_items_clientId_idx" ON "review_items"("clientId");

ALTER TABLE "review_items" ADD CONSTRAINT "review_items_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
