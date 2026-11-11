-- Prompt 43: Coach accounts, and coachId becomes a real foreign key to coaches.
-- No coach row is created here. The old placeholder string 'default-coach' becomes NULL,
-- which means "demo data not yet claimed"; the first coach to register claims it
-- (server/src/auth/claimDemoData.ts, called by registration in Prompt 44).
-- Every existing row is kept: only the coachId value changes.

-- CreateTable
CREATE TABLE "coaches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coaches_email_key" ON "coaches"("email");

-- clients / assignments / progress_logs: drop the placeholder default, allow NULL, and turn
-- the placeholder value into NULL (unclaimed demo data).
ALTER TABLE "clients" ALTER COLUMN "coachId" DROP DEFAULT, ALTER COLUMN "coachId" DROP NOT NULL;
UPDATE "clients" SET "coachId" = NULL WHERE "coachId" = 'default-coach';

ALTER TABLE "assignments" ALTER COLUMN "coachId" DROP DEFAULT, ALTER COLUMN "coachId" DROP NOT NULL;
UPDATE "assignments" SET "coachId" = NULL WHERE "coachId" = 'default-coach';

ALTER TABLE "progress_logs" ALTER COLUMN "coachId" DROP DEFAULT, ALTER COLUMN "coachId" DROP NOT NULL;
UPDATE "progress_logs" SET "coachId" = NULL WHERE "coachId" = 'default-coach';

-- chat_messages: new coachId column (existing messages are unclaimed demo data).
ALTER TABLE "chat_messages" ADD COLUMN "coachId" TEXT;
CREATE INDEX "chat_messages_coachId_idx" ON "chat_messages"("coachId");

-- Any other leftover placeholder value can't point at a real coach: make it unclaimed too,
-- so the foreign keys below can be added safely.
UPDATE "clients" SET "coachId" = NULL WHERE "coachId" IS NOT NULL AND "coachId" NOT IN (SELECT "id" FROM "coaches");
UPDATE "assignments" SET "coachId" = NULL WHERE "coachId" IS NOT NULL AND "coachId" NOT IN (SELECT "id" FROM "coaches");
UPDATE "progress_logs" SET "coachId" = NULL WHERE "coachId" IS NOT NULL AND "coachId" NOT IN (SELECT "id" FROM "coaches");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_logs" ADD CONSTRAINT "progress_logs_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
