import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Connects to the database on startup. Exits the process if DATABASE_URL is
// missing or the database can't be reached, so a misconfigured deploy fails loudly.
export async function connectDb(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set. Add it to .env (local) or the Render environment.");
    process.exit(1);
  }
  try {
    await prisma.$connect();
    console.log("DB connected");
  } catch (err) {
    console.error("FATAL: could not connect to the database.", err);
    process.exit(1);
  }
}
