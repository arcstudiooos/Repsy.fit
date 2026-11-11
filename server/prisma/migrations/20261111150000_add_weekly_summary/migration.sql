-- Prompt 51: one saved AI weekly summary per coach per week, with the facts it was written from.
CREATE TABLE "weekly_summaries" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_summaries_coachId_weekStart_key" ON "weekly_summaries"("coachId", "weekStart");

ALTER TABLE "weekly_summaries" ADD CONSTRAINT "weekly_summaries_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
