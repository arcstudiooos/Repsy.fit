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
 * Current and best streak of consecutive done days.
 * - A missed day breaks the streak.
 * - Today not yet logged does NOT break it: the current streak then counts back from yesterday.
 * - Days after `today`, duplicates and input order are ignored.
 */
export function habitStreaks(doneDates: string[], today: string): { current: number; best: number } {
  const done = new Set(doneDates.filter((d) => d <= today));
  const sorted = [...done].sort();

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of sorted) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }

  let current = 0;
  for (let day = done.has(today) ? today : addDays(today, -1); done.has(day); day = addDays(day, -1)) current++;

  return { current, best };
}
