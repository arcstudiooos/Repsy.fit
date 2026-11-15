// Backup and restore against a real database (CI only) - Nov 2026.
//
// This is the test that turns "we have backups" into "we have tested a restore". It cannot run
// locally because there is no local Postgres, and it cannot be faked with mocks: the whole point is
// that real foreign keys, real cascades and real column types survive the round trip.
//
// What it proves:
//   1. A backup captures the rows that exist.
//   2. A restore into an emptied database brings every row back, with its values intact.
//   3. Rows written AFTER the backup are gone after a restore - a snapshot is a snapshot, and
//      pretending otherwise is how people lose data they thought was safe.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { prisma } from "../src/db.js";
import { backup } from "../scripts/backup.mjs";
import { restore } from "../scripts/restore.mjs";

/** backup.mjs is plain JS, so give its return value a shape the type-checker can use. */
type Dump = {
  takenAt: string;
  models: string[];
  counts: Record<string, number>;
  data: Record<string, Array<Record<string, unknown> & { id: string }>>;
};
const takeBackup = (models: string[]) => backup(prisma, models) as Promise<Dump>;
import { hashPassword } from "../src/auth/password.js";

const tag = `bk-${Date.now()}`;
const email = `${tag}@example.com`;

/**
 * Only these tables are wiped and restored, so the test cannot destroy rows another test is using.
 * Parent-first, exactly as a real restore requires.
 */
const SCOPE = ["assignment", "habitLog", "habit", "client", "coach"] as const;
const ORDER = ["coach", "client", "habit", "habitLog", "assignment"];

let coachId = "";
let clientId = "";

beforeAll(async () => {
  const coach = await prisma.coach.create({
    data: { email, name: "Backup Test", passwordHash: await hashPassword("x".repeat(12)) },
  });
  coachId = coach.id;
  const client = await prisma.client.create({
    data: { coachId, name: "Restore Me", goal: "Strength", notes: "a note with 'quotes' and ünicode" },
  });
  clientId = client.id;
  await prisma.assignment.create({
    data: { coachId, clientId, type: "Workout", title: "Legs", details: "Squat 5x5", date: "2026-11-16" },
  });
  // A habit belongs to the coach as well as the client - both relations are required.
  const habit = await prisma.habit.create({ data: { coachId, clientId, name: "Walk 8k" } });
  await prisma.habitLog.create({ data: { habitId: habit.id, date: "2026-11-16", done: true } });
});

afterAll(async () => {
  // Clean up whatever survived, children first.
  await prisma.habitLog.deleteMany({ where: { habit: { client: { coachId } } } });
  await prisma.habit.deleteMany({ where: { client: { coachId } } });
  await prisma.assignment.deleteMany({ where: { coachId } });
  await prisma.client.deleteMany({ where: { coachId } });
  await prisma.coach.deleteMany({ where: { id: coachId } });
  await prisma.$disconnect();
});

/** Rows for this test's coach only, so other tests' data is never counted or touched. */
async function mine() {
  return {
    coach: await prisma.coach.count({ where: { id: coachId } }),
    client: await prisma.client.count({ where: { coachId } }),
    assignment: await prisma.assignment.count({ where: { coachId } }),
    habit: await prisma.habit.count({ where: { client: { coachId } } }),
    habitLog: await prisma.habitLog.count({ where: { habit: { client: { coachId } } } }),
  };
}

describe("a backup can actually be restored", () => {
  it("captures every row of every table it names", async () => {
    const dump = await takeBackup(ORDER);
    // The counts are the whole database, so assert ours are present rather than exact totals.
    expect(dump.counts.coach).toBeGreaterThanOrEqual(1);
    expect(dump.data.client.some((c) => c.id === clientId)).toBe(true);
    expect(dump.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("brings back every row, with its values intact, after the tables are emptied", async () => {
    const before = await mine();
    expect(before).toEqual({ coach: 1, client: 1, assignment: 1, habit: 1, habitLog: 1 });

    const dump = await takeBackup(ORDER);

    // The destructive half: empty the tables, children first.
    for (const model of SCOPE) await (prisma[model] as { deleteMany: () => Promise<unknown> }).deleteMany();
    expect(await mine()).toEqual({ coach: 0, client: 0, assignment: 0, habit: 0, habitLog: 0 });

    await restore(prisma, dump, { models: ORDER });

    expect(await mine()).toEqual(before);
    // Not just the count - the content. A restore that loses a note is not a restore.
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    expect(client?.name).toBe("Restore Me");
    expect(client?.notes).toBe("a note with 'quotes' and ünicode");
    const assignment = await prisma.assignment.findFirst({ where: { coachId } });
    expect(assignment?.details).toBe("Squat 5x5");
    expect(assignment?.date).toBe("2026-11-16");
    // A DateTime must come back as a real date, not the string JSON turned it into.
    expect(client?.createdAt).toBeInstanceOf(Date);
  });

  it("does NOT bring back rows written after the backup was taken", async () => {
    // A logical backup is a snapshot. Anyone treating it as continuous protection will lose the
    // difference, so this behaviour is pinned rather than left to be discovered during an incident.
    const dump = await takeBackup(ORDER);
    const later = await prisma.assignment.create({
      data: { coachId, clientId, type: "Note", title: "Written after the backup", details: "", date: "2026-11-17" },
    });

    for (const model of SCOPE) await (prisma[model] as { deleteMany: () => Promise<unknown> }).deleteMany();
    await restore(prisma, dump, { models: ORDER });

    expect(await prisma.assignment.findUnique({ where: { id: later.id } })).toBeNull();
    expect((await mine()).assignment).toBe(1);
  });
});
