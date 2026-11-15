#!/usr/bin/env node
// A logical backup of everything, using Prisma (Nov 2026).
//
// WHY THIS EXISTS, given Render already backs the database up:
//   * Render's point-in-time recovery window is 3 days on a Hobby workspace, 7 on Professional.
//     Corruption noticed on day 8 is unrecoverable from the host alone.
//   * A Render restore creates a NEW database instance; it is not a file you hold.
//   * Nothing outside Render means nothing if the account itself is lost.
//
// This writes ONE JSON file with every row of every table, which needs no pg_dump binary and runs
// anywhere Node does - including a Render shell or a cron job.
//
// It is NOT a substitute for PITR: a logical dump is a point-in-time snapshot taken when it runs,
// and restoring it loses everything written since. Use PITR first for recent accidents; use this
// when the window has passed, or when a copy must live somewhere Render cannot reach.
//
// Usage:  node scripts/backup.mjs [--out <file>]
// Reads DATABASE_URL. Prints a summary; never prints row contents.
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

/**
 * Every model, parent-first so a restore can insert in this order without breaking a foreign key.
 * Kept explicit rather than reflected, so adding a model is a deliberate decision here - and
 * `backup-restore.db.test.ts` fails if the schema has a model this list does not.
 */
export const MODELS = [
  "coach",
  "client",
  "clientPlan",
  "payment",
  "exercise",
  "food",
  "meal",
  "workoutTemplate",
  "form",
  "formSubmission",
  "program",
  "programPhase",
  "programItem",
  "assignment",
  "workoutSection",
  "workoutExercise",
  "habit",
  "habitLog",
  "measurement",
  "progressLog",
  "dailyCheckIn",
  "weeklySummary",
  "threadMessage",
  "chatMessage",
  "appointment",
  "reviewItem",
  "lead",
  "aiUsage",
  "clientInvite",
  "passwordResetToken",
  "clientPasswordResetToken",
];

/** Dates and BigInts are not JSON; keep them as strings that restore recognises. */
const replacer = (_key, value) => (typeof value === "bigint" ? value.toString() : value);

export async function backup(prisma, models = MODELS) {
  const data = {};
  const counts = {};
  for (const model of models) {
    const delegate = prisma[model];
    if (!delegate?.findMany) {
      // A model in the list that the client does not have means the list is stale: say so loudly
      // rather than writing a backup that silently misses a table.
      throw new Error(`Backup list names "${model}", which is not in the Prisma client. Update MODELS.`);
    }
    const rows = await delegate.findMany();
    data[model] = rows;
    counts[model] = rows.length;
  }
  return { takenAt: new Date().toISOString(), models, counts, data };
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex > -1 ? process.argv[outIndex + 1] : `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const prisma = new PrismaClient();
  try {
    const dump = await backup(prisma);
    writeFileSync(out, JSON.stringify(dump, replacer, 0));
    const total = Object.values(dump.counts).reduce((a, b) => a + b, 0);
    const nonEmpty = Object.entries(dump.counts).filter(([, n]) => n > 0);
    console.log(`Backup written to ${out}`);
    console.log(`${total} rows across ${nonEmpty.length} non-empty tables (${dump.models.length} checked).`);
    for (const [model, n] of nonEmpty) console.log(`  ${model}: ${n}`);
    // A backup with no coaches is almost certainly pointed at the wrong database.
    if (!dump.counts.coach) console.warn("WARNING: no coaches in this backup. Is DATABASE_URL the right database?");
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly, so the test can import `backup` without side effects.
if (process.argv[1]?.endsWith("backup.mjs")) await main();
