-- Habit recurrence (Inspo C3, Nov 2026).
--
-- 0 = Sunday ... 6 = Saturday, matching Date.getUTCDay().
--
-- The default is all seven days, which is exactly what every habit written before recurrence
-- existed already meant. So nothing about an existing habit changes: `isScheduled` treats a full
-- list as "every day", and `habitStreaks` with a full list behaves as it always did (its twelve
-- original tests pass untouched).
ALTER TABLE "habits" ADD COLUMN "days" INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6];
