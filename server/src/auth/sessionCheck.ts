// Is a validly signed session token still current? (Prompt 47) A token carries the coach's
// sessionVersion at sign-in; a password change or reset raises the number in the database, so older
// tokens stop working everywhere at once. A coach that no longer exists is not current either.
import { prisma } from "../db.js";

export async function isSessionCurrent(coachId: string, version: number): Promise<boolean> {
  const coach = await prisma.coach.findUnique({ where: { id: coachId }, select: { sessionVersion: true } });
  return !!coach && coach.sessionVersion === version;
}
