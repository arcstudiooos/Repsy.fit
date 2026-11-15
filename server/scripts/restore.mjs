#!/usr/bin/env node
// Restore a logical backup written by backup.mjs (Nov 2026).
//
// THIS IS DESTRUCTIVE. It deletes every row in the tables it restores, then reinserts the backup.
// That is what a restore means, but it is also how a backup turns into data loss if pointed at the
// wrong database, so:
//   * it refuses to run unless --yes is passed, and
//   * it refuses a database that already holds coaches unless --force is ALSO passed.
//
// Render's own recovery restores into a NEW instance, and that is the safer habit here too: create
// an empty database, restore into it, look at it, and only then repoint DATABASE_URL.
//
// Usage:  node scripts/restore.mjs --in <file> --yes [--force]
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { MODELS } from "./backup.mjs";

/** Dates come back from JSON as strings; Prisma needs Date objects for DateTime columns. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
export function revive(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === "string" && ISO.test(value) ? new Date(value) : value;
  }
  return out;
}

export async function restore(prisma, dump, { models = MODELS } = {}) {
  const restored = {};
  // Delete children before parents (reverse order), so a foreign key never blocks the wipe.
  for (const model of [...models].reverse()) {
    if (dump.data[model]) await prisma[model].deleteMany();
  }
  // Insert parents before children.
  for (const model of models) {
    const rows = dump.data[model];
    if (!rows?.length) {
      restored[model] = 0;
      continue;
    }
    // createMany in one call per table: fast, and skipDuplicates is deliberately NOT set, because a
    // duplicate here means the wipe did not work and silence would hide that.
    await prisma[model].createMany({ data: rows.map(revive) });
    restored[model] = rows.length;
  }
  return restored;
}

async function main() {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : undefined;
  };
  const file = arg("--in");
  if (!file) {
    console.error("Usage: node scripts/restore.mjs --in <file> --yes [--force]");
    process.exit(2);
  }
  if (!process.argv.includes("--yes")) {
    console.error("Refusing to run without --yes. This DELETES every row in the restored tables first.");
    process.exit(2);
  }

  const dump = JSON.parse(readFileSync(file, "utf8"));
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.coach.count();
    if (existing > 0 && !process.argv.includes("--force")) {
      console.error(`Refusing: this database already has ${existing} coach(es). Restore into an empty database,`);
      console.error("or pass --force if you are certain you want to overwrite this one.");
      process.exit(2);
    }
    console.log(`Restoring backup taken ${dump.takenAt}...`);
    const restored = await restore(prisma, dump);
    const total = Object.values(restored).reduce((a, b) => a + b, 0);
    console.log(`Restored ${total} rows.`);

    // Verify rather than assume: count every table back and compare with the backup's own counts.
    const mismatches = [];
    for (const model of dump.models ?? MODELS) {
      const expected = dump.counts?.[model] ?? 0;
      const actual = await prisma[model].count();
      if (actual !== expected) mismatches.push(`${model}: expected ${expected}, found ${actual}`);
    }
    if (mismatches.length) {
      console.error("RESTORE DID NOT MATCH THE BACKUP:");
      for (const m of mismatches) console.error(`  ${m}`);
      process.exit(1);
    }
    console.log("Every table matches the backup's row counts.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("restore.mjs")) await main();
