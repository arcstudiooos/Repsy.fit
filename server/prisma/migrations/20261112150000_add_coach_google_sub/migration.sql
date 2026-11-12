-- "Continue with Google": link a coach to a Google account (nullable, unique when set).
ALTER TABLE "coaches" ADD COLUMN "googleSub" TEXT;
CREATE UNIQUE INDEX "coaches_googleSub_key" ON "coaches"("googleSub");
