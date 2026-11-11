// Prompt 43 against a real database: Coach model + coachId foreign keys, and the one-time
// claim of demo data by the first coach. Skipped when DATABASE_URL is not set (runs in CI).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimDemoData } from "../src/auth/claimDemoData.js";
import { hashPassword } from "../src/auth/password.js";
import { prisma } from "../src/db.js";

const tag = `claim-${Date.now()}`;
const url = process.env.DATABASE_URL ?? "";
// This test deletes every coach and all unclaimed data: never run it against Render.
const isRenderDb = /render\.com|dpg-/.test(url);

describe.skipIf(!url || isRenderDb)("coach accounts and demo-data claim (database)", () => {
  beforeAll(async () => {
    await prisma.coach.deleteMany({});
    await prisma.client.deleteMany({ where: { coachId: null } });
  });
  afterAll(async () => {
    await prisma.coach.deleteMany({}); // cascades to anything they own
    await prisma.client.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  it("demo data has no coach; the first coach claims all of it; a second coach gets nothing", async () => {
    const client = await prisma.client.create({
      data: {
        name: `${tag} Maya`,
        assignments: { create: { type: "Workout", title: "Plan", details: "1. Back Squat", date: "2026-11-11" } },
        progressLogs: { create: { date: "2026-11-11", weightKg: 70 } },
        chatMessages: { create: { role: "coach", content: "Hi" } },
      },
    });
    expect(client.coachId).toBeNull();
    const before = await Promise.all([
      prisma.client.count(),
      prisma.assignment.count(),
      prisma.progressLog.count(),
      prisma.chatMessage.count(),
    ]);

    const first = await prisma.$transaction(async (tx) => {
      const coach = await tx.coach.create({ data: { name: "First", email: `${tag}-1@example.com`, passwordHash: await hashPassword("0123456789") } });
      return { coach, result: await claimDemoData(tx, coach.id) };
    });
    expect(first.result.claimed).toBe(true);
    expect(first.result.clients).toBe(before[0]);
    expect(await prisma.client.count({ where: { coachId: null } })).toBe(0);
    expect(await prisma.assignment.count({ where: { coachId: first.coach.id } })).toBe(before[1]);
    expect(await prisma.progressLog.count({ where: { coachId: first.coach.id } })).toBe(before[2]);
    expect(await prisma.chatMessage.count({ where: { coachId: first.coach.id } })).toBe(before[3]);
    // Nothing was lost: totals are unchanged.
    expect(await Promise.all([prisma.client.count(), prisma.assignment.count(), prisma.progressLog.count(), prisma.chatMessage.count()])).toEqual(before);

    // New demo data created later stays unclaimed; a second coach does NOT claim it.
    await prisma.client.create({ data: { name: `${tag} Later` } });
    const second = await prisma.$transaction(async (tx) => {
      const coach = await tx.coach.create({ data: { name: "Second", email: `${tag}-2@example.com`, passwordHash: await hashPassword("0123456789") } });
      return claimDemoData(tx, coach.id);
    });
    expect(second.claimed).toBe(false);
    expect(await prisma.client.count({ where: { coachId: null } })).toBe(1);
  });

  it("two coaches registering at the same moment: exactly one claims the demo data", async () => {
    await prisma.coach.deleteMany({});
    await prisma.client.create({ data: { name: `${tag} Race` } });
    const register = (n: number) =>
      prisma.$transaction(async (tx) => {
        const coach = await tx.coach.create({ data: { name: `Race ${n}`, email: `${tag}-race${n}@example.com`, passwordHash: "x" } });
        return claimDemoData(tx, coach.id);
      });
    const results = await Promise.all([register(1), register(2)]);
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(await prisma.client.count({ where: { coachId: null } })).toBe(0);
  });

  it("coachId is a real foreign key and email is unique", async () => {
    await expect(prisma.client.create({ data: { name: `${tag} Orphan`, coachId: "no-such-coach" } })).rejects.toThrow();
    await expect(
      prisma.coach.create({ data: { name: "Dup", email: `${tag}-1@example.com`, passwordHash: "x" } }),
    ).rejects.toThrow();
  });
});
