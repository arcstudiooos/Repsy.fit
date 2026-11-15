-- Diet type and alternative meals (Inspo N3/N8, Nov 2026).
--
-- `dietType` defaults to 'Any', which is exactly what every meal saved before now means: nothing is
-- reclassified retroactively, and a coach labels meals as they go.
--
-- `swapIds` is a plain TEXT[] of meal ids, deliberately NOT a relation. A swap is a SUGGESTION
-- ("paneer OR chicken"), so a dangling id must never block deleting a meal or fail a read - the
-- route resolves the ids it can and silently drops the rest.
ALTER TABLE "meals" ADD COLUMN "dietType" TEXT NOT NULL DEFAULT 'Any';
ALTER TABLE "meals" ADD COLUMN "swapIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
