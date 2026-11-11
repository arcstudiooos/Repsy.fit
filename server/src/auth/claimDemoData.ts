// One-time claim of the demo data (Prompt 43, used by registration in Prompt 44).
// Existing data has coachId NULL ("unclaimed demo data"). When the very FIRST coach account is
// created, it takes ownership of all of it. Every later coach starts with an empty account.
// No fake coach is ever created.
import type { Prisma } from "@prisma/client";

/** Postgres advisory-lock key, so two registrations can't both count themselves as "first". */
export const CLAIM_LOCK_KEY = 43_000_001;

export type ClaimResult = { claimed: boolean; clients: number; assignments: number; progressLogs: number; chatMessages: number };

/**
 * Call inside the same transaction that created `coachId`. Claims every unclaimed row only if
 * that coach is the only coach in the database; otherwise changes nothing.
 */
export async function claimDemoData(tx: Prisma.TransactionClient, coachId: string): Promise<ClaimResult> {
  // Serialise the check: a concurrent registration waits here until this transaction commits,
  // then sees 2 coaches and claims nothing.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAIM_LOCK_KEY})`;
  const coaches = await tx.coach.count();
  if (coaches !== 1 || !(await tx.coach.findUnique({ where: { id: coachId }, select: { id: true } }))) {
    return { claimed: false, clients: 0, assignments: 0, progressLogs: 0, chatMessages: 0 };
  }
  const unclaimed = { coachId: null };
  const data = { coachId };
  const clients = await tx.client.updateMany({ where: unclaimed, data });
  const assignments = await tx.assignment.updateMany({ where: unclaimed, data });
  const progressLogs = await tx.progressLog.updateMany({ where: unclaimed, data });
  const chatMessages = await tx.chatMessage.updateMany({ where: unclaimed, data });
  return { claimed: true, clients: clients.count, assignments: assignments.count, progressLogs: progressLogs.count, chatMessages: chatMessages.count };
}
