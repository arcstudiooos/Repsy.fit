-- The coach's own subscription to Repsy (Nov 2026). PayPal holds the money; these columns hold
-- only what the app needs to decide what a coach may do today.
ALTER TABLE "coaches" ADD COLUMN "planTier" TEXT NOT NULL DEFAULT 'Solo';
ALTER TABLE "coaches" ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'trialing';
ALTER TABLE "coaches" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "coaches" ADD COLUMN "periodEndsAt" TIMESTAMP(3);
ALTER TABLE "coaches" ADD COLUMN "pastDueSince" TIMESTAMP(3);
ALTER TABLE "coaches" ADD COLUMN "paypalSubscriptionId" TEXT;
ALTER TABLE "coaches" ADD COLUMN "paypalPlanId" TEXT;
CREATE UNIQUE INDEX "coaches_paypalSubscriptionId_key" ON "coaches"("paypalSubscriptionId");

-- Accounts that existed before billing: give them a trial that starts now, so nobody who signed up
-- under "free while in early access" is locked out by this deploy.
UPDATE "coaches" SET "trialEndsAt" = NOW() + INTERVAL '30 days' WHERE "trialEndsAt" IS NULL;
