// Reads the Manual Planner's numbered plan lines (Prompt 79), e.g.
//   "1. Back Squat — 4 sets × 6 reps · Rest 120s"   (also "- Rest 120s", and "x" for "×")
// written by components/ManualAssignmentForm.tsx. Any other line (AI plans, notes) stays plain text.

export type PlanLine =
  | {
      kind: "exercise";
      /** The number written on the line (restarts each day in multi-day plans). */
      n: number;
      /** 1, 2, 3... across the whole plan: what the client's checklist remembers. */
      seq: number;
      name: string;
      sets: number;
      reps: string;
      /** "60 kg", "135 lb" or "bodyweight" (AI plans since Nov 2026; manual lines may have none). */
      load?: string;
      /** True for a timed move ("3 sets × 40 s"): reps then carries "40 s". */
      timed?: boolean;
      restSec: number;
    }
  | { kind: "day"; text: string }
  | { kind: "text"; text: string };

// "1. Back Squat — 4 sets × 6 reps · Rest 120s" or, with a load, "1. Back Squat — 4 sets × 6 reps · 60 kg · Rest 120s".
const EXERCISE =
  /^(\d+)\.\s+(.+?)\s+[—–-]\s+(\d+)\s+sets?\s+[×x]\s+(?:(.+?)\s+reps?|(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\b)(?:\s+[·•\-–—]\s+((?:\d+(?:\.\d+)?\s*(?:kg|lb)s?(?:\s+(?:each|per)\s+(?:arm|hand|side|leg|dumbbell))?)|bodyweight|BW))?\s+[·•\-–—]\s+Rest\s+(\d+)\s*s\s*$/i;

// "Day 1 — Push" / "Day 3: Rest" / "**Day 2 (Pull)**"
const DAY = /^\**\s*(Day\s+\d+\b.*?)\s*\**$/i;

export function parsePlanLines(details: string): PlanLine[] {
  const out: PlanLine[] = [];
  let seq = 0;
  for (const raw of details.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = EXERCISE.exec(line);
    if (m) {
      seq += 1;
      const load = m[6] ? (/^bw$/i.test(m[6]) ? "bodyweight" : m[6].replace(/\s*(kg|lb)s?\b/i, (_, u: string) => ` ${u.toLowerCase()}`)) : undefined;
      // Either "6 reps" (m[4]) or a timed move like "40 s" (m[5]).
      const timed = m[5] !== undefined;
      out.push({
        kind: "exercise",
        n: Number(m[1]),
        seq,
        name: m[2],
        sets: Number(m[3]),
        reps: timed ? `${m[5]} s` : m[4],
        timed,
        load,
        restSec: Number(m[7]),
      });
      continue;
    }

    const d = DAY.exec(line);
    if (d && line.length <= 60) out.push({ kind: "day", text: d[1].replace(/\*+/g, "").trim() });
    else out.push({ kind: "text", text: line });
  }
  return out;
}

/** "1:30" for 90 seconds. */
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
