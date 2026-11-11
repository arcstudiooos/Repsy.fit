-- Prompt 56: body measurements. Additive only: one new table, no existing rows touched.
CREATE TABLE "measurements" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "waistCm" DOUBLE PRECISION,
    "chestCm" DOUBLE PRECISION,
    "armCm" DOUBLE PRECISION,
    "hipCm" DOUBLE PRECISION,
    "bodyFatPercent" DOUBLE PRECISION,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "measurements_clientId_date_idx" ON "measurements"("clientId", "date");
CREATE INDEX "measurements_coachId_idx" ON "measurements"("coachId");

ALTER TABLE "measurements" ADD CONSTRAINT "measurements_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
