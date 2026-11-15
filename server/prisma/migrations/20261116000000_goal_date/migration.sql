-- The date a client is working towards (Inspo C5, Nov 2026).
--
-- A wedding, a race, a holiday. NULL means no date, which is what every client meant before this
-- existed, so nothing is backfilled or assumed.
--
-- A plain "YYYY-MM-DD" string like every other date in Repsy, NOT a timestamp: a goal date is a day
-- in the client's own life, and storing it as an instant would let a timezone move it.
ALTER TABLE "clients" ADD COLUMN "goalDate" TEXT;
ALTER TABLE "clients" ADD COLUMN "goalEvent" TEXT NOT NULL DEFAULT '';
