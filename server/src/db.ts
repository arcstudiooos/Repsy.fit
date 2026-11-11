import { PrismaClient } from "@prisma/client";

// A client's password hash (Prompt 65) is omitted from EVERY query by default, so no route can
// return it by accident - including `include: { client: true }`. Only the client sign-in code opts
// back in, per query, with `omit: { passwordHash: false }`.
export const prisma = new PrismaClient({ omit: { client: { passwordHash: true } } });

/** The `tx` handed to `prisma.$transaction(async (tx) => ...)` for this client. */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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

// Closes the database connection cleanly (used on shutdown).
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  console.log("DB disconnected");
}
