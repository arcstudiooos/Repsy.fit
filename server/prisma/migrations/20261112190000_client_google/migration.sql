-- Prompt 78: Continue with Google for clients.
ALTER TABLE "clients" ADD COLUMN "googleSub" TEXT;
ALTER TABLE "clients" ADD COLUMN "lastGoogleAuthAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "clients_googleSub_key" ON "clients"("googleSub");
