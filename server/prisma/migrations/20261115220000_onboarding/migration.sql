-- Onboarding automation (Inspo C8, Nov 2026).
--
-- `welcomeMessage` is sent to a new client as their first message. Empty is the default and means
-- "send nothing", which is exactly what every coach meant before this existed.
--
-- `intakeFormId` is a plain id, deliberately NOT a foreign key: deleting a form must never be
-- blocked by a coach having once chosen it, and a stale id simply reads as "no intake form".
ALTER TABLE "coaches" ADD COLUMN "welcomeMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "coaches" ADD COLUMN "intakeFormId" TEXT;
