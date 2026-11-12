-- Prompt 79: clients mark their own plans done (with effort and a note); who completed it.
ALTER TABLE "assignments" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "assignments" ADD COLUMN "completedBy" TEXT;
ALTER TABLE "assignments" ADD COLUMN "clientEffort" INTEGER;
ALTER TABLE "assignments" ADD COLUMN "clientNote" TEXT NOT NULL DEFAULT '';
