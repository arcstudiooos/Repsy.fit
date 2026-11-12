-- Prompt 81: who added a measurement (a client may delete only their own).
ALTER TABLE "measurements" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'coach';
