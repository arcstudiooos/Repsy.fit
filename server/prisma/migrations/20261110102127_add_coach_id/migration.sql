-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "coachId" TEXT NOT NULL DEFAULT 'default-coach';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "coachId" TEXT NOT NULL DEFAULT 'default-coach';

-- AlterTable
ALTER TABLE "progress_logs" ADD COLUMN     "coachId" TEXT NOT NULL DEFAULT 'default-coach';

-- CreateIndex
CREATE INDEX "assignments_coachId_idx" ON "assignments"("coachId");

-- CreateIndex
CREATE INDEX "clients_coachId_idx" ON "clients"("coachId");

-- CreateIndex
CREATE INDEX "progress_logs_coachId_idx" ON "progress_logs"("coachId");
