-- Reusable multi-week programs (Inspo W10, Nov 2026).
--
-- A Program is a TEMPLATE: Program -> Phase -> Item, where an item sits at a (week, weekday) inside
-- its phase and carries NO date. Assigning the program materialises ordinary rows in `assignments`
-- on real dates, after which template and assignments are independent.
--
-- Why materialise rather than link: every reader in the app (the client app, the checklist, exports,
-- the snapshot cards, the calendar) already understands an assignment and none of them need to learn
-- about programs. It also lets a coach change one client's week without editing the template that
-- every other client is on.
CREATE TABLE "programs" (
  "id" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "program_phases" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "weeks" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "program_phases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "program_items" (
  "id" TEXT NOT NULL,
  "phaseId" TEXT NOT NULL,
  "week" INTEGER NOT NULL,
  "weekday" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "program_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "programs_coachId_idx" ON "programs"("coachId");
CREATE INDEX "program_phases_programId_order_idx" ON "program_phases"("programId", "order");
CREATE INDEX "program_items_phaseId_week_weekday_idx" ON "program_items"("phaseId", "week", "weekday");

ALTER TABLE "programs" ADD CONSTRAINT "programs_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_phases" ADD CONSTRAINT "program_phases_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_items" ADD CONSTRAINT "program_items_phaseId_fkey"
  FOREIGN KEY ("phaseId") REFERENCES "program_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
