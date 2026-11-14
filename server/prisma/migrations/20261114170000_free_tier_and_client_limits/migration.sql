-- Pricing by client count (Nov 2026): everyone is free forever with 2 clients, and paying raises
-- the limit. This replaces the trial-and-lockout model entirely.

-- Demo clients never count towards the limit.
ALTER TABLE "clients" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- Existing coaches move to the plan that covers what they already have, so nobody wakes up over
-- their limit because of a pricing change they did not ask for.
ALTER TABLE "coaches" ALTER COLUMN "planTier" SET DEFAULT 'Free';
UPDATE "coaches" c SET "planTier" = CASE
  WHEN (SELECT COUNT(*) FROM "clients" cl WHERE cl."coachId" = c.id) <= 2   THEN 'Free'
  WHEN (SELECT COUNT(*) FROM "clients" cl WHERE cl."coachId" = c.id) <= 5   THEN 'Pro5'
  WHEN (SELECT COUNT(*) FROM "clients" cl WHERE cl."coachId" = c.id) <= 10  THEN 'Pro10'
  WHEN (SELECT COUNT(*) FROM "clients" cl WHERE cl."coachId" = c.id) <= 20  THEN 'Pro20'
  WHEN (SELECT COUNT(*) FROM "clients" cl WHERE cl."coachId" = c.id) <= 50  THEN 'Pro50'
  ELSE 'Pro100'
END;

-- The old trial has no meaning now: the free plan never expires.
UPDATE "coaches" SET "billingStatus" = 'free', "trialEndsAt" = NULL WHERE "paypalSubscriptionId" IS NULL;
