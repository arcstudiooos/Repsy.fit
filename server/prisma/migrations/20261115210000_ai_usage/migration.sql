-- The AI spend ledger (Nov 2026). The owner's budget is USD 20 a month.
--
-- Estimated from the provider's token counts, never billed amounts: the provider dashboard remains
-- the source of truth for money. This table exists so the app can STOP before the budget is gone.
--
-- One row per coach per day: the monthly total is a single indexed aggregate, and a runaway coach is
-- visible rather than hidden inside a global counter.
--
-- `coachId` is intentionally NOT a foreign key. Usage history must outlive a deleted coach, or the
-- month's spend would drop the moment somebody cancels - exactly when a refund-shaped argument needs
-- the record to still exist.
CREATE TABLE "ai_usage" (
  "id" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "calls" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costCents" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_usage_coachId_day_key" ON "ai_usage"("coachId", "day");
CREATE INDEX "ai_usage_month_idx" ON "ai_usage"("month");
