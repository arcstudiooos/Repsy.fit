// Habit tracker helpers (Prompt 54). The streak rules live in ONE function, `habitStreaks`.
export const MAX_ACTIVE_HABITS = 8;
export const GRID_DAYS = 7;

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" shifted by whole days (UTC arithmetic, so no daylight-saving drift). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The last `n` dates ending at `today`, oldest first. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/**
 * The weekdays a habit is expected on: 0 = Sunday ... 6 = Saturday, matching `Date.getUTCDay()`.
 *
 * All seven is "every day", which is what every habit written before recurrence existed has, so
 * nothing about them changed.
 */
export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** Mon-first for display: a coach reads a week starting Monday, as the weekly summary already does. */
export const WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** Which weekday "YYYY-MM-DD" falls on (UTC, so no daylight-saving drift). */
export const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Is this habit expected on this date? An empty or full list both mean every day. */
export function isScheduled(date: string, days: readonly number[] = EVERY_DAY): boolean {
  if (days.length === 0 || days.length >= 7) return true;
  return days.includes(weekdayOf(date));
}

/** "Every day", "Weekdays", "Mon, Wed, Fri" - how a recurrence reads to a coach. */
export function recurrenceLabel(days: readonly number[] = EVERY_DAY): string {
  const set = [...new Set(days)].filter((d) => d >= 0 && d <= 6);
  if (set.length === 0 || set.length >= 7) return "Every day";
  const sorted = WEEKDAY_ORDER.filter((d) => set.includes(d));
  if (sorted.length === 5 && [1, 2, 3, 4, 5].every((d) => set.includes(d))) return "Weekdays";
  if (sorted.length === 2 && set.includes(0) && set.includes(6)) return "Weekends";
  return sorted.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

/**
 * Current and best streak of consecutive SCHEDULED days.
 *
 * - A missed scheduled day breaks the streak.
 * - A day the habit was never expected on is SKIPPED, not counted and not a break. Without this a
 *   Mon/Wed/Fri habit would lose its streak every Tuesday, which would make recurrence useless.
 * - Today not yet logged does NOT break it: the current streak then counts back from the previous
 *   scheduled day.
 * - Days after `today`, duplicates and input order are ignored.
 */
export function habitStreaks(
  doneDates: string[],
  today: string,
  days: readonly number[] = EVERY_DAY,
): { current: number; best: number } {
  const done = new Set(doneDates.filter((d) => d <= today && isScheduled(d, days)));
  const sorted = [...done].sort();

  /** The scheduled day immediately before `date`. Bounded: a schedule always has a day in any week. */
  const previousScheduled = (date: string): string => {
    for (let i = 1; i <= 7; i++) {
      const candidate = addDays(date, -i);
      if (isScheduled(candidate, days)) return candidate;
    }
    return addDays(date, -1);
  };

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of sorted) {
    // Consecutive means "the scheduled day before this one", not "yesterday".
    run = previous !== null && previousScheduled(date) === previous ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }

  let current = 0;
  let day = isScheduled(today, days) && done.has(today) ? today : previousScheduled(today);
  while (done.has(day)) {
    current++;
    day = previousScheduled(day);
  }

  return { current, best };
}
