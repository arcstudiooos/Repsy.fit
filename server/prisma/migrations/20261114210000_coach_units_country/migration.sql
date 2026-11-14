-- The coach's own profile: how they read weights, and where they are (Nov 2026).
ALTER TABLE "coaches" ADD COLUMN "units" TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE "coaches" ADD COLUMN "country" TEXT;
