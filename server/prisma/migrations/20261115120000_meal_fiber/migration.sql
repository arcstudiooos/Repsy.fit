-- Inspo N2: fibre, the fourth macro a nutrition coach actually tracks.
--
-- DEFAULT 0 and NOT NULL, so every meal saved before today stays valid and reads as "no fibre
-- recorded" rather than becoming a null a form has to special-case.
--
-- `mealType` is plain TEXT and is NOT touched here: the meal categories go from 4 names to 17 in
-- application code only, and all four original names are kept, so no existing row changes meaning.
ALTER TABLE "meals" ADD COLUMN "fiberG" DOUBLE PRECISION NOT NULL DEFAULT 0;
