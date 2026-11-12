-- Prompt 76: coach join codes.
ALTER TABLE "coaches" ADD COLUMN "joinCode" TEXT;
ALTER TABLE "coaches" ADD COLUMN "joinCodeActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "coaches" ADD COLUMN "approveNewClients" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "coaches_joinCode_key" ON "coaches"("joinCode");
