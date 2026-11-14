// Writing a workout's structure to the database (Inspo W3/A1, Nov 2026).
//
// A LEAF module on purpose: `routes/assignments.ts` and the AI path both need this, and a helper
// that lives in one of its callers creates an ESM import cycle - a timing bug `tsc` cannot see.
// See "Shared helpers go in leaf modules" in CLAUDE.md.
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { type SectionInput, looksStructured, parseDetails } from "./structure.js";

/**
 * The exercise ids this coach may actually link to: their own, or Repsy stock.
 *
 * `coachId` is null on demo data, which leaves stock exercises - the right answer, since a demo
 * assignment has no coach whose library it could borrow from.
 *
 * An id that is not allowed is NOT an error - the caller keeps the exercise as a plain name instead,
 * so one stale id from an old copy never fails a whole save.
 */
export async function allowedExerciseIds(coachId: string | null, sections: SectionInput[]): Promise<Set<string>> {
  const ids = [
    ...new Set(sections.flatMap((s) => s.exercises.map((e) => e.exerciseId).filter((x): x is string => !!x))),
  ];
  if (ids.length === 0) return new Set();
  const rows = await prisma.exercise.findMany({
    where: { id: { in: ids }, OR: [{ coachId }, { coachId: null }] },
    select: { id: true },
  });
  return new Set(rows.map((e) => e.id));
}

/**
 * Replaces an assignment's structure with these sections.
 *
 * Replace rather than diff: a workout is small, and it keeps `order` contiguous for free. Runs
 * inside the caller's transaction so a half-written workout is never visible.
 */
export async function writeSections(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  sections: SectionInput[],
  allowed: Set<string>,
): Promise<void> {
  await tx.workoutSection.deleteMany({ where: { assignmentId } });
  for (const [order, section] of sections.entries()) {
    await tx.workoutSection.create({
      data: {
        assignmentId,
        order,
        protocol: section.protocol,
        sets: section.sets,
        restSec: section.restSec,
        durationSec: section.durationSec ?? null,
        notes: section.notes,
        exercises: {
          create: section.exercises.map((e, exOrder) => ({
            order: exOrder,
            exerciseId: e.exerciseId && allowed.has(e.exerciseId) ? e.exerciseId : null,
            name: e.name,
            repsPerSet: e.repsPerSet,
            loadPerSet: e.loadPerSet,
            durationSec: e.durationSec ?? null,
            distanceM: e.distanceM ?? null,
            rpe: e.rpe ?? null,
            restSec: e.restSec,
            notes: e.notes,
            recordFields: e.recordFields,
          })),
        },
      },
    });
  }
}

/**
 * Inspo A1/A2: gives a newly saved workout its structure, when its text already reads as one.
 *
 * Why this exists: the AI writes a plan as numbered lines ("1. Back Squat - 4 sets x 6 reps · Rest
 * 120s"), and so do most coaches. That text works - it is what the client app renders and what the
 * exports use - but it is a blob: the builder opens empty on it and nothing can count a set. Parsing
 * it on save means an AI draft lands as REAL structure, with no change to the prompt and no second
 * model call.
 *
 * Deliberately silent and best-effort:
 *  * `details` is NEVER rewritten. The coach's (or the AI's) own words stay exactly as written, so
 *    nothing a human reads can change under them. Structure is added alongside.
 *  * A plan that does not parse simply gets no structure, which is today's behaviour.
 *  * Any failure is swallowed with a log. Structure is a bonus; it must never be the reason a plan
 *    the coach just wrote fails to save.
 */
export async function deriveStructure(assignment: {
  id: string;
  coachId: string | null;
  type: string;
  details: string;
}): Promise<{ sections: number } | null> {
  if (assignment.type !== "Workout" || !looksStructured(assignment.details)) return null;
  try {
    const sections = parseDetails(assignment.details);
    if (sections.length === 0 || sections.every((s) => s.exercises.length === 0)) return null;
    const allowed = await allowedExerciseIds(assignment.coachId, sections);
    await prisma.$transaction(async (tx) => {
      await writeSections(tx, assignment.id, sections, allowed);
    });
    return { sections: sections.length };
  } catch (err) {
    console.error(
      `Could not derive structure for assignment ${assignment.id}: ${
        err instanceof Error ? err.message : String(err)
      }. The plan is saved; it just has no structure yet.`,
    );
    return null;
  }
}
