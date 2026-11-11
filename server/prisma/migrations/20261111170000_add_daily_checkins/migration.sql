-- Prompt 53: one daily check-in per client per day (energy, mood, water, steps, food note).
-- sleepHours and recoveryScore are included now and filled in by Prompt 55.
CREATE TABLE "daily_checkins" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "energy" INTEGER,
    "mood" INTEGER,
    "sleepHours" DOUBLE PRECISION,
    "recoveryScore" INTEGER,
    "waterLiters" DOUBLE PRECISION,
    "steps" INTEGER,
    "foodNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_checkins_clientId_date_key" ON "daily_checkins"("clientId", "date");
CREATE INDEX "daily_checkins_coachId_idx" ON "daily_checkins"("coachId");

ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
