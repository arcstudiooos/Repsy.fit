-- Prompt 58: workout templates. Additive only: one new table, no existing rows touched.
CREATE TABLE "workout_templates" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "focus" TEXT NOT NULL DEFAULT '',
    "exercises" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workout_templates_coachId_idx" ON "workout_templates"("coachId");

ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
