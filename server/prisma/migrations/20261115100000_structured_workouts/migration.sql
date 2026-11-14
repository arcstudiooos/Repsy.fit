-- Structured workouts (Inspo W3/W5/W6/W7/W8, Nov 2026).
--
-- A workout becomes an ordered list of sections, each repeating `sets` times and holding ordered
-- exercises. Per-set numbers are arrays: repsPerSet {12,12,10} IS "12, 12, 10 Reps", so no third
-- table per set is needed.
--
-- NOTHING IS BACKFILLED HERE on purpose. Every assignment written before this migration keeps
-- `details` as its source of truth, and src/workouts/structure.ts parses it on demand (the same
-- numbered-line format the Manual Planner already writes). An assignment therefore has either
-- sections or a parseable `details`, never a half-migrated mix.
CREATE TABLE "workout_sections" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "protocol" TEXT NOT NULL DEFAULT 'Regular',
  "sets" INTEGER NOT NULL DEFAULT 1,
  "restSec" INTEGER NOT NULL DEFAULT 0,
  "durationSec" INTEGER,
  "notes" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "workout_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workout_exercises" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "exerciseId" TEXT,
  "name" TEXT NOT NULL,
  "repsPerSet" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "loadPerSet" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "durationSec" INTEGER,
  "distanceM" INTEGER,
  "rpe" DOUBLE PRECISION,
  "restSec" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL DEFAULT '',
  "recordFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workout_sections_assignmentId_idx" ON "workout_sections"("assignmentId");
CREATE UNIQUE INDEX "workout_sections_assignmentId_order_key" ON "workout_sections"("assignmentId", "order");
CREATE INDEX "workout_exercises_sectionId_idx" ON "workout_exercises"("sectionId");
CREATE INDEX "workout_exercises_exerciseId_idx" ON "workout_exercises"("exerciseId");
CREATE UNIQUE INDEX "workout_exercises_sectionId_order_key" ON "workout_exercises"("sectionId", "order");

-- Deleting an assignment takes its structure with it.
ALTER TABLE "workout_sections" ADD CONSTRAINT "workout_sections_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "workout_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Deleting a library exercise must NOT blank a workout: the link goes NULL, the name stays.
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exerciseId_fkey"
  FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
