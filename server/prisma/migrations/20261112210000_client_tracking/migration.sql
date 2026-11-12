-- Prompt 80: client targets, weekly check-in day, meals on Nutrition plans.
ALTER TABLE "clients" ADD COLUMN "calorieTarget" INTEGER;
ALTER TABLE "clients" ADD COLUMN "proteinTargetG" DOUBLE PRECISION;
ALTER TABLE "clients" ADD COLUMN "weeklyCheckInDay" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "assignments" ADD COLUMN "mealIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "daily_checkins" ADD COLUMN "enteredBy" TEXT NOT NULL DEFAULT 'coach';
ALTER TABLE "habit_logs" ADD COLUMN "enteredBy" TEXT NOT NULL DEFAULT 'coach';
ALTER TABLE "progress_logs" ADD COLUMN "enteredBy" TEXT NOT NULL DEFAULT 'coach';
