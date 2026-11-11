// Progress tab stat cards: computed from ALL of a client's logs and assignments, never
// hard-coded. A value that can't be computed is null (shown as "-"), so there is never a
// 0 for missing data, a NaN, or a division by zero.
import type { Assignment, Habit, ProgressLog } from "../types";

export type ProgressStats = {
  /** Latest logged weight (kg), or null when no log has a weight. */
  currentWeight: number | null;
  /** Latest weight minus first weight (kg); null unless at least 2 logs have a weight. */
  weightChange: number | null;
  /** Rounded mean of the non-null adherence values (%), or null when there are none. */
  averageAdherence: number | null;
  /** Sum of workoutsDone, or null when no log has it. */
  totalWorkouts: number | null;
  /** Assignments Done % averaged with this week's habit % (Prompt 54); null when neither exists. */
  planCompletion: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Done ticks / possible ticks (active habits x 7 days) this week, as a rounded %; null without habits. */
export function habitCompletion(habits: Pick<Habit, "week">[]): number | null {
  const possible = habits.reduce((s, h) => s + h.week.length, 0);
  if (possible === 0) return null;
  const ticked = habits.reduce((s, h) => s + h.week.filter(Boolean).length, 0);
  return Math.round((ticked / possible) * 100);
}

/**
 * logs must be oldest first (the API's order). Plan completion (Prompt 54) is the average of the
 * assignments' Done % and this week's habit completion %; with only one of them it is that one.
 */
export function progressStats(logs: ProgressLog[], assignments: Assignment[], habits: Pick<Habit, "week">[] = []): ProgressStats {
  const weights = logs.map((l) => l.weightKg).filter((w): w is number => w !== null);
  const adherence = logs.map((l) => l.adherence).filter((a): a is number => a !== null);
  const workouts = logs.map((l) => l.workoutsDone).filter((w): w is number => w !== null);
  const done = assignments.filter((a) => a.status === "Done").length;
  const parts = [assignments.length ? (done / assignments.length) * 100 : null, habitCompletion(habits)].filter(
    (p): p is number => p !== null,
  );

  return {
    currentWeight: weights.length ? round1(weights[weights.length - 1]) : null,
    weightChange: weights.length >= 2 ? round1(weights[weights.length - 1] - weights[0]) : null,
    averageAdherence: adherence.length ? Math.round(adherence.reduce((s, a) => s + a, 0) / adherence.length) : null,
    totalWorkouts: workouts.length ? workouts.reduce((s, w) => s + w, 0) : null,
    planCompletion: parts.length ? Math.round(parts.reduce((s, p) => s + p, 0) / parts.length) : null,
  };
}

/** "-1.2 kg overall" / "+1.5 kg overall" - plain sign, no good/bad judgement. */
export function formatWeightChange(change: number): string {
  const sign = change > 0 ? "+" : change < 0 ? "-" : "";
  return `${sign}${Math.abs(change).toFixed(1)} kg overall`;
}
