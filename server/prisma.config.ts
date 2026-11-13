// Prisma configuration (Nov 2026). Replaces the `prisma` block in package.json, which Prisma 6.19
// deprecates and Prisma 7 removes - the deploy log warned about it on every build.
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
});
