// Reads the Manual Planner's numbered plan lines (Prompt 79), e.g.
//   "1. Back Squat — 4 sets × 6 reps · Rest 120s"   (also "- Rest 120s", and "x" for "×")
// written by components/ManualAssignmentForm.tsx. Any other line (AI plans, notes) stays plain text.

export type PlanLine =
  | { kind: "exercise"; n: number; name: string; sets: number; reps: string; restSec: number }
  | { kind: "text"; text: string };

const EXERCISE = /^(\d+)\.\s+(.+?)\s+[—–-]\s+(\d+)\s+sets?\s+[×x]\s+(.+?)\s+reps?\s+[·•\-–—]\s+Rest\s+(\d+)\s*s\s*$/i;

export function parsePlanLines(details: string): PlanLine[] {
  const out: PlanLine[] = [];
  for (const raw of details.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = EXERCISE.exec(line);
    if (m) out.push({ kind: "exercise", n: Number(m[1]), name: m[2], sets: Number(m[3]), reps: m[4], restSec: Number(m[5]) });
    else out.push({ kind: "text", text: line });
  }
  return out;
}

/** "1:30" for 90 seconds. */
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
