-- Separate, explicit consent for health details a client enters.
ALTER TABLE "clients" ADD COLUMN "healthConsentAt" TIMESTAMP(3);
